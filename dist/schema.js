import { z } from 'zod';
export const DirectionSchema = z.enum(['client_to_server', 'server_to_client']);
export const SourceSchema = z.enum(['jsonrpc_heuristic', 'process_observer']);
export const SeveritySchema = z.enum(['info', 'low', 'medium', 'high']);
export const FindingSchema = z.object({
    rule: z.string(),
    severity: SeveritySchema,
    message: z.string(),
    evidence: z.record(z.unknown()).default({}),
});
export const ObservationSchema = z.object({
    pid: z.number().int().positive(),
    kind: z.enum(['file_open', 'network_socket']),
    value: z.string(),
    fd: z.string().optional(),
    protocol: z.string().optional(),
});
export const AuditEventSchema = z.object({
    v: z.literal(1),
    seq: z.number().int().nonnegative(),
    at: z.string(),
    sessionId: z.string(),
    source: SourceSchema.optional().default('jsonrpc_heuristic'),
    eventType: z.string().optional(),
    direction: DirectionSchema,
    method: z.string().optional(),
    toolName: z.string().optional(),
    requestId: z.union([z.string(), z.number()]).optional(),
    observation: ObservationSchema.optional(),
    bytesIn: z.number().int().nonnegative(),
    bytesOut: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
    scopes: z.array(z.string()),
    dataFlow: z.array(z.string()),
    findings: z.array(FindingSchema),
    prevHash: z.string(),
    hash: z.string(),
});
export const ReportSchema = z.object({
    ok: z.boolean(),
    sessionId: z.string(),
    events: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    observedProcessEvents: z.number().int().nonnegative().default(0),
    estimatedCostUsd: z.number().nonnegative(),
    findings: z.array(FindingSchema),
    byTool: z.record(z.object({ calls: z.number(), estimatedCostUsd: z.number(), findings: z.number() })),
});
//# sourceMappingURL=schema.js.map