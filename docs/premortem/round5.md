# MCPSnitch premortem round 5 — live process measurement and long-tail profiles — 2026-06-13

Input: review said v0.1.2 was defensible, but process-observer FP rate against real running processes was unmeasured, and the built-in profile set would not cover long-tail MCP servers.

| Scenario | Triage | Fix |
|---|---|---|
| Process layer only tested with synthetic observations. | Fix now | Added `bench:process`, which spawns real child processes and samples real held files/sockets via `lsof`. |
| Sampling ceiling is hidden by tests that only use sustained sockets. | Fix now | Added short-lived socket fixture; report records whether sampled mode observed it. It is informational, not a pass gate. |
| Built-in profiles cannot cover custom enterprise MCP servers. | Fix now | Added JSON profile files plus `profile:init` and `profile:learn`. |
| Learning profiles accidentally blesses sensitive-file access. | Fix now | `profile:learn` never auto-enables `allowSensitiveFiles`. |
| Benchmarks available only from source clone. | Fix now | npm package `files` now includes `bench`, not only `bench/results`. |

Exit: accepted fixes applied. Remaining next step is live dogfood against real installed MCP packages and platform-specific tracing beyond sampled `lsof`.
