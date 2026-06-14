#!/usr/bin/env node
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { eventFromObservation, lsofAvailable, readProcessTreeObservations } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, 'results');
const seed = 'mcpsnitch-v0.1.6-real-mcp-process-dogfood';
const REQUIRED_PACKAGES = {
  filesystem: '@modelcontextprotocol/server-filesystem@2026.1.14',
  fetch: 'mcp-server-fetch-typescript@0.1.1',
};
const OPTIONAL_PACKAGES = {
  github: '@modelcontextprotocol/server-github@2025.4.8',
  brave: '@modelcontextprotocol/server-brave-search@0.6.2',
};

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function highOrMedium(event) { return event.findings.some((f) => f.severity === 'medium' || f.severity === 'high'); }
function obsKey(obs) { return `${obs.pid}:${obs.kind}:${obs.fd ?? ''}:${obs.value}`; }
function redactArg(arg, temp) { return typeof arg === 'string' && temp && arg.includes(temp) ? arg.replace(temp, '<tmp>') : arg; }

class StdioJsonRpcSession {
  constructor(name, command, args, env = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = '';
    this.stdoutBuffer = '';
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    this.child.stdout.on('data', (chunk) => this.#onStdout(chunk));
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk.toString(); });
    this.exit = new Promise((resolve) => this.child.once('exit', (code, signal) => resolve({ code, signal })));
  }
  #onStdout(chunk) {
    this.stdoutBuffer += chunk.toString();
    for (;;) {
      const idx = this.stdoutBuffer.indexOf('\n');
      if (idx < 0) break;
      const line = this.stdoutBuffer.slice(0, idx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (!line.startsWith('{')) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${this.name} JSON-RPC ${msg.id} error: ${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
      }
    }
  }
  request(method, params = {}, timeoutMs = 30_000) {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} timed out waiting for ${method}; stderr=${this.stderr.slice(-1000)}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }
  notify(method, params = {}) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }
  async initialize() {
    const result = await this.request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mcpsnitch-real-mcp-harness', version: '0' } });
    this.notify('notifications/initialized');
    return result;
  }
  async close() {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error(`${this.name} closed`));
    }
    this.pending.clear();
    if (!this.child.killed) this.child.kill('SIGTERM');
    this.child.stdin.destroy();
    await Promise.race([this.exit, wait(2_000)]);
    if (!this.child.killed) this.child.kill('SIGKILL');
  }
}

