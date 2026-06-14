---
name: mcpsnitch-report
description: Show the MCPSnitch audit report and verify the tamper-evident witness chain.
argument-hint: "[--root <path>] [--json]"
---

$ARGUMENTS

Read the current MCPSnitch audit log. This is intentionally separate from clean guard sessions so MCPSnitch stays silent while you work.

```bash
npx -y github:rudycelekli/mcpsnitch#v0.1.6 report $ARGUMENTS
npx -y github:rudycelekli/mcpsnitch#v0.1.6 verify $ARGUMENTS
```

Remember: MCPSnitch v0.1.x is observability and tripwire evidence, not prevention or sandboxing.
