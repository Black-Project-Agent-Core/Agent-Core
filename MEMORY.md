# Agent Core Memory — Current Implemented State

> **Current authoritative snapshot:** 2026-09-20 recovery after filesystem block corruption.
> **Stable product version:** 0.12.0
> **Planned next release:** none currently — `release:plan` reports 0 pending intents; current-line baseline has not yet been refreshed for the next development cycle.
> **Canonical durable authority:** <PROJECT_ROOT>\runtime\memory.
> **Architecture authority:** <PROJECT_ROOT>\docs\CODEBASE.md.

## Current override — 2026-09-20

Recovery audit note: root `.env.example` was detected as 6,687 NUL bytes from prior filesystem corruption and was rebuilt from current source configuration contracts into a 95-line UTF-8 placeholder/default template with no live secrets; credential-bearing and machine-specific optional overrides remain blank/commented.

This section supersedes older tool-count/version/current-task statements retained below as historical implemented-state detail. Agent Core is live on E:\Projects\Agent-Core using dynamic root resolution; the drive letter is not product identity. /health currently reports Core ok, Execution available, Memory/canonical/index/Embedding/Intelligence available with issueCount 0, Phone available, Grafel available/index current with issueCount 0, Semantic IDE available, Learning available with Memory + Grafel Pattern sinks available, and Hermes Partner available.

Current public architecture includes 26 machine-control tools, 11 memory tools, 14 Game Mode tools, 7 Grafel Code Intelligence tools, Semantic IDE facades (code_symbol, code_refactor), Learning, and Hermes Partner. External Remote Desktop Commander remains operationally separate from Agent Core.

Git recovery boundary changed by explicit user instruction on 2026-09-20: `https://github.com/Black-Project-Agent-Core/Agent-Core` is now designated as a remote recovery mirror of the current local Agent Core line rather than legacy/reference-only. Local files remain authoritative and must not be reconciled by pulling/merging old remote contents. The Git backup excludes credentials/private runtime state/protected reference checkouts/browser profiles/forensic backups/generated temp state; the immutable v0.12.0 release ZIP is intended for a GitHub Release asset rather than ordinary Git because it exceeds GitHub's 100 MB file limit. Repository presentation is now maintained with a current README, contributing/support/code-of-conduct guidance, CODEOWNERS, issue/PR templates, and expanded security reporting guidance; these are documentation/recovery-operability surfaces and do not alter runtime behavior.

Stable release 0.12.0 was explicitly applied and packaged on 2026-09-20. All 11 approved intents (8 minor + 3 patch) were archived, `release:plan` now reports 0 pending intents, and `release:compat` remains 62→62 with no breaking evidence. Immutable package: `release\v0.12.0\Agent-Core-v0.12.0.zip`, 214,410,695 bytes / 19,350 entries / SHA-256 `9eaf5cacdaa689d0c8558779e9a90e6b8efd0d6e86f9608447d7f8eaff2411fe`; packaged launcher FileVersion/ProductVersion are 0.12.0.0/0.12.0 with SHA-256 `5be78ce367840938b8e517cdae3b462269e0b5b1ce677dfd2e458b72e38885ac`. ZIP safety scan found zero forbidden credential/backups/Git/protected-reference/user-memory paths. Packaging required recovery of corrupted UI node_modules from the existing lockfile and a system-dotnet fallback after quarantining a corrupt local `runtime\dotnet-sdk\dotnet.exe`, plus regeneration of corrupted launcher `obj` build cache. The synthetic current-line baseline was intentionally not refreshed; current `release:check-intent` therefore remains non-zero until an explicit next-cycle baseline refresh. No commit, tag, push, publish, deploy, or restart occurred; live Node Core remains 0.11.0 until separately restarted.

