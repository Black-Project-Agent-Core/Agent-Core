---
"agent-core": minor
---

Add `code_orient` action `context`: lexical (BM25 over identifier tokens) search over bounded line windows of the workspace source. Returns line ranges and masked, bounded snippets re-read from disk. A hit whose file changed since indexing triggers one rebuild and is never returned with the old range. Reuses the memory identifier tokenizer and secret masker, excludes runtime, secrets, protected folders, backups, junctions that leave the root, and key, env, or credential files, and reports skipped files by name. Telemetry and controller bookkeeping match the provider tools. No embeddings, no network, no persisted state; the tool count is unchanged. First step of the Code Context Engine study (`docs/proposals/Code-Context-Engine-Steal-Use-Integration-Plan.md`).
