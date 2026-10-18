---
"agent-core": patch
---

Read TCP listener ownership directly from Windows for launcher process probes, avoiding repeated slow Get-NetTCPConnection queries while retaining process identity checks, bounded metrics timeouts, and HTTP health authority.
