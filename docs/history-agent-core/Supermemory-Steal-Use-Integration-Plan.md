# Supermemory Steal / Use Integration Plan

> **Status:** SM-P1 COMPLETE/LIVE — SM-C1 + SM-C2 CONSUMER-ONLY — REFERENCE MOVED TO `Consumer` — NO CURRENT IMPLEMENTATION PROPOSAL
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\19-supermemory`
> **Repository:** `https://github.com/supermemoryai/supermemory.git`
> **Revision:** `2415a5c796d62c7ea9d709bc9337a6e1b6f6d837`
> **Branch:** `main`
> **License:** MIT

## 1. Source-first evidence

Fresh census found 772 non-Git files, 385 executable-code files and 76 test files. Audit emphasis was framework-agnostic memory client/context/tool code under `packages/tools/src`, including profile/search deduplication, soft-forget, source-document vs learned-memory separation and owned context replacement.

## 2. SM-P1 — explicit reversible soft-forget lifecycle

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.

Source evidence:
- `packages/tools/src/shared/forget-memory.ts`;
- tool contracts distinguish soft-forgetting one learned fact from hard deletion of its source document;
- forgotten facts stop appearing in profile/search while source/audit history remains;
- optional reason is retained with the forget request.
Verified Agent Core gap:
- Agent Core has explicit hard `memory_delete`, non-destructive feedback, revisions and retirement review;
- `stale/wrong` feedback lowers auxiliary salience but does not create an explicit reversible retrieval-suppression state;
- a user correction can therefore require either leaving a wrong record searchable or hard deleting it.

Proposed adaptation:
- add an Agent Core-owned reversible `forgotten` lifecycle in auxiliary Memory state, never a second canonical store;
- extend existing bounded feedback/lifecycle state rather than adding a database;
- explicit forget records reason/evidence and excludes the non-pinned record from ordinary search and linked expansion while leaving exact read/revisions/provenance intact;
- explicit restore re-enables recall only when the same record still exists;
- hard delete remains separate and still repairs links;
- pinned foundation cannot be forgotten through ordinary APIs;
- avoid a new public tool if possible: use a narrowly extended existing Memory lifecycle surface while keeping the MCP manifest inside its reviewed budget.

Acceptance:
- forget is idempotent and reversible;
- forgotten memories cannot leak through direct or linked search;
- exact read exposes historical/forgotten state;
- restore does not erase forget history;
- hard delete remains stronger/separate;
- no automatic model decision can forget/restore a record.
## 3. SM-C1 — owned memory-context block replacement

**Disposition:** CONDITIONAL FUTURE-FIT — do not install until a real Agent Core AI prompt-assembly consumer exists.

Source mechanism:
- `shared/memory-context.ts` marks middleware-owned context, escapes nested owner tags, strips only prior owned blocks and preserves caller-authored instructions.

If the separate Agent Core AI/agentRuntime workstream later assembles prompts from local Memory, adapt this as a strict Agent Core-owned readonly context envelope so retrieved Memory cannot terminate/nest the system-owned block. Do not add a dormant prompt-assembly subsystem to today's MCP core merely to consume this mechanism.

## 4. Covered / rejected families

Covered:
- profile/search dedup can be expressed by current metadata, fusion ranking and controller selection;
- source provenance/export/import already exists;
- bounded outbound retry/timeout patterns are already hardened;
- hard deletion/revisions already exist.

Rejected:
- Supermemory cloud API/client dependency as a second memory authority;
- automatic remote extraction/document ingestion into canonical Agent Core Memory;
- provider SDK middleware for OpenAI/Vercel/Mastra/VoltAgent;
- automatic memory-context insertion into every MCP turn.

## 5. Reference disposition

**CONSUMER-ONLY / MOVED.** SM-P1 is already implemented/live. The only surviving source-backed value is SM-C1/SM-C2, both gated on native prompt/session consumers that do not exist in current Agent Core. The checkout is therefore no longer an active adoption candidate and belongs under the protected `Consumer` holding area rather than the active reference pool.

## 6. Approved execution result — 2026-09-27

SM-P1 is present in current source/dist through the existing `memory_feedback` surface with explicit `forget`/`restore`, reversible auxiliary lifecycle history, pinned-foundation protection and active-recall suppression. Direct wave acceptance verified forget/restore without canonical deletion.

SM-C1 remains intentionally conditional. No real Agent Core AI prompt-assembly consumer exists in this approved scope, so no dormant prompt-injection subsystem was installed. The `19-supermemory` source remains preserved as conditional evidence; its current filesystem classification is `Consumer\19-supermemory`.

Live resident activation of SM-P1 is complete after the user-controlled restart/reconnect; installed-runtime acceptance is recorded in `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`.

## 7. Residual re-grounding — 2026-09-27

Exact source was re-read after SM-P1 live activation. No real Agent Core prompt/model/session runtime exists under `src`; current `agentRuntime` occurrences are UI/status contracts. Therefore SM-C1 remains conditional and must not be installed into the current MCP core.

### SM-C2 — tool-call-safe conversation persistence normalization

**Disposition:** CONDITIONAL FUTURE-FIT — only if native Agent Core AI gains durable conversation/session persistence.

Source/tests under `packages/tools/test/with-supermemory/conversation-conversion.test.ts` substantiate:
- tool-call + tool-result ordering is preserved across conversion;
- assistant text and tool calls can coexist without reordering;
- missing tool-call input is serialized as an empty object;
- non-JSON-serializable tool input fails soft instead of aborting the whole conversation save;
- tool calls/results can be intentionally omitted while preserving ordinary text.

Future adaptation, if the consumer exists:
- normalize Agent Core-owned conversation records without losing tool-call/result correlation IDs;
- preserve ordering and caller-authored text;
- fail soft on unpersistable tool input with explicit evidence rather than dropping the entire turn;
- keep tool outputs subject to current redaction/evidence-capture policy;
- do not use Supermemory cloud persistence or create a second Memory authority.

**Reference disposition is CONSUMER-ONLY.** SM-C1 and SM-C2 are still source-backed conditional mechanisms, so no current product/runtime installation is proposed and the checkout is preserved under `Consumer`.

## 8. Approved conditional execution boundary — 2026-09-27

The user approved the reviewed plan, but SM-C1/SM-C2 conditions are still absent: Agent Core has no native prompt assembler or durable model/session conversation owner. No dormant prompt injection or parallel conversation store was created.

Both mechanisms remain preserved under `Consumer` for the separate native Agent Core AI workstream.

## 9. Final lifecycle re-grounding — 2026-09-27

Current Agent Core source was rechecked after SM-P1 live activation. No native prompt assembler, model-session owner, or durable conversation runtime exists under current `src`; SM-C1 and SM-C2 therefore remain genuine future-consumer mechanisms rather than current adoption work.

Under the current reference lifecycle rule, a checkout retained **only** for such a future consumer is not kept in the active steal/use pool. The exact pinned checkout was moved from `memory\19-supermemory` to `Consumer\19-supermemory` with HEAD unchanged at `2415a5c796d62c7ea9d709bc9337a6e1b6f6d837`.

No source/runtime implementation, build, restart, release action, or canonical-memory deletion occurred in this reclassification.
