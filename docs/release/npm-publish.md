# npm publish handoff

Package name checks completed on 2026-06-13:

- `npm view mcpsnitch` -> 404 / available
- `npm view mcp-snitch` -> 404 / available

Local publish gate:

```bash
cd /Users/rudycelekli/Downloads/REGENTICS_RESEARCH-mcp/projects/mcpsnitch
npm login
npm publish --access public --provenance
```

GitHub Actions publish gate:

1. Add an npm automation token as repo secret `NPM_TOKEN`, or configure npm Trusted Publishing for `rudycelekli/mcpsnitch`.
2. Publish a GitHub release or run the `Publish to npm` workflow manually.
