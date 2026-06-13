# MCPSnitch premortem round 4 — sampled observer and alert fatigue — 2026-06-13

Input: review said v0.1.1 is a real two-layer observer, but still has sampling limits, silent downgrade risk, and no contextual false-positive measurement.

| Scenario | Triage | Fix |
|---|---|---|
| User believes `lsof` polling captures all egress. | Fix now | Observer status event and README say sampled `lsof` mode can miss short-lived activity between samples. |
| `lsof` missing means tool silently falls back to regex-only mode. | Fix now | `process_observer_unavailable` high finding and loud stderr warning say self-report-only mode is evadable. |
| Legitimate network servers produce constant `observed_network_connection` alert noise. | Fix now | Built-in profiles contextualize expected network sockets as info findings. |
| Profile capability exists only internally. | Fix now | Exposed profiles through CLI, HTTP, and MCP. |
| False-positive rate still unmeasured. | Fix now | Added deterministic representative benign false-positive harness; live-server dogfood remains next. |

Exit: accepted fixes applied. Next gap is live-server corpus and deeper platform tracing, not wording.
