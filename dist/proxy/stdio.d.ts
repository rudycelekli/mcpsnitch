import type { AuditEvent, Finding } from '../schema.js';
export interface WatchOptions {
    root?: string;
    command: string;
    args?: string[];
    sessionId?: string;
    /** Best-effort OS-observed process behavior via lsof. Default: true when lsof is available. */
    processObserver?: boolean;
    /** Expected behavior profile name/path, or auto. */
    profile?: string;
    /** Sampling interval for lsof process observation. */
    observerIntervalMs?: number;
    /** When true, clean/info-only sessions emit nothing to stderr. */
    quiet?: boolean;
}
export declare function alertingFindings(event: AuditEvent): Finding[];
export declare function formatActionableAlert(event: AuditEvent): string;
export declare function watchStdio(opts: WatchOptions): Promise<number>;
