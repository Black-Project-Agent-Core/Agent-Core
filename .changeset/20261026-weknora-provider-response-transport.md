---
"agent-core": patch
---

Recognize structured transport failures while reading provider response bodies, including an opaque Undici "terminated" error with a socket cause. Reuse the existing bounded provider retry/cooldown path; retain HTTP error precedence and deterministic JSON/size/unknown-error behavior.
