# ADR-0002: security honesty, false-positive harness, and process observation

Status: Accepted  
Date: 2026-06-13

## Context

An engineering review found the v0.1 analyzer was too easy to characterize as a regex keyword matcher wearing a security-tool claim. That critique is correct enough to treat as release-blocking for any "finished security tool" positioning.

The transparent proxy and hash chain are real, but the analyzer must not imply it can see side effects that happen inside an opaque MCP server. JSON-RPC traffic is self-reported protocol data; real file and network behavior happens at the OS/process layer.

## Decision

1. Reposition MCPSnitch v0.1.x as **developer-preview observability**, not prevention.
2. Put the honesty line in the README first screen and release notes.
3. Replace broad substring matching with structured heuristics:
   - scope from tool name, argument keys, path-shaped values, URL-shaped destination fields, and secret-like values in secret-like fields;
   - benign prose mentioning "file", "URL", or "password" must not flag;
   - every finding records `evidence.layer = jsonrpc_heuristic`.
4. Add a false-positive benchmark harness with benign scary-word traces and encoded evasive malicious traces. The benchmark must report false-positive rate and heuristic recall, not only precision.
5. Add a best-effort process observation layer using `lsof -nP -p <pid>`:
   - `mcpsnitch watch` starts it automatically when available;
   - `mcpsnitch observe --pid <pid>` exposes it directly;
   - events use `source = process_observer` so users can distinguish OS-observed behavior from JSON-RPC heuristics.

## Consequences

- v0.1.x is more honest and less likely to damage the trust brand.
- Process observation is still not syscall enforcement. It is sampled, host-permission-dependent, and can miss short-lived behavior.
- A future world-class version should add policy configuration and deeper platform-specific tracing, e.g. EndpointSecurity on macOS, eBPF/auditd on Linux, and ETW on Windows.

## New claim

MCPSnitch v0.1.x provides transparent MCP traffic logging, a tamper-evident audit log, a measured false-positive harness, and best-effort process observation when the host exposes it. It does not claim to prevent malicious MCP behavior.
