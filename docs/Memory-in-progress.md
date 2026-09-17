# Agent Core Memory — Status Pointer

> **Status:** Superseded duplicate; canonical implementation/status document is `E:\Projects\Agent-Core\Memory-in-progress.md`.
> **Current state:** Phases 0–10 implemented; targeted local acceptance passed; external AI-controller acceptance passed; OAuth tunnel re-auth flow verified.
> **Architecture source of truth:** `E:\Projects\Agent-Core\docs\CODEBASE.md`.

This file is intentionally kept as a lightweight pointer so older references to `docs\Memory-in-progress.md` do not resolve to stale planning information.

Do not maintain a second full memory plan here. Update the root `Memory-in-progress.md` for memory implementation/status details and update `docs\CODEBASE.md` for implemented architecture.

Current verified memory contract:

- Canonical memory is file-native under `runtime\memory`.
- The foundational memory is pinned as `agent-core-foundational`.
- Derived lexical/semantic/vector index state is rebuildable and is not canonical authority.
- Cloudflare Workers AI embedding is optional and fail-soft; canonical memory remains independently usable.
- Memory evolution is conservative and does not rewrite substantive content automatically.
- Consolidation is proposal-only and does not automatically merge or delete canonical memories.
- Public MCP surface is 36 tools: 26 direct RDC-compatible tools + 10 explicit memory tools.
- Memory is a sibling subsystem and never routes, authorizes, or gates normal RDC machine-control calls.
- Live acceptance has verified memory health, semantic retrieval, recall metadata, evolution behavior, consolidation non-destructiveness, direct RDC independence, cleanup, and final health.

For exact evidence, historical checkpoints, remaining optional work, and phase-by-phase design notes, read the root `Memory-in-progress.md`.
