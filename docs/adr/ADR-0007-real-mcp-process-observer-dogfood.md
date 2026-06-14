# ADR-0007: real MCP process-observer dogfood and process-tree sampling

Status: Accepted  
Date: 2026-06-13

## Context

After v0.1.5 landed plugin packaging and config-level wrapping, the remaining engineering risk was not another UI feature. It was measurement: the process observer had been tested against synthetic observations and purpose-built live fixtures, but not against real MCP server packages launched the way users actually launch them.

The first real-server dogfood exposed a concrete false-positive risk: when the configured server command is `npx`, MCPSnitch's observer sees the package-manager launcher as well as the MCP server. Launcher bootstrap network sockets can look like unexpected network behavior under a filesystem profile, even though the actual filesystem MCP server did not violate its profile.

## Decision

1. Add `bench:real-mcp`, a real MCP process-observer dogfood harness that runs pinned MCP npm packages:
   - `@modelcontextprotocol/server-filesystem@2026.1.14` under the `filesystem` profile;
   - `mcp-server-fetch-typescript@0.1.1` under the `fetch` profile with a local held HTTP socket;
   - optional GitHub and Brave-search packages when credentials are explicitly present.
2. Include this harness in `npm run verify` so it remains a release gate, not an anecdote.
3. Make the process observer sample the wrapped process tree, not only the immediate launcher PID.
4. Treat known package-manager launcher bootstrap network as info-level launcher evidence, not as server-profile behavior:
   - this keeps clean `npx`-launched filesystem servers silent;
   - actual network from the MCP server child remains subject to the active server profile.
5. Keep the v0.1.x honesty line: sampled `lsof` process-tree observation is still not syscall tracing and can miss short-lived behavior.

## Consequences

- MCPSnitch now measures process-observer false positives against real running MCP servers, not only fixtures.
- The default `npx` adoption path no longer creates a first-run false positive for package-manager bootstrap traffic.
- Process-tree sampling closes the practical gap where the actual MCP server is a child of a launcher process.
- Optional credentialed server dogfood is explicit and skipped honestly when secrets are absent.
- This still does not claim prevention or complete capture; deeper macOS/Linux/Windows tracing remains v0.2+ work.
