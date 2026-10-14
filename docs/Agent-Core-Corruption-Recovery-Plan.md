# Agent Core Corruption Recovery Plan

> **Status:** PLAN ONLY — READY FOR USER REVIEW
> **Created:** 2026-09-20
> **Scope:** Recover Agent Core continuity after filesystem corruption without rolling back valid post-v0.11.0 capabilities.
> **Primary evidence:** current source/runtime, durable memory metadata, scoped recovery backups, release archives, integration plans, and conversation archives.
> **Hard rule:** this document does not authorize implementation, deletion, release application, commit, tag, push, publish, deploy, or broad regression testing.

## 1. Objective

Restore Agent Core to one coherent current-line state while preserving every capability that is still present and healthy.

The recovery must fix:
- corrupted pinned foundational memory;
- memory health blind spots;
- documentation/plan rollback or drift;
- missing historical integration evidence;
- client/server MCP manifest mismatch;
- protected-reference retirement drift;
- any implementation loss that can be proven from exact evidence.

The recovery must not treat the sealed v0.11.0 release as the newest source authority because Serena deferred-wave and Anthropic hardening work exists after that release.

## 2. Current forensic facts

The audit immediately before this plan established:

- live Agent Core reports product version 0.11.0 and /health status=ok;
- Execution, Grafel, Semantic IDE, Learning, Hermes Partner, and Phone are live;
- server-side release compatibility reports 62 -> 62 MCP tools with no removed/added public routes;
- the currently connected external controller exposes only 60 Agent Core tools, so its manifest is stale;
- runtime\memory\00-agent-core-memory.md is exactly 11,957 bytes and all 11,957 bytes are NUL (0x00);
- memory health nevertheless reports canonical store available and issueCount 0;
- 429 active text/config/source files were scanned; the pinned foundational memory was the only all-NUL active file found;
- current source contains every file present in runtime\backups\source-dist-recovery-20260920-1212\src;
- current dist contains every file present in that recovery checkpoint;
- both pending 0.12.0 changesets still exist;
- release:check-intent and release:compat are healthy;
- multiple completed plans have reverted to stale PLANNED or VERIFICATION PENDING labels.

This points to continuity/state corruption, not wholesale loss of the current Agent Core implementation.

## 3. Recovery authority order

When sources disagree, use this order:

1. Exact current source plus direct live runtime evidence.
2. Current-line recovery checkpoint runtime\backups\source-dist-recovery-20260920-1212.
3. Newer scoped implementation backups for the affected subsystem.
4. Durable non-corrupt Agent Core memories and root MEMORY.md.
5. Sealed local release archives, especially release\v0.11.0, only for bytes proven to belong to that release.
6. Conversation archives under docs\Agent-Core-*.md and uploaded Agent-Core archives as historical evidence.
7. Legacy GitHub lineage only as reference evidence, never as a restoration baseline.

Never restore the whole project from legacy Git or from the v0.11.0 ZIP.

## 4. Adoption census

### Explicit steal/use or codebase-derived adoption tracks

| Source tool/codebase | Adopted into Agent Core | Current evidence | Recovery treatment |
| --- | --- | --- | --- |
| A-MEM | semantic capture, deterministic metadata fallback, semantic relationships/evolution | src\memory + durable strategy | preserve implementation; repair stale plan status |
| Reflexion | failure-triggered reflection, anti-blind retry, bounded 1–3 recall, exact + same-family stagnation advisory, compact redacted failure-history evidence | AGENTS.md + src\failure-evidence.ts + failure-loop-advisor + Tool History + regression guards + durable strategy | preserve complete first/second-wave implementation; Audit reference retired after zero-value census |
| Changesets | release intent, semver planning, version sync, shared release-relevance policy, non-consuming snapshot/prerelease packaging, local stable packaging/baseline | .changeset + scripts\release + src\version.ts + durable strategy | preserve complete first/second-wave implementation; Audit reference retired after zero-value census |
| Grafel | structural code intelligence, patterns, workspace/ref routing, repair, fitness/diagnostics | src\code-intelligence + runtime provider + 7 public tools | preserve; normalize second-wave/post-v0.3.3 docs |
| Hermes Agent — Self-Learning | LearningService, memory_batch, review/curator/journey, Memory/Grafel sinks | src\learning + learning + memory_batch | preserve; normalize plan to verified state |
| Hermes Agent — A2A Partner | align/discuss/approve/delegate/collect collaboration bridge | src\partner + partner | preserve COMPLETE 24/24 state |
| Serena / SolidLSP | Semantic IDE/LSP, code_symbol, code_refactor, multi-language providers, safe refactors, explicit verified provider provisioning/repair, external MCP acceptance harness | src\semantic-ide + scripts\verify + server-side 62-tool contract | COMPLETE — LIVE-ACTIVATED — VERIFIED FOR APPROVED SCOPE; fresh external MCP acceptance proved the live additive schema and idempotent provider readback; final zero-value census passed and `Audit\Serena` was retired/deleted |
| Anthropic SDK Python | retry/Retry-After, bounded I/O, endpoint policy, env isolation, sensitive-file checks, atomic persistence, redaction, release compat | src\net + src\security + src\persistence + pending changeset | preserve; finish targeted verification later |

