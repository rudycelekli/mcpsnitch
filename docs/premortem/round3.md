# MCPSnitch premortem round 3 — security-core critique — 2026-06-13

Input: engineering review argued that the proxy is real, but the analyzer is not yet world-class and would be criticized as keyword grep if shipped as a finished security tool.

| Scenario | Triage | Fix |
|---|---|---|
| Security reviewers say "your security tool is keyword grep." | Fix now | README/release now call v0.1.x developer-preview observability; every heuristic finding is labeled `jsonrpc_heuristic`. |
| False positives make the tool get muted. | Fix now | Structured analyzer avoids scary-word prose false positives; benchmark now reports benign false-positive rate. |
| Malicious servers encode destinations and evade JSON heuristics. | Fix now | Benchmark includes intentionally evasive cases and reports all-malicious heuristic recall. README says this is not a prevention boundary. |
| Tool inspects self-reported protocol traffic, not actual side effects. | Fix now | Added best-effort `lsof` process observer and `mcpsnitch observe --pid`, labeled `process_observer`. |
| Users still over-trust process observation. | Fix now | README and ADR say sampling can miss short-lived behavior and future syscall tracing is required for stronger guarantees. |

Exit: accepted fixes applied. Remaining roadmap is deeper OS-specific tracing/policy enforcement, not v0.1.x marketing.
