---
"agent-core": minor
---

Add `code_orient` action `context`: lexical (BM25 over identifier tokens) search over bounded line windows of the workspace source. Returns line ranges and masked, bounded snippets re-read from disk. Reuses the memory identifier tokenizer and secret masker, and excludes runtime, secrets, protected folders, backups, and key or env files. No embeddings, no network, no persisted state; the tool count is unchanged. First step of the Code Context Engine study (`docs/proposals/Code-Context-Engine-Steal-Use-Integration-Plan.md`).
