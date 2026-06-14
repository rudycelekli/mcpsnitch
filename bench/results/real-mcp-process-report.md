# MCPSnitch real MCP process-observer dogfood

Seed: mcpsnitch-v0.1.6-real-mcp-process-dogfood

| Metric | Value |
|---|---:|
| Required real MCP servers | 2 |
| Optional real MCP servers run | 0 |
| Optional servers skipped | 2 |
| Benign alerting false-positive rate | 0.000 (0/2) |
| Required expected evidence misses | 0 |

Required cases: filesystem-official-npm, fetch-typescript-npm-local-http.

Optional skipped: github-official-npm (GITHUB_PERSONAL_ACCESS_TOKEN/GITHUB_TOKEN not set), brave-search-official-npm (BRAVE_API_KEY not set).

This harness runs real pinned MCP npm packages as child process trees. It measures alerting false positives from the same lsof process-observer layer MCPSnitch uses in guard mode. Optional GitHub/Brave cases require user-provided credentials and are skipped without weakening the required local measurement.

Pass: true
