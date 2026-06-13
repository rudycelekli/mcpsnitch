# ADR-0004: live process-observer harness and long-tail profiles

Status: Accepted  
Date: 2026-06-13

## Context

The v0.1.2 profile harness measured deterministic process-observer events, but it did not spawn real processes that held real sockets/files open. A review correctly called out that the process observer is MCPSnitch's strong layer and therefore needs its own live measurement. The same review noted that a small built-in profile set is not enough for the long tail of MCP servers.

## Decision

1. Add `bench:process`, a live process-observer harness that:
   - spawns real child processes;
   - holds real file descriptors and TCP sockets open;
   - samples those children using the same `lsof` process-observer path;
   - measures benign false-positive rate and malicious detection rate for the process layer;
   - includes a short-lived socket fixture that demonstrates the 250ms sampling ceiling.
2. Add profile files:
   - `resolveProfile()` now accepts either a built-in profile name or a JSON profile path.
   - `mcpsnitch profile:init --out <file> --name <name>` creates custom profiles.
   - `mcpsnitch profile:learn --root <root> --out <file> --name <name>` drafts a profile from observed audit events.
3. Never auto-learn `allowSensitiveFiles: true`; sensitive-file access must be deliberate.
4. Include `bench` in npm package files so benchmark scripts and fixtures are available to downstream users, not just precomputed reports.

## Consequences

- MCPSnitch now measures its process-observer layer against real OS-observable behavior, not only synthetic event objects.
- The harness publishes the sampled-mode limitation: short-lived sockets can go unobserved.
- Long-tail MCP servers can declare or draft their own profiles without changing MCPSnitch source.
- Live external MCP-server dogfood with real packages/credentials remains future work; this release avoids requiring secrets or external APIs in CI.
