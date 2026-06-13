import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AuditEventSchema, type AuditEvent, type Report, type Finding } from '../schema.js';
import { sha256Hex, stableJson } from '../audit/analyzer.js';

export function paths(root = '.'): { root: string; dir: string; log: string; report: string } {
  const r = resolve(root);
  return { root: r, dir: join(r, '.mcpsnitch'), log: join(r, '.mcpsnitch', 'audit.jsonl'), report: join(r, '.mcpsnitch', 'report.json') };
}

export function ensure(root = '.'): ReturnType<typeof paths> {
  const p = paths(root); mkdirSync(p.dir, { recursive: true }); return p;
}

function rawLines(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
}

export function appendEvent(event: AuditEvent, root = '.'): AuditEvent {
  const p = ensure(root);
  const lines = rawLines(p.log);
  const prevHash = lines.length ? sha256Hex(lines[lines.length - 1]) : '';
  const seq = lines.length;
  const sans = { ...event, seq, prevHash };
  const { hash: _old, ...withoutHash } = sans;
  const entry = AuditEventSchema.parse({ ...withoutHash, hash: sha256Hex(stableJson(withoutHash)) });
  appendFileSync(p.log, JSON.stringify(entry) + '\n');
  return entry;
}

export function loadEvents(root = '.'): AuditEvent[] {
  const p = paths(root);
  return rawLines(p.log).map((line, i) => {
    try { return AuditEventSchema.parse(JSON.parse(line)); }
    catch (e) { throw new Error(`audit log parse error at line ${i + 1}: ${(e as Error).message}`); }
  });
}

export function verifyLog(root = '.'): { ok: boolean; entries: number; chainValid: boolean; firstBreak?: { seq: number; reason: string } } {
  const p = paths(root);
  const lines = rawLines(p.log);
  for (let i = 0; i < lines.length; i++) {
    let event: AuditEvent;
    try { event = AuditEventSchema.parse(JSON.parse(lines[i])); }
    catch (e) { return { ok: false, entries: lines.length, chainValid: false, firstBreak: { seq: i, reason: `parse error: ${(e as Error).message}` } }; }
    if (event.seq !== i) return { ok: false, entries: lines.length, chainValid: false, firstBreak: { seq: i, reason: `seq mismatch: got ${event.seq}` } };
    const expectedPrev = i === 0 ? '' : sha256Hex(lines[i - 1]);
    if (event.prevHash !== expectedPrev) return { ok: false, entries: lines.length, chainValid: false, firstBreak: { seq: i, reason: 'prevHash mismatch' } };
    const { hash, ...withoutHash } = event;
    if (hash !== sha256Hex(stableJson(withoutHash))) return { ok: false, entries: lines.length, chainValid: false, firstBreak: { seq: i, reason: 'entry hash mismatch' } };
  }
  return { ok: true, entries: lines.length, chainValid: true };
}

export function summarize(events: AuditEvent[], sessionId = events[0]?.sessionId ?? 'none'): Report {
  const findings: Finding[] = events.flatMap((e) => e.findings);
  const byTool: Report['byTool'] = {};
  for (const e of events) if (e.toolName) {
    byTool[e.toolName] ??= { calls: 0, estimatedCostUsd: 0, findings: 0 };
    byTool[e.toolName].calls += 1;
    byTool[e.toolName].estimatedCostUsd = Number((byTool[e.toolName].estimatedCostUsd + e.estimatedCostUsd).toFixed(9));
    byTool[e.toolName].findings += e.findings.length;
  }
  return {
    ok: findings.every((f) => f.severity === 'info' || f.severity === 'low'),
    sessionId,
    events: events.length,
    toolCalls: events.filter((e) => e.method === 'tools/call').length,
    observedProcessEvents: events.filter((e) => e.source === 'process_observer').length,
    estimatedCostUsd: Number(events.reduce((a, e) => a + e.estimatedCostUsd, 0).toFixed(9)),
    findings,
    byTool,
  };
}

export function writeReport(root = '.'): Report {
  const events = loadEvents(root);
  const report = summarize(events);
  const p = ensure(root);
  writeFileSync(p.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
