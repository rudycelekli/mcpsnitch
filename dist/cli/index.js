#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { appendEvent, loadEvents, summarize, verifyLog, writeReport } from '../log/store.js';
import { watchStdio } from '../proxy/stdio.js';
import { startHttpServer } from '../http/server.js';
import { startMcpServer } from '../mcp/server.js';
import { eventFromObservation, readProcessObservations } from '../process/observer.js';
import { listProfiles } from '../policy/profile.js';
const program = new Command();
program.name('mcpsnitch').description('Transparent MCP tool-call proxy and audit reporter').version('0.1.2');
function out(json, data, human) { if (json)
    console.log(JSON.stringify(data, null, 2));
else
    human(); }
function fail(json, code, msg) { if (json)
    console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
else
    console.error(`mcpsnitch: ${msg}`); process.exit(code); }
program.command('analyze').description('Analyze one JSON-RPC message and append it to .mcpsnitch/audit.jsonl').argument('<jsonrpc>').option('--root <path>', 'workspace root', '.').option('--json', 'machine-readable output').action((msg, o) => { try {
    const event = appendEvent(analyzeJsonRpc(msg), o.root);
    out(o.json, { ok: true, event }, () => console.log(`${event.findings.length ? 'FLAG' : 'OK'} ${event.method ?? 'message'} ${event.toolName ?? ''}`.trim()));
}
catch (e) {
    fail(o.json, 2, e.message);
} });
program.command('watch').description('Transparent stdio proxy: mcpsnitch watch -- <mcp-server-command> [args...]').option('--root <path>', 'workspace root', '.').option('--profile <name>', 'expected behavior profile: generic | filesystem | fetch | github | database', 'generic').option('--observer-interval <ms>', 'process observer sampling interval', (v) => Number(v)).option('--no-process-observer', 'disable best-effort lsof process observation').allowUnknownOption(true).argument('[cmd...]').action(async (cmd, o) => { const sep = cmd; if (!sep.length)
    fail(false, 2, 'missing command: mcpsnitch watch -- <server>'); const code = await watchStdio({ root: o.root, command: sep[0], args: sep.slice(1), processObserver: o.processObserver, profile: o.profile, observerIntervalMs: o.observerInterval }); process.exit(code); });
program.command('report').description('Print current audit report').option('--root <path>', 'workspace root', '.').option('--write', 'write .mcpsnitch/report.json').option('--json', 'machine-readable output').action((o) => { try {
    const report = o.write ? writeReport(o.root) : summarize(loadEvents(o.root));
    out(o.json, report, () => { console.log(`MCPSnitch report: ${report.toolCalls} tool calls, ${report.observedProcessEvents} process observations, $${report.estimatedCostUsd.toFixed(9)} estimated, ${report.findings.length} findings`); for (const f of report.findings)
        console.log(`${f.severity.toUpperCase()} ${f.rule}: ${f.message}`); });
    process.exit(report.ok ? 0 : 1);
}
catch (e) {
    fail(o.json, 2, e.message);
} });
program.command('verify').description('Verify the audit log hash chain').option('--root <path>', 'workspace root', '.').option('--json', 'machine-readable output').action((o) => { const r = verifyLog(o.root); out(o.json, r, () => console.log(r.ok ? `audit log ok (${r.entries} entries)` : `audit log broken at ${r.firstBreak?.seq}: ${r.firstBreak?.reason}`)); process.exit(r.ok ? 0 : 1); });
program.command('observe').description('One-shot OS process observation via lsof: records open files/sockets for a PID when available').requiredOption('--pid <pid>', 'child process id to inspect', (v) => Number(v)).option('--profile <name>', 'expected behavior profile: generic | filesystem | fetch | github | database', 'generic').option('--root <path>', 'workspace root', '.').option('--json', 'machine-readable output').action(async (o) => { try {
    const observations = await readProcessObservations(o.pid);
    const events = observations.map((obs) => appendEvent(eventFromObservation(obs, { profile: o.profile }), o.root));
    out(o.json, { ok: true, profile: o.profile, observations: observations.length, events }, () => { console.log(`observed ${observations.length} process entries for pid ${o.pid} (profile=${o.profile})`); for (const event of events)
        console.log(`${event.eventType} ${event.observation?.value ?? ''}`); });
    process.exit(events.some((e) => e.findings.some((f) => f.severity === 'medium' || f.severity === 'high')) ? 1 : 0);
}
catch (e) {
    fail(o.json, 2, e.message);
} });
program.command('serve').description('Start local HTTP endpoint server').option('--root <path>', 'workspace root', '.').option('--port <port>', 'port', (v) => Number(v)).option('--json', 'machine-readable startup line').action(async (o) => { const s = await startHttpServer({ root: o.root, port: o.port }); console.log(JSON.stringify({ ok: true, port: s.port, endpoints: ['POST /analyze', 'GET /report', 'POST /report', 'GET /verify', 'GET /profiles'] })); });
program.command('profiles').description('List built-in expected-behavior profiles for contextualizing process observations').option('--json', 'machine-readable output').action((o) => { const profiles = listProfiles(); out(o.json, { ok: true, profiles }, () => { for (const p of profiles)
    console.log(`${p.name}: ${p.description}`); }); });
program.command('mcp').description('Start MCPSnitch operator MCP stdio server').action(async () => startMcpServer());
program.parseAsync().catch((e) => fail(false, 2, e.message));
//# sourceMappingURL=index.js.map