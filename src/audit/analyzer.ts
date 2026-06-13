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

interface StringHit {
  value: string;
  key: string;
  path: string[];
}

export function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
    .join(',')}}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function estimateCostUsd(bytes: number): number {
  // Deterministic conservative proxy: $0.25 per million UTF-8 bytes inspected.
  return Number(((bytes / 1_000_000) * 0.25).toFixed(9));
}

function collectStrings(value: unknown, path: string[] = [], out: StringHit[] = []): StringHit[] {
  if (typeof value === 'string') {
    out.push({ value, key: path[path.length - 1] ?? '', path });
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => collectStrings(item, [...path, String(i)], out));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(item, [...path, key], out);
    }
  }
  return out;
}

function toolLooksFilesystem(toolName = ''): boolean {
  return /(^|[_:-])(read|list|search|grep|glob|file|fs|path|directory|dir)([_:-]|$)/i.test(toolName);
}

function toolLooksNetwork(toolName = ''): boolean {
  return /(^|[_:-])(fetch|http|https|url|uri|browser|web|network|download|request)([_:-]|$)/i.test(toolName);
}

function toolLooksProcess(toolName = ''): boolean {
  return /(^|[_:-])(exec|bash|shell|spawn|command|process|run)([_:-]|$)/i.test(toolName);
}

function keyLooksPath(key: string): boolean {
  return /(^|[_:-])(path|file|filename|filepath|directory|dir|glob|pattern|cwd|root)([_:-]|$)/i.test(key);
}

function keyLooksUrl(key: string): boolean {
  const k = key.toLowerCase();
  return /(^|[_:-])(url|uri|endpoint|webhook|host|hostname|origin|target|destination|dest)([_:-]|$)/i.test(key) ||
    k.endsWith('url') || k.includes('endpoint') || k.includes('webhook') || k.includes('destination');
}

function keyLooksSecret(key: string): boolean {
  const k = key.toLowerCase();
  return /(^|[_:-])(secret|token|api[_-]?key|password|credential|bearer|authorization|auth)([_:-]|$)/i.test(key) ||
    k.endsWith('token') || k.endsWith('secret') || k.endsWith('password') || k.includes('apikey') || k.includes('api_key');
}

function valueLooksPath(value: string): boolean {
  return /^(?:~\/|\.\.?\/|\/|[A-Za-z]:\\)/.test(value) ||
    /(^|[\s"'])(?:\/?(?:Users|home|etc|var|tmp)\/|\.env\b|id_rsa\b|\.ssh\/|ssh\/)/i.test(value);
}

function valueLooksSensitivePath(value: string): boolean {
  return /(^|\/)(?:\.env(?:\.|$)|id_rsa$|id_ed25519$|known_hosts$|authorized_keys$)|\/etc\/(?:passwd|shadow)\b|\.ssh\//i.test(value);
}

function valueLooksUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /\bhttps?:\/\/[^\s"'<>]+/i.test(value);
}

function valueLooksSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  if (/^(?:true|false|null|undefined|redacted|example|placeholder|password reset)$/i.test(trimmed)) return false;
  return /(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|AKIA[0-9A-Z]{12,}|[A-Za-z0-9_/-]{20,}\.[A-Za-z0-9_/-]{10,})/.test(trimmed) ||
    /^[A-Za-z0-9_\-+/=]{24,}$/.test(trimmed);
}

function hasFinding(findings: Finding[], rule: string): boolean {
  return findings.some((f) => f.rule === rule);
}

function addFinding(findings: Finding[], finding: Finding): void {
  if (!hasFinding(findings, finding.rule)) findings.push(finding);
}

export function classifyToolCall(
  message: JsonRpcLike,
  raw: string,
  opts: { costSpikeBytes: number },
): { toolName?: string; scopes: string[]; dataFlow: string[]; findings: Finding[] } {
  const scopes = new Set<string>();
  const dataFlow = new Set<string>();
  const findings: Finding[] = [];
  const method = message.method ?? '';
  const params = (message.params ?? {}) as Record<string, unknown>;
  const toolName = method === 'tools/call' && typeof params.name === 'string' ? params.name : undefined;
  const args = (params.arguments ?? params.args ?? params.input ?? params) as unknown;
  const hits = collectStrings(args);
  const expectedFilesystem = toolLooksFilesystem(toolName);
  const expectedNetwork = toolLooksNetwork(toolName);
  const expectedProcess = toolLooksProcess(toolName);

  if (expectedFilesystem) scopes.add('filesystem');
  if (expectedNetwork) scopes.add('network');
  if (expectedProcess) scopes.add('process');
  if (toolName) dataFlow.add('tool_args_to_server');

  for (const hit of hits) {
    const pathContext = keyLooksPath(hit.key);
    const urlContext = keyLooksUrl(hit.key);
    const secretContext = keyLooksSecret(hit.key);
    const pathLike = valueLooksPath(hit.value);
    const urlLike = valueLooksUrl(hit.value);
    const sensitivePath = valueLooksSensitivePath(hit.value);

    if ((pathContext && pathLike) || sensitivePath) {
      scopes.add('filesystem');
      dataFlow.add('local_path');
    }
    if ((urlContext && urlLike) || (expectedNetwork && urlLike)) {
      scopes.add('network');
      dataFlow.add('network_destination');
    }
    if (secretContext && valueLooksSecret(hit.value)) {
      dataFlow.add('possible_secret');
    }
    if (sensitivePath) {
      addFinding(findings, {
        rule: 'sensitive_file_reference',
        severity: 'high',
        message: 'tool call references a sensitive local file path',
        evidence: { layer: 'jsonrpc_heuristic', key: hit.key, path: hit.path.join('.') },
      });
    }
  }

  if (toolName && scopes.has('filesystem') && !expectedFilesystem) {
    addFinding(findings, {
      rule: 'unexpected_file_access',
      severity: 'medium',
      message: `tool ${toolName} carries path-like inputs but is not a filesystem tool by name`,
      evidence: { layer: 'jsonrpc_heuristic', toolName },
    });
  }
  if (toolName && scopes.has('network') && !expectedNetwork) {
    addFinding(findings, {
      rule: 'unexpected_network_destination',
      severity: 'medium',
      message: `tool ${toolName} carries URL-like destination inputs but is not a network tool by name`,
      evidence: { layer: 'jsonrpc_heuristic', toolName },
    });
  }
  if (dataFlow.has('possible_secret')) {
    addFinding(findings, {
      rule: 'possible_secret_flow',
      severity: 'high',
      message: 'tool call contains a secret-like value in a secret-like field',
      evidence: { layer: 'jsonrpc_heuristic', toolName },
    });
  }
  if (raw.length >= opts.costSpikeBytes) {
    addFinding(findings, {
      rule: 'cost_spike',
      severity: 'medium',
      message: `message size ${raw.length} bytes exceeds threshold ${opts.costSpikeBytes}`,
      evidence: { layer: 'jsonrpc_heuristic', bytes: raw.length, threshold: opts.costSpikeBytes },
    });
  }
  return { toolName, scopes: [...scopes].sort(), dataFlow: [...dataFlow].sort(), findings };
}

export function analyzeJsonRpc(rawInput: string | JsonRpcLike, opts: AnalyzeOptions = {}): AuditEvent {
  const raw = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
  let msg: JsonRpcLike = {};
  try {
    msg = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    msg = { method: 'invalid-json' };
  }
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
    source: 'jsonrpc_heuristic' as const,
    eventType: 'jsonrpc_message' as const,
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
