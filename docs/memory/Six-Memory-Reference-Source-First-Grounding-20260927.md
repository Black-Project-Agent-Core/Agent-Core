> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](CONSOLIDATION.md).

# Six Memory Reference Source-First Grounding — 2026-09-27

> **Status:** GROUNDING COMPLETE — USER REVIEW REQUIRED — NO ADOPTION INSTALLED
> **Scope:** Agent Core system/ecosystem Memory, evidence, retrieval and tool-runtime hardening.
> **References:** 21-claude-mem, 16-deepseek-harness, 17-mem0, 18-letta, 19-supermemory, 20-cognee.
> **Method:** exact source/tests first; docs only supporting evidence; Grafel second opinion when available; current Agent Core source/runtime is the comparison authority.

## 1. Current Agent Core comparison baseline

Live Agent Core is v0.13.0 with 70 MCP tools. Relevant existing owners:
- canonical file-native Memory + provenance/revisions/typed temporal links;
- legacy/BM25/fusion retrieval, EmbeddingGemma semantic index and source-file scoring;
- Memory feedback/salience, retention review and retrieval exposure ledger;
- Memory page/export/import/diagnostics;
- Learning review with verified Memory/Grafel sinks;
- Activity Tracker + process-session invocation evidence;
- MCP result budget/redacted spill + terminal output spill;
- process ledger/owned process trees, Reflexion, Grafel and Semantic IDE.

A proposal survived only when exact reference source showed a mechanism not already covered by these owners or a materially stronger correctness property.

## 2. Census / provenance summary
| Reference | Source census | Pin / provenance | Final planning disposition |
| --- | --- | --- | --- |
| 21-claude-mem | 1,241 files; 797 code; 368 tests | thedotmack/claude-mem @ dcfc442..., Apache-2.0; pre-existing two deleted OpenClaw skill files preserved | RETAIN — CM2-P1 |
| 16-deepseek-harness | 11,239 files; 4,330 code; 2,202 tests | observed ddefc45...; MIT; Git status degraded with bad HEAD object | RETAIN — DSH-P1/P2 |
| 17-mem0 | 1,787 files; 1,022 code; 292 tests | mem0ai/mem0 @ b51f769..., Apache-2.0; pre-existing CLAUDE.md deletions preserved | RETAIN — M0-P1 |
| 18-letta | 12 files; 0 code; 0 tests | letta-ai/letta @ 5bcdd17..., Apache-2.0; HEAD itself docs-only, not sparse/shallow | RETIRED/DELETED — zero source value |
| 19-supermemory | 772 files; 385 code; 76 tests | supermemoryai/supermemory @ 2415a5c..., MIT | RETAIN — SM-P1; SM-C1 conditional |
| 20-cognee | 3,593 files; 2,989 code; 872 tests | topoteretes/cognee @ c0d18c8..., Apache-2.0 | RETAIN — CG-P1; CG-P2 conditional |

Evidence snapshot: `runtime/tmp/six-memory-reference-grounding-20260927.json`.

## 3. Proposals that survived exact-source comparison

- **CM2-P1:** priority-aware actual-output budgeting for `memory_search`, preserving high-value semantic items and degrading optional diagnostics before dropping useful records.
- **DSH-P1:** crash-tail reconciliation for orphaned MCP invocation starts; classify unknown outcomes without blind retry.
- **DSH-P2:** UTF-8 byte-accurate, Unicode-safe head/tail generic MCP result budgeting while preserving Agent Core redaction/spill ownership.
- **M0-P1:** explicit non-destructive Memory record expiry; expired notes remain historical/readable but leave active recall.
- **SM-P1:** reversible soft-forget/restore lifecycle distinct from hard delete.
- **SM-C1:** owned readonly Memory context block, conditional on a real Agent Core AI prompt-assembly consumer.
- **CG-P1:** bounded explicit-feedback contribution to fusion ranking only; feedback cannot create query relevance.
- **CG-P2:** explicit as-of temporal link retrieval, conditional on public MCP manifest budget.
## 4. Exhausted / covered families

No separate proposal was retained for:
- alternate canonical databases/vector stores/graph stores;
- second embedding/reranker/LLM providers;
- automatic LLM memory extraction, update, deletion or contradiction authority;
- remote cloud Memory APIs as Agent Core authority;
- autonomous prompt/session/model loops;
- Redis/BullMQ/Postgres queue stacks without a concrete current consumer;
- duplicate process supervisors, source provenance, revisions, BM25/fusion, file search, relationship graphs, telemetry, or hard-delete implementations;
- retrieval-frequency self-boosting, because it creates positive-feedback bias from mere exposure rather than explicit user evidence;
- automatic prompt injection into the current MCP-only core.

Reference docs/READMEs were not used to create features that executable source/tests did not substantiate.

## 5. Grafel / structural second opinion

A temporary protected audit workspace `audit-memory-wave-16-21` was explicitly registered with repo-marker authorization. Grafel loaded the new Claude Mem checkout as current and mapped its source/service/server/sync/supervisor families. The other four source-bearing graphs remained unavailable in that audit group, so no conclusion relied on them.

Exact source remained final authority. The temporary workspace was unregistered after the audit and repo markers were removed. No provider/runtime dependency was created.

## 6. Letta corpse retirement evidence

`git ls-tree -r HEAD` contained exactly the same 12 documentation/workflow files seen on disk. The repository is not shallow and no sparse-checkout setting is active. Active Agent Core source/scripts/tests had zero dependency on `18-letta`; process inspection found zero external process using the path.

Under the user's explicit zero-value cleanup rule, `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\18-letta` was deleted after this evidence and this retained plan were written. No Agent Core source/runtime artifact was removed.

## 7. Safety / implementation boundary

This pass created or updated plans only and retired the zero-value Letta checkout. It did **not** implement any proposal, install dependencies, build product code, restart Agent Core, alter MCP schemas, run product regression suites, apply a release, commit, tag, push, publish or deploy.

The five retained references remain review evidence until the user selects proposals for implementation and a later post-adoption zero-value census determines whether each can be retired.

## 8. Approved execution supersession — 2026-09-27

The planning state above was subsequently approved by the user and executed. Current implementation/verification authority is `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md` and CODEBASE section 0.1.50.

CM2-P1, DSH-P1/P2, M0-P1, SM-P1 and CG-P1/P2 are source/dist implemented and targeted verified. SM-C1 remains conditional because no real prompt-assembly consumer exists. DeepSeek Harness, Mem0, Cognee and thedotmack Claude Mem were re-cloned/pinned as needed for clean grounding, then retired after post-adoption zero-value census. Supermemory remains retained for SM-C1.

Final resident live activation is complete after the user-controlled restart/reconnect; execution authority remains `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`.
