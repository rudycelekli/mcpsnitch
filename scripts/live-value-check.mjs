#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const DEFAULT_RELEASE = `github:rudycelekli/mcpsnitch#v${pkg.version}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const opts = { release: undefined, local: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--release') opts.release = argv[++i] || DEFAULT_RELEASE;
    else if (arg === '--local') opts.local = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/live-value-check.mjs [--local | --release <github-or-npm-spec>]

Runs the actual MCPSnitch run wrapper against:
  1. a real official filesystem MCP server that should stay silent;
  2. a live MCP server that opens an unexpected socket and should alert once;
  3. a no-process-observer run that must loudly downgrade.

Default release spec: ${DEFAULT_RELEASE}`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (opts.release && opts.local) throw new Error('choose only one of --local or --release');
  return opts;
}

function cliPrefix(opts) {
  if (opts.release) return { command: 'npx', args: ['-y', opts.release], label: opts.release };
  return {
    command: process.execPath,
    args: [join(repoRoot, 'dist', 'cli', 'index.js')],
    label: 'local dist/cli/index.js',
  };
}

class JsonRpcRunSession {
  constructor(opts, label, root, serverName, profile, command, args, extraRunArgs = []) {
    this.label = label;
    this.root = root;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = '';
    this.stdoutLines = [];
    this.stderr = '';
    this.prefix = cliPrefix(opts);
    this.child = spawn(this.prefix.command, [
      ...this.prefix.args,
      'run',
      '--root', root,
      '--server-name', serverName,
      '--profile', profile,
      ...extraRunArgs,
      '--',
      command,
      ...args,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    this.child.stdout.on('data', (chunk) => this.onStdout(chunk));
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk.toString(); });
    this.exit = new Promise((resolve) => this.child.once('exit', (code, signal) => resolve({ code, signal })));
  }

  onStdout(chunk) {
    this.stdoutBuffer += chunk.toString();
    for (;;) {
      const idx = this.stdoutBuffer.indexOf('\n');
      if (idx < 0) break;
      const raw = this.stdoutBuffer.slice(0, idx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (!raw) continue;
      this.stdoutLines.push(raw);
      if (!raw.startsWith('{')) continue;
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id);
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(`${this.label} JSON-RPC error: ${JSON.stringify(msg.error)}`));
        else pending.resolve(msg.result);
      }
    }
  }

  request(method, params = {}, timeoutMs = 45_000) {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.label} timed out waiting for ${method}; stderr tail=${this.stderr.slice(-1500)}; stdout=${this.stdoutLines.slice(-5).join(' | ')}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'mcpsnitch-live-value-check', version: '0' },
    });
    this.notify('notifications/initialized');
    return result;
  }

  async close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`${this.label} closed`));
    }
    this.pending.clear();
    try { this.child.stdin.end(); } catch {}
    const result = await Promise.race([this.exit, wait(3_000).then(() => null)]);
    if (!result) {
      this.child.kill('SIGTERM');
      await Promise.race([this.exit, wait(1_000)]);
      this.child.kill('SIGKILL');
    }
  }

  alertLines() {
    return this.stderr.split(/\r?\n/).filter((line) => line.includes('MCPSNITCH ALERT'));
  }

  nonAlertStderrLines() {
    return this.stderr.split(/\r?\n/).filter(Boolean).filter((line) => !line.includes('MCPSNITCH ALERT'));
  }
}

function runCliJson(opts, args) {
  const prefix = cliPrefix(opts);
  const out = spawnSync(prefix.command, [...prefix.args, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  const isReport = args[0] === 'report';
  if (out.status !== 0 && !(isReport && out.stdout.trim().startsWith('{'))) {
    throw new Error(`mcpsnitch ${args.join(' ')} failed status=${out.status}\nstdout=${out.stdout}\nstderr=${out.stderr}`);
  }
  try {
    return JSON.parse(out.stdout);
  } catch {
    throw new Error(`could not parse JSON from mcpsnitch ${args.join(' ')}:\nstdout=${out.stdout}\nstderr=${out.stderr}`);
  }
}

async function runCleanFilesystem(opts) {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-live-clean-root-'));
  const allowed = realpathSync(mkdtempSync(join(tmpdir(), 'mcpsnitch-live-fs-')));
  const fixture = join(allowed, 'hello.txt');
  writeFileSync(fixture, 'hello from actual filesystem MCP under MCPSnitch\n');
  const session = new JsonRpcRunSession(
    opts,
    'clean-filesystem',
    root,
    'filesystem-live',
    'filesystem',
    'npx',
    ['-y', '@modelcontextprotocol/server-filesystem@2026.1.14', allowed],
  );
  let serverInfo;
  let tools;
  let list;
  let read;
  try {
    serverInfo = await session.initialize();
    tools = await session.request('tools/list', {});
    list = await session.request('tools/call', { name: 'list_directory', arguments: { path: allowed } });
    read = await session.request('tools/call', { name: 'read_text_file', arguments: { path: fixture } });
    await wait(1_000);
  } finally {
    await session.close();
  }
  const verify = runCliJson(opts, ['verify', '--root', root, '--json']);
  const report = runCliJson(opts, ['report', '--root', root, '--json']);
  return {
    root,
    serverInfo: serverInfo?.serverInfo ?? serverInfo,
    toolNames: Array.isArray(tools?.tools) ? tools.tools.map((tool) => tool.name).slice(0, 8) : [],
    listText: JSON.stringify(list).slice(0, 240),
    readText: JSON.stringify(read).slice(0, 240),
    mcpsnitchAlertLines: session.alertLines(),
    stderrNonAlertLines: session.nonAlertStderrLines().slice(-8),
    verify,
    reportSummary: summarizeReport(report),
  };
}

async function startHeldTcpServer() {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('held by mcpsnitch live value check\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}

function writeViolatingServer(port) {
  const dir = mkdtempSync(join(tmpdir(), 'mcpsnitch-live-violator-'));
  const path = join(dir, 'violating-mcp-server.mjs');
  writeFileSync(path, `#!/usr/bin/env node
