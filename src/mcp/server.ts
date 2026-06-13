import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { appendEvent, loadEvents, summarize, verifyLog } from '../log/store.js';

type ToolText = { content: Array<{ type: 'text'; text: string }>; structuredContent?: Record<string, unknown> };
function asText(data: unknown): ToolText { return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> }; }
async function failOpen(hint: string, fn: () => unknown | Promise<unknown>): Promise<ToolText> { try { return asText(await fn()); } catch (e) { return asText({ ok: false, warn: true, error: (e as Error).message, hint }); } }

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: 'mcpsnitch', version: '0.1.0' }, { instructions: 'MCPSnitch audit tools for MCP tool-call observability. Long-running proxy mode is the CLI: mcpsnitch watch -- <server command>.' });
  server.tool('snitch_analyze', 'Analyze one JSON-RPC/MCP message and append it to the audit log. Same engine used by the transparent stdio proxy.', { root: z.string().optional(), message: z.string().describe('JSON-RPC message string') }, async ({ root, message }) => failOpen('pass a JSON-RPC object string', () => ({ ok: true, event: appendEvent(analyzeJsonRpc(message), root) })));
  server.tool('snitch_report', 'Return the per-session audit report: tool calls, cost estimate, permission scopes, data-flow hints, and anomalies.', { root: z.string().optional() }, async ({ root }) => failOpen('run snitch_analyze or mcpsnitch watch first', () => summarize(loadEvents(root))));
  server.tool('snitch_verify_log', 'Verify the hash-chained JSONL audit log for tampering.', { root: z.string().optional() }, async ({ root }) => failOpen('run snitch_analyze or mcpsnitch watch first', () => verifyLog(root)));
  await server.connect(new StdioServerTransport());
}
