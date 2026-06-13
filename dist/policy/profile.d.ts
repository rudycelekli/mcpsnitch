import { z } from 'zod';
import type { AuditEvent } from '../schema.js';
export declare const ServerProfileSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    allowNetwork: z.ZodDefault<z.ZodBoolean>;
    allowFileRead: z.ZodDefault<z.ZodBoolean>;
    allowSensitiveFiles: z.ZodDefault<z.ZodBoolean>;
    expectedNetworkDestinations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    expectedFilePaths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    allowNetwork: boolean;
    allowFileRead: boolean;
    allowSensitiveFiles: boolean;
    expectedNetworkDestinations?: string[] | undefined;
    expectedFilePaths?: string[] | undefined;
}, {
    name: string;
    description?: string | undefined;
    allowNetwork?: boolean | undefined;
    allowFileRead?: boolean | undefined;
    allowSensitiveFiles?: boolean | undefined;
    expectedNetworkDestinations?: string[] | undefined;
    expectedFilePaths?: string[] | undefined;
}>;
export type ServerProfile = z.infer<typeof ServerProfileSchema>;
export declare const BUILTIN_PROFILES: Record<string, ServerProfile>;
/** Resolve a built-in profile name or a JSON profile file path. */
export declare function resolveProfile(spec?: string): ServerProfile;
export declare function listProfiles(): ServerProfile[];
export declare function profileToJson(profile: ServerProfile): string;
export declare function writeProfile(path: string, profile: ServerProfile): ServerProfile;
export declare function makeProfile(opts: Partial<ServerProfile> & {
    name: string;
}): ServerProfile;
export declare function inferProfileFromCommand(command: string, args?: string[]): string;
export declare function resolveProfileForCommand(spec: string | undefined, command: string, args?: string[]): ServerProfile;
export declare function learnProfileFromEvents(events: AuditEvent[], opts: {
    name: string;
    description?: string;
}): ServerProfile;
