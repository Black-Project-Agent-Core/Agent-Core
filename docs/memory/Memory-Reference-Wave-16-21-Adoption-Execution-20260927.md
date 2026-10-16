> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](CONSOLIDATION.md).

# Memory Reference Wave 16–21 Adoption Execution — 2026-09-27

> **Status:** COMPLETE — SOURCE/DIST TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED
> **Product version:** stable `0.13.0`; no release apply/version bump.
> **Approved scope:** CM2-P1, DSH-P1/P2, M0-P1, SM-P1, CG-P1, CG-P2 subject to manifest budget. SM-C1 remains conditional on a real Agent Core AI prompt-assembly consumer.

## 1. Source repair / reference grounding

The approved execution began by re-reading canonical local Memory. Protected reference readback showed only `19-supermemory` present; the other retained planning references had disappeared since the prior audit.

Under the user's explicit re-clone authorization, clean GitHub checkouts were restored and pinned exactly to the revisions used by the plans:
- DeepSeek Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887`;
- Mem0: `b51f7692f002d4f8719dd5c0f23d4d129003757d`;
- Cognee: `c0d18c80e24b7b78918e7642c03f6f128fdd2aee`;
- thedotmack/claude-mem: `dcfc44221deabc228b0698a0012f87ed2fe6bbe7`.

The earlier DeepSeek `bad object HEAD` defect is no longer present in the replacement checkout. Initial exFAT Git ownership warnings on new clones were handled per-command with `-c safe.directory=...`; no global Git policy was changed.

## 2. Implementation state discovered in current Agent Core
Exact current source already contained the approved wave plus release intent `.changeset/20260927-memory-reference-wave-16-21-adoption.md`. The execution therefore did not duplicate or overwrite those mechanisms; it grounded, qualified and closed the existing candidate implementation.

### CM2-P1 — priority-aware Memory search delivery
- `src/memory/search-projection.ts` performs post-ranking, controller-facing projection.
- Detail degrades `full -> compact -> minimal -> preview`; direct results are prioritized over linked expansion.
- A single oversized top result can still return a bounded preview/read-by-ID path instead of disappearing.
- Retrieval ledger records selected/trimmed/dropped delivery disposition.

### DSH-P1 — interrupted invocation reconciliation
- `src/tracker/tool-invocation.ts` reconciles prior-process start events without terminal evidence.
- Recovery records `outcome-unknown` plus `retryDirective=never-blind-retry`.
- Current-process calls and already-terminal invocations are excluded.
- `src/index.ts` invokes the bounded reconciliation during startup.

### DSH-P2 — UTF-8 byte-safe generic MCP result budget
- `src/mcp/result-budget.ts` budgets serialized output using UTF-8 bytes.
- Oversized text uses Unicode-safe head/tail retention with explicit omission.
- Sensitive-capable non-persistable tools never write full spill artifacts.
- Existing redaction, owned artifact cleanup and fail-soft behavior remain.

### M0-P1 — non-destructive Memory expiry
- canonical non-pinned Memory supports optional `expiresAt`;
- active search excludes expired records while exact read/list/history remain available;
- expiry is visible to lifecycle/retirement review and is preserved by canonical state.

### SM-P1 — reversible soft forget/restore
- existing `memory_feedback` surface carries explicit `forget` / `restore` actions rather than adding a new tool;
- lifecycle state is auxiliary and reversible; canonical content/revisions/provenance remain;
- forgotten records are excluded from direct and linked active recall;
- pinned foundation is protected.

### CG-P1 — bounded explicit-feedback fusion influence
- feedback salience contributes only to `fusion`;
- boost/penalty is clamped and cannot create query eligibility;
- legacy/BM25 remain unchanged;
- score evidence is visible through existing retrieval diagnostics/ledger.

### CG-P2 — explicit historical `asOf` retrieval
- existing `memory_search` accepts validated optional `asOf`;
- temporal link activity is evaluated at the explicit reference time;
- no LLM date extraction or canonical mutation is introduced;
- reference time is recorded in retrieval evidence.

### SM-C1 — conditional only
No real Agent Core AI prompt-assembly consumer was established by this task. The approved plan explicitly forbids installing a dormant prompt-injection subsystem only to consume SM-C1. Therefore SM-C1 remains conditional and `19-supermemory` is retained as the live reference for that future condition.

## 3. Targeted verification

Authorized verification was limited to the affected scope.

- `tests/memory-reference-wave-16-21-adoption.test.ts`: **6/6 PASS**.
  - expiry visibility;
  - forget/restore;
  - bounded fusion feedback;
  - explicit `asOf`;
  - interrupted invocation reconciliation;
  - UTF-8 head/tail result budgeting.
- `tests/mcp-result-budget.test.ts`: **3/3 PASS**.
- `tests/mcp-manifest-contract.test.ts`: **2/2 PASS**.
- focused relevant subset of `tests/memory-maintenance.test.ts -t preserves`: **3 PASS / 20 skipped**; includes the CM2-P1 preview contract.
- root `npm run build`: **PASS**.
- path policy: **260 authored files / 0 exceptions**.
- compiled MCP manifest: **70 tools / 116,107 bytes / ~29,027 tokens**, inside the reviewed 120,000-byte / 30,000-token budget. CG-P2 therefore satisfies its conditional manifest-budget gate.
- `release:check-intent`: **ok=true**; the wave has one existing minor release intent.
- Grafel workspace was current/complete 1/1 and LSP symbol readback confirmed current wiring for `MemoryService.search`, `applyResultBudget` and `reconcileInterruptedToolInvocations`.

One broader affected historical file, `tests/memory-maintenance.test.ts`, still exits code 1 when run in full without emitting a Vitest failure diagnostic. Its first concrete stale-fixture error (missing `projectRoot`) was repaired and isolated; the wave-specific/relevant subset passes. This whole-file non-diagnostic residual is **not represented as PASS** and was not used as the wave gate.

`release:compat` reports `ok=false` because the much older current-line baseline still contains the now-retired legacy `partner` tool. That historical removal produces global `breakingEvidence=true`; it is not introduced by this Memory wave. Routes are unchanged. This evidence is preserved rather than hidden or rewritten.

## 4. Post-adoption zero-value census

Exact dependency search found no active `src/tests/scripts` consumer of the protected source checkouts; matches were documentation/history only.

Retired after adoption:
- `16-deepseek-harness` — DSH-P1/P2 adopted; residual families covered/rejected.
- `17-mem0` — M0-P1 adopted; residual families covered/rejected.
- `20-cognee` — CG-P1/P2 adopted; residual families covered/rejected.
- `21-claude-mem` — CM2-P1 adopted; remaining context-owner idea is represented more directly by retained Supermemory SM-C1.

Retained:
- `19-supermemory` — SM-C1 remains a real source-backed conditional mechanism, pending a future real prompt-assembly consumer.
Letta had already been retired as zero-value during the planning census.

Retirement evidence: `runtime/tmp/memory-wave-post-adoption-retirement-20260927.json`.

## 5. Activation closure

The user restarted/reconnected Agent Core after source/dist qualification. Installed-runtime acceptance is now complete.

Live evidence:
- launcher PID **18820**, Node Core PID **17676**, tunnel PID **22392**; Node runs project-local `runtime\node\node.exe -> dist\index.js`;
- `/health=ok` on Agent Core **v0.13.0**;
- Memory canonical/index/embedding/intelligence are available with `issueCount=0`;
- fresh direct MCP handshake returns **70 tools** with manifest fingerprint `6634eb76d50a14c5e96beb3b3c16baa5ad2c4c268d685305bbb598682d8b89d9`;
- fresh runtime descriptor exposes `memory_search.asOf`, `memory_remember.expiresAt`, `memory_update.expiresAt`, and `memory_feedback` enum values `forget` / `restore`;
- isolated live behavior probe passed create-with-expiry -> `asOf` search -> forget suppression -> restore recall -> delete cleanup;
- post-probe Memory returned to **63 notes**, `forgottenCount=0`, and `issueCount=0`.

Acceptance evidence directory: `runtime/tmp/mcp-client-acceptance/2026-09-27T14-22-03-023Z`.

The tool schema embedded in this already-open ChatGPT conversation still reflects the pre-restart cached descriptor for some Memory actions. That cache does not represent the resident Core: the fresh authenticated HTTP MCP descriptor above is authoritative for installed-runtime activation. A fresh connector/session should receive the new schema.

Current completion state:

**COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.**

No dependency installation was required. No `release:apply`, version bump, commit, tag, push, publish or deploy occurred.
