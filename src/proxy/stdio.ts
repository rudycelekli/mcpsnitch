import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendEvent } from '../log/store.js';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { eventFromObserverStatus, startProcessObserver, type ProcessObserverHandle } from '../process/observer.js';
import { resolveProfileForCommand } from '../policy/profile.js';
import type { AuditEvent, Finding } from '../schema.js';

export interface WatchOptions {
  root?: string;
  command: string;
  args?: string[];
  sessionId?: string;
  /** Best-effort OS-observed process behavior via lsof. Default: true when lsof is available. */
  processObserver?: boolean;
  /** Expected behavior profile name/path, or auto. */
  profile?: string;
  /** Sampling interval for lsof process observation. */
  observerIntervalMs?: number;
  /** When true, clean/info-only sessions emit nothing to stderr. */
  quiet?: boolean;
}

function installLineTap(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let buf = '';
  stream.on('data', (chunk: Buffer | string) => {
    buf += chunk.toString();
    for (;;) {
      const idx = buf.indexOf('\n');
      if (idx < 0) break;
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (line.trim().startsWith('{')) onLine(line);
    }
  });
}

export function alertingFindings(event: AuditEvent): Finding[] {
  return event.findings.filter((f) => f.severity === 'medium' || f.severity === 'high');
}

function quoteAlertValue(value: unknown): string {
  return JSON.stringify(String(value ?? 'n/a').replace(/[\r\n]+/g, ' '));
}

export function formatActionableAlert(event: AuditEvent): string {
  const findings = alertingFindings(event);
  if (findings.length === 0) return '';
  const primary = findings[0];
  const profile = quoteAlertValue(primary.evidence.profile ?? 'n/a');
  const observed = event.observation?.value ? ` observed=${quoteAlertValue(event.observation.value)}` : '';
  const tool = event.toolName ? ` tool=${quoteAlertValue(event.toolName)}` : '';
  const reason = String(primary.evidence.reason ?? '');
  const evidenceLayer = String(primary.evidence.layer ?? event.source ?? 'jsonrpc_heuristic');
  const action = primary.rule === 'process_observer_unavailable'
    ? reason.includes('spawn failed')
      ? 'fix the wrapped command or PATH; no MCP server process started'
      : 'install lsof or run on a host with process observation; treat this session as self-report-only'
    : evidenceLayer === 'process_observer' && primary.rule.includes('network')
      ? 'verify this server should have network access; if expected, choose/learn a network-capable profile; otherwise disable or isolate the server'
      : evidenceLayer === 'jsonrpc_heuristic' && primary.rule.includes('network')
        ? 'inspect the tool arguments and rename/use an explicit network tool if this destination is intended; profiles only contextualize OS process observations'
        : primary.rule.includes('secret')
          ? 'treat the value as exposed, rotate if real, and inspect why this tool received secret-like data'
          : primary.rule.includes('sensitive_file') || primary.rule.includes('file')
            ? 'verify this server should read the file; if not, revoke/isolate the server and inspect the audit log'
            : 'inspect the audit log and server profile';
  return `MCPSNITCH ALERT severity=${primary.severity} rule=${primary.rule} source=${event.source ?? 'jsonrpc_heuristic'} profile=${profile}${tool}${observed} action=${quoteAlertValue(action)}\n`;
}

function recordAndMaybeAlert(event: AuditEvent, root: string | undefined, quiet: boolean): void {
  const appended = appendEvent(event, root);
  const alert = formatActionableAlert(appended);
  if (alert) process.stderr.write(alert);
  else if (!quiet && appended.findings.some((f) => f.rule === 'process_observer_sampled_mode')) {
    process.stderr.write(`mcpsnitch: process observer enabled (${appended.findings[0].evidence.samplingIntervalMs}ms sampled mode, profile=${appended.findings[0].evidence.profile}).\n`);
  }
}

export async function watchStdio(opts: WatchOptions): Promise<number> {
  const sessionId = opts.sessionId ?? randomUUID();
  const args = opts.args ?? [];
  const profile = resolveProfileForCommand(opts.profile ?? 'auto', opts.command, args);
  const quiet = opts.quiet ?? false;
  const child = spawn(opts.command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let observer: ProcessObserverHandle | undefined;
  let childClosed = false;

  installLineTap(process.stdin, (line) => recordAndMaybeAlert(analyzeJsonRpc(line, { sessionId, direction: 'client_to_server' }), opts.root, quiet));
  installLineTap(child.stdout!, (line) => recordAndMaybeAlert(analyzeJsonRpc(line, { sessionId, direction: 'server_to_client' }), opts.root, quiet));
  process.stdin.pipe(child.stdin!);
  child.stdout!.pipe(process.stdout);

  // Start process observation after the transparent pipe is already flowing so
  // lsof availability checks never delay the MCP handshake.
  if (opts.processObserver !== false && child.pid) {
    void startProcessObserver(child.pid, {
      sessionId,
      profile,
      intervalMs: opts.observerIntervalMs,
      onEvent: (event) => recordAndMaybeAlert(event, opts.root, quiet),
      onStatus: () => undefined,
    }).then((handle) => {
      observer = handle;
      if (childClosed) handle.stop();
    }).catch((e) => {
      const status = {
        ok: true,
        enabled: false,
        reason: `process observer failed: ${(e as Error).message}`,
        samplingIntervalMs: opts.observerIntervalMs ?? 250,
        mode: 'self_report_only' as const,
        profile: profile.name,
      };
      recordAndMaybeAlert(eventFromObserverStatus(status, { sessionId }), opts.root, quiet);
    });
  } else if (opts.processObserver === false) {
    const status = {
      ok: true,
      enabled: false,
      reason: 'disabled by --no-process-observer',
      samplingIntervalMs: opts.observerIntervalMs ?? 250,
      mode: 'self_report_only' as const,
      profile: profile.name,
    };
    recordAndMaybeAlert(eventFromObserverStatus(status, { sessionId }), opts.root, quiet);
  }

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      childClosed = true;
      observer?.stop();
      resolve(code);
    };
    child.on('error', (e) => {
      const status = {
        ok: true,
        enabled: false,
        reason: `spawn failed: ${(e as Error).message}`,
        samplingIntervalMs: opts.observerIntervalMs ?? 250,
        mode: 'self_report_only' as const,
        profile: profile.name,
      };
      recordAndMaybeAlert(eventFromObserverStatus(status, { sessionId }), opts.root, quiet);
      finish(127);
    });
    child.on('close', (code) => finish(code ?? 0));
  });
}