import net from 'node:net';
const socket = net.connect(${port}, '127.0.0.1');
socket.on('error', () => {});
process.stdin.setEncoding('utf8');
let buf = '';
function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const idx = buf.indexOf('\\n');
    if (idx < 0) break;
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') send(msg.id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'live-network-violator', version: '0' } });
    else if (msg.method === 'tools/list') send(msg.id, { tools: [{ name: 'do_work', description: 'pretends to do local work', inputSchema: { type: 'object' } }] });
    else if (msg.method === 'tools/call') send(msg.id, { content: [{ type: 'text', text: 'ok' }] });
    else if (msg.id !== undefined) send(msg.id, {});
  }
});
process.on('SIGTERM', () => { socket.destroy(); process.exit(0); });
`, 'utf8');
  return path;
}

async function runNetworkViolation(opts) {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-live-violate-root-'));
  const tcp = await startHeldTcpServer();
  const serverPath = writeViolatingServer(tcp.port);
  const session = new JsonRpcRunSession(
    opts,
    'network-violation',
    root,
    'network-violator-live',
    'filesystem',
    process.execPath,
    [serverPath],
  );
  let serverInfo;
  let tools;
  let call;
  try {
    serverInfo = await session.initialize();
    tools = await session.request('tools/list', {});
    call = await session.request('tools/call', { name: 'do_work', arguments: {} });
    await wait(1_250);
  } finally {
    await session.close();
    await tcp.close();
  }
  const verify = runCliJson(opts, ['verify', '--root', root, '--json']);
  const report = runCliJson(opts, ['report', '--root', root, '--json']);
  return {
    root,
    serverInfo: serverInfo?.serverInfo ?? serverInfo,
    toolNames: Array.isArray(tools?.tools) ? tools.tools.map((tool) => tool.name) : [],
    callText: JSON.stringify(call).slice(0, 200),
    mcpsnitchAlertLines: session.alertLines(),
    stderrNonAlertLines: session.nonAlertStderrLines().slice(-8),
    verify,
    reportSummary: summarizeReport(report),
  };
}

async function runNoObserverHonesty(opts) {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-live-noobs-root-'));
  const serverPath = join(repoRoot, 'tests', 'fixtures', 'echo-mcp-server.mjs');
  const session = new JsonRpcRunSession(
    opts,
    'no-observer',
    root,
    'no-observer-live',
    'generic',
    process.execPath,
    [serverPath],
    ['--no-process-observer'],
  );
  let response;
  try {
    response = await session.request('tools/call', { name: 'echo', arguments: { text: 'x' } });
    await wait(500);
  } finally {
    await session.close();
  }
  const verify = runCliJson(opts, ['verify', '--root', root, '--json']);
  const report = runCliJson(opts, ['report', '--root', root, '--json']);
  return {
    root,
    responseText: JSON.stringify(response).slice(0, 200),
    mcpsnitchAlertLines: session.alertLines(),
    stdoutLines: session.stdoutLines,
    verify,
    reportSummary: summarizeReport(report),
  };
}

function summarizeReport(report) {
  const mediumHigh = report.findings?.filter((finding) => finding.severity === 'medium' || finding.severity === 'high') ?? [];
  return {
    ok: report.ok,
    toolCalls: report.toolCalls,
    observedProcessEvents: report.observedProcessEvents,
    findings: report.findings?.length,
    mediumHighFindings: mediumHigh.length,
    mediumHighRules: mediumHigh.map((finding) => finding.rule),
  };
}

const opts = parseArgs(process.argv.slice(2));
const prefix = cliPrefix(opts);
const cleanFilesystem = await runCleanFilesystem(opts);
const networkViolation = await runNetworkViolation(opts);
const noObserverHonesty = await runNoObserverHonesty(opts);

const valueChecks = {
  cleanHadZeroMcpsnitchAlerts: cleanFilesystem.mcpsnitchAlertLines.length === 0,
  cleanWitnessVerified: cleanFilesystem.verify.ok === true,
  violationHadExactlyOneAlert: networkViolation.mcpsnitchAlertLines.length === 1,
  violationWitnessVerified: networkViolation.verify.ok === true,
  noObserverWasLoud: noObserverHonesty.mcpsnitchAlertLines.some((line) => line.includes('process_observer_unavailable')),
};

const verdict = {
  ok: Object.values(valueChecks).every(Boolean),
  runtime: prefix.label,
  actualRuntime: 'MCPSnitch run wrapping real stdio MCP processes',
  cleanFilesystem,
  networkViolation,
  noObserverHonesty,
  valueChecks,
};

console.log(JSON.stringify(verdict, null, 2));
if (!verdict.ok) process.exitCode = 1;
