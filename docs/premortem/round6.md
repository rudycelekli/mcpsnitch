# MCPSnitch premortem round 6 — silent run and actionable alerts — 2026-06-13

Input: review said the next indispensability build is not more detection power; it is zero-friction adoption, silent clean behavior, auto profile matching, and unmistakable actionable alerts when the process observer sees a real violation.

| Scenario | Triage | Fix |
|---|---|---|
| Engineers disable MCPSnitch because every clean session prints status noise. | Fix now | Added `mcpsnitch run`, which suppresses info-only observer status and keeps stdout as only proxied protocol traffic. |
| First real alert is ambiguous or not actionable. | Fix now | Added one-line stderr alerts with severity, rule, source layer, active profile, observed value, and recommended action. |
| Adoption requires users to know which profile to choose before first run. | Fix now | `run` and `watch` default to `--profile auto` with conservative known-server command inference. |
| Users unknowingly run JSON-RPC-only mode after disabling/loss of process observer. | Fix now | Process-observer disabled/unavailable status remains a high-severity alert and audit event, even in quiet mode. |
| Product overclaims that `run -- <agent>` instruments every server an arbitrary agent launches. | Avoid now | Docs and ADR call `run` a stdio MCP-server wrapper. Client-specific whole-agent recipe work remains future scope. |
| Alert formatting becomes another noisy, untestable UI surface. | Fix now | Added unit tests for alert/no-alert behavior and integration coverage for `run` forwarding plus observer downgrade alerts. |

Exit: accepted fixes applied. Remaining next step is distribution/dogfood: install the one-line wrapper in real Codex/Claude/Cursor/Claude Desktop MCP configs, measure whether clean sessions stay quiet, and collect first-user catch evidence.
