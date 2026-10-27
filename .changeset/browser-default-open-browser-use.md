---
"agent-core": major
---

Use the installed Open Browser Use extension as the default browser transport for Native and external controllers. Remove the isolated Chromium engine and reject transport="isolated". Bind browser sessions to host-owned caller/task/workspace identity, retain external-only conversation grants, and bound observation payloads without truncating stale-state comparisons. Existing callers selecting the removed engine must omit transport or choose "open-browser-use"/"extension".

Deliver background keyboard events through scoped focus emulation and keep healthy native-host connections during event bursts using bounded backpressure without increasing queue or frame limits.