Hermes stability repair 2026-09-20 is COMPLETE. `E:\Projects\hermes\Hermes.cmd` again works end-to-end through loopback 9Router: its local API key was rewired without exposure, default inference is `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`, and configured fallbacks are `openrouter/poolside/laguna-s-2.1:free` plus `gemini/gemini-3.5-flash-lite`; all three routes produced successful direct 9Router evidence, with `Hermes.cmd -z` returning `HERMES_0213_OK`. Corrupt Hermes `state.db` FTS B-trees and corrupt root `tmp` were quarantined under `E:\Projects\hermes\backups`; active `state.db` is freshly created and `sessions repair --check-only` reports clean, while old transcript data remains forensic backup for optional separate recovery. Agent Core Partner source discovery preserves explicit env overrides, otherwise prefers sibling `E:\Projects\hermes-agent` when it contains `gateway\platforms\api_server.py`, with nested `<HERMES_HOME>\hermes-agent` as recovery fallback. Filesystem corruption had made all 40 tracked files under `gateway\platforms` and all 30 tracked files under `cron` unreadable/deleted; both directories were quarantined and restored exactly from local Git HEAD v0.21.3, and `from gateway.platforms.api_server import APIServerAdapter` passed afterward. Live Node Core PID 11172 reports `/health=ok`; Hermes Partner is available on loopback port 18642, version 0.21.3, issueCount 0. Final post-repair A2A acceptance completed alignment + approval + delegated execution with terminal status `completed`; the delegated readiness output confirmed Hermes 0.21.3 is ready under lead-verified criteria. A broken optional `plugins\ponytail` directory still has OS-level Access Denied and can emit a non-blocking session-end hook warning; it does not block inference or Partner execution and was not force-repaired at the drive level.

Grafel final re-grounded G20–G25 boundary hardening is COMPLETE — IMPLEMENTED — LIVE-ACTIVATED — TARGETED VERIFIED — REFERENCE RETIRED. Added behavior: explicit stale-workspace unregister/prune with default-workspace protection, AST-derived MCP schema parity regression, complete 62-tool manifest contract + handshake budget in release:compat, Grafel wire_version compatibility reporting/degradation, typed canonical Code Intelligence query/discriminator options while retaining legacy/provider-forward escape hatches, and bounded redacted graph-touch evidence in the existing Activity Tracker. Verification: build PASS; 5 files / 21 targeted tests PASS; release:compat 62→62 with breakingEvidence=false; manifest 104,867 bytes/~26,217 tokens under budget; stale-registry cleanup removed only audit-a-mem/audit-changesets/audit-reflexion; final 71/71 zero-value/dependency census passed and Audit\\Grafel was deleted. Post-restart live acceptance reports Code Intelligence available/current, providerWireVersion=0.1.0, providerWireCompatible=true, issueCount=0; get_recent_tool_calls compact/failuresOnly works live, typed substring find and analysisPreset routing are live, and Activity Tracker records real touchedEntityIds. Minor intent `20260920085541-e0820f` was consumed into stable release 0.12.0. External MCP clients that initialized against an older manifest may need their own reinitialize/reconnect before additive enum values such as prune_workspaces are accepted client-side.

Serena-derived Semantic IDE deferred-wave scope is COMPLETE/VERIFIED and the Serena protected reference checkout was retired after zero-value census. Current capabilities include external TCP providers, multi-root workspaces, provider hot reload, type hierarchy, diagnostics delta, provider version compatibility, hardened provider environments, and scalable freshness.

Anthropic-SDK-derived hardening is IMPLEMENTED/LIVE-ACTIVATED/TARGETED-VERIFIED for the previously approved Python-derived and TS3 waves. The user-approved fourth-wave TS4-P1/P2/P3/P4 + PY4-P1 scope is now COMPLETE + IMPLEMENTED + TARGETED VERIFIED + LIVE-ACTIVATED: Code Intelligence/Learning/Phone converge on a shared text-first/structuredContent MCP decoder; Phone parses complete LF/CRLF/CR SSE events with multi-line data; outbound policy treats caller abort as terminal, makes retry backoff abort-aware, cancels discarded retry bodies, and bounded-response cancels failed readers; Key/OAuth/RDC config reads consume identity-bound opened handles using exact BigInt dev/ino because observed NTFS inode values exceed JavaScript safe-integer range; RDC config persistence uses writeOwnedFileAtomic under its existing cross-process lock. Fourth-wave regression is 18/18 PASS; final Key/OAuth/RDC affected suites are 4/4 + 3/3 + 5/5 PASS and targeted bridge config/file mutation PASS. Live readback: Node Core PID 18268, created 2026-09-20 19:39:16 +07:00, `/health=status=ok`, and compiled dist contains the fourth-wave implementation. No Anthropic SDK runtime/model/provider/dependency was installed. Conditional expiring-token/OIDC credential chains, lease-worker ownership, and external-memory reconciliation remain dormant without real consumers; both references remain retained.

