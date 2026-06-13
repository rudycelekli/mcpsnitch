import { z } from 'zod';
export declare const DirectionSchema: z.ZodEnum<["client_to_server", "server_to_client"]>;
export declare const SeveritySchema: z.ZodEnum<["info", "low", "medium", "high"]>;
export declare const FindingSchema: z.ZodObject<{
    rule: z.ZodString;
    severity: z.ZodEnum<["info", "low", "medium", "high"]>;
    message: z.ZodString;
    evidence: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    rule: string;
    severity: "info" | "low" | "medium" | "high";
    message: string;
    evidence: Record<string, unknown>;
}, {
    rule: string;
    severity: "info" | "low" | "medium" | "high";
    message: string;
    evidence?: Record<string, unknown> | undefined;
}>;
export declare const AuditEventSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    seq: z.ZodNumber;
    at: z.ZodString;
    sessionId: z.ZodString;
    direction: z.ZodEnum<["client_to_server", "server_to_client"]>;
    method: z.ZodOptional<z.ZodString>;
    toolName: z.ZodOptional<z.ZodString>;
    requestId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    bytesIn: z.ZodNumber;
    bytesOut: z.ZodNumber;
    estimatedCostUsd: z.ZodNumber;
    scopes: z.ZodArray<z.ZodString, "many">;
    dataFlow: z.ZodArray<z.ZodString, "many">;
    findings: z.ZodArray<z.ZodObject<{
        rule: z.ZodString;
        severity: z.ZodEnum<["info", "low", "medium", "high"]>;
        message: z.ZodString;
        evidence: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence: Record<string, unknown>;
    }, {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence?: Record<string, unknown> | undefined;
    }>, "many">;
    prevHash: z.ZodString;
    hash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    at: string;
    v: 1;
    seq: number;
    sessionId: string;
    direction: "client_to_server" | "server_to_client";
    bytesIn: number;
    bytesOut: number;
    estimatedCostUsd: number;
    scopes: string[];
    dataFlow: string[];
    findings: {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence: Record<string, unknown>;
    }[];
    prevHash: string;
    hash: string;
    method?: string | undefined;
    toolName?: string | undefined;
    requestId?: string | number | undefined;
}, {
    at: string;
    v: 1;
    seq: number;
    sessionId: string;
    direction: "client_to_server" | "server_to_client";
    bytesIn: number;
    bytesOut: number;
    estimatedCostUsd: number;
    scopes: string[];
    dataFlow: string[];
    findings: {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence?: Record<string, unknown> | undefined;
    }[];
    prevHash: string;
    hash: string;
    method?: string | undefined;
    toolName?: string | undefined;
    requestId?: string | number | undefined;
}>;
export declare const ReportSchema: z.ZodObject<{
    ok: z.ZodBoolean;
    sessionId: z.ZodString;
    events: z.ZodNumber;
    toolCalls: z.ZodNumber;
    estimatedCostUsd: z.ZodNumber;
    findings: z.ZodArray<z.ZodObject<{
        rule: z.ZodString;
        severity: z.ZodEnum<["info", "low", "medium", "high"]>;
        message: z.ZodString;
        evidence: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence: Record<string, unknown>;
    }, {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence?: Record<string, unknown> | undefined;
    }>, "many">;
    byTool: z.ZodRecord<z.ZodString, z.ZodObject<{
        calls: z.ZodNumber;
        estimatedCostUsd: z.ZodNumber;
        findings: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        estimatedCostUsd: number;
        findings: number;
        calls: number;
    }, {
        estimatedCostUsd: number;
        findings: number;
        calls: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    estimatedCostUsd: number;
    findings: {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence: Record<string, unknown>;
    }[];
    ok: boolean;
    events: number;
    toolCalls: number;
    byTool: Record<string, {
        estimatedCostUsd: number;
        findings: number;
        calls: number;
    }>;
}, {
    sessionId: string;
    estimatedCostUsd: number;
    findings: {
        rule: string;
        severity: "info" | "low" | "medium" | "high";
        message: string;
        evidence?: Record<string, unknown> | undefined;
    }[];
    ok: boolean;
    events: number;
    toolCalls: number;
    byTool: Record<string, {
        estimatedCostUsd: number;
        findings: number;
        calls: number;
    }>;
}>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type Report = z.infer<typeof ReportSchema>;
