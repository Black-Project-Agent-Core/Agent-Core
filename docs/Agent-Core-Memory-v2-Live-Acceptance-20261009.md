# Agent Core Memory v2 — Production Live Acceptance

**Date:** 2026-10-09 (Indonesia local date)
**Status:** SELESAI — production Memory v2 activation, preservation and live external-controller functional acceptance verified.
**Owner:** Existing Agent Core Memory capability; no second MCP service or Memory server.
**Root:** `E:\Projects\Agent-Core`

## Production cutover and resident engine

- User-operated `ACTIVATE-MEMORY-V2.cmd` printed `VERIFIED ACTIVATION` and `activated:true`.
- Activation report: 123 restored records; five legacy access-metadata notes reconciled;
  retrieval-ledger SHA-256 `2de8aee08b0023c40ddfa32330eaea5bc10799e2722586e9cf07e58fb932bbb8`.
- The file `runtime/memory-v2-activation.json` exists and selects `runtime/memory-v2`.
- Marker backup SHA-256 matches the referenced immutable final legacy snapshot manifest.
- Agent Core resident exposes `memory_v2_read` and `memory_v2_write` through the current
  external-controller MCP connector. `memory_v2_read(action=capabilities)` reports
  `writeMode: experience-v2`, the five progressive disclosure views and temporal-asOf.
- `memory_status` reports canonical store `available`, `canonicalComplete:true`,
  123 initial records, zero issues, and available index/embedding/intelligence.

## Preservation and historical proof

- Read-only parity script: `runtime/tmp/memory-v2-live-parity-20261009.mjs`.
- Initial roots have 122 regular notes and one pinned foundation each (123 total).
- All 122 migrated records have identical IDs and preserved title, content,
  keywords, context, tags, category, createdAt, source, provenance, and pinned state.
- Zero missing, extra, or mismatched legacy records were observed before a new write.
- The active graph has 167 links vs 188 legacy links. The 21 historical cross-scope
  links were intentionally quarantined from active v2 traversal, with original
  v1 snapshots and links retained in the archival data.
- Exact historical v1 revision of Memory ID
  `4e98e288-57b0-4b44-b861-aeb321924980` was successfully expanded via
  `memory_v2_read(action=expand, view=record)` with `availability:available`.
- The original `runtime/memory` and hashed pre-v2 and final-v1 backups remain intact.

## Episode and capsule — live MCP check

- `memory_v2_write(action=task_start)` created an actual host-bound episode
  `770dfc62-37fa-4c5d-b94d-f9ee9fd37af3` for this migration acceptance.
- `memory_v2_write(action=event_append)` stored the production activation observation.
- `memory_v2_write(action=checkpoint)` generated deterministic capsule
  `df50ff02-26b2-445f-9b62-2de82a11535b` with two critical working-state items.
- `memory_v2_read(action=task_context)` returned the same episode and
  capsule, `freshness: current`, `needsCheckpoint: false`.

## Remaining scope and exclusions

- Live controlled permanent knowledge write/read passed: `memory_remember` produced
  record `1099ff1c-aef0-4d31-b2e5-86cbe74402be` (version 2), and both
  `memory_read` and `memory_v2_read(action=recall)` retrieved it.
  `memory_status` now reports 124 records, canonical complete, zero issues.
- This is a live functional acceptance, **not** a speed, throughput, or latency benchmark.
- Broader standalone Windows regression suite was not universally green during
  earlier migration work; filesystem fixture and timeout findings remain separate.
- A real cross-provider ChatGPT-to-Claude controller handoff and Native Agent
  live replay are not claimed by this single-connector acceptance.
- No Git commit/push, release apply, automatic restart, deletion of the v1 root,
  or rollback of the production v2 root was performed.
