# ADR-0001: MCPSnitch v0.1

Status: Accepted  
Date: 2026-06-13

## Context

MCP users routinely run servers from npm packages and local scripts that can read files, call networks, and spend model/tool budget. Today the operator usually sees only the final agent answer, not the MCP tool-call stream that produced it.

## Decision

Build **MCPSnitch** as a Node/TypeScript package with three front doors:

1. npm library API for analyzing JSON-RPC/MCP messages.
2. CLI, centered on `mcpsnitch watch -- <mcp-server-command>` plus `analyze`, `report`, `verify`, and `serve`.
3. Operator MCP server with `snitch_analyze`, `snitch_report`, and `snitch_verify_log` tools.

The v0.1 implementation observes stdio JSON-RPC messages, records every visible `tools/call`, estimates byte-based audit cost, classifies permission/data-flow hints, flags obvious anomalies, and writes a tamper-evident hash-chained JSONL audit log under `.mcpsnitch/`.

## ONE verifiable claim

`mcpsnitch watch`/the same analyzer can audit MCP JSON-RPC tool calls, produce a per-session report and hash-chain verification, and add **<5ms p99 local analysis overhead** on the bundled seeded trace benchmark.

Verification command:

```bash
npm run verify
```

## Benchmark

- Baseline: raw JSON parsing/forwarding of the same JSON-RPC trace fixture.
- MCPSnitch: `analyzeJsonRpc` proxy tap on the same seeded trace fixture.
- Dataset: bundled synthetic MCP tool-call trace with 1,000 events and deterministic malicious injections.
- Metrics: p50/p95/p99 latency, p99 delta, anomaly precision on injected malicious calls.
- Pass condition: p99 delta `<5ms`.

## Scope v0.1

- Stdio MCP proxy for newline JSON-RPC traffic.
- Audit analyzer for `tools/call` request messages.
- Deterministic cost heuristic based on bytes inspected.
- Scope/data-flow classification for filesystem, network, process, paths, and secret-looking strings.
- Anomaly rules: unexpected file access, unexpected network egress, possible secret flow, cost spike.
- Hash-chained audit JSONL and `verify` command.
- HTTP endpoint surface for integration tests and simple dashboards.
- Operator MCP endpoint surface for agents.

## Not in v0.1

- Kernel/syscall sandboxing or prevention.
- Guaranteed detection of side effects inside opaque MCP servers.
- Accurate vendor billing for all model/tool providers.
- Hosted dashboard.
- Binary MCP framing beyond the common line-delimited JSON-RPC path.

## Revisit triggers

- MCP framing conventions change or a major client requires Content-Length framing.
- Users ask for syscall/network enforcement rather than visibility.
- Real traces show >5ms p99 overhead.
- False positives on benign URLs/paths dominate reports.

## Prior art and lineage

The product follows the local project factory pattern from ProofSeal and AgentCanary: ADR-first scope, endpoint-based integration tests, deterministic proof/verify command, and honest security wording. It reimplements the needed audit-chain and MCP endpoint patterns for MCPSnitch rather than copying reference code.
