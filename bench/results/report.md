# MCPSnitch benchmark

Seed: mcpsnitch-v0.1.1-honest-harness

| Metric | Raw | MCPSnitch | Delta |
|---|---:|---:|---:|
| p99 latency | 0.0025ms | 0.0745ms | 0.0720ms |

| Detection metric | Value |
|---|---:|
| Precision on flagged calls | 1.000 (100/100) |
| Benign false-positive rate | 0.000 (0/850) |
| Visible malicious heuristic recall | 1.000 |
| All malicious heuristic recall (includes encoded evasive cases) | 0.667 |

Honesty note: The JSON-RPC heuristic intentionally does not claim to catch encoded or internal server-side behavior; use process observation for OS-visible sockets/files and treat v0.1.x as observability, not prevention.

Pass: true
