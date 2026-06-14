---
name: mcpsnitch-run
description: Run one stdio MCP server under the silent MCPSnitch process-observer guard.
argument-hint: "-- <mcp-server-command> [args...]"
---

$ARGUMENTS

Run one stdio MCP server through MCPSnitch's transparent proxy. In guard mode, MCPSnitch records the JSON-RPC heuristic layer but only speaks when the process observer sees a real OS-level violation or when process observation is unavailable.

```bash
npx -y github:rudycelekli/mcpsnitch#v0.1.5 run $ARGUMENTS
```

Silence rule:

- Clean session: no MCPSnitch stderr of its own, no summary, no per-session report.
- Real process-observed violation: one actionable `MCPSNITCH ALERT ...` line.
- No `lsof` / observer disabled: one loud self-report-only, evadable-mode alert and an audit-log event.

For watching all configured Claude Code MCP servers, prefer:

```bash
npx -y github:rudycelekli/mcpsnitch#v0.1.5 init
```