Claude-Mem-derived current-fit memory scope CM-P1/CM-P2/CM-P3 is COMPLETE + IMPLEMENTED + TARGETED VERIFIED + LIVE-ACTIVATED. Memory records may carry bounded workspace/repo/file/commit provenance; `memory_read` returns advisory `unanchored|source-unavailable|current|changed` source staleness and optional bounded prior full-record revisions; content-changing mutations snapshot the prior canonical record inside the same MemoryTransactionCoordinator commit and retain at most 8 / about 1 MiB per memory; malformed revision state never replaces canonical authority; `memory_search.sourceFiles` adds a transparent bounded `sourceFileMatch` ranking component and is inert when omitted. Targeted verification: new adoption suite 7/7 PASS, existing memory/manifest suites 27/27 PASS, root build PASS, release:compat 62→62 with breakingEvidence=false. Minor intent `20260920131504-f2cb0a` was consumed into stable release 0.12.0. No Python MCP runtime, SQLite canonical store, MiniLM model, NetworkX graph, regex indexer, LRU memory cache, or parallel per-project memory authority was added. CM-C1 is closed by the existing Learning review boundary: unverified candidates remain proposals and only verified candidates reach durable sinks. Final zero-value/dependency census passed and the protected `claude_mem` checkout is retired/deleted as a corpse; the completed plan remains the provenance record.

Changesets-derived release tooling is COMPLETE for both first-wave and selected second-wave scope. Stable product identity is now 0.12.0: explicit stable `release:apply` consumed all 11 approved intents and archived them under `.changeset\applied`, while `release:plan` now reports 0 pending intents. `release:package` successfully produced immutable `release\v0.12.0\Agent-Core-v0.12.0.zip` plus notes/manifest/SHA256; checksum verification and a ZIP path-safety scan passed. The second wave continues to provide shared changedFilePatterns policy, metadata-safe intent discovery, non-consuming snapshot packaging, and explicit prerelease channel state. The synthetic `refs/agent-core/current-line-baseline` was intentionally not refreshed during this packaging task, so current `release:check-intent` is expected to stay non-zero until a deliberate next-development-cycle baseline refresh. `release:compat` remains 62→62 with no breaking evidence. No commit/tag/push/publish/deploy/restart occurred. The Changesets Audit reference remains retired; only `@changesets/parse` is the intentional Changesets package dependency.

Reflexion is now COMPLETE — IMPLEMENTED — LIVE-ACTIVATED — TARGETED VERIFIED — REFERENCE RETIRED for the selected second wave. The original exact-repeat advisory remains intact, while `FailureLoopAdvisor` additionally detects third consecutive same-tool/same-failure-family stagnation across changed arguments without blocking or retrying execution. Live acceptance exposed that absolute paths inside coded ENOENT messages initially fragmented failure families; the normalizer now replaces volatile absolute paths/PID/port values before family fingerprinting, and a dedicated regression protects that behavior. `src\failure-evidence.ts` centralizes redacted failure-family normalization and bounded evidence excerpts. Tool History captures a compact redacted failed-call capsule before oversized raw output is capped; `get_recent_tool_calls(compact=true, failuresOnly=true)` exposes only bounded diagnostic evidence while default/full history preserves its previous response shape. Targeted Reflexion verification passed 3 files / 18 tests; root build passed; compiled schema smoke succeeded; pre-release release:check-intent was healthy, while after stable 0.12.0 apply the baseline intentionally remains pre-release until an explicit next-cycle refresh; release:compat remains 62→62. The final live Node Core listener is PID 18776, started from rebuilt `dist\index.js` at 2026-09-20T14:46:49+07:00 with `/health=ok`, Memory available, and Execution available. Three live ENOENT `read_file` failures using different absolute paths produced the broader failure-family advisory only on failure 3, proving the final P1 runtime behavior. The exact Reflexion Audit checkout was deleted after a 55-file / 293-definition zero-value and dependency census. No Reflexion runtime/model/provider/database, automatic retry loop, generated-test engine, or machine-control gate was added. The `get_recent_tool_calls` public-schema drift is fixed and live-activated by Grafel-derived G21, protected by an AST-derived schema parity regression. Post-restart live acceptance proved `compact=true` plus `failuresOnly=true` reaches the handler and returns compact failure evidence. Clients that cached an older MCP manifest may still need their own reinitialize/reconnect to discover additive schema fields/enums.

Recovery note: on 2026-09-20 filesystem block corruption overwrote portions of source, dist, root node_modules, package.json, AGENTS.md, MEMORY.md, docs, Tool History, and 9Router DB/cache. Recovery restored exact v0.11 dependency bytes where lockfile-identical, preserved post-v0.11 Serena/Anthropic source behavior, rebuilt Core/launcher, repaired Grafel registry/index and Hermes/9Router state, and kept corrupt artifacts in timestamped backups rather than deleting them.

