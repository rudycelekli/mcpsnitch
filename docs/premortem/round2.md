# MCPSnitch premortem round 2 — 2026-06-13

Revised plan after R1: visibility-only wording, CLI-only long-running proxy, endpoint tests, benchmark-generated claim.

| Scenario | Triage | Decision |
|---|---|---|
| Some MCP servers use non-newline framing; v0.1 proxy won't capture them. | Fix now | Scope to newline JSON-RPC in ADR and README; analyzer/API still valuable for fixtures and endpoint use. |
| Cost estimate is mistaken for exact billing. | Fix now | Rename as byte-based estimate and document it as a conservative heuristic. |
| MCP operator tool writes logs but users don't know where artifacts live. | Fix now | README architecture diagram and quickstart list `.mcpsnitch/audit.jsonl` and `.mcpsnitch/report.json`. |
| Competitor launches with syscall tracing. | Watch | Different scope; consider enforcement mode only after v0.1 visibility is used. |
| Users need Claude Code config auto-rewrite. | Watch | Keep v0.1 generic; add config wizard later if support requests prove demand. |

Exit condition: no new accepted code-blocking scenario remains after these fixes; remaining items are watch-list roadmap risks.
