import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEvents, verifyLog, lsofAvailable } from '../../dist/index.js';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;
const SERVER = new URL('../fixtures/echo-mcp-server.mjs', import.meta.url).pathname;

test('watch transparently forwards JSON-RPC and records audit event', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-proxy-'));
  const child = spawn(process.execPath, [CLI, 'watch', '--root', root, '--no-process-observer', '--', process.execPath, SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'summarize', arguments: { url: 'https://evil.example' } } }) + '\n');
  let output = '';
  for await (const chunk of child.stdout) { output += chunk.toString(); if (output.includes('\n')) break; }
  const response = JSON.parse(output.trim());
  assert.equal(response.id, 1);
  assert.equal(response.result.content[0].text, 'ok');
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  const events = loadEvents(root);
  assert.ok(events.some((e) => e.method === 'tools/call' && e.toolName === 'summarize'));
  assert.equal(verifyLog(root).ok, true);
});


test('run is a quiet-by-default wrapper that forwards JSON-RPC and records actionable observer downgrades', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-run-'));
  const child = spawn(process.execPath, [CLI, 'run', '--root', root, '--no-process-observer', '--', process.execPath, SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hello' } } }) + '\n');
  let output = '';
  for await (const chunk of child.stdout) { output += chunk.toString(); if (output.includes('\n')) break; }
  const response = JSON.parse(output.trim());
  assert.equal(response.id, 7);
  assert.equal(response.result.content[0].text, 'ok');
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));

  assert.match(stderr, /MCPSNITCH ALERT/);
  assert.match(stderr, /rule=process_observer_unavailable/);
  assert.match(stderr, /self-report-only/);
  const events = loadEvents(root);
  assert.ok(events.some((e) => e.method === 'process\/observer_status'));
  assert.ok(events.some((e) => e.method === 'tools/call' && e.toolName === 'echo'));
  assert.equal(verifyLog(root).ok, true);
});

test('run help advertises silent clean behavior and auto profiles', () => {
  const help = spawnSync(process.execPath, [CLI, 'run', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /Silent-when-clean stdio wrapper/);
  assert.match(help.stdout, /auto-match\s+known server commands/);
  assert.match(help.stdout, /--verbose/);
});


test('run stays silent on clean sessions when process observation is available', async (t) => {
  if (!(await lsofAvailable())) return t.skip('lsof unavailable on this host');
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-run-clean-'));
  const child = spawn(process.execPath, [CLI, 'run', '--root', root, '--', process.execPath, SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'echo', arguments: { text: 'clean' } } }) + '\n');
  let output = '';
  for await (const chunk of child.stdout) { output += chunk.toString(); if (output.includes('\n')) break; }
  assert.equal(JSON.parse(output.trim()).id, 8);
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  assert.equal(stderr, '');
  assert.equal(verifyLog(root).ok, true);
});
