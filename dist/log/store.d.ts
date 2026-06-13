import { type AuditEvent, type Report } from '../schema.js';
export declare function paths(root?: string): {
    root: string;
    dir: string;
    log: string;
    report: string;
};
export declare function ensure(root?: string): ReturnType<typeof paths>;
export declare function appendEvent(event: AuditEvent, root?: string): AuditEvent;
export declare function loadEvents(root?: string): AuditEvent[];
export declare function verifyLog(root?: string): {
    ok: boolean;
    entries: number;
    chainValid: boolean;
    firstBreak?: {
        seq: number;
        reason: string;
    };
};
export declare function summarize(events: AuditEvent[], sessionId?: string): Report;
export declare function writeReport(root?: string): Report;
