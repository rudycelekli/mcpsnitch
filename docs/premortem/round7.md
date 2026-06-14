# MCPSnitch premortem round 7 — Claude Code plugin and config wrapping — 2026-06-13

Input: packaging must make MCPSnitch one slash command from a user while preserving the two-layer honesty model and silent-when-clean guard behavior.

| Scenario | Triage | Fix |
|---|---|---|
| Product claims `mcpsnitch run -- <agent>` observes every MCP server subprocess without an interception layer. | Fix now | Use config-level wrapping of direct stdio MCP server entries and document that it watches only the servers Claude Code launches through that config. |
| Remote HTTP/SSE MCP servers are presented as covered by the local process observer. | Fix now | `init` marks them as not locally process-observable by v0.1.x and does not wrap them. |
| Users lose trust because their MCP config was modified silently. | Fix now | `init` and `uninit` make backups before mutation and print the backup path in human output; user-level `~/.claude.json` requires `--global` or `--config`. |
| Wrapping breaks a working MCP server's stdio protocol. | Fix now | Add integration coverage that a wrapped echo server returns the same JSON-RPC response and the witness chain still verifies. |
| Clean sessions become noisy and users uninstall the guard. | Fix now | Guard-mode `run` suppresses JSON-RPC heuristic alerts and info status; it prints only process-observed violations or observer downgrades. |
| Missing `lsof` silently downgrades the product to heuristic-only visibility. | Fix now | The no-observer path emits a high-severity self-report-only alert and appends it to the audit log. |
| Slash-command docs promise non-namespaced aliases that Claude Code may not expose. | Fix now | Docs use canonical namespaced plugin invocations only. |
| GitHub `npx` wrapper drifts after future commits. | Fix now | Default plugin and config wrapper package specs pin to `github:rudycelekli/mcpsnitch#v0.1.5`. |

Exit: accepted fixes applied. The next step is distribution dogfood: install from the GitHub marketplace entry in a real Claude Code environment, run `/mcpsnitch:mcpsnitch-init`, and put MCPSnitch in front of an actual MCP user rather than adding more core-only features.
