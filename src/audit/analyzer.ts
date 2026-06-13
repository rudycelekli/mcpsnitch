import { createHash, randomUUID } from 'node:crypto';
import type { AuditEvent, Finding } from '../schema.js';

export interface AnalyzeOptions {
  sessionId?: string;
  seq?: number;
  prevHash?: string;
  direction?: 'client_to_server' | 'server_to_client';
  costSpikeBytes?: number;
}

export interface JsonRpcLike {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}

export function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function estimateCostUsd(bytes: number): number {
  // Deterministic conservative proxy: $0.25 per million UTF-8 bytes inspected.
  return Number(((bytes / 1_000_000) * 0.25).toFixed(9));
}

function walk(value: unknown, visit: (s: string) => void): void {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (value && typeof value === 'object') for (const item of Object.values(value as Record<string, unknown>)) walk(item, visit);
}

export function classifyToolCall(message: JsonRpcLike, raw: string, opts: { costSpikeBytes: number }): { toolName?: string; scopes: string[]; dataFlow: string[]; findings: Finding[] } {
  const scopes = new Set<string>();
  const dataFlow = new Set<string>();
  const findings: Finding[] = [];
  const method = message.method ?? '';
  const params = (message.params ?? {}) as Record<string, unknown>;
  const toolName = method === 'tools/call' && typeof params.name === 'string' ? params.name : undefined;
  const haystack: string[] = [method, toolName ?? ''];
  walk(params, (s) => haystack.push(s));
  const joined = haystack.join('\n');

  if (/read|file|fs|path|glob|grep/i.test(joined)) scopes.add('filesystem');
  if (/write|edit|patch|delete|rm|mv/i.test(joined)) scopes.add('filesystem:write');
  if (/http|https|fetch|curl|wget|browser|network|url/i.test(joined)) scopes.add('network');
  if (/exec|bash|shell|spawn|command/i.test(joined)) scopes.add('process');
  if (toolName) dataFlow.add('tool_args_to_server');
  if (/secret|token|api[_-]?key|password|credential/i.test(joined)) dataFlow.add('possible_secret');
  if (/https?:\/\//i.test(joined)) dataFlow.add('network_destination');
  if (/(^|[\s"'])(?:\/)?(?:Users|home|etc|var|tmp)\//i.test(joined) || /\.env\b|id_rsa|ssh\//i.test(joined)) { dataFlow.add('local_path'); scopes.add('filesystem'); }

  if (toolName && scopes.has('filesystem') && !/read|list|search|grep|glob/i.test(toolName)) {
    findings.push({ rule: 'unexpected_file_access', severity: 'medium', message: `tool ${toolName} carries filesystem-looking inputs`, evidence: { toolName } });
  }
  if (toolName && scopes.has('network') && !/fetch|http|browser|web|url/i.test(toolName)) {
    findings.push({ rule: 'unexpected_network_egress', severity: 'high', message: `tool ${toolName} carries URL/network-looking inputs`, evidence: { toolName } });
  }
  if (dataFlow.has('possible_secret')) {
    findings.push({ rule: 'possible_secret_flow', severity: 'high', message: 'tool call contains secret-like text', evidence: { toolName } });
  }
  if (raw.length >= opts.costSpikeBytes) {
    findings.push({ rule: 'cost_spike', severity: 'medium', message: `message size ${raw.length} bytes exceeds threshold ${opts.costSpikeBytes}`, evidence: { bytes: raw.length, threshold: opts.costSpikeBytes } });
  }
  return { toolName, scopes: [...scopes].sort(), dataFlow: [...dataFlow].sort(), findings };
}

export function analyzeJsonRpc(rawInput: string | JsonRpcLike, opts: AnalyzeOptions = {}): AuditEvent {
  const raw = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
  let msg: JsonRpcLike = {};
  try { msg = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput; } catch { msg = { method: 'invalid-json' }; }
  const seq = opts.seq ?? 0;
  const prevHash = opts.prevHash ?? '';
  const direction = opts.direction ?? 'client_to_server';
  const classified = classifyToolCall(msg, raw, { costSpikeBytes: opts.costSpikeBytes ?? 64 * 1024 });
  const bytes = Buffer.byteLength(raw, 'utf8');
  const sansHash = {
    v: 1 as const,
    seq,
    at: new Date().toISOString(),
    sessionId: opts.sessionId ?? randomUUID(),
    direction,
    method: msg.method,
    toolName: classified.toolName,
    requestId: msg.id,
    bytesIn: direction === 'client_to_server' ? bytes : 0,
    bytesOut: direction === 'server_to_client' ? bytes : 0,
    estimatedCostUsd: estimateCostUsd(bytes),
    scopes: classified.scopes,
    dataFlow: classified.dataFlow,
    findings: classified.findings,
    prevHash,
  };
  return { ...sansHash, hash: sha256Hex(stableJson(sansHash)) };
}
