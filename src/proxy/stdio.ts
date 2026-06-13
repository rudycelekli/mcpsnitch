import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendEvent } from '../log/store.js';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { startProcessObserver, type ProcessObserverHandle } from '../process/observer.js';

export interface WatchOptions {
  root?: string;
  command: string;
  args?: string[];
  sessionId?: string;
  /** Best-effort OS-observed process behavior via lsof. Default: true when lsof is available. */
  processObserver?: boolean;
  /** Expected behavior profile used to contextualize process observations. */
  profile?: string;
  /** Sampling interval for lsof process observation. */
  observerIntervalMs?: number;
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

export async function watchStdio(opts: WatchOptions): Promise<number> {
  const sessionId = opts.sessionId ?? randomUUID();
  const child = spawn(opts.command, opts.args ?? [], { stdio: ['pipe', 'pipe', 'inherit'] });
  let observer: ProcessObserverHandle | undefined;

  installLineTap(process.stdin, (line) => appendEvent(analyzeJsonRpc(line, { sessionId, direction: 'client_to_server' }), opts.root));
  installLineTap(child.stdout!, (line) => appendEvent(analyzeJsonRpc(line, { sessionId, direction: 'server_to_client' }), opts.root));
  process.stdin.pipe(child.stdin!);
  child.stdout!.pipe(process.stdout);

  // Start process observation after the transparent pipe is already flowing so
  // lsof availability checks never delay the MCP handshake.
  if (opts.processObserver !== false && child.pid) {
    void startProcessObserver(child.pid, {
      sessionId,
      profile: opts.profile,
      intervalMs: opts.observerIntervalMs,
      onEvent: (event) => appendEvent(event, opts.root),
      onStatus: (status) => {
        if (!status.enabled) {
          process.stderr.write(
            `MCPSNITCH WARNING: OS-level process observation unavailable (${status.reason ?? 'unknown'}). ` +
            'Running in self-report-only mode; a malicious MCP server can evade JSON-RPC heuristics.\n',
          );
        } else {
          process.stderr.write(
            `mcpsnitch: process observer enabled (${status.mode}, ${status.samplingIntervalMs}ms sampling, profile=${status.profile}). ` +
            'Short-lived file/socket activity between samples can be missed.\n',
          );
        }
      },
    }).then((handle) => { observer = handle; });
  } else if (opts.processObserver === false) {
    process.stderr.write('MCPSNITCH WARNING: process observer disabled by --no-process-observer; running in self-report-only mode.\n');
  }

  return await new Promise((resolve) => child.on('close', (code) => {
    observer?.stop();
    resolve(code ?? 0);
  }));
}