These are adoption tracks. Multiple Grafel/Serena/Hermes plans are waves of the same source tool, not separate external tools.

### Foundational vendored lineage

src\rdc is the Agent Core internal machine-control layer derived from Desktop Commander compatibility code. This is foundational vendored lineage, not the external Remote Desktop Commander product/device.

### External integrations, not steal/use adoptions

Android Agent Bridge / Game Mode and 9Router-related runtime integration must be tracked separately. Their existence does not make them source-adoption authorities for recovery.

## 5. Phase 0 — Freeze and evidence snapshot

Before any recovery mutation:

1. Create a timestamped scoped backup containing runtime\memory, docs, MEMORY.md, AGENTS.md, .changeset, scripts\release, and only source files touched by recovery.
2. Record SHA-256 for the corrupted foundational memory and every file that will be replaced.
3. Capture /health, release:plan, release:check-intent, and release:compat.
4. Record server-side MCP tool count and connected-controller tool count separately.
5. Do not stop Grafel, Hermes, Semantic IDE, Phone, tunnel, or Node Core unless activation of a specific repair requires it.
6. Do not delete any corrupt artifact; preserve it inside the recovery evidence backup.

## 6. Phase 1 — Recover pinned foundational memory

### 6.1 Reconstruct from evidence, never invention

Use:
- newest healthy 00-agent-core-memory.md backup;
- current AGENTS.md;
- current root MEMORY.md;
- readable durable adoption memories;
- exact current source/runtime facts.

Do not restore an old backup verbatim because it predates Learning, Partner, Serena second wave, later Grafel work, and release hardening.

### 6.2 Canonical replacement

Produce one reconstructed latest foundational Markdown file.
Before cutover:
- preserve the NUL file in the recovery backup;
- validate UTF-8 text;
- reject NUL bytes;
- require the expected foundational heading/record identity;
- atomically replace the canonical file.

### 6.3 Reindex only after canonical validation

After canonical text is healthy, rebuild the derived index and verify memory_read(agent-core-foundational) returns real text rather than NUL content.

## 7. Phase 2 — Harden memory health against silent corruption

The current health contract incorrectly accepts an all-NUL pinned canonical record.

Implement a narrow canonical integrity validator that reports a blocking/degraded issue for:
- NUL-containing canonical Markdown;
- binary/non-text canonical files;
- empty or truncated foundational record;
- malformed canonical header/metadata that prevents safe parsing.

Required behavior:
- canonical corruption must never be reported as issueCount=0;
- reindex must not silently bless obviously binary/NUL canonical content;
- derived-index health must remain separate from canonical-store health;
- no automatic destructive rewrite of user memory;
- pinned foundational recovery must be explicit and evidence-based.

This is a shipped behavior change and therefore needs release intent when implementation begins.

## 8. Phase 3 — Normalize documentation and integration history

Reconcile every active architecture document against current source/runtime evidence.

Required repairs include:
- A-MEM was re-grounded source-first on 2026-09-20, P1/P2 were explicitly approved, implemented, targeted-verified, live-activated after launcher restart, and the Audit reference was deleted after a final zero-value census; preserve that completed state rather than restoring stale PLAN ONLY wording;
- docs\Reflexion-Integration-Plan.md was reconstructed from exact source/test/history re-grounding on 2026-09-20; R2-P1/R2-P2 were explicitly approved, implemented, targeted-verified, and the Audit reference was retired after final zero-value/dependency census. Preserve that completed state rather than restoring stale planning-only wording;
- normalize Grafel Second Wave from stale NOT STARTED wording to the verified implemented state;
- normalize Grafel post-v0.3.3 final disposition;
- normalize Hermes Self-Learning to its externally verified 40/40 state;
- keep Hermes A2A Partner at COMPLETE 24/24;
- normalize Serena first-wave to COMPLETE and preserve the fully selected second-wave implementation as verified; the 2026-09-20 source-first re-grounding is a separate proposal-only refresh (`S3-P1` / `S3-P2`) and must not downgrade the implemented baseline;
- keep Anthropic hardening truthfully at implemented/live with targeted verification pending until those gates are executed;
- reconcile docs\CODEBASE.md product version, tool-count, ownership-map, reference-retirement, and plan-status contradictions;
- preserve conversation archives as context, not backlog.

