#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeJsonRpc } from '../audit/analyzer.js';
import { appendEvent, loadEvents, summarize, verifyLog, writeReport } from '../log/store.js';
import { watchStdio } from '../proxy/stdio.js';
import { startHttpServer } from '../http/server.js';
import { startMcpServer } from '../mcp/server.js';
import { eventFromObservation, readProcessObservations } from '../process/observer.js';
import { listProfiles, makeProfile, writeProfile, learnProfileFromEvents } from '../policy/profile.js';
import { MCPSNITCH_VERSION } from '../version.js';
const program = new Command();
program.name('mcpsnitch').description('Transparent MCP tool-call proxy and audit reporter').version(MCPSNITCH_VERSION);
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
program.command('run').description('Silent-when-clean stdio wrapper: mcpsnitch run -- <mcp-server-command> [args...]').option('--root <path>', 'workspace root', '.').option('--profile <name-or-path>', 'expected behavior profile name/path, or auto-match known server commands', 'auto').option('--observer-interval <ms>', 'process observer sampling interval', (v) => Number(v)).option('--no-process-observer', 'disable best-effort lsof process observation and record a self-report-only downgrade').option('--verbose', 'print info-level observer status instead of staying silent when clean').allowUnknownOption(true).argument('[cmd...]').action(async (cmd, o) => { const sep = cmd; if (!sep.length)
    fail(false, 2, 'missing command: mcpsnitch run -- <server>'); const code = await watchStdio({ root: o.root, command: sep[0], args: sep.slice(1), processObserver: o.processObserver, profile: o.profile, observerIntervalMs: o.observerInterval, quiet: !o.verbose }); process.exit(code); });
program.command('watch').description('Transparent stdio proxy: mcpsnitch watch -- <mcp-server-command> [args...]').option('--root <path>', 'workspace root', '.').option('--profile <name-or-path>', 'expected behavior profile name/path, or auto-match known server commands', 'auto').option('--observer-interval <ms>', 'process observer sampling interval', (v) => Number(v)).option('--no-process-observer', 'disable best-effort lsof process observation and record a self-report-only downgrade').option('--quiet', 'suppress info-level observer status; medium/high alerts still print').allowUnknownOption(true).argument('[cmd...]').action(async (cmd, o) => { const sep = cmd; if (!sep.length)
    fail(false, 2, 'missing command: mcpsnitch watch -- <server>'); const code = await watchStdio({ root: o.root, command: sep[0], args: sep.slice(1), processObserver: o.processObserver, profile: o.profile, observerIntervalMs: o.observerInterval, quiet: !!o.quiet }); process.exit(code); });
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
program.command('observe').description('One-shot OS process observation via lsof: records open files/sockets for a PID when available').requiredOption('--pid <pid>', 'child process id to inspect', (v) => Number(v)).option('--profile <name-or-path>', 'expected behavior profile name/path', 'generic').option('--root <path>', 'workspace root', '.').option('--json', 'machine-readable output').action(async (o) => { try {
    const observations = await readProcessObservations(o.pid);
    const events = observations.map((obs) => appendEvent(eventFromObservation(obs, { profile: o.profile }), o.root));
    out(o.json, { ok: true, profile: o.profile, observations: observations.length, events }, () => { console.log(`observed ${observations.length} process entries for pid ${o.pid} (profile=${o.profile})`); for (const event of events)
        console.log(`${event.eventType} ${event.observation?.value ?? ''}`); });
    process.exit(events.some((e) => e.findings.some((f) => f.severity === 'medium' || f.severity === 'high')) ? 1 : 0);
}
catch (e) {
    fail(o.json, 2, e.message);
} });
program.command('serve').description('Start local HTTP endpoint server').option('--root <path>', 'workspace root', '.').option('--port <port>', 'port', (v) => Number(v)).option('--json', 'machine-readable startup line').action(async (o) => { const s = await startHttpServer({ root: o.root, port: o.port }); console.log(JSON.stringify({ ok: true, port: s.port, endpoints: ['GET /version', 'POST /analyze', 'GET /report', 'POST /report', 'GET /verify', 'GET /profiles'] })); });
program.command('profile:init')
    .description('Create a custom expected-behavior profile JSON file for a long-tail MCP server')
    .requiredOption('--out <path>', 'profile JSON file to write')
    .requiredOption('--name <name>', 'profile name')
    .option('--description <text>', 'profile description')
    .option('--allow-network', 'mark network sockets as expected')
    .option('--deny-file-read', 'mark ordinary file opens as unexpected')
    .option('--allow-sensitive-files', 'mark sensitive files as expected (dangerous; use only for intentionally secret-reading servers)')
    .option('--json', 'machine-readable output')
    .action((o) => { try {
    const profile = writeProfile(o.out, makeProfile({ name: o.name, description: o.description, allowNetwork: !!o.allowNetwork, allowFileRead: !o.denyFileRead, allowSensitiveFiles: !!o.allowSensitiveFiles }));
    out(o.json, { ok: true, path: o.out, profile }, () => console.log(`wrote ${o.out} (${profile.name})`));
}
catch (e) {
    fail(o.json, 2, e.message);
} });
program.command('profile:learn')
    .description('Learn a draft expected-behavior profile from the current audit log; review before use')
    .requiredOption('--name <name>', 'profile name')
    .requiredOption('--out <path>', 'profile JSON file to write')
    .option('--root <path>', 'workspace root', '.')
    .option('--json', 'machine-readable output')
    .action((o) => { try {
    const events = loadEvents(o.root);
    const profile = writeProfile(o.out, learnProfileFromEvents(events, { name: o.name }));
    out(o.json, { ok: true, path: o.out, events: events.length, profile }, () => { console.log(`learned ${o.out} from ${events.length} events`); console.log('Review before use; sensitive-file permission is never auto-learned.'); });
}
catch (e) {
    fail(o.json, 2, e.message);
} });
program.command('profiles').description('List built-in expected-behavior profiles for contextualizing process observations').option('--json', 'machine-readable output').action((o) => { const profiles = listProfiles(); out(o.json, { ok: true, profiles }, () => { for (const p of profiles)
    console.log(`${p.name}: ${p.description}`); }); });
program.command('mcp').description('Start MCPSnitch operator MCP stdio server').action(async () => startMcpServer());
program.parseAsync().catch((e) => fail(false, 2, e.message));
//# sourceMappingURL=index.js.map