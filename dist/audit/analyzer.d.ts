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
export declare function stableJson(value: unknown): string;
export declare function sha256Hex(value: string): string;
export declare function estimateCostUsd(bytes: number): number;
export declare function classifyToolCall(message: JsonRpcLike, raw: string, opts: {
    costSpikeBytes: number;
}): {
    toolName?: string;
    scopes: string[];
    dataFlow: string[];
    findings: Finding[];
};
export declare function analyzeJsonRpc(rawInput: string | JsonRpcLike, opts?: AnalyzeOptions): AuditEvent;
