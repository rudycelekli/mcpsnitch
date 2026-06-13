import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeJsonRpc, appendEvent, verifyLog, loadEvents, summarize } from '../../dist/index.js';

test('audit log is hash chained and detects tampering', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-'));
  appendEvent(analyzeJsonRpc(JSON.stringify({ id: 1, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'README.md' } } })), root);
  appendEvent(analyzeJsonRpc(JSON.stringify({ id: 2, method: 'tools/call', params: { name: 'fetch', arguments: { url: 'https://example.com' } } })), root);
  assert.equal(verifyLog(root).ok, true);
  const report = summarize(loadEvents(root));
  assert.equal(report.toolCalls, 2);
  assert.equal(report.events, 2);
  appendFileSync(join(root, '.mcpsnitch', 'audit.jsonl'), '{"bad":true}\n');
  assert.equal(verifyLog(root).ok, false);
});
