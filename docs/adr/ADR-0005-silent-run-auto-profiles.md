# ADR-0005: silent run wrapper, auto profiles, and actionable alerts

Status: Accepted  
Date: 2026-06-13

## Context

A review of v0.1.3 said MCPSnitch had become an honest security/observability tool, but indispensability requires less noise and less setup. The next product bar is: engineers keep it on because it is silent when clean, loud only when a real violation or trust downgrade occurs, and easy to add as a one-line wrapper around an MCP server command.

## Decision

1. Add `mcpsnitch run -- <mcp-server-command> [args...]` as the default quiet wrapper.
   - It forwards stdout/stdin transparently like `watch`.
   - It appends audit evidence even when it prints nothing.
   - It suppresses info-only observer status by default.
   - `--verbose` restores info-level observer status.
2. Keep `mcpsnitch watch` as the diagnostic mode.
   - It now also defaults to `--profile auto`.
   - `--quiet` is available when watch is used in low-noise contexts.
3. Add command-based profile inference.
   - Known GitHub server command names infer `github`.
   - Known filesystem server command names infer `filesystem`.
   - Fetch/search/browser/web command names infer `fetch`.
   - Database command names infer `database`.
   - Unknown commands remain `generic`.
4. Emit one-line actionable alerts to stderr for medium/high findings.
   - Alerts include severity, rule, evidence source, profile, observed value when present, and next action.
   - Info-only expected behavior remains silent under `run`.
   - Process-observer disabled/unavailable states remain loud because they downgrade MCPSnitch to easier-to-evade self-report-only visibility.

## Consequences

- The default path now matches the security-tool retention rule: no clean-session noise, actionable violation output.
- Existing `watch` integrations remain compatible while getting auto profiles.
- Auto inference is intentionally conservative; explicit built-in or JSON profiles are still the source of truth for long-tail servers.
- `run` is a stdio MCP-server wrapper, not a universal rewriter of every MCP server an arbitrary agent process might launch internally. Whole-agent, multi-server auto-instrumentation remains future client-specific integration work.
