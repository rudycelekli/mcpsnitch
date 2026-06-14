---
name: silent-guard
description: Use MCPSnitch to silently wrap configured stdio MCP servers, preserve audit evidence, and alert only on process-observed violations or observer downgrades.
argument-hint: "init|report|run"
allowed-tools: Bash(npx *), Bash(node *), Read, Write, Edit
---

# MCPSnitch silent guard

Use this skill when the user wants MCP runtime observability, MCP security auditing, silent background monitoring, Claude Code MCP config wrapping, or a tamper-evident MCP audit trail.

## Non-negotiable honesty rules

- MCPSnitch v0.1.x is observability and a tripwire, not prevention and not sandboxing.
- The JSON-RPC heuristic layer is cheap first-pass evidence; it can be evaded and does not prove OS behavior.
- The process observer (`lsof` sampled mode) is the strong local evidence layer for stdio MCP child processes.
- If process observation is unavailable, say so loudly: self-report-only mode is heuristic-only and evadable.
- Remote HTTP/SSE MCP servers are not locally process-observable by v0.1.x because there is no local child process to inspect.

## Default onboarding

Run:

```bash
npx -y github:rudycelekli/mcpsnitch#v0.1.6 init
```

This config-level wrapper backs up the MCP config, wraps configured stdio MCP server entries with `mcpsnitch run`, and writes `.mcpsnitch/profiles.json` with conservative profile mappings. It searches project-local config by default; use `--config <path>` or `--global` deliberately for user-level Claude config.

Use canonical plugin command names when installed from Claude Code:

```text
/mcpsnitch:mcpsnitch-init
/mcpsnitch:mcpsnitch-run
/mcpsnitch:mcpsnitch-report
```

## Clean-session behavior

Clean means the process observer is available and observed server behavior stays within the active profile. In a clean session MCPSnitch should print nothing of its own. Use `mcpsnitch report` only when the user asks to inspect evidence.

## Reversal

If wrapping causes trouble, run:

```bash
npx -y github:rudycelekli/mcpsnitch#v0.1.6 uninit
```

The init and uninit paths both back up the MCP config before changing it.
