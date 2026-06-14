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
    /** MCP server name used for profile-config lookups and alert context. */
    serverName?: string;
    /** Editable .mcpsnitch/profiles.json mapping written by mcpsnitch init. */
    profileConfigPath?: string;
    /** Which findings should speak to stderr. run uses process; watch uses all. */
    alertMode?: 'process' | 'all';
    /** Sampling interval for lsof process observation. */
    observerIntervalMs?: number;
    /** When true, clean/info-only sessions emit nothing to stderr. */
    quiet?: boolean;
}
export declare function alertingFindings(event: AuditEvent, mode?: 'process' | 'all'): Finding[];
export declare function formatActionableAlert(event: AuditEvent, mode?: 'process' | 'all'): string;
export declare function watchStdio(opts: WatchOptions): Promise<number>;
