# MCPSnitch premortem round 1 — 2026-06-13

Prompt: six months from now MCPSnitch failed despite shipping v0.1. Why?

| Scenario | Triage | Fix |
|---|---|---|
| Users think it prevents exfiltration, then blame it for not stopping a malicious server. | Fix now | README and ADR say observes/flags, not prevents; limitations are first-screen visible. |
| Proxy only sees MCP JSON-RPC and misses internal server syscalls. | Fix now | Add explicit blind spot in ADR/README. |
| Long-running proxy as MCP tool hangs agents. | Fix now | `watch` is CLI-only; MCP server has report/analyze/verify tools only. |
| Benchmark claim is invented in prose. | Fix now | `bench/run.mjs` emits report.json/report.md; README table copied from current run. |
| Security false positives make reports noisy. | Watch | Keep small deterministic rules and expose evidence in findings. |
| Name collision blocks npm. | Fix now | `npm view mcpsnitch` and `npm view mcp-snitch` returned 404 on 2026-06-13. |

Round result: accepted fixes applied to ADR/design before implementation and README.
