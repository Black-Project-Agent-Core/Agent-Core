---
"agent-core": minor
---

Add opt-in REM model assist (P1): with `AGENT_CORE_REM_MODEL_ASSIST=digest` the existing REM engine asks the Native provider route, through a host-injected completion, to rewrite each digest as a short abstractive summary. Off by default and not part of `AGENT_CORE_MEMORY_COGNITIVE=all`. Member text is redacted and bounded before it is sent; the answer is validated and any failure, timeout, rejection or exhausted daily budget commits the unchanged extractive digest. Digests stay `hypothesis`/`unverified` with the `model-assisted` tag, keep the source-revision check, and Dreaming status reports aggregate counts only. No second engine, store or job; the diary (P2) is not included.
