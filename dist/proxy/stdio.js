import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendEvent } from '../log/store.js';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { startProcessObserver } from '../process/observer.js';
function installLineTap(stream, onLine) {
    let buf = '';
    stream.on('data', (chunk) => {
        buf += chunk.toString();
        for (;;) {
            const idx = buf.indexOf('\n');
            if (idx < 0)
                break;
            const line = buf.slice(0, idx).trimEnd();
            buf = buf.slice(idx + 1);
            if (line.trim().startsWith('{'))
                onLine(line);
        }
    });
}
export async function watchStdio(opts) {
    const sessionId = opts.sessionId ?? randomUUID();
    const child = spawn(opts.command, opts.args ?? [], { stdio: ['pipe', 'pipe', 'inherit'] });
    let observer;
    installLineTap(process.stdin, (line) => appendEvent(analyzeJsonRpc(line, { sessionId, direction: 'client_to_server' }), opts.root));
    installLineTap(child.stdout, (line) => appendEvent(analyzeJsonRpc(line, { sessionId, direction: 'server_to_client' }), opts.root));
    process.stdin.pipe(child.stdin);
    child.stdout.pipe(process.stdout);
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
                    process.stderr.write(`MCPSNITCH WARNING: OS-level process observation unavailable (${status.reason ?? 'unknown'}). ` +
                        'Running in self-report-only mode; a malicious MCP server can evade JSON-RPC heuristics.\n');
                }
                else {
                    process.stderr.write(`mcpsnitch: process observer enabled (${status.mode}, ${status.samplingIntervalMs}ms sampling, profile=${status.profile}). ` +
                        'Short-lived file/socket activity between samples can be missed.\n');
                }
            },
        }).then((handle) => { observer = handle; });
    }
    else if (opts.processObserver === false) {
        process.stderr.write('MCPSNITCH WARNING: process observer disabled by --no-process-observer; running in self-report-only mode.\n');
    }
    return await new Promise((resolve) => child.on('close', (code) => {
        observer?.stop();
        resolve(code ?? 0);
    }));
}
//# sourceMappingURL=stdio.js.map