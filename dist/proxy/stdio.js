import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendEvent } from '../log/store.js';
import { analyzeJsonRpc } from '../audit/analyzer.js';
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
    installLineTap(process.stdin, (line) => appendEvent(analyzeJsonRpc(line, { sessionId, direction: 'client_to_server' }), opts.root));
    installLineTap(child.stdout, (line) => appendEvent(analyzeJsonRpc(line, { sessionId, direction: 'server_to_client' }), opts.root));
    process.stdin.pipe(child.stdin);
    child.stdout.pipe(process.stdout);
    return await new Promise((resolve) => child.on('close', (code) => resolve(code ?? 0)));
}
//# sourceMappingURL=stdio.js.map