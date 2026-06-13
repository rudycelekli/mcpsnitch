#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeJsonRpc, eventFromObservation } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const seed = 'mcpsnitch-v0.1.2-profiled-benign-corpus';
const benignCases = [
  {
    server: 'filesystem',
    profile: 'filesystem',
    messages: [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_file', arguments: { path: './README.md' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_directory', arguments: { path: './src' } } },
    ],
    observations: [
      { pid: 111, kind: 'file_open', value: '/Users/alice/project/README.md', fd: '12r' },
      { pid: 111, kind: 'file_open', value: '/Users/alice/project/src/index.ts', fd: '13r' },
    ],
  },
  {
    server: 'github',
    profile: 'github',
    messages: [
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_issue', arguments: { owner: 'octo', repo: 'hello-world', issue_number: 1 } } },
    ],
    observations: [
      { pid: 222, kind: 'network_socket', value: 'TCP 127.0.0.1:50123->140.82.112.6:443 (ESTABLISHED)', fd: '20u', protocol: 'IPv4' },
    ],
  },
  {
    server: 'fetch',
    profile: 'fetch',
    messages: [
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'fetch_url', arguments: { url: 'https://example.com/docs' } } },
    ],
    observations: [
      { pid: 333, kind: 'network_socket', value: 'TCP 127.0.0.1:50124->93.184.216.34:443 (ESTABLISHED)', fd: '21u', protocol: 'IPv4' },
    ],
  },
  {
    server: 'brave-search',
    profile: 'fetch',
    messages: [
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'brave_web_search', arguments: { query: 'model context protocol security' } } },
    ],
    observations: [
      { pid: 444, kind: 'network_socket', value: 'TCP 127.0.0.1:50125->104.18.32.1:443 (ESTABLISHED)', fd: '22u', protocol: 'IPv4' },
    ],
  },
  {
    server: 'database',
    profile: 'database',
    messages: [
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'query_database', arguments: { sql: 'select 1' } } },
    ],
    observations: [
      { pid: 555, kind: 'network_socket', value: 'TCP 127.0.0.1:50126->10.0.0.12:5432 (ESTABLISHED)', fd: '23u', protocol: 'IPv4' },
    ],
  },
  {
    server: 'prose-tool',
    profile: 'generic',
    messages: [
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'summarize_text', arguments: { text: 'This text mentions file, URL, network, token, and password reset as prose only.' } } },
    ],
    observations: [],
  },
];

const maliciousCases = [
  {
    server: 'filesystem-unexpected-network',
    profile: 'filesystem',
    messages: [],
    observations: [
      { pid: 666, kind: 'network_socket', value: 'TCP 127.0.0.1:50127->203.0.113.10:443 (ESTABLISHED)', fd: '24u', protocol: 'IPv4' },
    ],
  },
  {
    server: 'generic-sensitive-file',
    profile: 'generic',
    messages: [],
    observations: [
      { pid: 777, kind: 'file_open', value: '/Users/alice/project/.env', fd: '25r' },
    ],
  },
];

function highOrMedium(event) {
  return event.findings.some((f) => f.severity === 'medium' || f.severity === 'high');
}
function evaluateCase(c, label) {
  const jsonEvents = c.messages.map((msg) => analyzeJsonRpc(JSON.stringify(msg)));
  const processEvents = c.observations.map((obs) => eventFromObservation(obs, { profile: c.profile }));
  const events = [...jsonEvents, ...processEvents];
  return { ...c, label, events, alertingEvents: events.filter(highOrMedium).length };
}
const evaluatedBenign = benignCases.map((c) => evaluateCase(c, 'benign'));
const evaluatedMalicious = maliciousCases.map((c) => evaluateCase(c, 'malicious'));
const all = [...evaluatedBenign, ...evaluatedMalicious];
const benignAlerting = evaluatedBenign.filter((c) => c.alertingEvents > 0);
const maliciousAlerting = evaluatedMalicious.filter((c) => c.alertingEvents > 0);
const report = {
  ok: benignAlerting.length === 0 && maliciousAlerting.length === maliciousCases.length,
  seed,
  fixtureHash: createHash('sha256').update(JSON.stringify({ benignCases, maliciousCases })).digest('hex'),
  corpus: { benignServers: benignCases.length, maliciousFixtures: maliciousCases.length, events: all.reduce((n, c) => n + c.events.length, 0) },
  benignFalsePositiveRate: benignAlerting.length / benignCases.length,
  benignAlertingServers: benignAlerting.map((c) => c.server),
  maliciousDetectionRate: maliciousAlerting.length / maliciousCases.length,
  maliciousAlertingServers: maliciousAlerting.map((c) => c.server),
  byServer: all.map((c) => ({ server: c.server, label: c.label, profile: c.profile, events: c.events.length, alertingEvents: c.alertingEvents, findings: c.events.flatMap((e) => e.findings.map((f) => ({ rule: f.rule, severity: f.severity }))) })),
  note: 'This is a deterministic representative benign corpus harness. It measures profile-contextual false positives without requiring external API credentials; live-server dogfood should extend it, not replace it.',
};
mkdirSync(join(here, 'results'), { recursive: true });
writeFileSync(join(here, 'results', 'false-positive-report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(here, 'results', 'false-positive-report.md'), `# MCPSnitch false-positive harness\n\nSeed: ${seed}\n\n| Metric | Value |\n|---|---:|\n| Benign server fixtures | ${report.corpus.benignServers} |\n| Malicious fixtures | ${report.corpus.maliciousFixtures} |\n| Benign false-positive rate | ${report.benignFalsePositiveRate.toFixed(3)} (${benignAlerting.length}/${benignCases.length}) |\n| Malicious detection rate | ${report.maliciousDetectionRate.toFixed(3)} (${maliciousAlerting.length}/${maliciousCases.length}) |\n\n${report.note}\n\nPass: ${report.ok}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
