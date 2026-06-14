import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { AuditEvent, Finding, ProcessObservation } from '../schema.js';
import { estimateCostUsd, sha256Hex, stableJson } from '../audit/analyzer.js';
import { resolveProfile, type ServerProfile } from '../policy/profile.js';

const execFileP = promisify(execFile);
export const DEFAULT_PROCESS_OBSERVER_INTERVAL_MS = 250;

export interface ProcessObserverStatus {
  ok: boolean;
  enabled: boolean;
  reason?: string;
  samplingIntervalMs: number;
  mode: 'sampled_lsof' | 'self_report_only';
  profile: string;
}

export interface ProcessObserverOptions {
  intervalMs?: number;
  sessionId?: string;
  profile?: string | ServerProfile;
  launcherCommand?: string;
  onEvent: (event: AuditEvent) => void;
  onStatus?: (status: ProcessObserverStatus) => void;
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

function resolveProfileValue(profile?: string | ServerProfile): ServerProfile {
  return typeof profile === 'string' || profile === undefined ? resolveProfile(profile) : profile;
}

function isPackageLauncher(command?: string): boolean {
  if (!command) return false;
  const name = basename(command).toLowerCase();
  return ['npx', 'npm', 'pnpm', 'yarn', 'bun', 'uvx', 'uv'].includes(name) || name.startsWith('npx.');
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

async function readProcessChildren(): Promise<Map<number, number[]>> {
  try {
    const { stdout } = await execFileP('ps', ['-axo', 'pid=,ppid='], { timeout: 2_000, maxBuffer: 1024 * 1024 });
    const children = new Map<number, number[]>();
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const pid = Number(parts[0]);
      const ppid = Number(parts[1]);
      if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
      const list = children.get(ppid) ?? [];
      list.push(pid);
      children.set(ppid, list);
    }
    return children;
  } catch {
    return new Map();
  }
}

export async function readDescendantPids(pid: number): Promise<number[]> {
  const children = await readProcessChildren();
  const seen = new Set<number>();
  const out: number[] = [];
  const visit = (parent: number): void => {
    for (const child of children.get(parent) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      visit(child);
    }
  };
  visit(pid);
  return out;
}

export async function readProcessTreeObservations(pid: number): Promise<ProcessObservation[]> {
  const pids = [pid, ...(await readDescendantPids(pid))];
  const observations: ProcessObservation[] = [];
  for (const currentPid of pids) {
    try {
      observations.push(...await readProcessObservations(currentPid));
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (currentPid === pid && err.code === 'ENOENT') throw e;
    }
  }
  return observations;
}

export function eventFromObserverStatus(
  status: ProcessObserverStatus,
  opts: { sessionId?: string; seq?: number; prevHash?: string } = {},
): AuditEvent {
  const findings: Finding[] = status.enabled
    ? [{
        rule: 'process_observer_sampled_mode',
        severity: 'info',
        message: `process observer enabled in sampled lsof mode (${status.samplingIntervalMs}ms interval)`,
        evidence: { layer: 'process_observer', sampled: true, processTree: true, samplingIntervalMs: status.samplingIntervalMs, profile: status.profile },
      }]
    : [{
        rule: 'process_observer_unavailable',
        severity: 'high',
        message: 'OS-level process observation unavailable; running in self-report-only mode that a malicious server can evade',
        evidence: { layer: 'process_observer', reason: status.reason ?? 'unknown', profile: status.profile },
      }];
  const sansHash = {
    v: 1 as const,
    seq: opts.seq ?? 0,
    at: new Date().toISOString(),
    sessionId: opts.sessionId ?? randomUUID(),
    source: 'process_observer' as const,
    eventType: 'process/observer_status',
    direction: 'server_to_client' as const,
    method: 'process/observer_status',
    bytesIn: 0,
    bytesOut: 0,
    estimatedCostUsd: estimateCostUsd(0),
    scopes: [],
    dataFlow: status.enabled ? ['sampled_process_observation'] : ['self_report_only_mode'],
    findings,
    prevHash: opts.prevHash ?? '',
  };
  return { ...sansHash, hash: sha256Hex(stableJson(sansHash)) };
}

export function eventFromObservation(
  observation: ProcessObservation,
  opts: { sessionId?: string; seq?: number; prevHash?: string; profile?: string | ServerProfile; samplingIntervalMs?: number; launcherBootstrap?: boolean; launcherCommand?: string } = {},
): AuditEvent {
  const profile = resolveProfileValue(opts.profile);
  const interval = opts.samplingIntervalMs ?? DEFAULT_PROCESS_OBSERVER_INTERVAL_MS;
  const findings: Finding[] = [];
  const scopes = observation.kind === 'network_socket' ? ['network'] : ['filesystem'];
  const dataFlow = observation.kind === 'network_socket' ? ['observed_network_socket'] : ['observed_file_open'];
  const commonEvidence = { layer: 'process_observer', value: observation.value, fd: observation.fd, profile: profile.name, sampled: true, samplingIntervalMs: interval, ...(opts.launcherBootstrap ? { launcherBootstrap: true, launcherCommand: opts.launcherCommand } : {}) };

  if (observation.kind === 'network_socket') {
    if (opts.launcherBootstrap) {
      findings.push({
        rule: 'observed_expected_launcher_network_connection',
        severity: 'info',
        message: 'package-manager launcher has an OS-observed network socket during MCP server bootstrap; profile enforcement applies to the server process tree after launcher handoff',
        evidence: commonEvidence,
      });
    } else if (profile.allowNetwork) {
      findings.push({
        rule: 'observed_expected_network_connection',
        severity: 'info',
        message: 'child process has an OS-observed network socket allowed by the active server profile',
        evidence: commonEvidence,
      });
    } else {
      findings.push({
        rule: 'observed_unexpected_network_connection',
        severity: 'medium',
        message: 'child process has an OS-observed network socket not allowed by the active server profile',
        evidence: commonEvidence,
      });
    }
  }
  if (observation.kind === 'file_open' && isSensitivePath(observation.value)) {
    findings.push({
      rule: profile.allowSensitiveFiles ? 'observed_expected_sensitive_file_open' : 'observed_sensitive_file_open',
      severity: profile.allowSensitiveFiles ? 'info' : 'high',
      message: profile.allowSensitiveFiles
        ? 'child process has an OS-observed sensitive file open allowed by the active server profile'
        : 'child process has an OS-observed sensitive file open not allowed by the active server profile',
      evidence: commonEvidence,
    });
  } else if (observation.kind === 'file_open' && !profile.allowFileRead && !isNoiseFile(observation.value)) {
    findings.push({
      rule: 'observed_unexpected_file_open',
      severity: 'medium',
      message: 'child process has an OS-observed file open not allowed by the active server profile',
      evidence: commonEvidence,
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
  const intervalMs = opts.intervalMs ?? DEFAULT_PROCESS_OBSERVER_INTERVAL_MS;
  const profile = resolveProfileValue(opts.profile);
  const available = await lsofAvailable();
  if (!available) {
    const status = { ok: true, enabled: false, reason: 'lsof not found; process observer disabled', samplingIntervalMs: intervalMs, mode: 'self_report_only' as const, profile: profile.name };
    opts.onStatus?.(status);
    opts.onEvent(eventFromObserverStatus(status, { sessionId: opts.sessionId }));
    return { enabled: false, stop: () => undefined };
  }
  const seen = new Set<string>();
  let stopped = false;
  const sessionId = opts.sessionId;
  const poll = async (): Promise<void> => {
    if (stopped) return;
    try {
      const observations = await readProcessTreeObservations(pid);
      for (const obs of observations) {
        if (obs.kind === 'file_open' && isNoiseFile(obs.value) && !isSensitivePath(obs.value)) continue;
        const key = `${obs.pid}:${obs.kind}:${obs.fd ?? ''}:${obs.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        opts.onEvent(eventFromObservation(obs, { sessionId, profile, samplingIntervalMs: intervalMs, launcherBootstrap: obs.pid === pid && obs.kind === 'network_socket' && isPackageLauncher(opts.launcherCommand), launcherCommand: opts.launcherCommand }));
      }
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      // lsof exits non-zero when the process has already ended; that is normal at shutdown.
      if (err.code === 'ENOENT') {
        opts.onStatus?.({ ok: true, enabled: false, reason: 'lsof disappeared; process observer disabled', samplingIntervalMs: intervalMs, mode: 'self_report_only', profile: profile.name });
      }
    }
  };
  const status = { ok: true, enabled: true, samplingIntervalMs: intervalMs, mode: 'sampled_lsof' as const, profile: profile.name };
  const interval = setInterval(() => void poll(), intervalMs);
  interval.unref?.();
  opts.onEvent(eventFromObserverStatus(status, { sessionId }));
  void poll();
  opts.onStatus?.(status);
  return { enabled: true, stop: () => { stopped = true; clearInterval(interval); } };
}
