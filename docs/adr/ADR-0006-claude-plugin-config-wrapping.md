# ADR-0006: Claude Code plugin packaging and config-level wrapping

Status: Accepted  
Date: 2026-06-13

## Context

MCPSnitch is useful only if engineers can install it in one step and leave it running. The tempting product story is `mcpsnitch run -- <agent>` magically watching every MCP server subprocess the agent later spawns. For v0.1.x that would overclaim: MCPSnitch does not yet install a PATH shim, launcher interception layer, or kernel policy hook that can reliably catch arbitrary descendants.

The honest distribution mechanism for Claude Code is config-level wrapping: patch the MCP server entries Claude Code actually launches so each configured stdio server is started as `mcpsnitch run -- <original command>`. This is bounded, inspectable, reversible, and aligned with the product's core honesty rule.

## Decision

1. Ship a Claude Code plugin bundle at the repo root:
   - `.claude-plugin/plugin.json` for plugin identity and component paths;
   - `.claude-plugin/marketplace.json` so users can run `/plugin marketplace add rudycelekli/mcpsnitch` and install `mcpsnitch@mcpsnitch`;
   - root-level `commands/` and `skills/` because plugin components must live outside `.claude-plugin/`.
2. Document canonical namespaced invocations only:
   - `/mcpsnitch:mcpsnitch-init`
   - `/mcpsnitch:mcpsnitch-run`
   - `/mcpsnitch:mcpsnitch-report`
3. Add `mcpsnitch init` / `mcpsnitch uninit` for Claude Code MCP config onboarding:
   - detect direct `mcpServers` config files such as `.mcp.json` and project Claude settings files;
   - auto-map known stdio servers to conservative built-in profiles;
   - default unknown stdio servers to `generic`;
   - mark remote HTTP/SSE servers as not locally process-observable and do not wrap them;
   - write editable `.mcpsnitch/profiles.json`;
   - require `--global` or `--config <path>` before mutating user-level `~/.claude.json`;
   - pin default GitHub `npx` wrapper invocations to the release tag (`github:rudycelekli/mcpsnitch#v0.1.5`) so installed plugin behavior does not drift silently.
4. Make config backup mandatory and visible before mutation:
   - `init` prints `backed up ... before wrapping`;
   - `uninit` prints `backed up ... before unwrapping` and restores original server commands from wrapped entries.
5. Keep `mcpsnitch run` as a stdio MCP server wrapper, not a whole-agent interceptor:
   - clean guard-mode sessions print no MCPSnitch-owned output;
   - JSON-RPC heuristic findings are recorded but silent in guard mode;
   - process-observed medium/high profile violations emit one deduplicated actionable stderr alert;
   - missing or disabled `lsof` emits one loud self-report-only downgrade alert and appends it to the witness chain.

## Consequences

- The package now closes the adoption gap without weakening the evidence model.
- MCPSnitch watches exactly the local stdio MCP child processes it launches from config; it does not claim coverage for arbitrary agent descendants.
- Remote HTTP/SSE MCP servers remain a named gap for v0.1.x because there is no local child process for `lsof` to inspect.
- Plugin users get reversible onboarding rather than a hidden settings mutation; global Claude config mutation is explicit opt-in.
- Whole-agent launcher interception, remote gateway observation, and stronger OS tracing remain future work and require new claims and tests.
