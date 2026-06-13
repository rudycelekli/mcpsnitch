export interface ServerProfile {
    name: string;
    description: string;
    allowNetwork: boolean;
    allowFileRead: boolean;
    allowSensitiveFiles: boolean;
    expectedNetworkDestinations?: string[];
    expectedFilePaths?: string[];
}
export declare const BUILTIN_PROFILES: Record<string, ServerProfile>;
export declare function resolveProfile(name?: string): ServerProfile;
export declare function listProfiles(): ServerProfile[];
