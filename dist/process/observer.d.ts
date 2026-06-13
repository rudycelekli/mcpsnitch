import type { AuditEvent, ProcessObservation } from '../schema.js';
export interface ProcessObserverOptions {
    intervalMs?: number;
    sessionId?: string;
    onEvent: (event: AuditEvent) => void;
    onStatus?: (status: {
        ok: boolean;
        enabled: boolean;
        reason?: string;
    }) => void;
}
export interface ProcessObserverHandle {
    enabled: boolean;
    stop: () => void;
}
/** Parse normal `lsof -nP -p <pid>` output into OS-observed file/socket events. */
export declare function parseLsofOutput(output: string, pidHint?: number): ProcessObservation[];
export declare function lsofAvailable(): Promise<boolean>;
export declare function readProcessObservations(pid: number): Promise<ProcessObservation[]>;
export declare function eventFromObservation(observation: ProcessObservation, opts?: {
    sessionId?: string;
    seq?: number;
    prevHash?: string;
}): AuditEvent;
export declare function startProcessObserver(pid: number, opts: ProcessObserverOptions): Promise<ProcessObserverHandle>;
