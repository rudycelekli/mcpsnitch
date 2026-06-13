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
export function resolveProfile(name = 'generic') {
    return BUILTIN_PROFILES[name] ?? BUILTIN_PROFILES.generic;
}
export function listProfiles() {
    return Object.values(BUILTIN_PROFILES);
}
//# sourceMappingURL=profile.js.map