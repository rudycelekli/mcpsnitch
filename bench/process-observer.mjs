#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { lsofAvailable, readProcessObservations, eventFromObservation } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/live-mcp-server.mjs');
const seed = 'mcpsnitch-v0.1.3-live-process-observer';
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function highOrMedium(event) { return event.findings.some((f) => f.severity === 'medium' || f.severity === 'high'); }
async function startTcpServer() {
  const sockets = new Set();
  const server = net.createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return { port: addr.port, close: () => new Promise((resolve) => { for (const socket of sockets) socket.destroy(); server.close(resolve); }) };
}
async function spawnFixture(mode, arg) {
  const child = spawn(process.execPath, [fixture, mode, arg], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`fixture ${mode} timed out: ${out}`)), 3_000);
    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
      const line = out.split('\n').find((l) => l.trim().startsWith('{'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line)); }
    });
    child.on('exit', (code) => reject(new Error(`fixture ${mode} exited early ${code}`)));
  });
  await ready;
  return child;
}
async function sampleFixture(def) {
  const child = await spawnFixture(def.mode, def.arg);
  try {
    await wait(def.waitMs ?? 100);
    const observations = await readProcessObservations(child.pid);
    const events = observations.map((obs) => eventFromObservation(obs, { profile: def.profile, samplingIntervalMs: 250 }));
    const matched = events.filter((event) => def.match(event));
    return { ...def, pid: child.pid, observations: observations.length, matched: matched.length, alertingMatched: matched.filter(highOrMedium).length, matchedFindings: matched.flatMap((event) => event.findings.map((f) => ({ rule: f.rule, severity: f.severity }))) };
  } finally {
    child.kill('SIGTERM');
    child.stdin.end();
  }
}
const available = await lsofAvailable();
const resultsDir = join(here, 'results');
if (!available) {
  const report = { ok: true, skipped: true, reason: 'lsof unavailable', seed };
  writeFileSync(join(resultsDir, 'process-observer-report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(resultsDir, 'process-observer-report.md'), `# MCPSnitch live process observer harness\n\nSkipped: lsof unavailable.\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const temp = mkdtempSync(join(tmpdir(), 'mcpsnitch-live-'));
const normalFile = join(temp, 'README.md');
const envFile = join(temp, '.env');
writeFileSync(normalFile, 'hello\n');
writeFileSync(envFile, 'MCPSNITCH_SECRET=1\n');
const tcp = await startTcpServer();
const defs = [
  { name: 'filesystem-benign-file', label: 'benign', mode: 'hold-file', arg: normalFile, profile: 'filesystem', match: (event) => event.observation?.value?.endsWith('/README.md') },
  { name: 'fetch-benign-socket', label: 'benign', mode: 'hold-socket', arg: `127.0.0.1:${tcp.port}`, profile: 'fetch', match: (event) => event.observation?.kind === 'network_socket' && event.observation.value.includes(String(tcp.port)) },
  { name: 'filesystem-unexpected-socket', label: 'malicious', mode: 'hold-socket', arg: `127.0.0.1:${tcp.port}`, profile: 'filesystem', match: (event) => event.observation?.kind === 'network_socket' && event.observation.value.includes(String(tcp.port)) },
  { name: 'generic-sensitive-file', label: 'malicious', mode: 'hold-file', arg: envFile, profile: 'generic', match: (event) => event.observation?.value?.endsWith('/.env') },
  { name: 'short-lived-socket-sampling-limit', label: 'sampling_limit', mode: 'short-socket', arg: `127.0.0.1:${tcp.port}`, profile: 'filesystem', waitMs: 300, match: (event) => event.observation?.kind === 'network_socket' && event.observation.value.includes(String(tcp.port)) },
];
const sampled = [];
try {
  for (const def of defs) sampled.push(await sampleFixture(def));
} finally {
  await tcp.close();
}
const benign = sampled.filter((r) => r.label === 'benign');
const malicious = sampled.filter((r) => r.label === 'malicious');
const benignAlerting = benign.filter((r) => r.alertingMatched > 0);
const maliciousDetected = malicious.filter((r) => r.alertingMatched > 0);
const shortLived = sampled.find((r) => r.label === 'sampling_limit');
const report = {
  ok: benignAlerting.length === 0 && maliciousDetected.length === malicious.length,
  seed,
  node: process.version,
  fixtureHash: createHash('sha256').update(JSON.stringify(defs.map(({ match: _m, ...rest }) => rest))).digest('hex'),
  corpus: { liveFixtures: defs.length, benign: benign.length, malicious: malicious.length, samplingLimit: 1 },
  benignFalsePositiveRate: benignAlerting.length / benign.length,
  maliciousDetectionRate: maliciousDetected.length / malicious.length,
  shortLivedSocketObserved: (shortLived?.matched ?? 0) > 0,
  results: sampled.map(({ match: _m, arg, ...rest }) => ({ ...rest, arg: arg.includes(temp) ? arg.replace(temp, '<tmp>') : arg })),
  honestyNote: 'This harness measures the process observer against real child processes with real open files/sockets. The short-lived socket fixture is informational and demonstrates that sampled lsof mode may miss sub-interval activity.',
};
writeFileSync(join(resultsDir, 'process-observer-report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(resultsDir, 'process-observer-report.md'), `# MCPSnitch live process observer harness\n\nSeed: ${seed}\n\n| Metric | Value |\n|---|---:|\n| Live fixtures | ${report.corpus.liveFixtures} |\n| Benign false-positive rate | ${report.benignFalsePositiveRate.toFixed(3)} (${benignAlerting.length}/${benign.length}) |\n| Malicious detection rate | ${report.maliciousDetectionRate.toFixed(3)} (${maliciousDetected.length}/${malicious.length}) |\n| Short-lived socket observed | ${report.shortLivedSocketObserved} |\n\n${report.honestyNote}\n\nPass: ${report.ok}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
