---
name: mcpsnitch-init
description: Wrap this project's configured stdio MCP servers with MCPSnitch silent guard and write editable profile expectations.
argument-hint: "[--dry-run] [--config <path>] [--global]"
---

$ARGUMENTS

Initialize MCPSnitch by patching the selected MCP config at the config-entry level. By default, discovery is project-local; pass `--global` or `--config <path>` before modifying `~/.claude.json`. This is intentionally not a magical whole-agent subprocess interceptor: it wraps the stdio MCP servers Claude Code actually launches from config, writes `.mcpsnitch/profiles.json`, and creates a visible backup before changing anything.

Run:

```bash
npx -y github:rudycelekli/mcpsnitch#v0.1.5 init $ARGUMENTS
```

Expected clean result includes lines like:

```text
backed up /path/to/.mcp.json -> /path/to/.mcp.json.bak before wrapping
github: wrapped with profile=github
filesystem: wrapped with profile=filesystem
profiles: /path/to/.mcpsnitch/profiles.json
```

If a configured MCP server is remote HTTP/SSE, MCPSnitch must report that it is not locally process-observable in v0.1.x; do not treat that as covered by `lsof`.

To reverse the config-level wrapping:

```bash
npx -y github:rudycelekli/mcpsnitch#v0.1.5 uninit
```
