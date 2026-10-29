---
"agent-core": patch
---

Recover Native providers stranded in HALF_OPEN after cancellation, preflight/checkpoint failure or process interruption. Persist a finite probe deadline and revision; release abandoned selections without reporting success, cancel expired work, fence late outcomes and preserve real outage/quota handling. Retain explicit model choice and Continue after restart.