Documentation may describe only evidence-backed implemented state.

## 9. Phase 4 — Per-adoption implementation integrity census

For every adoption track in Section 4, build a recovery matrix with:

- expected active source files;
- expected public MCP tools or internal behavior;
- current source presence;
- current dist presence;
- current runtime health;
- relevant release intent/archive;
- current reference-checkout state;
- current plan status;
- required recovery action, if any.

Rules:
- exact current source outranks plan wording;
- source/dist mismatch is a repair candidate;
- missing plan/history is documentation recovery, not proof of runtime loss;
- retired reference absence is expected, not corruption;
- do not recreate retired research repositories merely to make directories look complete.

Targeted subsystem tests belong to the later verification stage and require the user's explicit testing authorization when execution begins.

## 10. Phase 5 — Restore MCP manifest parity

Server-side source/compatibility currently says 62 tools while this connected controller exposes 60.

Recovery procedure:
1. Verify server registration still includes exactly code_symbol and code_refactor.
2. Verify live Semantic IDE health before touching auth.
3. Reconnect or reinitialize the external MCP connector.
4. Re-OAuth only if the connector actually requires it.
5. Confirm the external controller sees 62 tools.
6. Do not mutate server registration merely to compensate for a stale client cache.

Success criterion: server and newly initialized controller expose the same 62-tool contract.

## 11. Phase 6 — Reference-retirement hygiene

Expected retired/absent references:
- A-MEM;
- Reflexion;
- Changesets;
- Grafel;
- Serena forensic re-clone after S3-P1/S3-P2 completion and final zero-value census;
- Awesome AI Memory, retired on 2026-09-20 after source/Git census found no executable memory engine or active dependency.

Expected retained references:
- Anthropic SDK Python, because targeted verification debt and conditional credential/worker/sync mechanisms remain;
- Anthropic SDK TypeScript, while TS3-P1/TS3-P2/optional TS3-P3 remain proposal-pending and conditional credential/worker families remain source-backed.

The current DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\serena path must be treated as suspicious recovery residue because retirement evidence says the original checkout was deleted.

Do not delete it during recovery without explicit destructive authorization.
First identify whether it is:
- an exact resurrected Serena checkout;
- a partial/corrupt remnant;
- unrelated content restored into the old path.

Record hashes, repository identity, and origin evidence before any deletion decision.

## 12. Phase 7 — Finish Anthropic hardening verification after recovery

Anthropic is the only major adoption currently designed to remain verification-pending.

Targeted gates should cover:
- retry classification by operation safety/idempotency;
- Retry-After and retry-after-ms handling;
- bounded response consumption;
- HTTPS-or-loopback credential endpoint policy;
- Agent Core-owned child environment secret isolation;
- sensitive-file rejection rules;
- atomic credential persistence durability;
- correlation-safe diagnostics and redaction;
- release:compat.

Do not fold these gates into foundational-memory recovery. Complete recovery first, then run the Anthropic gates only with explicit testing authorization.

## 13. Phase 8 — Final coherence gate

Recovery may be called complete only when all are true:

- foundational canonical memory is valid readable Markdown, not NUL/binary;
- memory health detects canonical corruption correctly;
- derived memory index is rebuilt from healthy canonical files;
- no recovery-checkpoint source or dist implementation is missing;
- every adoption track has a documented current disposition;
- active plan/status wording matches exact source/runtime evidence;
- CODEBASE.md has one coherent product/tool/runtime snapshot;
- server and refreshed client agree on the MCP manifest;
- retired-reference state matches recorded decisions;
- release:check-intent is healthy;
- release:compat has no unexplained removals;
- pending 0.12 intents remain intact unless a later explicit release action consumes them.

No release:apply is authorized by this recovery plan.

## 14. Explicit non-goals

This plan does not authorize rollback to the v0.11.0 ZIP, reset/rebase/merge/pull from legacy GitHub, deletion of residual Serena content, retirement of Anthropic reference, broad regression suites, release 0.12.0, commit/tag/push/publish/deploy, or creation of a new memory/workflow/routing/recovery subsystem.

## 15. Recovery completion report

When implementation is eventually authorized, the final report must distinguish:

- recovered bytes/files;
- reconstructed documentation;
- source changes made to prevent recurrence;
- live activation changes;
- tests/checks actually authorized and executed;
- remaining deferred work;
- release state.

Never label the system fully recovered based only on documentation, build success, or a healthy outer /health response.

## 16. Definition of Done

Recovery is DONE only when canonical memory, source, dist, docs, runtime health, MCP surface, adoption inventory, reference-retirement state, and release metadata all tell the same evidence-backed story.

Any unresolved contradiction must be listed explicitly rather than hidden by normalizing wording.
