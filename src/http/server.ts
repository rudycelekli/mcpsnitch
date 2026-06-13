import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { appendEvent, loadEvents, summarize, verifyLog, writeReport } from '../log/store.js';
import { listProfiles } from '../policy/profile.js';

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try { return JSON.parse(raw); } catch { return raw; }
}
function send(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

export async function startHttpServer(opts: { root?: string; port?: number } = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const root = opts.root ?? '.';
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/analyze') {
        const body = await readJson(req);
        const event = appendEvent(analyzeJsonRpc(typeof body === 'string' ? body : JSON.stringify(body)), root);
        send(res, 200, { ok: true, event });
      } else if (req.method === 'GET' && req.url === '/report') {
        send(res, 200, summarize(loadEvents(root)));
      } else if (req.method === 'POST' && req.url === '/report') {
        send(res, 200, writeReport(root));
      } else if (req.method === 'GET' && req.url === '/verify') {
        send(res, 200, verifyLog(root));
      } else if (req.method === 'GET' && req.url === '/profiles') {
        send(res, 200, { ok: true, profiles: listProfiles() });
      } else {
        send(res, 404, { ok: false, error: 'not found', endpoints: ['POST /analyze', 'GET /report', 'POST /report', 'GET /verify', 'GET /profiles'] });
      }
    } catch (e) { send(res, 500, { ok: false, error: (e as Error).message }); }
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port ?? 0;
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
