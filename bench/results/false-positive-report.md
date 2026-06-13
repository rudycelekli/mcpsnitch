# MCPSnitch false-positive harness

Seed: mcpsnitch-v0.1.2-profiled-benign-corpus

| Metric | Value |
|---|---:|
| Benign server fixtures | 6 |
| Malicious fixtures | 2 |
| Benign false-positive rate | 0.000 (0/6) |
| Malicious detection rate | 1.000 (2/2) |

This is a deterministic representative benign corpus harness. It measures profile-contextual false positives without requiring external API credentials; live-server dogfood should extend it, not replace it.

Pass: true
