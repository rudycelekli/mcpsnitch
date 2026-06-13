import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, Finding, ProcessObservation } from '../schema.js';
import { estimateCostUsd, sha256Hex, stableJson } from '../audit/analyzer.js';

const execFileP = promisify(execFile);

export interface ProcessObserverOptions {
  intervalMs?: number;
  sessionId?: string;
  onEvent: (event: AuditEvent) => void;
  onStatus?: (status: { ok: boolean; enabled: boolean; reason?: string }) => void;
}

export interface ProcessObserverHandle {
  enabled: boolean;
  stop: () => void;
}

function isSensitivePath(value: string): boolean {
  return /(^|\/)(?:\.env(?:\.|$)|id_rsa$|id_ed25519$|known_hosts$|authorized_keys$)|\/etc\/(?:passwd|shadow)\b|\.ssh\//i.test(value);
}

function isNoiseFile(value: string): boolean {
  return /\/node_modules\/|\/dist\/|\/usr\/lib\/|\/usr\/bin\/|\/lib(?:64)?\/|\/System\/Library\//.test(value);
}

/** Parse normal `lsof -nP -p <pid>` output into OS-observed file/socket events. */
export function parseLsofOutput(output: string, pidHint?: number): ProcessObservation[] {
  const lines = output.split('\n').filter((line) => line.trim());
  const observations: ProcessObservation[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const pid = Number(parts[1]);
    if (!Number.isFinite(pid) || (pidHint && pid !== pidHint)) continue;
    const fd = parts[3];
    const type = parts[4];
    const name = parts.slice(8).join(' ');
    if (!name || name === 'PIPE' || name.startsWith('pipe')) continue;
    if (/^IPv[46]$/i.test(type)) {
      observations.push({ pid, kind: 'network_socket', value: name, fd, protocol: type });
    } else if (name.startsWith('/') || name.startsWith('~')) {
      observations.push({ pid, kind: 'file_open', value: name, fd });
    }
  }
  return observations;
}

export async function lsofAvailable(): Promise<boolean> {
  try {
    await execFileP('lsof', ['-v'], { timeout: 2_000 });
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // `lsof -v` often exits non-zero after printing version info; ENOENT is the only hard unavailable signal.
    return err.code !== 'ENOENT';
  }
}

export async function readProcessObservations(pid: number): Promise<ProcessObservation[]> {
  const { stdout } = await execFileP('lsof', ['-nP', '-p', String(pid)], { timeout: 2_000, maxBuffer: 1024 * 1024 });
  return parseLsofOutput(stdout, pid);
}

export function eventFromObservation(observation: ProcessObservation, opts: { sessionId?: string; seq?: number; prevHash?: string } = {}): AuditEvent {
  const findings: Finding[] = [];
  const scopes = observation.kind === 'network_socket' ? ['network'] : ['filesystem'];
  const dataFlow = observation.kind === 'network_socket' ? ['observed_network_socket'] : ['observed_file_open'];
  if (observation.kind === 'network_socket') {
    findings.push({
      rule: 'observed_network_connection',
      severity: 'medium',
      message: 'child process has an OS-observed network socket',
      evidence: { layer: 'process_observer', value: observation.value, fd: observation.fd },
    });
  }
  if (observation.kind === 'file_open' && isSensitivePath(observation.value)) {
    findings.push({
      rule: 'observed_sensitive_file_open',
      severity: 'high',
      message: 'child process has an OS-observed sensitive file open',
      evidence: { layer: 'process_observer', value: observation.value, fd: observation.fd },
    });
  }
  const sansHash = {
    v: 1 as const,
    seq: opts.seq ?? 0,
    at: new Date().toISOString(),
    sessionId: opts.sessionId ?? randomUUID(),
    source: 'process_observer' as const,
    eventType: `process/${observation.kind}`,
    direction: 'server_to_client' as const,
    method: `process/${observation.kind}`,
    observation,
    bytesIn: 0,
    bytesOut: 0,
    estimatedCostUsd: estimateCostUsd(0),
    scopes,
    dataFlow,
    findings,
    prevHash: opts.prevHash ?? '',
  };
  return { ...sansHash, hash: sha256Hex(stableJson(sansHash)) };
}

export async function startProcessObserver(pid: number, opts: ProcessObserverOptions): Promise<ProcessObserverHandle> {
  const available = await lsofAvailable();
  if (!available) {
    opts.onStatus?.({ ok: true, enabled: false, reason: 'lsof not found; process observer disabled' });
    return { enabled: false, stop: () => undefined };
  }
  const seen = new Set<string>();
  let stopped = false;
  const sessionId = opts.sessionId;
  const poll = async (): Promise<void> => {
    if (stopped) return;
    try {
      const observations = await readProcessObservations(pid);
      for (const obs of observations) {
        if (obs.kind === 'file_open' && isNoiseFile(obs.value) && !isSensitivePath(obs.value)) continue;
        const key = `${obs.kind}:${obs.fd ?? ''}:${obs.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        opts.onEvent(eventFromObservation(obs, { sessionId }));
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      // lsof exits non-zero when the process has already ended; that is normal at shutdown.
      if (err.code === 'ENOENT') opts.onStatus?.({ ok: true, enabled: false, reason: 'lsof disappeared; process observer disabled' });
    }
  };
  const interval = setInterval(() => void poll(), opts.intervalMs ?? 250);
  interval.unref?.();
  void poll();
  opts.onStatus?.({ ok: true, enabled: true });
  return { enabled: true, stop: () => { stopped = true; clearInterval(interval); } };
}
