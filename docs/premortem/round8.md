# MCPSnitch premortem round 8 — real MCP process dogfood — 2026-06-13

Input: review said v0.1.5 was code-complete for packaging, but the process observer still needed measurement against real running MCP servers before users discover its false-positive rate.

| Scenario | Triage | Fix |
|---|---|---|
| Real MCP servers produce process-observer false positives that synthetic fixtures missed. | Fix now | Added `bench:real-mcp` with pinned real MCP npm packages and included it in `npm run verify`. |
| `npx` launcher bootstrap network is mistaken for filesystem-server egress. | Fix now | Process observer records known package-manager launcher network as info-level launcher evidence; server child network still obeys the server profile. |
| MCPSnitch observes only the `npx` parent and misses the actual MCP server child. | Fix now | Process observer now samples the wrapped process tree and has an integration test proving descendant observation. |
| Credentialed GitHub/Brave dogfood becomes flaky or leaks secrets. | Avoid now | Optional cases run only when credentials are present and report skipped otherwise; no secret values are written to benchmark reports. |
| The new harness is treated as a one-off local experiment. | Fix now | Added `bench:real-mcp` to `npm run verify` and committed generated reports. |

Exit: accepted fixes applied. Remaining non-code risk is adoption: publish npm/marketplace surfaces and put the tool in front of real MCP users.