---

## Historical implemented-state detail (retained for continuity)

# Agent Core Memory — Current Implemented State

> **Status:** IMPLEMENTED, ACTIVE, VERIFIED
> **Root:** `<PROJECT_ROOT>`
> **Canonical memory root:** `<PROJECT_ROOT>\runtime\memory`
> **Authority:** canonical Markdown files; derived index is rebuildable and non-authoritative.
> **Queued memory work:** **NONE**

This document describes the memory subsystem that exists now. It is not a plan, roadmap, phase tracker, reminder, or future-work list. Historical design-phase notes were removed from the active documentation after implementation was completed. New memory work requires a new explicit user request.

## Runtime role

Agent Core Memory is a first-class sibling subsystem to the Agent Core machine-control layer. That layer is implemented by vendored RDC-derived code under `src\rdc`, but it is part of Agent Core runtime and is not the external Remote Desktop Commander device/service. Memory does not authorize, route, gate, delay, or select normal Agent Core machine-control calls.

Runtime topology:

```text
AI / MCP client
  -> Agent Core MCP
      -> 26 Agent Core machine-control tools (`src\rdc`, vendored RDC-derived)
      -> 10 explicit memory tools
           -> MemoryService
                -> canonical Markdown store
                -> rebuildable lexical/semantic index
      -> 14 Game Mode / Android phone-control tools
      -> 5 Code Intelligence tools
           -> isolated Grafel provider / structural graph
```

Memory, Game Mode, and Code Intelligence are sibling capabilities. Code Intelligence does not route, authorize, gate, or replace Memory or normal machine-control calls.

## Canonical storage

```text
runtime\memory\
  00-agent-core-memory.md
  notes\
  index\index.json
  state\
  .memory.lock\
```

