# Capability Residual Wave Execution — 2026-09-27

> **Status:** STABLE CURRENT RUNTIME — COMPLETE — IMPLEMENTED — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED
> **Scope:** Agent Core capabilities only. Native chat, model/provider runtime, conversation/session runtime, agent loops, and UI are excluded.
> **Plans:** Prime Agent PRIME-P4/P5; MemOS MEMOS-P4; Anthropic Skills SK-P4/P5; AI-Memory AIM-P6.

## Implemented capability changes

PRIME-P4:
- added `src/persistence/bounded-event-log.ts`;
- ActivityTracker and ToolHistory now use committed-newline JSONL semantics with bounded replay;
- incomplete final append is uncommitted and repairable; malformed interior committed records fail closed;
- durable append can fsync and rejects short writes;
- Activity/ToolHistory retain their existing redaction, budgets, and ownership semantics.

PRIME-P5:
- hardened `scripts/verify/mcp-external-acceptance.mjs`;
- connect/list/probe/cleanup are bounded by lifecycle/request deadlines;
- transport fetches share an abort lifecycle;
- cleanup losing promises are observed;
- persistent failure evidence is reduced to fixed safe categories.
MEMOS-P4:
- added opt-in `memory_search rankingProfile="fusion"`;
- current `legacy` and `bm25` branches remain unchanged unless fusion is explicitly selected;
- fusion uses independent lexical, metadata, semantic, and source channels with reciprocal-rank agreement;
- concrete long identifiers require exact evidence for ordinary memories;
- direct selection adds relative-threshold handling, strong multi-channel bypass, exact duplicate suppression, and deterministic MMR redundancy control;
- linked-neighbor expansion and character budgets remain after direct selection.

SK-P4:
- added Agent Core-owned `SkillService` under `src/skills`;
- added one public MCP tool, `skills`, with status/list/inspect/validate/import/package actions;
- artifacts are storage/validation/package objects only; no script is executed and declared tools grant no authority;
- strict bounded SKILL.md frontmatter subset is used; no new YAML dependency was installed;
- existing `yauzl` and `pizzip` provide bounded ZIP inspection/package support;
- import validates complete source/archive before staging and atomic rename; package order and digests are deterministic.

SK-P5:
- added `scripts/verify/skill-effectiveness-eval.mjs` and `npm run verify:skill-effectiveness`;
- evaluation is offline over supplied fixtures/observations;
- repeated skill/control cohorts produce mean, sample stddev, min/max and deltas;
- reports are advisory-only and never mutate/promote a skill.
AIM-P6:
- added `src/security/evidence-capture-policy.ts`;
- optional nearest `.agent-core-evidence.json` marker controls durable evidence only;
- decisions are `full`, `metadata-only`, or `omit`;
- candidate paths are extracted only from known Agent Core file-tool schemas;
- invalid/restrictive evidence paths fail toward metadata-only;
- the policy never changes tool authorization, execution, or returned result/error;
- existing redaction remains a second protection layer.

## Verification evidence

Targeted Vitest command covered:
- `tests/capability-residual-wave.test.ts`;
- `tests/mcp-external-acceptance-harness.test.ts`;
- `tests/mcp-manifest-contract.test.ts`;
- `tests/memory-bm25-ranking.test.ts`;
- `tests/reflexion-second-wave.test.ts`.

Final targeted result: **5 files / 20 tests PASS**.
TypeScript `--noEmit`: **exit 0**.
Both modified verifier scripts pass `node --check`.
Path policy: **256 authored files / 0 exceptions**.
Release intent check: **ok=true**.
Final release compatibility:
- public source/installed manifest = **65 tools**;
- additive tool = `skills`; no tool or HTTP route removal;
- `breakingEvidence=false`;
- manifest budget = **117,088 bytes / ~29,272 tokens**, below 120,000 / 30,000 limits;
- `stale=false`; `verificationIssues=[]`; overall `ok=true`.

Grafel was explicitly reindexed after source changes and converged to `current` with complete 1/1 registered-workspace coverage.
Structural impact review matched the intended owners:
- SkillService → composition root + skills tests;
- registerSkillsTools → MCP server/handler, release manifest, MCP tests;
- searchMemories → MemoryService / memory_search / ranking tests;
- evidence policy → generic MCP wrapper and evidence-related tests;
- bounded event log → persistence/test surface, with exact source confirming ActivityTracker/ToolHistory consumers.

## Installed runtime evidence

Candidate build: `runtime/build/capability-residual-wave-20260927/dist`.
Primary CAS cutover installed 13 runtime JS artifacts with `rollbackRequired=false`, `restartPerformed=false`, `releaseApplied=false`.
Two follow-up CAS syncs updated the final skills contract form and aggregate MCP build stamp.
Fresh final readback confirms **13/13 active `dist` hashes equal the current candidate hashes**.
Backups exist under `runtime/backups/capability-residual-wave-20260927*`.
## Resident activation closure

Resident activation is now verified. The active Node Core is PID `14564`, started at `2026-09-27T07:12:09.5922010Z`, after the capability cutover. Live `/health` is `status=ok` on v0.13.0 and reports Memory, Code Intelligence, Semantic IDE, Learning, and the new `skills` service as available; `skills.executionAuthority=false` remains enforced.

A fresh authenticated HTTP MCP acceptance run against the resident server reports **65 tools**, manifest fingerprint `abde2452fe21017a2c2006ef4cc8c929bd6410162b1069bb6d31f5a7b17c0e8c`, required tool `skills`, required parameters `memory_search:rankingProfile` and `skills:action`, and a passing read-only `memory_status` probe. Separate live calls confirm `skills status` and `memory_search` with `rankingProfile="fusion"` both succeed. Both temporary acceptance keys were revoked.

The installed runtime had already passed a fresh **13/13 active artifact hash match** against `runtime/build/capability-residual-wave-20260927/dist`; the post-cutover process now proves those installed artifacts are resident. A second fresh stability gate also passed on the same resident runtime: 65-tool manifest unchanged, `skills status` PASS, fusion Memory search PASS, `/health=ok`, and the temporary acceptance credential revoked. This wave is therefore **STABLE CURRENT RUNTIME** and may be treated as closed for subsequent tasks. Closure evidence: `runtime/tmp/capability-residual-live-closure-20260927.json`, `runtime/tmp/capability-residual-stability-gate-20260927.json`, and `runtime/tmp/mcp-client-acceptance/2026-09-27T07-39-59-696Z`.

## Release / dependency boundary

No additional dependency was required or installed.
Changeset: `.changeset/20260927-capability-residual-wave.md` with `minor` intent.
Release plan remains `0.13.0 -> 0.14.0`.
No `release:apply`, version bump, commit, tag, push, publish, or deploy was performed.
Protected reference checkouts were not modified or deleted.
