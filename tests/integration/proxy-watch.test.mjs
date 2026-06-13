import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEvents, verifyLog } from '../../dist/index.js';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;
const SERVER = new URL('../fixtures/echo-mcp-server.mjs', import.meta.url).pathname;

test('watch transparently forwards JSON-RPC and records audit event', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-proxy-'));
  const child = spawn(process.execPath, [CLI, 'watch', '--root', root, '--', process.execPath, SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
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