`00-agent-core-memory.md` is the pinned foundational memory. Ordinary memories live as canonical Markdown records under `notes\`. The index may be deleted and rebuilt without losing canonical memory.
## Public memory tools

The active MCP surface exposes:

1. `memory_list`
2. `memory_read`
3. `memory_search`
4. `memory_remember`
5. `memory_update`
6. `memory_delete`
7. `memory_status`
8. `memory_reindex`
9. `memory_evolve`
10. `memory_consolidate`

## Embedding and retrieval

The configured semantic embedding remains intentionally unchanged:

```text
Provider   : Cloudflare Workers AI
Model      : @cf/google/embeddinggemma-300m
Dimensions : 768
```

Embedding vectors are derived state only. Persisted, provider-returned, and query vectors are validated for exact dimensions and finite numeric values before use. Semantic search is fail-soft: canonical/lexical retrieval remains usable when the embedding provider is unavailable.

Hybrid retrieval combines lexical/metadata scoring, raw cosine similarity, bounded relationship expansion, and a hard response-character budget. `semanticSimilarity` is exposed as raw/clamped `0..1`; weighting is applied only to the total ranking score.

## Durability and relationships

Canonical mutations use cross-process locking. The current lock implementation uses `proper-lockfile` directory leases with heartbeat/stale recovery and compatibility handling for legacy file locks. Pinned foundational memory cannot be deleted through ordinary APIs.

Ordinary `related` links are bounded, deduplicated, strength-aware, and synchronized reciprocally when safe. Evolution may enrich empty metadata and add or strengthen relationships; it does not automatically rewrite substantive memory content.

## Controller-assisted semantic capture

A-MEM-style semantic analysis is integrated at the existing controller/MCP boundary instead of introducing a second internal LLM runtime. When confidently known, a connected AI/controller supplies concise `keywords`, factual `context`, non-redundant `tags`, and a meaningful `category` in the same `memory_remember` call. If substantive content is later replaced through `memory_update`, the controller should refresh those semantic fields when they would otherwise become stale.

These fields remain optional. Omitted or uncertain metadata is enriched by a provider-independent deterministic fallback before persistence, so basic `keywords`, `context`, and `tags` do not depend on Cloudflare or any embedding provider. `EmbeddingMemoryIntelligence` remains responsible for embedding-backed nearest-neighbor relationship proposals and conservative link evolution when semantic vectors are available. Agent Core therefore gains model-level semantic capture from whichever AI is controlling it while retaining useful fallback behavior without ChromaDB, Python, OpenAI/Ollama/SGLang/OpenRouter runtime dependencies, or an internal memory-specific LLM provider.

A-MEM second-wave review is now implemented in the existing `memory_evolve` surface. The default `mode=apply` preserves the prior conservative mutation lifecycle. Explicit `mode=preview` is non-mutating with respect to canonical memory, reciprocal links, and the derived index: it requires an already-current semantic index, returns the exact validated owner evolution proposal, and includes bounded nearest-neighbor evidence containing current neighbor keywords/context/tags/category plus similarity/proposed-link evidence. Neighbor evidence is review context only. Agent Core never auto-rewrites neighboring metadata from similarity; any selected neighbor metadata correction must be derived by the connected controller from inspectable evidence and committed explicitly through `memory_update` or preferably one atomic `memory_batch`. Targeted verification passed the memory-maintenance suite at 1 file / 23 tests, including six new P1/P2 acceptance cases; TypeScript build passed; release compatibility remained 62 -> 62 with no public tool/route removal. Live activation was then proven after launcher restart: the new Node Core listener started from the rebuilt `dist\index.js`, `/health` returned Agent Core available, and a direct live MCP call `memory_evolve(mode=preview, neighborLimit=3)` returned `mode=preview`, `applied=false`, the exact proposal, and bounded neighbor evidence. After final exact-source zero-value census, the re-cloned `Audit\A-MEM` checkout was deleted as a corpse; provenance remains in `docs\A-MEM-Integration-Plan.md`.

## Reflexion durable-lesson protocol

Reflexion-style failure learning is integrated at the controller contract, not as a new MemoryService or autonomous retry runtime. A verified failure, explicit user correction, failed authorized verification, or repeated no-progress attempt may produce a concise task-local reflection grounded in the actual result. The controller must change the next attempt rather than blindly repeat an equivalent failed action.

Task-local reflections are not canonical memory. When a failure recurs, the controller may query `memory_search` for only the top 1–3 relevant durable lessons. A lesson is promoted through the existing `memory_remember` / `memory_update` path only after the correction materially succeeds, has supporting evidence, is reusable, and contains no secret/transient noise. Reusable operational lessons normally use category `operational-reflection`; raw scratchpads, hidden/private reasoning, and full chain-of-thought are never stored.

This behavior reuses direct MCP results, bounded Tool History, targeted Activity Tracker evidence, and the existing A-MEM-enhanced MemoryService. Tool-history arguments/outputs and Activity Tracker messages/context/error snapshots are recursively secret-redacted before persistence, and existing persisted history/tracker artifacts are re-sanitized when the current runtime loads. It adds no reflection database, vector store, Python/LangChain runtime, autonomous retry daemon, machine-control gate, or second model provider. The former protected `memory\reflexion` research checkout was retired after final re-grounding; Agent Core runtime has no dependency on that deleted checkout.

Two Reflexion hardening items are now implemented and complete. `tests\reflexion-contract.test.ts` protects the controller contract and architecture invariants during authorized verification. `src\mcp\failure-loop-advisor.ts` provides bounded deterministic post-execution detection of repeated equivalent failures: sanitized canonical arguments + redacted failure family, 64-entry in-memory state, 10-minute TTL, first failure silent, second failure advisory, third-and-later stronger no-progress advisory, conservative polling/status exemptions, and success/reset semantics. The advisory never blocks execution, retries automatically, chooses tools, forces memory recall, or writes canonical memory. Machine-control and memory handled failures can surface the advisory while preserving original error semantics; repeated thrown errors retain the same Error instance with advisory text appended. Advisory events reuse Activity Tracker module `REFLEXION` rather than creating a second reflection log.

## Code Intelligence knowledge boundary

Grafel-backed Code Intelligence is integrated and active, but it is not a replacement for Agent Core Memory.

The active facade is:

1. `code_orient`
2. `code_graph`
3. `code_surface`
4. `code_analysis`
5. `code_patterns`

Authority split:

```text
Agent Core Memory
= durable architecture facts
= generic verified operational lessons
= cross-task continuity

Reflexion
= task-local failure diagnosis
= changed-next-attempt behavior
= selective durable-lesson promotion

