# MCPSnitch live process observer harness

Seed: mcpsnitch-v0.1.3-live-process-observer

| Metric | Value |
|---|---:|
| Live fixtures | 5 |
| Benign false-positive rate | 0.000 (0/2) |
| Malicious detection rate | 1.000 (2/2) |
| Short-lived socket observed | false |

This harness measures the process observer against real child processes with real open files/sockets. The short-lived socket fixture is informational and demonstrates that sampled lsof mode may miss sub-interval activity.

Pass: true
