import type { AuditEvent, ProcessObservation } from '../schema.js';
import { type ServerProfile } from '../policy/profile.js';
export declare const DEFAULT_PROCESS_OBSERVER_INTERVAL_MS = 250;
export interface ProcessObserverStatus {
    ok: boolean;
    enabled: boolean;
    reason?: string;
    samplingIntervalMs: number;
    mode: 'sampled_lsof' | 'self_report_only';
    profile: string;
}
export interface ProcessObserverOptions {
    intervalMs?: number;
    sessionId?: string;
    profile?: string | ServerProfile;
    launcherCommand?: string;
    onEvent: (event: AuditEvent) => void;
    onStatus?: (status: ProcessObserverStatus) => void;
}
export interface ProcessObserverHandle {
    enabled: boolean;
    stop: () => void;
}
/** Parse normal `lsof -nP -p <pid>` output into OS-observed file/socket events. */
export declare function parseLsofOutput(output: string, pidHint?: number): ProcessObservation[];
export declare function lsofAvailable(): Promise<boolean>;
export declare function readProcessObservations(pid: number): Promise<ProcessObservation[]>;
export declare function readDescendantPids(pid: number): Promise<number[]>;
export declare function readProcessTreeObservations(pid: number): Promise<ProcessObservation[]>;
export declare function eventFromObserverStatus(status: ProcessObserverStatus, opts?: {
    sessionId?: string;
    seq?: number;
    prevHash?: string;
}): AuditEvent;
export declare function eventFromObservation(observation: ProcessObservation, opts?: {
    sessionId?: string;
    seq?: number;
    prevHash?: string;
    profile?: string | ServerProfile;
    samplingIntervalMs?: number;
    launcherBootstrap?: boolean;
    launcherCommand?: string;
}): AuditEvent;
export declare function startProcessObserver(pid: number, opts: ProcessObserverOptions): Promise<ProcessObserverHandle>;
