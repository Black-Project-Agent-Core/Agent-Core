---
"agent-core": patch
---

REM model assist prompt hardening: member text is masked over the full text before it is cut to 600 characters, the host adapter limits a digest to one provider attempt (`attemptLimit: 1`), and model output containing U+007F is rejected before the canonical write. Found by the Native partner's design review of P1.
