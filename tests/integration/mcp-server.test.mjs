import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CLI = new URL('../../dist/cli/index.js', import.meta.url).pathname;

test('operator MCP server lists and calls snitch tools', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcpsnitch-mcp-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'] });
  const client = new Client({ name: 'mcpsnitch-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  const list = await client.listTools();
  assert.ok(list.tools.some((t) => t.name === 'snitch_analyze'));
  assert.ok(list.tools.some((t) => t.name === 'snitch_profiles'));
  const call = await client.callTool({ name: 'snitch_analyze', arguments: { root, message: JSON.stringify({ id: 9, method: 'tools/call', params: { name: 'fetch', arguments: { url: 'https://example.com' } } }) } });
  const data = JSON.parse(call.content[0].text);
  assert.equal(data.ok, true);
  const report = await client.callTool({ name: 'snitch_report', arguments: { root } });
  const reportData = JSON.parse(report.content[0].text);
  assert.equal(reportData.toolCalls, 1);
  const profiles = await client.callTool({ name: 'snitch_profiles', arguments: {} });
  assert.ok(JSON.parse(profiles.content[0].text).profiles.some((p) => p.name === 'filesystem'));
  await client.close();
});
