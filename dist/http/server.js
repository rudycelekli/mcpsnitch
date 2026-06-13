import { createServer } from 'node:http';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { appendEvent, loadEvents, summarize, verifyLog, writeReport } from '../log/store.js';
async function readJson(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8') || '{}';
    try {
        return JSON.parse(raw);
    }
    catch {
        return raw;
    }
}
function send(res, code, data) {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
}
export async function startHttpServer(opts = {}) {
    const root = opts.root ?? '.';
    const server = createServer(async (req, res) => {
        try {
            if (req.method === 'POST' && req.url === '/analyze') {
                const body = await readJson(req);
                const event = appendEvent(analyzeJsonRpc(typeof body === 'string' ? body : JSON.stringify(body)), root);
                send(res, 200, { ok: true, event });
            }
            else if (req.method === 'GET' && req.url === '/report') {
                send(res, 200, summarize(loadEvents(root)));
            }
            else if (req.method === 'POST' && req.url === '/report') {
                send(res, 200, writeReport(root));
            }
            else if (req.method === 'GET' && req.url === '/verify') {
                send(res, 200, verifyLog(root));
            }
            else {
                send(res, 404, { ok: false, error: 'not found', endpoints: ['POST /analyze', 'GET /report', 'POST /report', 'GET /verify'] });
            }
        }
        catch (e) {
            send(res, 500, { ok: false, error: e.message });
        }
    });
    await new Promise((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : opts.port ?? 0;
    return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
//# sourceMappingURL=server.js.map