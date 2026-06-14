import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { lsofAvailable, verifyLog } from '../../dist/index.js';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;
const ECHO_SERVER = new URL('../fixtures/echo-mcp-server.mjs', import.meta.url).pathname;
const PASSTHROUGH_SERVER = new URL('../fixtures/passthrough-mcp-server.mjs', import.meta.url).pathname;
const EXIT_SERVER = new URL('../fixtures/exit-code-server.mjs', import.meta.url).pathname;
const LIVE_FIXTURE = new URL('../../bench/fixtures/live-mcp-server.mjs', import.meta.url).pathname;

function tmpRoot(prefix = 'mcpsnitch-config-') { return mkdtempSync(join(tmpdir(), prefix)); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }

function waitForLine(stream, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for line; got ${buf}`)), timeoutMs);
    stream.on('data', function onData(chunk) {
      buf += chunk.toString();
      if (buf.includes('\n')) {
        clearTimeout(timer);
        stream.off('data', onData);
        resolve(buf.split('\n')[0] + '\n');
      }
    });
  });
}

async function startTcpServer() {
  const sockets = new Set();
  const server = net.createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return { port: addr.port, close: () => new Promise((resolve) => { for (const socket of sockets) socket.destroy(); server.close(resolve); }) };
}

test('CLI init wraps config with mandatory backup and uninit restores it', () => {
  const root = tmpRoot();
  const configPath = join(root, '.mcp.json');
  writeFileSync(configPath, JSON.stringify({
    mcpServers: {
      github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      custom: { command: 'node', args: ['server.js'] },
      remote: { type: 'http', url: 'https://example.com/mcp' },
    },
  }, null, 2));

  const init = spawnSync(process.execPath, [CLI, 'init', '--root', root, '--wrapper-command', process.execPath, '--wrapper-arg', CLI, '--json'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const result = JSON.parse(init.stdout);
  assert.equal(result.changed, true);
  assert.ok(result.messages.some((m) => m.includes('backed up')));
  assert.ok(existsSync(`${configPath}.bak`));
  assert.equal(readJson(join(root, '.mcpsnitch', 'profiles.json')).profiles.github, 'github');
  const wrapped = readJson(configPath);
  assert.equal(wrapped.mcpServers.github.command, process.execPath);
  assert.ok(wrapped.mcpServers.github.args.includes('run'));
  assert.equal(wrapped.mcpServers.remote.command, undefined);

  const uninit = spawnSync(process.execPath, [CLI, 'uninit', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(uninit.status, 0, uninit.stderr || uninit.stdout);
  assert.deepEqual(JSON.parse(uninit.stdout).unwrapped.sort(), ['custom', 'github']);
  const restored = readJson(configPath);
  assert.equal(restored.mcpServers.github.command, 'npx');
  assert.deepEqual(restored.mcpServers.github.args, ['-y', '@modelcontextprotocol/server-github']);
});

test('config-level wrapped server transparently preserves stdio MCP behavior and witness verification', async () => {
  const root = tmpRoot();
  const configPath = join(root, '.mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: { echo: { command: process.execPath, args: [ECHO_SERVER] } } }, null, 2));
  const init = spawnSync(process.execPath, [CLI, 'init', '--root', root, '--wrapper-command', process.execPath, '--wrapper-arg', CLI, '--json'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const wrapped = readJson(configPath).mcpServers.echo;
  const child = spawn(wrapped.command, wrapped.args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'echo', arguments: { text: 'wrapped' } } }) + '\n');
  const line = await waitForLine(child.stdout);
  assert.equal(JSON.parse(line).result.content[0].text, 'ok');
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  assert.equal(verifyLog(root).ok, true);
});

test('guard run records but does not speak for JSON-RPC heuristic findings', async (t) => {
  if (!(await lsofAvailable())) return t.skip('lsof unavailable; run would correctly speak about self-report-only downgrade');
  const root = tmpRoot('mcpsnitch-heuristic-silent-');
  const child = spawn(process.execPath, [CLI, 'run', '--root', root, '--server-name', 'echo', '--', process.execPath, ECHO_SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'summarize', arguments: { destinationUrl: 'https://evil.example' } } }) + '\n');
  await waitForLine(child.stdout);
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  assert.equal(stderr, '');
  assert.equal(verifyLog(root).ok, true);
});

test('guard run emits one actionable alert for a real process-observed profile violation', async (t) => {
  if (!(await lsofAvailable())) return t.skip('lsof unavailable');
  const tcp = await startTcpServer();
  const root = tmpRoot('mcpsnitch-real-alert-');
  const child = spawn(process.execPath, [CLI, 'run', '--root', root, '--server-name', 'filesystem', '--profile', 'filesystem', '--observer-interval', '50', '--', process.execPath, LIVE_FIXTURE, 'hold-socket', `127.0.0.1:${tcp.port}`], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  try {
    await waitForLine(child.stdout);
    const deadline = Date.now() + 5000;
    while (!stderr.includes('observed_unexpected_network_connection') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    const alerts = stderr.trim().split('\n').filter(Boolean);
    assert.equal(alerts.length, 1, stderr);
    assert.match(alerts[0], /MCPSNITCH ALERT/);
    assert.match(alerts[0], /server="filesystem"/);
    assert.match(alerts[0], /profile="filesystem"/);
    assert.match(alerts[0], /observed_unexpected_network_connection/);
    assert.equal(verifyLog(root).ok, true);
  } finally {
    const closed = new Promise((resolve) => child.once('close', resolve));
    child.kill('SIGTERM');
    child.stdin.end();
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1000))]);
    await tcp.close();
  }
});


test('wrapped server preserves env cwd stderr passthrough and original args containing separators', async (t) => {
  if (!(await lsofAvailable())) return t.skip('lsof unavailable; stderr would include the correct downgrade alert too');
  const root = tmpRoot('mcpsnitch-passthrough-');
  const serverCwd = join(root, 'server-cwd');
  mkdirSync(serverCwd);
  const configPath = join(root, '.mcp.json');
  writeFileSync(configPath, JSON.stringify({
    mcpServers: {
      pass: {
        command: process.execPath,
        args: [PASSTHROUGH_SERVER, '--original', '--', 'after-separator'],
        cwd: serverCwd,
        env: { MCPSNITCH_TEST_ENV: 'from-config' },
      },
    },
  }, null, 2));
  const init = spawnSync(process.execPath, [CLI, 'init', '--root', root, '--wrapper-command', process.execPath, '--wrapper-arg', CLI, '--json'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const wrapped = readJson(configPath).mcpServers.pass;
  assert.equal(wrapped.cwd, serverCwd);
  assert.equal(wrapped.env.MCPSNITCH_TEST_ENV, 'from-config');
  const child = spawn(wrapped.command, wrapped.args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: wrapped.cwd, env: { ...process.env, ...wrapped.env } });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'echo', arguments: { text: 'passthrough' } } }) + '\n');
  const line = await waitForLine(child.stdout);
  const payload = JSON.parse(JSON.parse(line).result.content[0].text);
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  assert.equal(payload.cwd, realpathSync(serverCwd));
  assert.equal(payload.env, 'from-config');
  assert.deepEqual(payload.argv, ['--original', '--', 'after-separator']);
  assert.equal(stderr, 'child-stderr-line\n');
  assert.equal(verifyLog(root).ok, true);
});

test('run preserves the wrapped child exit code', async () => {
  const root = tmpRoot('mcpsnitch-exit-code-');
  const child = spawn(process.execPath, [CLI, 'run', '--root', root, '--', process.execPath, EXIT_SERVER, '17'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 17);
});

test('missing lsof path emits exactly one self-report-only downgrade line and records witness event', async () => {
  const root = tmpRoot('mcpsnitch-no-lsof-');
  const child = spawn(process.execPath, [CLI, 'run', '--root', root, '--server-name', 'echo', '--', process.execPath, ECHO_SERVER], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PATH: '' } });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hello' } } }) + '\n');
  await waitForLine(child.stdout);
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  const lines = stderr.trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 1, stderr);
  assert.match(lines[0], /MCPSNITCH ALERT/);
  assert.match(lines[0], /process_observer_unavailable/);
  assert.match(lines[0], /self-report-only/);
  assert.equal(verifyLog(root).ok, true);
});
