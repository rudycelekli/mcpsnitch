# ADR-0003: profiled false-positive harness and loud observer downgrade

Status: Accepted  
Date: 2026-06-13

## Context

A follow-up review confirmed that the `lsof` process observer made the core real, but identified three gaps before MCPSnitch can credibly move toward a world-class security tool:

1. `lsof` polling is sampling, not syscall tracing; short-lived file/socket activity can happen between samples.
2. If `lsof` is unavailable, the product must loudly surface self-report-only mode instead of silently downgrading to JSON-RPC heuristics.
3. Raw `observed_network_connection` alerts can become false-positive noise for legitimate network MCP servers such as GitHub, fetch, search, and database servers.

## Decision

- Make process observer status an explicit audit event:
  - `process_observer_sampled_mode` (`info`) when sampled `lsof` mode is enabled.
  - `process_observer_unavailable` (`high`) when MCPSnitch falls back to self-report-only mode.
- Print a loud stderr warning when process observation is unavailable or disabled.
- Add built-in expected-behavior profiles:
  - `generic`
  - `filesystem`
  - `fetch`
  - `github`
  - `database`
- Contextualize process findings by profile:
  - network sockets under network-capable profiles become `observed_expected_network_connection` (`info`), not alerting medium findings.
  - unexpected network under `generic`/`filesystem` remains `observed_unexpected_network_connection` (`medium`).
  - sensitive file opens remain high unless a future explicit profile permits them.
- Expose profiles through all front doors:
  - CLI: `mcpsnitch profiles`, `watch --profile`, `observe --profile`
  - HTTP: `GET /profiles`
  - MCP: `snitch_profiles`
- Add `bench:false-positive` with a deterministic representative benign corpus for filesystem, GitHub, fetch, Brave-search, database, and prose-only tool behavior.

## Consequences

- The process observer is now visibly sampled, not implied to be complete tracing.
- Users can tell when the product has degraded to its weakest mode.
- Legitimate network MCP servers no longer create alerting findings when run under the right profile.
- The false-positive harness is still representative and deterministic, not yet a live-server dogfood corpus. The live corpus remains the next hardening target.

## Stable claim after this ADR

MCPSnitch can measure contextual false-positive rate on a representative benign corpus and can distinguish expected network behavior from unexpected process-level egress according to an explicit profile. It still does not claim complete syscall capture.