Grafel Patterns
= repo/module/language/stack-specific code recipes
= real code exemplars
= scoped pattern lifecycle/confidence
```

Structural graph results remain navigation/analysis evidence only. Exact current source remains authoritative. If the Grafel index is stale/unavailable, controllers fall back to ordinary Agent Core search/read without blocking machine control.

The implemented `code_patterns` lifecycle is `query`, `record`, `get`, `refine`, `apply`, `reject`, and `promote`. Pattern outcomes must be grounded in real work/evidence; they are not automatically copied into canonical Memory.

## Consolidation and health

`memory_consolidate` is proposal-only. It can report `review-merge` or `review-overlap`; it does not automatically merge, delete, supersede, or rewrite canonical memories.

`/health` and `memory_status` perform live canonical/index inspection. Health distinguishes canonical-store readiness from derived index/embedding/intelligence readiness. A damaged derived index degrades derived capabilities without converting a healthy canonical store into data loss.

## Verification evidence

Final-graduation verification on 2026-09-18 supersedes the earlier pre-Grafel broad baseline for current-state claims.

- full Agent Core root `npm run verify`: TypeScript build PASS + **17 / 17 Vitest files, 98 / 98 tests PASS**
- Agent Core internal machine-control bridge regression including PDF create/read/modify: **7 / 7 PASS** (this does not test external Remote Desktop Commander)
- memory-maintenance regression: **17 / 17 PASS**; the stale-directory same-process contention regression was additionally repeated **10 consecutive times, 10 / 10 PASS** after the lock fix
- separate Node-process memory-lock serialization: PASS
- memory lock architecture now combines a per-process same-lock queue with the existing cross-process `proper-lockfile` lease, eliminating the stale-recovery `ERELEASED` race seen during the first final broad run
- desktop status truth test now explicitly disables optional Game Mode + Code Intelligence in its isolated execution/memory contract, preventing unrelated provider/device startup latency from causing false timeouts
- desktop UI: **1 / 1 file, 3 / 3 tests PASS**, typecheck PASS, Vite production build PASS
- native launcher: **12 / 12 tests PASS**; Release build PASS with **0 warnings, 0 errors, `MSB3277=0`**
- final rebuilt Node core activation: HTTP/core `ok`; Execution/Memory/Game Mode/Code Intelligence all available; Memory `issueCount=0`; Grafel index `current`
- post-activation same-process lock acceptance: **8 concurrent `memory_read` calls all succeeded**, followed by fully available `memory_status` with zero issues
- embedding provider/model/dimensions live: Cloudflare Workers AI / `@cf/google/embeddinggemma-300m` / 768
- A-MEM integration targeted regression: **4 files / 28 tests PASS**, including provider-independent fallback, controller-supplied metadata preservation, semantic evolution/consolidation, MCP parity, and direct machine-control regression.
- compiled `dist` smoke: provider-independent fallback populated metadata with embedding `not-configured`, while controller-supplied metadata remained unchanged; canonical memory stayed `available` with `issueCount=0`.
- A-MEM dependency audit: active `src` contains **0 references** to ChromaDB, SentenceTransformers, Ollama, SGLang, or OpenRouter runtime integration.
- Reflexion controller-contract loader smoke: compiled `dist/mcp/agent-protocol.js` read the live `AGENTS.md` and confirmed the Reflexion protocol, bounded 1–3 recall rule, and anti-blind-retry rule are present.
- Reflexion failure acceptance: an intentional missing-file `ENOENT` was not retried blindly; the next action changed to `list_directory`, which discovered the real plan filename. `memory_list` immediately afterward still contained only the pre-existing durable memories, proving task-local reflection is not auto-persisted.
- Reflexion durable-lesson acceptance: a real PowerShell/Git quoting failure was corrected with a materially changed command that exited `0`; only after that verified success was the reusable lesson promoted as category `operational-reflection`. A bounded `memory_search(limit=3)` recovered it directly.
- Protected Reflexion reference repository remained clean after integration acceptance; active `src` contains **0 Reflexion runtime imports/references**, confirming no second runtime/service was introduced.
- Reflexion post-audit hardening: root TypeScript build PASS after shared secret-redaction wiring; targeted synthetic smoke confirmed nested/header/CLI/key-value credentials are redacted, and startup scrub paths now sanitize existing tool-history/tracker evidence.
- Reflexion contract regression + advisory detector: targeted Vitest **2 files / 12 tests PASS**. The contract regression includes a negative control proving blind-retry drift is detected; the detector regression covers thresholds, argument/failure-family separation, `origin` normalization, success/TTL/restart resets, polling/status exemptions, secret redaction, handled-result preservation, and thrown-Error identity preservation.
- Reflexion compiled/live acceptance: successful direct MCP call remained ungated; first repeated-failure sequence produced no advisory on attempt 1, `repeat 2` on attempt 2, and stronger `repeat 3` no-progress text on attempt 3 while preserving the original ENOENT. An intervening successful tool call reset the streak. The same first/second behavior was live-verified for `memory_read` against a missing id.
- Reflexion persisted-evidence redaction acceptance: the synthetic failure itself persisted as `token=[REDACTED]`. A later literal-value verification search was logged as Tool History test data, so that synthetic verification artifact was scrubbed; final JSONL validation reported zero parse errors and zero remaining raw synthetic-secret occurrences in both Activity Tracker and Tool History, while redacted-token occurrences and `failure-loop-advisory` events remained.
- Reflexion hardening activation: rebuilt Node core restarted with owner/listener identity checking; post-restart `/health` remained `ok`, Execution/Memory/Game Mode/Code Intelligence stayed available, and Memory `issueCount=0`.
- Grafel Code Intelligence integration: project-local provider live with daemon `available`, index `current`, group `agent-core`, and `issueCount=0`; root TypeScript build PASS after final Code Intelligence source changes.
- Grafel structural acceptance: active Agent Core entity discovery, incoming relation traversal, and impact analysis succeeded; protected reference and `SubProject` identifiers were absent from the graph.
- Grafel second-wave integration: request-scoped workspaces/refs/worktrees, explicit residual repair, architectural fitness, structural review/calibration protocols, and diagnostics/quarantine visibility are implemented; current live Node core `0.9.0` reports Grafel available/index current with `issueCount=0`.
- Grafel second-wave targeted acceptance: provider exposes 22 MCP tools; index-status/repair-list succeeded, refs were readable, quarantine returned a truthful empty list, zero-rule fitness returned a neutral success, and historical acceptance records tracked-worktree registration plus explicit repair/reindex behavior.
- MCP registration baseline before Grafel second wave exposed **55 tools** = 26 machine-control + 10 memory + 14 Game Mode + 5 Code Intelligence; Grafel second wave expanded it to 57, and the Hermes-adapted self-learning implementation now defines **59 tools** = 26 machine-control + 11 memory + 14 Game Mode + 7 Code Intelligence + 1 Learning.
- Fresh external-controller acceptance previously exposed the first-wave five `code_*` tools. Grafel second-wave now registers seven tools; controllers initialized before the second-wave cutover may require reconnect/reinitialize to refresh their cached tool manifest.

Detailed maintenance evidence is retained in `Maintenance.md`. Current architecture ownership and subsystem relationships are documented in `docs\CODEBASE.md`.

## Current task state

A-MEM, Reflexion, Grafel Code Intelligence, and Hermes-adapted self-learning are implementation-complete for their approved scopes. Hermes final acceptance is complete at 40 / 40 PASS.

- A-MEM remains the semantic capture/retrieval enhancement inside native MemoryService.
- Reflexion remains controller-side failure learning over existing evidence + MemoryService, with no second runtime or execution gate.
- Grafel Code Intelligence is active as a separate sibling structural-code-intelligence provider with seven `code_*` tools (`code_orient`, `code_graph`, `code_surface`, `code_analysis`, `code_patterns`, `code_workspace`, `code_repair`) and no machine-control gate.
- Hermes-adapted self-learning is a sibling `LearningService`: meaningful task checkpoints + immediate correction/recovery/explicit-learn triggers, controller-owned semantic review, verified routing to existing MemoryService or Grafel Patterns, `memory_batch` transactional mutations, proposal-only curator, and read-only learning journey. `runtime\learning` stores scheduling metadata only; no Python Hermes runtime, hidden model, transcript store, or second memory authority was introduced.

There is **no queued A-MEM, Reflexion, Grafel first/second-wave, or Hermes self-learning integration work** in active root documentation. The Hermes plan is **COMPLETE — VERIFIED FOR APPROVED SCOPE** after external acceptance plus Gate 20/30 repair/reacceptance reached 40 / 40 PASS. Future capability expansion requires a new explicit user request.

Do not derive new work from implementation history. A new memory/reflection/code-intelligence task exists only when the user explicitly requests one or a newly verified defect is recorded as OPEN.\n## Hermes final graduation — 2026-09-18\n\n- External Hermes acceptance initially returned 38 PASS / Gate 20 FAIL / Gate 30 BLOCKED.\n- Gate 20 root cause was the Agent Core Grafel adapter, not Agent Core root hardcoding: Grafel v0.3.3 code-pattern record requires a structured trigger object and real entity exemplars; generic provenance cannot be used as an exemplar.\n- The relocation incident also exposed scheduler-only false-positive freshness: copied Grafel daemon state still referenced the old absolute root even though the portable Agent Core root and fleet registration had moved. Relocation now synchronously reindexes the newly resolved root and health requires graph-backed ref evidence.\n- Live Gate 20 repair acceptance captured pattern `922a0156704289ef`; duplicate replay returned duplicate with the same id.\n- Live Gate 30 repair acceptance exposed the active pattern in Learning Journey with real de-interned exemplar entity edges.\n- Public legacy `text` record compatibility succeeded, provider error detail is preserved, and generic evidence refs are no longer treated as Grafel exemplars.\n- Targeted regression: 5 files / 37 tests PASS; TypeScript build PASS; direct machine-control remained ungated.\n- Final Grafel index for current runtime root: 229 files / 3861 entities / 17467 relationships; graph-backed workspace status current.\n- Temporary test patterns were lifecycle-rejected and temporary Memory capture was deleted; canonical Memory returned to 9 records with zero issues.\n- Hermes final decision: **40 / 40 gates PASS — COMPLETE — VERIFIED FOR APPROVED SCOPE**.\n
## Stable release 0.9.0 — 2026-09-18

- Two pending minor intents were explicitly applied: Grafel second-wave Code Intelligence and Hermes-adapted self-learning/transactional memory.
- Canonical product version advanced `0.8.1 -> 0.9.0`; root/UI/TypeScript/.NET version surfaces synchronized; pending release intents are now zero.
- `release:package` created immutable local artifacts under `release\v0.9.0\`.
- `Agent-Core-v0.9.0.zip`: 208,812,849 bytes, SHA-256 `8c03da087a3905db05623b42e5d0851490e4f7f565cc60781340456787c836d3`.
- Packaged launcher SHA-256 `8c971e1e1c4dab2576b2d4004cd318597ba5964dd7c66465355b37e207c70be2`; FileVersion `0.9.0.0`, ProductVersion `0.9.0`.
- Root launcher was cut over to the verified 0.9.0 binary; Node core restarted without resetting OAuth.
- Live `/health` reports version `0.9.0`, core ok, Execution/Memory/Code Intelligence/Learning available, Memory issueCount 0, Learning issueCount 0, Grafel index current.
- Synthetic current-line baseline refreshed to `b99381b32ef6a36554a44c723d54608371ce95ae`; post-refresh `release:check-intent` is clean with no release-relevant delta and no pending intent.
- No commit/tag/push/publish/deploy or legacy-remote mutation occurred.

## Serena S3 provider provisioning + external acceptance — 2026-09-20

- User approved both re-grounded Serena residual proposals `S3-P1` and `S3-P2`.
- `S3-P1` is implemented as explicit `code_symbol(action=provision_provider)` with confirmation `PROVISION_PROVIDER`; ordinary semantic queries never download/install providers.
- Managed Python/C#/PowerShell recipes are pinned to exact versions/hashes and install only under `runtime\semantic-ide\providers` with host/redirect validation, bounded streaming, SHA-256 verification, safe archive extraction, staged atomic promotion, integrity manifests, and explicit repair semantics.
- Mutable provider state is separated from immutable integrity trees: C# logs and PowerShell session state live under `runtime\semantic-ide\state`; Roslyn `cache` is the only recipe-declared mutable C# subtree excluded from artifact-tree integrity hashing.
- `S3-P2` is implemented as `scripts\verify\mcp-external-acceptance.mjs` / `npm run verify:mcp-external`, an explicit external MCP handshake/schema/read-only-probe harness, not a daemon or runtime gate.
- Targeted verification: 3 files / 10 tests PASS; TypeScript build PASS; real Python/C#/PowerShell managed trees validate `alreadyValid=true`; `release:compat` remains 62 -> 62 with `breakingEvidence=false`.
- Minor intent `20260920101657-048227` is pending toward 0.12.0; `release:apply` was not run.
- Source/dist implementation is complete and live-activated. Post-restart `/health` reports Semantic IDE `available`, issueCount `0`, with TypeScript 6.0.0 / C# 5.5.0 / PowerShell 7.6.6 / Python 1.1.403 all compatible. A fresh authenticated external MCP client observed 62 tools and confirmed live `code_symbol` schema fields `provision_provider`, `providerId`, `repair`, and `confirmation`. Live Python provisioning returned `changed=false`, `alreadyValid=true`, `repaired=false`.
- Final zero-value/dependency retirement passed: active source/test/script contains 0 Serena dependencies, no `.grafel` marker remains, Grafel registry contains only the `agent-core` repo, and `Audit\Serena` was deleted (`EXISTS_AFTER=False`). Serena S3 is therefore COMPLETE — VERIFIED FOR APPROVED SCOPE — LIVE-ACTIVATED — REFERENCE RETIRED.