async function startHeldHttpServer() {
  let requestSeenResolve;
  let releaseResponse;
  const requestSeen = new Promise((resolve) => { requestSeenResolve = resolve; });
  const release = new Promise((resolve) => { releaseResponse = resolve; });
  const server = createServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write('mcpsnitch real MCP fetch harness\n');
    requestSeenResolve();
    await release;
    res.end('done\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return {
    url: `http://127.0.0.1:${addr.port}/fixture.txt`,
    port: addr.port,
    requestSeen,
    release: () => releaseResponse(),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function isPackageLauncher(command) {
  return ['npx', 'npm', 'pnpm', 'yarn', 'bun', 'uvx', 'uv'].includes(command);
}

async function collectProcessEvents(pid, profile, { match, timeoutMs = 2_000, launcherCommand } = {}) {
  const seen = new Map();
  const deadline = Date.now() + timeoutMs;
  do {
    const observations = await readProcessTreeObservations(pid);
    for (const obs of observations) seen.set(obsKey(obs), obs);
    const events = [...seen.values()].map((obs) => eventFromObservation(obs, { profile, samplingIntervalMs: 250, launcherBootstrap: obs.pid === pid && obs.kind === 'network_socket' && isPackageLauncher(launcherCommand), launcherCommand }));
    if (!match || events.some(match)) return events;
    await wait(100);
  } while (Date.now() < deadline);
  return [...seen.values()].map((obs) => eventFromObservation(obs, { profile, samplingIntervalMs: 250, launcherBootstrap: obs.pid === pid && obs.kind === 'network_socket' && isPackageLauncher(launcherCommand), launcherCommand }));
}

async function runCase(def) {
  const session = new StdioJsonRpcSession(def.name, def.command, def.args, def.env);
  const startedAt = Date.now();
  try {
    const initialize = await session.initialize();
    const tools = await session.request('tools/list', {}, 30_000).catch((e) => ({ error: e.message, tools: [] }));
    const beforeEvents = await collectProcessEvents(session.child.pid, def.profile, { timeoutMs: 500, launcherCommand: def.command });
    const during = await def.exercise?.(session, tools);
    const processEvents = await collectProcessEvents(session.child.pid, def.profile, { match: def.match, timeoutMs: def.match ? 3_000 : 1_000, launcherCommand: def.command });
    const events = [...beforeEvents, ...processEvents];
    const alertingEvents = events.filter(highOrMedium);
    const matchedEvents = def.match ? events.filter(def.match) : [];
    return {
      name: def.name,
      package: def.package,
      label: def.label,
      profile: def.profile,
      command: def.command,
      args: def.args.map((arg) => redactArg(arg, def.temp ?? '')),
      pid: session.child.pid,
      serverInfo: initialize?.serverInfo,
      tools: Array.isArray(tools.tools) ? tools.tools.map((tool) => tool.name).slice(0, 20) : [],
      observations: events.length,
      matched: matchedEvents.length,
      alertingEvents: alertingEvents.length,
      alertingFindings: alertingEvents.flatMap((event) => event.findings.filter((f) => f.severity === 'medium' || f.severity === 'high').map((f) => ({ rule: f.rule, severity: f.severity, value: f.evidence.value }))),
      expectedEvidenceObserved: def.match ? matchedEvents.length > 0 : undefined,
      durationMs: Date.now() - startedAt,
      stderrTail: session.stderr.slice(-1000),
      during,
    };
  } finally {
    await def.cleanup?.();
    await session.close();
  }
}

const available = await lsofAvailable();
mkdirSync(resultsDir, { recursive: true });
if (!available) {
  const report = { ok: true, skipped: true, reason: 'lsof unavailable', seed };
  writeFileSync(join(resultsDir, 'real-mcp-process-report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(resultsDir, 'real-mcp-process-report.md'), '# MCPSnitch real MCP process-observer dogfood\n\nSkipped: lsof unavailable.\n');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const temp = mkdtempSync(join(tmpdir(), 'mcpsnitch-real-mcp-'));
const fixtureFile = join(temp, 'hello.txt');
writeFileSync(fixtureFile, 'hello from real MCP filesystem harness\n');
const heldHttp = await startHeldHttpServer();

const cases = [
  {
    name: 'filesystem-official-npm',
    package: REQUIRED_PACKAGES.filesystem,
    label: 'required_benign',
    profile: 'filesystem',
    command: 'npx',
    args: ['-y', REQUIRED_PACKAGES.filesystem, temp],
    temp,
    exercise: async (session) => {
      await session.request('tools/call', { name: 'list_directory', arguments: { path: temp } }, 30_000);
      await session.request('tools/call', { name: 'read_text_file', arguments: { path: fixtureFile } }, 30_000);
      return { toolCalls: ['list_directory', 'read_text_file'] };
    },
  },
  {
    name: 'fetch-typescript-npm-local-http',
    package: REQUIRED_PACKAGES.fetch,
    label: 'required_benign',
    profile: 'fetch',
    command: 'npx',
    args: ['-y', REQUIRED_PACKAGES.fetch],
    match: (event) => event.observation?.kind === 'network_socket' && event.observation.value.includes(String(heldHttp.port)),
    exercise: async (session) => {
      const call = session.request('tools/call', { name: 'get_raw_text', arguments: { url: heldHttp.url } }, 30_000);
      await Promise.race([heldHttp.requestSeen, wait(10_000)]);
      const duringEvents = await collectProcessEvents(session.child.pid, 'fetch', { match: (event) => event.observation?.kind === 'network_socket' && event.observation.value.includes(String(heldHttp.port)), timeoutMs: 3_000, launcherCommand: 'npx' });
      heldHttp.release();
      await call;
      return { toolCalls: ['get_raw_text'], heldSocketObservedDuringCall: duringEvents.some((event) => event.observation?.kind === 'network_socket' && event.observation.value.includes(String(heldHttp.port))) };
    },
    cleanup: () => heldHttp.close(),
  },
];

if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN) {
  cases.push({
    name: 'github-official-npm-token-present',
    package: OPTIONAL_PACKAGES.github,
    label: 'optional_benign',
    profile: 'github',
    command: 'npx',
    args: ['-y', OPTIONAL_PACKAGES.github],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_TOKEN },
    exercise: async () => ({ toolCalls: ['tools/list'], note: 'token present; no secret values recorded' }),
  });
}
if (process.env.BRAVE_API_KEY) {
  cases.push({
    name: 'brave-search-official-npm-key-present',
    package: OPTIONAL_PACKAGES.brave,
    label: 'optional_benign',
    profile: 'fetch',
    command: 'npx',
    args: ['-y', OPTIONAL_PACKAGES.brave],
    env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY },
    exercise: async () => ({ toolCalls: ['tools/list'], note: 'API key present; no secret values recorded' }),
  });
}

const results = [];
let harnessError;
try {
  for (const def of cases) results.push(await runCase(def));
} catch (e) {
  harnessError = e;
  try { await heldHttp.close(); } catch {}
}
const required = results.filter((result) => result.label === 'required_benign');
const optionalSkipped = [
  ...(process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN ? [] : [{ name: 'github-official-npm', reason: 'GITHUB_PERSONAL_ACCESS_TOKEN/GITHUB_TOKEN not set' }]),
  ...(process.env.BRAVE_API_KEY ? [] : [{ name: 'brave-search-official-npm', reason: 'BRAVE_API_KEY not set' }]),
];
const benignAlerting = results.filter((result) => result.alertingEvents > 0);
const requiredEvidenceMisses = required.filter((result) => result.expectedEvidenceObserved === false);
const report = {
  ok: !harnessError && required.length === 2 && benignAlerting.length === 0 && requiredEvidenceMisses.length === 0,
  seed,
  node: process.version,
  fixtureHash: createHash('sha256').update(JSON.stringify({ REQUIRED_PACKAGES, OPTIONAL_PACKAGES, caseNames: cases.map((c) => c.name) })).digest('hex'),
  corpus: { requiredRealServers: required.length, optionalRealServersRun: results.filter((r) => r.label === 'optional_benign').length, optionalSkipped: optionalSkipped.length },
  benignFalsePositiveRate: results.length ? benignAlerting.length / results.length : 0,
  benignAlertingServers: benignAlerting.map((r) => r.name),
  requiredEvidenceMisses: requiredEvidenceMisses.map((r) => r.name),
  results,
  optionalSkipped,
  error: harnessError ? String(harnessError.stack ?? harnessError.message ?? harnessError) : undefined,
  honestyNote: 'This harness runs real pinned MCP npm packages as child process trees. It measures alerting false positives from the same lsof process-observer layer MCPSnitch uses in guard mode. Optional GitHub/Brave cases require user-provided credentials and are skipped without weakening the required local measurement.',
};
writeFileSync(join(resultsDir, 'real-mcp-process-report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(resultsDir, 'real-mcp-process-report.md'), `# MCPSnitch real MCP process-observer dogfood\n\nSeed: ${seed}\n\n| Metric | Value |\n|---|---:|\n| Required real MCP servers | ${report.corpus.requiredRealServers} |\n| Optional real MCP servers run | ${report.corpus.optionalRealServersRun} |\n| Optional servers skipped | ${report.corpus.optionalSkipped} |\n| Benign alerting false-positive rate | ${report.benignFalsePositiveRate.toFixed(3)} (${benignAlerting.length}/${results.length}) |\n| Required expected evidence misses | ${requiredEvidenceMisses.length} |\n\nRequired cases: ${required.map((r) => r.name).join(', ')}.\n\nOptional skipped: ${optionalSkipped.length ? optionalSkipped.map((s) => `${s.name} (${s.reason})`).join(', ') : 'none'}.\n\n${report.honestyNote}\n\nPass: ${report.ok}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
