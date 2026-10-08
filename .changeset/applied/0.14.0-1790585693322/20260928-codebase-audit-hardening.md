---
"agent-core": patch
---

Harden the post-audit runtime and diagnostics boundary: acquire the desktop single-instance mutex before WinForms initialization, isolate launcher child-environment setup from process launch sinks, remove the Semantic IDE type-only import cycle, and make Code Intelligence debt/security findings explicitly advisory until exact current source confirms them.
