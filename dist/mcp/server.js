import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { appendEvent, loadEvents, summarize, verifyLog } from '../log/store.js';
import { listProfiles } from '../policy/profile.js';
function asText(data) { return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data }; }
async function failOpen(hint, fn) { try {
    return asText(await fn());
}
catch (e) {
    return asText({ ok: false, warn: true, error: e.message, hint });
} }
export async function startMcpServer() {
    const server = new McpServer({ name: 'mcpsnitch', version: '0.1.2' }, { instructions: 'MCPSnitch audit tools for MCP tool-call observability. Long-running proxy mode is the CLI: mcpsnitch watch -- <server command>.' });
    server.tool('snitch_analyze', 'Analyze one JSON-RPC/MCP message and append it to the audit log. Same engine used by the transparent stdio proxy.', { root: z.string().optional(), message: z.string().describe('JSON-RPC message string') }, async ({ root, message }) => failOpen('pass a JSON-RPC object string', () => ({ ok: true, event: appendEvent(analyzeJsonRpc(message), root) })));
    server.tool('snitch_report', 'Return the per-session audit report: tool calls, cost estimate, permission scopes, data-flow hints, and anomalies.', { root: z.string().optional() }, async ({ root }) => failOpen('run snitch_analyze or mcpsnitch watch first', () => summarize(loadEvents(root))));
    server.tool('snitch_verify_log', 'Verify the hash-chained JSONL audit log for tampering.', { root: z.string().optional() }, async ({ root }) => failOpen('run snitch_analyze or mcpsnitch watch first', () => verifyLog(root)));
    server.tool('snitch_profiles', 'List built-in expected-behavior profiles used to contextualize process observations so legitimate network/file behavior does not become alert noise.', {}, async () => failOpen('profiles are bundled with MCPSnitch', () => ({ ok: true, profiles: listProfiles() })));
    await server.connect(new StdioServerTransport());
}
//# sourceMappingURL=server.js.map