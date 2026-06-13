import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
export const ServerProfileSchema = z.object({
    name: z.string().min(1),
    description: z.string().default('Custom MCPSnitch expected-behavior profile.'),
    allowNetwork: z.boolean().default(false),
    allowFileRead: z.boolean().default(true),
    allowSensitiveFiles: z.boolean().default(false),
    expectedNetworkDestinations: z.array(z.string()).optional(),
    expectedFilePaths: z.array(z.string()).optional(),
});
export const BUILTIN_PROFILES = {
    generic: {
        name: 'generic',
        description: 'Default locked-down profile: network and sensitive file opens are unexpected until explicitly profiled.',
        allowNetwork: false,
        allowFileRead: true,
        allowSensitiveFiles: false,
    },
    filesystem: {
        name: 'filesystem',
        description: 'Local filesystem MCP server: ordinary file opens are expected; network and sensitive files remain unexpected.',
        allowNetwork: false,
        allowFileRead: true,
        allowSensitiveFiles: false,
    },
    fetch: {
        name: 'fetch',
        description: 'Fetch/browser/search-style MCP server: network sockets are expected; sensitive local files remain unexpected.',
        allowNetwork: true,
        allowFileRead: true,
        allowSensitiveFiles: false,
    },
    github: {
        name: 'github',
        description: 'GitHub/API MCP server: network sockets are expected; sensitive local files remain unexpected.',
        allowNetwork: true,
        allowFileRead: true,
        allowSensitiveFiles: false,
        expectedNetworkDestinations: ['github.com', 'api.github.com'],
    },
    database: {
        name: 'database',
        description: 'Database MCP server: network sockets may be expected; sensitive local files remain unexpected.',
        allowNetwork: true,
        allowFileRead: true,
        allowSensitiveFiles: false,
    },
};
function readProfileFile(path) {
    const raw = readFileSync(path, 'utf8');
    try {
        return ServerProfileSchema.parse(JSON.parse(raw));
    }
    catch (e) {
        throw new Error(`invalid MCPSnitch profile ${path}: ${e.message}`);
    }
}
/** Resolve a built-in profile name or a JSON profile file path. */
export function resolveProfile(spec = 'generic') {
    if (BUILTIN_PROFILES[spec])
        return BUILTIN_PROFILES[spec];
    const path = resolve(spec);
    if (existsSync(path))
        return readProfileFile(path);
    return BUILTIN_PROFILES.generic;
}
export function listProfiles() {
    return Object.values(BUILTIN_PROFILES);
}
export function profileToJson(profile) {
    return JSON.stringify(ServerProfileSchema.parse(profile), null, 2) + '\n';
}
export function writeProfile(path, profile) {
    const parsed = ServerProfileSchema.parse(profile);
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, profileToJson(parsed));
    return parsed;
}
export function makeProfile(opts) {
    return ServerProfileSchema.parse({
        description: 'Custom MCPSnitch expected-behavior profile.',
        allowNetwork: false,
        allowFileRead: true,
        allowSensitiveFiles: false,
        ...opts,
    });
}
export function learnProfileFromEvents(events, opts) {
    const hasNetwork = events.some((event) => event.source === 'process_observer' && event.observation?.kind === 'network_socket');
    const hasFile = events.some((event) => event.source === 'process_observer' && event.observation?.kind === 'file_open');
    const networkDestinations = [...new Set(events
            .filter((event) => event.source === 'process_observer' && event.observation?.kind === 'network_socket')
            .map((event) => event.observation?.value)
            .filter((value) => !!value))];
    const filePaths = [...new Set(events
            .filter((event) => event.source === 'process_observer' && event.observation?.kind === 'file_open')
            .map((event) => event.observation?.value)
            .filter((value) => !!value))];
    return ServerProfileSchema.parse({
        name: opts.name,
        description: opts.description ?? `Learned from ${events.length} MCPSnitch audit events. Review before using in enforcement mode.`,
        allowNetwork: hasNetwork,
        allowFileRead: hasFile || true,
        // Never auto-learn sensitive-file permission. That must be deliberate.
        allowSensitiveFiles: false,
        expectedNetworkDestinations: networkDestinations.slice(0, 50),
        expectedFilePaths: filePaths.slice(0, 50),
    });
}
//# sourceMappingURL=profile.js.map