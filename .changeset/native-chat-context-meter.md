---
"agent-core": minor
---

Show the context window in Native Chat in real time so a manual compact can be timed (~70%). After each provider response the controller emits a `context.usage` event with the size of that call's full prompt (the last call only, never the cumulative turn metric) and the model's known window from the cached provider catalog; a window the catalog does not report stays empty and the UI says "kapasitas tidak diketahui" instead of guessing. The last value is persisted on the turn row (additive nullable `context_tokens` / `context_window`), so it survives reload. The ContextMeter (amber from 70%, red from 85%, 70% marker) lives in the Inspector "Context Window (N%)" card, not above the composer. The iteration limit and its failure behaviour are unchanged.
