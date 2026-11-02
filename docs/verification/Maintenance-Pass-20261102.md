# Maintenance pass: Agent Core source (2026-11-02)

Status: two consolidations and one defect fix are committed locally (no push); no unused candidate was deleted. The three red targeted tests of the 2026-11-01 pass are still red at `HEAD 8b77ff8` before any edit, with the same causes (section 2.4).

Scope requested: an explicit `/maintenance E:\Projects\Agent-Core` run, meaning all three passes plus the final simplification step. Baseline: `HEAD 8b77ff8` on `fix/agent-core-tool-latency-and-ui-cards`. Previous pass: [Maintenance-Pass-20261101.md](Maintenance-Pass-20261101.md) (consolidation commit `319def1`, 24 commits earlier than this baseline). This run is a delta against that pass: every number below is shown next to yesterday's.

## Delta in one view

| Item | 2026-11-01 | 2026-11-02 |
| --- | --- | --- |
| Commits since the previous pass | n/a | 24 (`319def1..8b77ff8`) |
| Export candidates retained (none deleted) | 839 (419 / 203 / 217) | 829 (415 / 175 / 239); 793 rows identical, 56 differ (section 1.0) |
| Files not reachable from production roots | 5 | 5 (identical) |
| Duplicate groups consolidated | 7 | 2 (Native turn digest; path containment, four copies) |
| Duplicate groups left `OPEN` | 8 exact + 3 structure-only | 5 exact + 2 structure-only (section 2.2) |
| HTTP routes / MCP registrations / launcher messages / UI pages | 30 / 84 / 28 in, 32 out / 15 | 30 / 84 / 28 in, 32 out / 15 (0 added, 0 removed; 2 routes became reachable) |
| Entry-point defects found | F1 (skills routes answered 404), closed afterwards | F1 confirmed closed; N1 (Plan mode refused seven read-only `skills` actions) found and fixed |
| Red targeted tests | 3 | the same 3 at baseline; 2 still red afterwards, 1 passes when the machine is less loaded (section 2.4) |

## 0. Coverage and limitations

| Item | Value |
| --- | --- |
| Analysed | every `.ts/.tsx/.mts/.cts/.js/.mjs/.cjs` under `src/`, `tests/`, `scripts/`: 965 files (438 source, 450 test, 77 script) |
| Excluded | `node_modules`, `dist`, `runtime/`, `SubProject/`, `vendor/`, `extensions/`, `docs/`, `.changeset/`, `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/`, `release/`, `Backups/`, build output (`bin`, `obj`) |
| Not analysed for unused code | the C# launcher (read for the inventory only), Go, Rust and Python trees (they live under `SubProject/` and `vendor/`) |
| Tooling | TypeScript compiler API 6.0.3 from `typescript-lsp-runtime` for syntax trees plus an own resolver for relative specifiers; ripgrep for the independent whole-word cross-check; `tsc` 7.0.2 and vitest 4.1.11 for verification. No analyser was installed. |
| Production roots | 130: `src/index.ts`; every `dist/<x>.js` path named by `package.json`, launcher sources, production `src` and scripts (mapped back to `src/<x>.ts`); tsconfig-excluded entry files (`src/rdc/server.ts`, `index.ts`, `custom-stdio.ts`, `src/ui/src/main.tsx`); tool configs by convention (Vite and Vitest configs, the `setupFiles` of the `src/ui` Vitest config); all of `scripts/**` |
| Test roots | `tests/**` and `src/**/*.test.*` (450 files) |
| Evidence source | a read-only `git worktree` of `HEAD 8b77ff8` (removed at the end of the run). `git stash` was not used. |
| Subagents | Pass 3: one read-only general-purpose subagent over the frozen worktree (it inherited the main model: it started before the Haiku rule for this skill existed). `/simplify`: three read-only reviewers on `haiku` (reuse, simplification, efficiency); the altitude angle was reviewed by the main agent because the concurrency limit is 3. |
| Working tree before the run | clean except untracked `.anchor/` and `.recall/` (plugin state; neither was touched, deleted or committed) |
| Not resolvable from source | string-keyed registries, reflection, external MCP and OAuth clients, anything under `dist/`; the whole-word matches are syntactic |

## 1. Pass 1: unreferenced files and symbols (all retained)

Pre-change evidence comes from a frozen read-only worktree of `HEAD 8b77ff8` (so line numbers cannot drift while edits are made); the refreshed run is over the edited working tree (section 1.5).

| Measure | 2026-11-01 (after its consolidation) | 2026-11-02 pre-change (`8b77ff8`) | 2026-11-02 refreshed |
| --- | --- | --- | --- | 
| First-party files analysed (`src`, `tests`, `scripts`) | 957 | 965 | 965 |
| Source files (non-test, `src/`) | 438 | 438 | 438 |
| Test files | 443 | 450 | 450 |
| Production roots | 131 | 130 | 130 |
| Source files reachable from the roots | 433 | 433 | 433 |
| Exports in reachable files | 2573 | 2582 | 2584 |
| Exports with a production reference | 1734 | 1753 | 1755 |
| Candidates (no production reference) | 839 | 829 | 829 |
| `UNREFERENCED IN SCOPE` | 419 | 415 | 415 |
| `TEST-ONLY` | 203 | 175 | 175 |
| `UNCERTAIN` | 217 | 239 | 239 |

### 1.0 Delta against 2026-11-01 and validation of the analyser

The 2026-11-01 analyser was not kept, so it was rebuilt from the method in the 2026-11-01 report section 0 (module graph with static, dynamic, `require`, `export from`, `import()` type, `new URL` and `dist/<x>.js` edges; per `file::export` name resolution including namespace members, destructured dynamic imports and re-export chains; a re-export statement in a reachable file counts as a reference to its origin; whole-module loaders by production code give `UNCERTAIN`, by tests only give `TEST-ONLY`). It was validated by comparing its candidate rows with the 839 rows of yesterday's tables.

- Same candidate with the same verdict: **793** of 839 yesterday rows.
- Differences: **56** rows (10 new candidates, 20 no longer candidates, 26 verdict changes: 5 `TEST-ONLY -> UNREFERENCED`, 13 `TEST-ONLY -> UNCERTAIN`, 7 `UNREFERENCED -> UNCERTAIN`, 1 `UNREFERENCED -> TEST-ONLY`).
- **6** of those 56 rows trace to a commit in `319def1..8b77ff8` (found with `git log -S<name>`); **50** do not: no commit in that range touches the name, so they are differences of analyser method, concentrated in `src/memory/*` modules that are loaded as whole modules or through the `facade.ts` / `transfer.ts` barrels, plus `src/rdc/tools/pdf/*` and `src/learning/proposal-documents.ts`. They are listed below with an independent whole-word `rg` result so that each can be checked by hand. Treat the verdict of these rows as less certain than the rest; none changes a conclusion because every candidate is retained.

| Row (`path::name`) | 2026-11-01 | 2026-11-02 | Explained by | Whole-word `rg` files (src, tests, scripts) |
| --- | --- | --- | --- | --- |
| `src/agent-context-usage.ts::CHARS_PER_TOKEN` | UNREFERENCED | not a candidate (has a production reference) | `781d467` (name added/removed in another file (reference changed)) | `src/agent-controller.ts`, `src/agent-context-usage.ts` |
| `src/agent-context-usage.ts::ContextBreakdownOptions` | not a candidate | UNREFERENCED | `781d467` (name added/removed in its own file) | `src/agent-context-usage.ts` |
| `src/agent-runtime.ts::normalizeState` | not a candidate | TEST-ONLY | `3c46f54` (name added/removed in another file (reference changed)) | `tests/agent-runtime-normalize-cache.test.ts`, `src/agent-runtime.ts`, `src/learning/state.ts` |
| `src/agent-runtime.ts::taskNormalizationStats` | not a candidate | TEST-ONLY | `3c46f54` (name added/removed in its own file) | `tests/agent-runtime-normalize-cache.test.ts`, `src/agent-runtime.ts` |
| `src/learning/proposal-documents.ts::assertProposalDocumentPath` | TEST-ONLY | UNREFERENCED | analyser method (no commit in range touches the name) | `src/learning/proposal-documents.ts` |
| `src/learning/proposal-documents.ts::needsUserDecision` | TEST-ONLY | UNREFERENCED | analyser method (no commit in range touches the name) | `src/learning/proposal-documents.ts` |
| `src/learning/proposal-documents.ts::ProposalDocumentList` | TEST-ONLY | UNREFERENCED | analyser method (no commit in range touches the name) | `src/ui/src/ProposalCards.tsx`, `src/ui/src/host.ts`, `src/learning/proposal-documents.ts` |
| `src/learning/proposal-documents.ts::ProposalDocumentRead` | TEST-ONLY | UNREFERENCED | analyser method (no commit in range touches the name) | `src/ui/src/ProposalCards.tsx`, `src/ui/src/host.ts`, `src/learning/proposal-documents.ts` |
| `src/learning/proposal-documents.ts::ProposalDocumentReadInput` | TEST-ONLY | UNREFERENCED | analyser method (no commit in range touches the name) | `src/learning/proposal-documents.ts` |
| `src/memory/controller-session.ts::ControllerMemoryBackend` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/controller-session.ts`, `tests/memory/engine/memory-relevance-controller.test.ts` |
| `src/memory/controller-session.ts::ControllerRankedSnapshot` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/controller-session.ts`, `tests/memory/engine/memory-relevance-controller.test.ts` |
| `src/memory/disclosure.ts::digestSchema` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/experience-types.ts`, `src/memory/episodes.ts`, `src/memory/disclosure.ts` (+5) |
| `src/memory/disclosure.ts::TimeValue` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/temporal.ts`, `src/memory/disclosure.ts`, `src/memory/facade.ts` (+1) |
| `src/memory/disclosure.ts::Validity` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/facade.ts`, `src/memory/experience-types.ts`, `src/memory/disclosure.ts` (+1) |
| `src/memory/experience-types.ts::checkpointTriggerSchema` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/experience-types.ts` |
| `src/memory/experience-types.ts::episodeEventInputSchema` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/experience-types.ts` |
| `src/memory/experience-types.ts::validitySchema` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/experience-types.ts` |
| `src/memory/experience-types.ts::verificationSchema` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/experience-types.ts`, `src/learning/evaluation.ts` |
| `src/memory/facade.ts::ControllerMemoryDispatcher` | not a candidate | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/planned-context.ts`, `src/memory/facade.ts`, `src/memory/controller-protocol.ts` (+1) |
| `src/memory/facade.ts::SourceRef` | not a candidate | UNCERTAIN | analyser method (no commit in range touches the name) | `src/learning/external-controller.ts`, `src/memory/transfer-v2.ts`, `src/memory/temporal.ts` (+25) |
| `src/memory/facade.ts::WorkingItem` | not a candidate | UNCERTAIN | analyser method (no commit in range touches the name) | `tests/memory/engine/memory-capsule-content-integrity.test.ts`, `src/memory/facade.ts`, `src/memory/experience-types.ts` (+5) |
| `src/memory/outcome/evaluation.ts::evaluateOutcome` | UNCERTAIN | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `tests/memory/memory-outcome-preregistration.test.ts` (+3) |
| `src/memory/outcome/evaluation.ts::validateOutcomePreregistration` | UNCERTAIN | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `src/memory/outcome/evaluation.ts`, `tests/memory/memory-outcome-preregistration.test.ts` |
| `src/memory/outcome/verifier.ts::verifyOutcomeOracle` | not a candidate | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/outcome/verifier.ts`, `src/memory/outcome/diagnostics-verifier.ts` |
| `src/memory/project-synthesis.ts::SynthesisDependencyResolver` | UNREFERENCED | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/project-synthesis.ts` |
| `src/memory/project-synthesis.ts::SynthesisDependencyStatus` | UNREFERENCED | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/project-synthesis.ts` |
| `src/memory/project-synthesis.ts::SynthesisEligibilityWait` | UNREFERENCED | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/project-synthesis.ts` |
| `src/memory/reconsolidation-report.ts::runReconsolidationExperiment` | UNCERTAIN | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `scripts/memory/evaluation/reconsolidation-offline.mjs`, `src/memory/reconsolidation-report.ts` |
| `src/memory/reconsolidation-report.ts::verifyReconsolidationExperiment` | UNCERTAIN | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `scripts/memory/evaluation/reconsolidation-offline.mjs`, `src/memory/reconsolidation-report.ts` |
| `src/memory/revisions.ts::MemoryRevisionFile` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/revisions.ts` |
| `src/memory/revisions.ts::MemoryRevisionSnapshot` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/revisions.ts` |
| `src/memory/revisions.ts::revisionStatePath` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/revisions.ts` |
| `src/memory/service.ts::ControllerRetrievalPolicy` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/engine/memory-controller-ranking-policy.test.ts`, `src/memory/facade.ts`, `src/memory/service.ts` |
| `src/memory/service.ts::LinkInput` | TEST-ONLY | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/service.ts` |
| `src/memory/transfer-v2.ts::exportMemoryTransferV2` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/memory-external-learning-promotion.test.ts`, `tests/memory/memory-claim-review.test.ts`, `tests/memory/engine/memory-transfer-v2.test.ts` (+8) |
| `src/memory/transfer-v2.ts::importMemoryTransferV2` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/memory-external-learning-promotion.test.ts`, `tests/memory/memory-claim-review.test.ts`, `src/memory/transfer.ts` (+7) |
| `src/memory/transfer-v2.ts::MemoryTransferV2Bundle` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/engine/memory-transfer-review.test.ts`, `tests/memory/engine/memory-promotion-transfer.test.ts`, `src/memory/transfer.ts` (+2) |
| `src/memory/transfer-v2.ts::previewMemoryTransferV2` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/engine/memory-transfer-v2.test.ts`, `tests/memory/engine/memory-transfer-review.test.ts`, `tests/memory/engine/memory-promotion-transfer.test.ts` (+4) |
| `src/memory/transfer.ts::exportMemoryTransferV2` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/memory-external-learning-promotion.test.ts`, `tests/memory/memory-claim-review.test.ts`, `src/memory/transfer.ts` (+8) |
| `src/memory/transfer.ts::importMemoryTransferV2` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/memory-claim-review.test.ts`, `tests/memory/engine/memory-transfer-v2.test.ts`, `tests/memory/engine/memory-transfer-review.test.ts` (+7) |
| `src/memory/transfer.ts::MEMORY_TRANSFER_VERSION` | UNREFERENCED | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/transfer.ts` |
| `src/memory/transfer.ts::MemoryImportPlan` | UNREFERENCED | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/transfer.ts` |
| `src/memory/transfer.ts::MemoryTransferPayload` | UNREFERENCED | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/transfer.ts` |
| `src/memory/transfer.ts::MemoryTransferRecord` | UNREFERENCED | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/transfer.ts` |
| `src/memory/transfer.ts::MemoryTransferV2Bundle` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `src/memory/transfer.ts`, `src/memory/transfer-v2.ts`, `src/memory/facade.ts` (+2) |
| `src/memory/transfer.ts::previewMemoryTransferV2` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `tests/memory/memory-claim-review.test.ts`, `tests/memory/engine/memory-transfer-v2.test.ts`, `tests/memory/engine/memory-transfer-review.test.ts` (+4) |
| `src/memory/types.ts::MemoryRecordV1` | not a candidate | UNCERTAIN | analyser method (no commit in range touches the name) | `src/memory/types.ts`, `src/memory/migration.ts`, `tests/memory/engine/helpers/memory-copy-upgrade.ts` |
| `src/rdc/tools/fuzzySearchCore.ts::recursiveFuzzyIndexOf` | UNCERTAIN | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `src/rdc/tools/fuzzySearchCore.ts`, `src/rdc/tools/fuzzySearch.ts` |
| `src/rdc/tools/pdf/extract-images.ts::ImageCompressionOptions` | UNREFERENCED | TEST-ONLY | analyser method (no commit in range touches the name) | `src/rdc/tools/pdf/extract-images.ts` |
| `src/rdc/tools/pdf/extract-images.ts::PageImages` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `src/rdc/tools/pdf/index.ts`, `src/rdc/tools/pdf/extract-images.ts` |
| `src/rdc/tools/pdf/lib/pdf2md.ts::PdfPageItem` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `src/rdc/utils/files/base.ts`, `src/rdc/tools/filesystem.ts`, `src/rdc/tools/pdf/lib/pdf2md.ts` (+1) |
| `src/rdc/tools/pdf/manipulations.ts::PdfDeleteOperation` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `src/rdc/tools/pdf/manipulations.ts`, `src/rdc/tools/pdf/index.ts` |
| `src/rdc/tools/pdf/manipulations.ts::PdfInsertOperation` | TEST-ONLY | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `src/rdc/tools/pdf/manipulations.ts`, `src/rdc/tools/pdf/index.ts` |
| `src/rdc/utils/files/factory.ts::isImageFile` | UNREFERENCED | not a candidate (has a production reference) | analyser method (no commit in range touches the name) | `src/rdc/utils/files/index.ts`, `src/rdc/utils/files/factory.ts`, `src/rdc/tools/mime-types.ts` (+1) |
| `src/skills/service.ts::SkillRetirementListing` | not a candidate | UNCERTAIN | `adff9d9` (name added/removed in its own file) | `src/skills/service.ts` |
| `src/skills/service.ts::SkillRetirementRecord` | not a candidate | UNCERTAIN | `adff9d9` (name added/removed in its own file) | `src/skills/service.ts` |

### 1.1 Files not reachable from the production roots

| File | Importers (graph) | Other references (`git grep` of the module name, tracked files) | Verdict |
| --- | --- | --- | --- |
| `src/auth/persistent-file.ts` | none | none | UNREACHABLE FROM KNOWN ROOTS. No importer in src, tests or scripts. Retained. |
| `src/memory/outcome/diagnostics-verifier.ts` | `src/memory/outcome/diagnostics.ts` | `docs/diagrams/Agent-Core-Memory-Dependencies-20261016.mmd`, `docs/diagrams/Agent-Core-Memory-Dependency-Inventory-20261016.md`, `docs/memory/PLAN-EXTERNAL-MEMORY-WORKFLOW-COMPLETION.md` | UNREACHABLE FROM KNOWN ROOTS (isolated pair with `src/memory/outcome/diagnostics.ts`: each is imported only by the other). Retained. |
| `src/memory/outcome/diagnostics.ts` | `src/memory/outcome/diagnostics-verifier.ts` | `docs/diagrams/Agent-Core-Memory-Dependencies-20261016.mmd`, `docs/diagrams/Agent-Core-Memory-Dependency-Inventory-20261016.md`, `docs/memory/PLAN-EXTERNAL-MEMORY-WORKFLOW-COMPLETION.md` | UNREACHABLE FROM KNOWN ROOTS (isolated pair with `src/memory/outcome/diagnostics-verifier.ts`: each is imported only by the other). Retained. |

### 1.2 Files reachable only from tests

| File | Test importers | Verdict |
| --- | --- | --- |
| `src/memory/examples/controller-continuation.ts` | `tests/memory/engine/memory-controller-continuation.test.ts` | TEST-ONLY. Retained. |
| `src/memory/migration.ts` | `tests/memory/engine/helpers/memory-copy-upgrade.ts`, `tests/memory/engine/memory-experience-migration.test.ts` | TEST-ONLY. Retained. |

### 1.3 Exported symbols with no production reference (pre-change, frozen `8b77ff8`)

Every row is an export of a file that is reachable from the production roots. The evidence column is the negative query result for that exact `file::name` pair; the whole-word column of the cross-check is an in-memory identifier index over `src`, `tests` and `scripts` (equivalent to `rg -w`), spot-checked against real `rg` in section 1.6.

#### UNREFERENCED IN SCOPE (415)

| Symbol (`path:line`) | Kind | Evidence |
| --- | --- | --- |
| `src/agent-capability-catalog.ts:32` `AgentCapabilityTool` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-capability-catalog.ts:37` `AgentCapabilityDescriptor` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:18` `AgentCapabilityPolicyConfig` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:24` `AgentCapabilityRequest` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:33` `AgentCapabilityDenied` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:43` `AgentCapabilityResolution` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:101` `inferUserRiskCeiling` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-chat-service.ts:40` `SlashSkillCatalog` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-chat-service.ts:64` `AgentChatEventSink` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-chat-service.ts:68` `AgentChatTurnResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/agent-context-accounting.ts:59` `ContextSource` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-context-compaction.ts:8` `HISTORY_SUMMARY_MARKER` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-context-compaction.ts:43` `TurnCompaction` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-context-usage.ts:34` `ContextBreakdownOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:14` `knowledgeRevision` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:23` `AgentKnowledgePacket` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:35` `KnowledgeSourceStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (9 occurrences); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:55` `KnowledgePacketCoverage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/agent-learning-loop.ts:101` `AgentStrategyDeclaration` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-learning-loop.ts:148` `procedureContract` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/agent-provider-errors.ts:56` `parseRetryAfterMs` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider-errors.ts:86` `parseResetAtMs` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider-readiness.ts:10` `ReadinessRoute` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (15 occurrences); the word occurs in no other file |
| `src/agent-provider-scheduler.ts:16` `ProviderPoolCursor` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word also occurs in `src/agent-provider-state.ts` |
| `src/agent-provider-scheduler.ts:28` `ScheduledProviderCredential` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider-scheduler.ts:34` `SchedulerSelectionResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider-state.ts:11` `ProviderCredentialOperationalState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/agent-provider-state.ts:18` `ProviderBreakerState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/agent-provider-state.ts:20` `ProviderCredentialDescriptor` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/agent-provider-state.ts:83` `ProviderSelectionResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:57` `AgentProviderRouteConfig` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:190` `AgentProviderRouteHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:208` `AgentProviderHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:243` `AgentProviderRouteTransition` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:244` `AgentProviderRoutingKey` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:250` `AgentProviderRoutingRoute` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:12` `AgentMemoryUse` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word also occurs in `src/agent-chat-store.ts`, `src/agent-memory-use.ts` (+3 more) |
| `src/agent-runtime.ts:41` `AgentRuntimeTaskStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:51` `AgentRuntimeSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:60` `AgentRuntimeFinalizationState` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:72` `AgentRuntimeTask` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (15 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:106` `AgentRuntimeHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:135` `FinalizeTaskInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:143` `AgentCumulativeEvaluationSummary` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:158` `AgentCumulativeEvaluation` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:21` `AGENT_TURN_CHECKPOINT_MAX_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:36` `AgentTurnArtifactReference` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:42` `AgentTurnPendingTool` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:51` `AgentTurnMemoryEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:57` `AgentTurnFinalResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-turn-events.ts:5` `AgentTurnEventType` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-turn-events.ts:121` `TOOL_STEP_TEXT_LIMIT` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-turn-outcomes.ts:65` `ToolOutcome` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/artifact-analysis/asar.ts:4` `AsarInspect` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/artifact-analysis/contracts.ts:2` `ArtifactOutcome` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/artifact-analysis/javascript.ts:5` `inspectJavaScript` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/artifact-analysis/worker.ts:5` `WorkerSummary` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/artifact-analysis/worker.ts:12` `activeArtifactWorkers` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/auth/key-store.ts:18` `KEY_PREFIX` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/auth/key-types.ts:13` `AuthenticationMode` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/auth/tool-grant.ts:5` `toolGrantSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:18` `ReviewHunk` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:24` `ReviewChangedFile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:30` `ReviewSeed` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:49` `ChangedSymbolReview` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/changed-source-security.ts:6` `AdvisorySeverity` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/code-intelligence/changed-source-security.ts:8` `AdditiveSecurityRule` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/code-intelligence/changed-source-security.ts:17` `SecurityAdvisoryFinding` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/code-intelligence/graph-observability.ts:17` `GraphIntegritySnapshot` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (9 occurrences); the word occurs in no other file |
| `src/code-intelligence/graph-observability.ts:43` `SourceRepresentationObservation` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/types.ts:3` `CodeIntelligenceStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/types.ts:6` `CodeIntelligenceResourcePolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/code-intelligence/types.ts:97` `CodeIsolationHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/types.ts:102` `CodeProviderAttestationState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/workspace-resolver.ts:26` `WorkspaceHygieneRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/workspace-resolver.ts:47` `deriveWorkspaceName` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/failure-evidence.ts:48` `failureText` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word also occurs in `src/agent-controller.ts` |
| `src/failure-evidence.ts:83` `boundedEvidenceExcerpt` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:10` `caseKind` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word also occurs in `scripts/verify/rea-harness-registration.mjs`, `src/harness/reconstruction/obligations.ts` (+3 more) |
| `src/harness/reconstruction/contracts.ts:11` `authority` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word also occurs in `scripts/memory/outcome/memory-outcome-adapter.mjs`, `scripts/portability/check-path-policy.mjs` (+78 more) |
| `src/harness/reconstruction/contracts.ts:14` `claimSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:20` `obligationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:25` `selectionSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:28` `contradictionSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:49` `ProofAuthority` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/obligations.ts:3` `CaseResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/readiness.ts:5` `HarnessStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/http/auth.ts:6` `parseBearerToken` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/http/process-identity.ts:5` `ProcessIdentity` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word also occurs in `src/rdc/process-ledger.ts`, `tests/process-ledger.test.ts` |
| `src/http/process-identity.ts:13` `BuildFreshness` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/curation-delta.ts:15` `curationDeltaSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/curation-delta.ts:23` `curationDeltaFingerprint` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/decision-evidence.ts:55` `LearningDecisionRecorder` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/decision-projection.ts:4` `DecisionEvidenceItem` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/decision-review.ts:44` `decisionAssessmentSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/decision-review.ts:57` `DecisionAssessment` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:78` `ExternalArtifactKind` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:79` `ExternalArtifactResult` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:80` `ExternalControllerEvent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:95` `ExternalMemoryBinding` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:97` `ExternalControllerEpisode` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (24 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:132` `ExternalProcedureCandidate` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:157` `ExternalControllerContextInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:177` `ExternalArtifactReceiptInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:195` `ExternalProcedureInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/external-evaluation.ts:24` `ExternalEvaluationOutcome` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/learning/external-evaluation.ts:38` `ExternalEvaluationOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/external-improvements.ts:13` `externalImprovementInput` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/procedure-scaffold.ts:9` `PROCEDURE_SCAFFOLD_QUESTIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/proposal-documents.ts:19` `ProposalDocumentList` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word also occurs in `src/ui/src/ProposalCards.tsx`, `src/ui/src/host.ts` |
| `src/learning/proposal-documents.ts:20` `ProposalDocumentReadInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/proposal-documents.ts:21` `ProposalDocumentRead` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word also occurs in `src/ui/src/ProposalCards.tsx`, `src/ui/src/host.ts` |
| `src/learning/proposal-documents.ts:39` `needsUserDecision` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/proposal-documents.ts:59` `assertProposalDocumentPath` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/skill-proposal-files.ts:50` `assertProposalPath` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/skill-proposal-notification.ts:4` `skillNoticeText` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/skill-proposal-notification.ts:41` `appendSkillNotices` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/skill-proposal-types.ts:9` `ProposalStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/skill-proposal-types.ts:10` `SkillProposalNoticeReceipt` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/skill-proposal-types.ts:21` `SkillProposalFulfillment` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/state.ts:16` `LearningStateOwner` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/types.ts:1` `LearningCandidateKind` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/types.ts:21` `LearningEffectClaimType` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/types.ts:22` `LearningEffectStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/types.ts:81` `LearningCurationEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:103` `LearningOrphanResolution` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:179` `LearningCuratorRecommendation` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:243` `EvaluatedEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/types.ts:248` `LearningVerification` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:274` `LearningCorrection` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/workflow-evidence.ts:6` `validBrowserReceipt` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word also occurs in `src/agent-learning-loop.ts`, `src/learning/service.ts` (+1 more) |
| `src/learning/workflow-evidence.ts:8` `BrowserUseResolution` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/artifact-inspect-tools.ts:50` `ArtifactInvocationValidator` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/call-tool-result.ts:1` `JsonToolResultLike` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/controller-contract.ts:6` `ContractSnapshot` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/external-controller-tool-support.ts:18` `ExternalControllerToolCall` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/mcp/failure-loop-advisor.ts:37` `FAILURE_LOOP_EXEMPT_TOOLS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/handler.ts:30` `BridgeMcpHttpOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/in-process-tool-host.ts:14` `HostToolConfig` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/mcp/in-process-tool-host.ts:22` `HostCallOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/in-process-tool-host.ts:31` `RegisteredHostTool` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/mutation-safety.ts:41` `MutationSafetyStatus` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/phone-game-schemas.ts:7` `region` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word also occurs in `scripts/verify/launcher-prototype-parity.mjs`, `src/mcp/phone-game-tools.ts` (+12 more) |
| `src/mcp/phone-game-schemas.ts:32` `gameProfile` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/mcp/skills-schemas.ts:6` `skillProposalDraft` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/bm25.ts:13` `Bm25Profile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/cognitive-config.ts:21` `CognitiveFeature` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/memory/cognitive-config.ts:30` `REM_MODEL_ASSIST_ENV_FLAG` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/cognitive-config.ts:31` `RemModelAssist` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/cognitive-maintenance.ts:37` `ContradictionReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/cognitive-maintenance.ts:44` `IntegrityReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/cognitive-maintenance.ts:52` `CognitiveCycleReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/memory/consolidation.ts:5` `ConsolidationCandidate` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/contradiction.ts:13` `ContradictionReason` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/contradiction.ts:25` `ContradictionPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/embedding-repair.ts:13` `EmbeddingRepairStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/embedding-repair.ts:15` `EmbeddingRepairJob` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/memory/episodes.ts:133` `EpisodeExpansion` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/epistemic-confidence.ts:9` `EpistemicStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/epistemic-confidence.ts:18` `EpistemicLinkCounts` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/memory/evidence-excerpt.ts:7` `ContentSpan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/evolution.ts:20` `AppliedEvolution` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:15` `MEMORY_SALIENCE_MIN` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:16` `MEMORY_SALIENCE_MAX` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:17` `MEMORY_SALIENCE_STEP` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:21` `MemoryFeedbackEvent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:27` `MemoryLifecycleEvent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:59` `MemoryLifecycleResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/graph-traversal.ts:13` `TraversalSeed` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/graph-traversal.ts:18` `TraversalHit` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/graph-traversal.ts:29` `TraversalOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/graph-traversal.ts:40` `MAX_TRAVERSAL_HOPS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/identifier-tokenizer.ts:5` `IdentifierTokens` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/index.ts:14` `IndexedPassage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/index.ts:19` `MemoryIndexOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/index.ts:20` `PassageScore` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/index.ts:23` `IndexEntry` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/memory/index.ts:32` `MemoryIndexFile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (13 occurrences); the word occurs in no other file |
| `src/memory/intelligence.ts:148` `proposalLinks` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/memory-tiers.ts:15` `MemoryTierPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/memory-tiers.ts:42` `isStrongEvidence` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/memory-tiers.ts:47` `TieredSearchOutcome` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/passages.ts:8` `PASSAGE_WINDOW` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/passages.ts:9` `PASSAGE_OVERLAP` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/passages.ts:10` `MAX_MEMORY_PASSAGES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/privacy-masking.ts:15` `MaskResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/privacy-masking.ts:88` `MaskedInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/query-embedding-cache.ts:4` `QueryEmbeddingKey` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/query-intent.ts:9` `FusionChannelName` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/query-intent.ts:11` `QueryIntent` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/query-intent.ts:13` `QueryIntentResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/reconsolidation-experiment.ts:6` `reconsolidationFixtureSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:17` `REM_TAG` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:53` `emptyDigestReasons` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:57` `DigestReasons` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:138` `DigestOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/rem-model-assist.ts:12` `DreamingCompletionRequest` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/rem-model-assist.ts:15` `AssistRejection` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/rem-model-assist.ts:16` `AssistCheck` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:26` `MemoryRetrievalStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:27` `MemoryRetrievalDeliveryStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:28` `MemoryRetrievalDisposition` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:30` `MemoryRetrievalExposure` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:73` `MemoryRetrievalDiagnosticsInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:79` `MemoryUseApplicability` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:80` `MemoryUseResult` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:99` `MemoryUseReceipt` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (13 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:9` `MemorySearchDeliveryDetail` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:11` `MemorySearchDelivery` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:19` `MemorySearchRetrievalEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:31` `MemorySearchProjectionDisposition` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:37` `MemorySearchProjection` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/self-repair.ts:10` `OrphanReference` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/self-repair.ts:17` `EmbeddingDriftStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:6` `Subquestion` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word also occurs in `tests/memory/memory-subquestion-protocol.test.ts` |
| `src/memory/subquestion-retrieval.ts:15` `RetrievalBudget` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:54` `RetrievalOrigin` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:58` `MergedRetrievalHit` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:59` `QuestionCoverage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/net/outbound-request.ts:4` `OutboundSafety` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/net/outbound-request.ts:19` `OutboundRequestPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/oauth/store.ts:73` `RegisteredClient` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/oauth/store.ts:85` `PublicClient` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/oauth/store.ts:91` `OAuthResetOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/oauth/store.ts:95` `OAuthResetResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/oauth/store.ts:124` `OAuthExchange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/persistence/bounded-event-log.ts:14` `BoundedEventLogOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/persistence/bounded-event-log.ts:21` `EventLogAppendOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/controller.ts:24` `PhoneStatusReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/controller.ts:35` `Coordinate` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/phone/game-mode-types.ts:10` `GameStateCondition` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/game-mode-types.ts:17` `GameStateRule` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/game-mode-types.ts:23` `GameActionCategory` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/game-mode-types.ts:27` `GameActionSemantic` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/game-mode-types.ts:60` `GameObservationSummary` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/game-perception.ts:32` `measureRegion` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/phone/image.ts:4` `EncodedImage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/portability/runtime-relocation.ts:16` `PortabilityPreparation` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/portability/runtime-relocation.ts:31` `currentMachineId` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/portability/runtime-relocation.ts:35` `PortabilityReindexRequest` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/control-state.ts:2` `ControlState` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/open-browser-use-runtime.ts:7` `OBU_EXTERNAL_HOST` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/open-browser-use.ts:24` `ObuConfiguration` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/open-browser-use.ts:25` `ObuDependencies` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:5` `BrowserShapeRole` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:6` `BrowserShapeBucket` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:57` `validBrowserShape` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:85` `compareBrowserShapes` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:107` `BrowserCompatibility` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/service.ts:24` `BrowserOpenOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/service.ts:25` `BrowserObserveOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/service.ts:54` `RestorePreview` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:20` `TASK_CHANGES_LIMITS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:26` `DiffState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:27` `ChangeState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:28` `AppliedChange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:42` `ExternalChange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:53` `RequestRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/config-field-definitions.ts:1` `ConfigFieldValueType` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/config-field-definitions.ts:3` `ConfigFieldDefinition` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/config-field-definitions.ts:43` `ConfigFieldKey` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/config-manager.ts:23` `ClientInfo` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/config-manager.ts:28` `RdcConfigHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/config-manager.ts:34` `normalizeTelemetryEnabledValue` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/config-manager.ts:51` `isTelemetryDisabledValue` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/config.ts:14` `TOOL_CALL_FILE` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/config.ts:15` `TOOL_CALL_FILE_MAX_SIZE` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/archive-converter.ts:14` `ZipPreflightPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/archive-converter.ts:21` `PACKAGE_ZIP_PREFLIGHT` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/helpers.ts:167` `firstDescendant` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/helpers.ts:226` `resolveHtmlLinks` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/helpers.ts:287` `basenameFromSource` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/html-main-content.ts:9` `MainHtmlSelection` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/service.ts:47` `ProjectBytesOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/service.ts:87` `DocumentProjectionService` | class | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/types.ts:6` `ProjectionEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/types.ts:49` `ProjectionContext` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/types.ts:61` `ProjectedFileMetadata` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/xlsx-evidence.ts:10` `XLSX_EVIDENCE_MAX_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/process-ledger.ts:8` `ProcessLedgerStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/process-ledger.ts:43` `processCommandDigest` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/process-ledger.ts:51` `queryProcessIdentitySync` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/search-manager.ts:15` `SearchResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (9 occurrences); the word occurs in no other file |
| `src/rdc/search-manager.ts:22` `SearchSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/search-manager.ts:38` `SearchSessionOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/search-manager.ts:55` `SearchManager` | class | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/terminal-manager.ts:81` `PaginatedOutputResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/tools/edit.ts:118` `performSearchReplace` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word also occurs in `src/rdc/utils/files/text.ts` |
| `src/rdc/tools/fuzzySearch.ts:6` `recursiveFuzzyIndexOf` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `src/rdc/tools/fuzzySearchCore.ts` |
| `src/rdc/tools/fuzzySearch.ts:9` `FUZZY_SEARCH_TIMEOUT_MS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/image-review.ts:22` `ImageReviewCriteria` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/tools/image-source-dependencies.ts:19` `ReadBudget` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word also occurs in `src/memory/disclosure.ts`, `src/memory/facade.ts` |
| `src/rdc/tools/image-source-dependencies.ts:20` `SourceReading` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/tools/image-source-dependencies.ts:21` `SourceDependenciesReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/tools/process.ts:16` `parseWindowsTasklistCsv` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/process.ts:36` `parsePsAux` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/prompts.ts:18` `PromptsData` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/tools/prompts.ts:32` `loadPromptsData` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:4` `GetConfigArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:24` `ListProcessesArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:85` `PdfInsertOperationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:93` `PdfDeleteOperationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:98` `PdfOperationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:176` `FileCheckpointArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:231` `GetUsageStatsArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:234` `GiveFeedbackArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:271` `ListSearchesArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:274` `GetPromptsArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/types.ts:72` `CompletedSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `src/rdc/terminal-manager.ts` |
| `src/rdc/types.ts:76` `ServerResponseContent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/types.ts:79` `FilePreviewStructuredContent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/types.ts:97` `ToolHandler` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/ui/file-preview/shared/preview-file-types.ts:8` `MARKDOWN_PREVIEW_EXTENSIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/ui/file-preview/shared/preview-file-types.ts:9` `HTML_PREVIEW_EXTENSIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/ui/file-preview/shared/preview-file-types.ts:11` `TEXT_PREVIEW_EXTENSIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/utils/capture.ts:5` `runInUiOriginCallContext` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:9` `isInsideUiOriginCall` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:13` `isTelemetryDisabledByEnv` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:17` `sanitizeError` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:23` `captureBase` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:25` `capture_call_tool` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:26` `capture_ui_event` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:27` `captureRemote` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/files/index.ts:10` `isImageFile` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `src/rdc/tools/filesystem.ts`, `src/rdc/tools/mime-types.ts` (+1 more) |
| `src/rdc/utils/files/index.ts:14` `ImageFileHandler` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `src/rdc/utils/files/factory.ts`, `src/rdc/utils/files/image.ts` |
| `src/rdc/utils/files/index.ts:15` `BinaryFileHandler` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `src/rdc/utils/files/binary.ts`, `src/rdc/utils/files/factory.ts` (+1 more) |
| `src/rdc/utils/files/index.ts:16` `ExcelFileHandler` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `src/rdc/tools/edit.ts`, `src/rdc/utils/files/base.ts` (+3 more) |
| `src/rdc/utils/lineEndingHandler.ts:4` `LineEndingStyle` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/utils/lineEndingHandler.ts:47` `analyzeLineEndings` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/logger.ts:1` `LogLevel` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word also occurs in `src/semantic-ide/provider-registry.ts` |
| `src/rdc/utils/logger.ts:3` `log` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (10 occurrences); the word also occurs in `scripts/browser-control/build-open-browser-use-transport.mjs`, `scripts/inspect/work-receipt.mjs` (+102 more) |
| `src/rdc/utils/logger.ts:19` `logToStderr` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/ripgrep-resolver.ts:94` `clearRipgrepCache` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/toolHistory.ts:10` `ToolCallRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (9 occurrences); the word occurs in no other file |
| `src/rdc/utils/toolHistory.ts:30` `CompactToolCallRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/utils/usageTracker.ts:4` `ToolUsageStats` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (9 occurrences); the word occurs in no other file |
| `src/rdc/utils/usageTracker.ts:32` `OnboardingState` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/utils/usageTracker.ts:38` `UsageSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/security/environment.ts:16` `getAgentCoreOwnedSecretKeys` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/security/sensitive-file.ts:14` `assertSensitiveRegularFile` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/security/verified-result-artifact.ts:10` `RESULT_ARTIFACT_MAX_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/security/verified-result-artifact.ts:23` `ownedResultArtifactRoot` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/diagnostic-payload.ts:2` `DiagnosticPayload` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/semantic-ide/freshness.ts:3` `WorkspaceFreshnessResult` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (11 occurrences); the word also occurs in `src/semantic-ide/language-server.ts`, `src/semantic-ide/types.ts` |
| `src/semantic-ide/freshness.ts:7` `FreshnessSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:18` `ProviderArtifactRecipe` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:39` `ProvisionProviderOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:43` `ProvisionProviderResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:791` `provisionableProviderIds` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:897` `ManagedProviderIssue` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:18` `ProviderCapabilityRequirement` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:23` `ProviderReadiness` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:34` `ProviderServerRequestResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:50` `ProviderPostInitializePlan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:55` `SemanticProviderAdapter` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/semantic-ide/text-position.ts:11` `PositionPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/semantic-ide/text-position.ts:32` `validateTextRange` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/transaction.ts:19` `TextFilePlan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/semantic-ide/transaction.ts:32` `RenamePlan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/semantic-ide/transaction.ts:46` `WorkspacePlan` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/semantic-ide/transaction.ts:194` `WorkspaceApplyOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:13` `PluginFile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:14` `SkillAdaptationChange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:15` `ClaudeSkillStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:21` `StrictSkillParser` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:23` `ClaudeSkillAnalysis` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:36` `ClaudePluginOtherComponent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:46` `ClaudeMarketplace` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:53` `ClaudeDeclaredComponent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:109` `PluginInventory` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/skills/discovery.ts:43` `SkillSearchResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/skills/discovery.ts:77` `MAX_SKILL_SEARCH_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/skills/discovery.ts:78` `MAX_SKILL_EMBEDDING_UNITS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/tracker/tool-detail.ts:5` `DetailPhase` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/tracker/tool-detail.ts:6` `DETAIL_CHUNK_CHARS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/ui/src/activityPhase.ts:15` `ActivityPhaseInput` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/activityPhase.ts:22` `ActivityPhase` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/ui/src/activityStates.ts:8` `ActivityGroup` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/activityStates.ts:12` `ActivityState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/activityStates.ts:415` `ACTIVITY_STATE_ORDER` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/AgentTimeline.tsx:6` `StepCategory` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/ui/src/AgentTimeline.tsx:43` `TimelineItem` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/ui/src/chatSelection.ts:4` `ChatSelection` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (14 occurrences); the word occurs in no other file |
| `src/ui/src/chatSelection.ts:5` `ChatSelectionResolution` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/ui/src/components.tsx:37` `navItems` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/components.tsx:115` `RestartMenu` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/components.tsx:142` `ProcessCard` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/components.tsx:152` `Sidebar` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/components.tsx:318` `EmptyAction` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/ContextMeter.tsx:24` `ContextMeterModel` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/ContextMeter.tsx:46` `ContextBreakdownRow` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/ui/src/ContextMeter.tsx:86` `ContextMeterSegment` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/ui/src/pages.tsx:100` `DashboardPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/pages.tsx:146` `CoreRuntimePage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/pages.tsx:202` `SystemsPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/pages.tsx:321` `DiagnosticsPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/pages.tsx:344` `SettingsPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/SlashMenu.tsx:3` `SLASH_MENU_LIMIT` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:3` `CodeLanguage` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:4` `CodePresentation` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:20` `shellLanguage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:26` `fileLanguage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/useTaskChanges.ts:8` `UseTaskChangesState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/vite.config.ts:5` `default` | default | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/release/integrity-manifest.mjs` (+118 more) |
| `src/ui/vitest.config.ts:3` `default` | default | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/release/integrity-manifest.mjs` (+118 more) |
| `src/web-research/service.ts:14` `WebSearchMode` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:15` `WebSearchProvider` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (10 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:18` `WebOpenProvider` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:19` `WebOpenReader` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:20` `WebContentScope` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:40` `WebSearchResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:53` `WebSearchResponse` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:60` `WebOpenResponse` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:84` `WebResearchHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/workflows/renderer.ts:5` `diagramId` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word also occurs in `src/workflows/diagram.ts`, `src/workflows/text.ts` |

#### TEST-ONLY (175)

| Symbol (`path:line`) | Kind | Evidence |
| --- | --- | --- |
| `src/agent-chat-attachments.ts:6` `MAX_ATTACHMENTS_PER_MESSAGE` | variable | imported only by `tests/agent-chat-attachments.test.ts` |
| `src/agent-chat-attachments.ts:7` `MAX_ATTACHMENT_BYTES` | variable | imported only by `tests/agent-chat-attachments.test.ts` |
| `src/agent-chat-attachments.ts:9` `INLINE_TEXT_CHARS_PER_FILE` | variable | imported only by `tests/agent-chat-attachments.test.ts` |
| `src/agent-chat-attachments.ts:10` `INLINE_TEXT_CHARS_PER_MESSAGE` | variable | imported only by `tests/agent-chat-attachments.test.ts` |
| `src/agent-chat-attachments.ts:114` `classifyAttachment` | function | imported only by `tests/agent-chat-attachments.test.ts` |
| `src/agent-chat-service.ts:45` `userSelectedSkillDirective` | function | imported only by `tests/agent-slash-commands.test.ts` |
| `src/agent-chat-service.ts:57` `AgentChatEventEnvelope` | interface | imported only by `tests/agent-chat-service.test.ts` |
| `src/agent-chat-store.ts:13` `AgentChatConversationStatus` | type | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:14` `AgentChatTurnStatus` | type | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:21` `AgentChatMessageRole` | type | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:24` `AgentChatLastSelection` | interface | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:44` `AgentChatAttachmentMeta` | type | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:82` `AgentChatMessage` | interface | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:92` `AgentChatStepMeta` | interface | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:107` `NARRATION_STEP_TOOL` | variable | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:117` `STEP_RETENTION_MS` | variable | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:134` `AgentChatCheckpointRecord` | interface | imported only by tests through a whole-module import |
| `src/agent-context-accounting.ts:4` `OUTPUT_RESERVE_TOKENS` | variable | imported only by `tests/agent-context-accounting.test.ts` |
| `src/agent-context-accounting.ts:7` `AUTOMATIC_CONTEXT_MAX_BYTES` | variable | imported only by `tests/agent-context-accounting.test.ts` |
| `src/agent-context-compaction.ts:6` `TURN_SUMMARY_MARKER` | variable | imported only by `tests/agent-context-compaction.test.ts` |
| `src/agent-context-usage.ts:17` `contextUsagePercent` | function | imported only by `src/agent-context-usage.test.ts` |
| `src/agent-controller.ts:157` `RESPONSE_STYLE_CONTRACT` | variable | imported only by tests through a whole-module import |
| `src/agent-controller.ts:169` `WORKING_RULES_CONTRACT` | variable | imported only by tests through a whole-module import |
| `src/agent-controller.ts:409` `NativeAgentTaskInput` | interface | imported only by tests through a whole-module import |
| `src/agent-controller.ts:442` `NativeAgentContinuationHooks` | interface | imported only by tests through a whole-module import |
| `src/agent-controller.ts:456` `NativeAgentConversationTurnInput` | interface | imported only by tests through a whole-module import |
| `src/agent-provider-readiness.ts:62` `readinessDigest` | function | imported only by `tests/agent-provider-health.test.ts`, `tests/agent-provider-readiness.test.ts` |
| `src/agent-provider-state.ts:241` `summarizeCredentialVerdicts` | function | imported only by `tests/agent-provider-scheduler.test.ts` |
| `src/agent-provider.ts:68` `AgentProviderConfig` | interface | imported only by `tests/agent-context-accounting.test.ts`, `tests/agent-provider-health.test.ts`, `tests/agent-provider-pool.test.ts`, `tests/dtc1-durable-turn-continuation.test.ts` |
| `src/agent-provider.ts:130` `AgentAnthropicContentBlock` | type | imported only by `tests/agent-provider-anthropic.test.ts` |
| `src/agent-provider.ts:453` `OpenAICompatibleProvider` | class | imported only by `tests/agent-provider-anthropic.test.ts`, `tests/agent-provider-response-transport.test.ts`, `tests/agent-provider.test.ts`, `tests/native-tool-images.test.ts` |
| `src/agent-runtime.ts:199` `taskNormalizationStats` | function | imported only by `tests/agent-runtime-normalize-cache.test.ts` |
| `src/agent-runtime.ts:389` `normalizeState` | function | imported only by `tests/agent-runtime-normalize-cache.test.ts` |
| `src/agent-turn-checkpoint.ts:227` `normalizeAgentTurnCheckpoint` | function | imported only by `tests/agent-context-compaction.test.ts`, `tests/dtc1-durable-turn-continuation.test.ts`, `tests/native-proposal-promotion.test.ts` |
| `src/capability-awareness.ts:7` `CapabilityDisclosurePolicy` | type | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:8` `CapabilityKind` | type | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:17` `CAPABILITY_LABELS` | variable | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:152` `SkillReadCoverageEntry` | interface | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:208` `skillReferenceRead` | function | imported only by `tests/capability-native-loop.test.ts`, `tests/skill-discovery-observation.test.ts`, `tests/skill-read-coverage.test.ts` |
| `src/code-intelligence/grafel-runtime.ts:63` `validateGrafelIsolationEnvironment` | function | imported only by `tests/code-intelligence-post-v033.test.ts` |
| `src/code-intelligence/service.ts:35` `isSupportedGrafelWireVersion` | function | imported only by `tests/grafel-regrounding-g20-g25.test.ts` |
| `src/http/app.ts:29` `HttpHandlerOptions` | interface | imported only by `tests/agent-ui-transport.test.ts` |
| `src/http/process-identity.ts:20` `describeProcess` | function | imported only by `tests/process-identity.test.ts` |
| `src/http/process-identity.ts:38` `judgeBuild` | function | imported only by `tests/process-identity.test.ts` |
| `src/http/process-identity.ts:44` `newestFileModifiedMs` | function | imported only by `tests/process-identity.test.ts` |
| `src/learning/decision-review.ts:28` `decisionDeclarationSchema` | variable | imported only by `tests/decision-review.test.ts` |
| `src/learning/decision-review.ts:56` `DecisionDeclaration` | type | imported only by `tests/decision-review.test.ts` |
| `src/learning/external-evaluation.ts:19` `externalEvaluationManifestSchema` | variable | imported only by `tests/external-evaluation.test.ts` |
| `src/learning/external-evaluation.ts:23` `ExternalEvaluationManifest` | type | imported only by `tests/external-evaluation.test.ts` |
| `src/learning/external-evaluation.ts:33` `ExternalEvaluationObservation` | type | imported only by `tests/external-evaluation.test.ts` |
| `src/learning/external-evaluation.ts:34` `ExternalEvaluationEpisode` | interface | imported only by `tests/external-evaluation.test.ts` |
| `src/learning/external-procedure.ts:10` `externalProcedureAdmissionSchema` | variable | imported only by `tests/external-procedure.test.ts` |
| `src/learning/external-procedure.ts:25` `ExternalProcedureAdmission` | type | imported only by `tests/external-learning-promotion-api.test.ts`, `tests/external-procedure.test.ts` |
| `src/learning/external-procedure.ts:40` `parseExternalProcedureAdmission` | function | imported only by `tests/external-procedure.test.ts` |
| `src/learning/salience-review.ts:39` `SalienceReviewInput` | type | imported only by `tests/salience-review.test.ts` |
| `src/learning/state.ts:27` `defaultLearningState` | function | imported only by `tests/cumulative-workflow.test.ts`, `tests/external-improvements.test.ts`, `tests/learning-finalization-continuity.test.ts` |
| `src/mcp/code-intelligence-tools.ts:48` `collectBoundedGraphTouches` | function | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/grafel-regrounding-g20-g25.test.ts` |
| `src/mcp/handler.ts:54` `bindAbortClose` | function | imported only by `tests/anthropic-sdk-third-wave.test.ts` |
| `src/mcp/native-chat-bridge-tools.ts:8` `nativeChatBridgeSchema` | variable | imported only by `tests/native-chat-bridge-facade.test.ts` |
| `src/mcp/native-chat-bridge-tools.ts:43` `runNativeChatBridge` | function | imported only by `tests/native-chat-bridge-facade.test.ts` |
| `src/mcp/restart-tool.ts:42` `requestAgentCoreRestart` | function | imported only by `tests/restart-tool.test.ts` |
| `src/mcp/streamable-http.ts:10` `parseJsonRpcHttpResponse` | function | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/mcp-streaming-response.test.ts` |
| `src/mcp/streamable-http.ts:48` `JsonRpcResponseOptions` | interface | imported only by tests through a whole-module import |
| `src/memory/archive.ts:128` `readMemoryAuditRefs` | function | imported only by `tests/memory/engine/memory-preservation.test.ts`, `tests/memory/engine/memory-retention.test.ts` |
| `src/memory/cognitive-config.ts:9` `COGNITIVE_FEATURES` | variable | imported only by `tests/memory/memory-cognitive-scoring.test.ts` |
| `src/memory/cognitive-config.ts:24` `COGNITIVE_ENV_FLAG` | variable | imported only by `tests/memory/memory-cognitive-scoring.test.ts` |
| `src/memory/evidence-excerpt.ts:48` `verifyMemoryExcerpt` | function | imported only by `tests/memory/engine/memory-evidence-excerpt-integration.test.ts`, `tests/memory/engine/memory-evidence-excerpt.test.ts`, `tests/memory/engine/memory-remaining-plans-integration.test.ts` |
| `src/memory/feedback.ts:372` `applyFeedbackSalience` | function | imported only by `tests/ecosystem-residual-adoption.test.ts` |
| `src/memory/mcp/tools.ts:17` `memoryTrust` | function | imported only by `tests/four-plan-adoption-wave.test.ts` |
| `src/memory/mcp/tools.ts:32` `memoryRememberLearningFinalizationAdvisory` | function | imported only by `tests/learning-finalization-continuity.test.ts` |
| `src/memory/memory-tiers.ts:20` `classifyMemoryTier` | function | imported only by `tests/memory/memory-cognitive-retrieval.test.ts` |
| `src/memory/memory-tiers.ts:32` `partitionByTier` | function | imported only by `tests/memory/memory-cognitive-retrieval.test.ts` |
| `src/memory/provenance.ts:10` `MemoryStalenessStatus` | type | imported only by tests through a whole-module import |
| `src/memory/provenance.ts:12` `MemoryStalenessAssessment` | interface | imported only by tests through a whole-module import |
| `src/memory/query-embedding-cache.ts:20` `DEFAULT_QUERY_CACHE_LIMITS` | variable | imported only by `tests/memory/engine/memory-query-cache-integration.test.ts`, `tests/memory/engine/memory-query-embedding-cache.test.ts`, `tests/memory/engine/memory-remaining-plans-integration.test.ts` |
| `src/memory/query-intent.ts:19` `NEUTRAL_FUSION_WEIGHTS` | variable | imported only by `tests/memory/memory-cognitive-retrieval.test.ts` |
| `src/memory/store.ts:17` `LoadedMemories` | interface | imported only by tests through a whole-module import |
| `src/memory/store.ts:24` `MemoryBatchPlan` | interface | imported only by tests through a whole-module import |
| `src/memory/store.ts:38` `StateSnapshot` | type | imported only by tests through a whole-module import |
| `src/memory/store.ts:40` `StorePlan` | type | imported only by tests through a whole-module import |
| `src/memory/subquestion-retrieval.ts:120` `markEvidenceReviewed` | function | imported only by `tests/memory/fixtures/memory-subquestion/replay.ts`, `tests/memory/memory-subquestion-merge.test.ts` |
| `src/memory/temporal.ts:10` `parseTimeValue` | function | imported only by `tests/memory/engine/memory-temporal.test.ts` |
| `src/memory/temporal.ts:16` `TemporalCandidate` | interface | imported only by tests through a whole-module import |
| `src/memory/temporal.ts:44` `TemporalTransitionInput` | type | imported only by tests through a whole-module import |
| `src/net/outbound-request.ts:6` `OutboundAttemptEvent` | interface | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/anthropic-sdk-third-wave.test.ts`, `tests/outbound-body-replayability.test.ts`, `tests/outbound-retry-budget.test.ts` |
| `src/net/public-address.ts:6` `NormalizedAddress` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:10` `PublicUrlBytes` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:11` `PublicReadOptions` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:13` `PublicReadDependencies` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:112` `createPublicUrlReader` | function | imported only by tests through a whole-module import |
| `src/oauth/store.ts:10` `MAX_UNAUTHORIZED_CLIENTS` | variable | imported only by `tests/oauth-registration-limits.test.ts` |
| `src/oauth/store.ts:25` `OAuthPrincipal` | interface | imported only by `tests/oauth-concurrency-review.test.ts` |
| `src/persistence/atomic-file.ts:9` `OwnedAtomicWriteOptions` | interface | imported only by tests through a whole-module import |
| `src/rdc/browser-control/canvas-observation.ts:22` `projectRaster` | function | imported only by `tests/systemone-browser-adoption.test.ts` |
| `src/rdc/browser-control/open-browser-use-runtime.ts:24` `ManagedBrowserUseRuntime` | class | imported only by `tests/browser-use-owner-startup.test.ts`, `tests/managed-browser-use.test.ts` |
| `src/rdc/browser-control/open-browser-use.ts:59` `obuSocketCandidates` | function | imported only by `tests/open-browser-use.test.ts` |
| `src/rdc/browser-control/service.ts:392` `BrowserControlService` | class | imported only by `tests/browser-control.test.ts`, `tests/browser-default-transport.test.ts`, `tests/browser-panel-scroll.test.ts`, `tests/browser-session-ownership.test.ts` |
| `src/rdc/command-guards.ts:20` `splitSegments` | function | imported only by `tests/command-guards.test.ts` |
| `src/rdc/document-projection/public-url.ts:10` `PublicDocumentOptions` | interface | imported only by tests through a whole-module import |
| `src/rdc/mutation-coordinator.ts:59` `PathMutationCoordinator` | class | imported only by `tests/four-plan-adoption-wave.test.ts` |
| `src/rdc/process-ledger.ts:11` `ProcessIdentity` | interface | imported only by `tests/process-ledger.test.ts` |
| `src/rdc/process-ledger.ts:89` `ProcessLedger` | class | imported only by `tests/process-ledger.test.ts` |
| `src/rdc/terminal-manager.ts:168` `TerminalManager` | class | imported only by `tests/terminal-manager-process-ledger-race.test.ts` |
| `src/rdc/tools/filesystem.ts:52` `READ_OPERATION_TIMEOUT_MS` | variable | imported only by tests through a whole-module import |
| `src/rdc/tools/filesystem.ts:396` `readFileFromUrl` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/filesystem.ts:493` `readFileFromDisk` | function | imported only by `tests/document-projection.test.ts`, `tests/rdc-safe-regular-file.test.ts`, `tests/xlsx-projection-evidence.test.ts` |
| `src/rdc/tools/filesystem.ts:937` `searchFiles` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/extract-images.ts:23` `ImageCompressionOptions` | interface | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:2` `PdfInsertOperation` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:2` `PdfDeleteOperation` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:4` `PdfPageItem` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:4` `PdfParseResult` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:4` `PdfParseOptions` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:8` `extractImagesFromPdf` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:9` `ImageInfo` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:9` `PageImages` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/markdown.ts:86` `findPuppeteerChrome` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/markdown.ts:116` `pruneOldPuppeteerChromeBuilds` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/schemas.ts:151` `BrowserControlArgsSchema` | variable | imported only by `tests/systemone-browser-adoption.test.ts` |
| `src/rdc/tools/schemas.ts:295` `toolArgSchemas` | variable | imported only by `tests/mcp-schema-contract.test.ts`, `tests/rdc-parity.test.ts` |
| `src/rdc/utils/files/safe-regular-file.ts:99` `RegularFileOpenOptions` | interface | imported only by tests through a whole-module import |
| `src/rdc/utils/files/safe-regular-file.ts:105` `GuardedRegularFile` | interface | imported only by tests through a whole-module import |
| `src/rdc/utils/files/safe-regular-file.ts:214` `regularFileGuardState` | function | imported only by `tests/rdc-safe-regular-file.test.ts` |
| `src/rdc/utils/toolHistory.ts:84` `ToolHistory` | class | imported only by `tests/capability-residual-wave.test.ts`, `tests/image-inspect-mcp.test.ts`, `tests/reflexion-second-wave.test.ts` |
| `src/security/environment.ts:6` `recordAgentCoreOwnedSecretKey` | function | imported only by `tests/anthropic-sdk-third-wave.test.ts` |
| `src/security/evidence-capture-policy.ts:9` `EVIDENCE_POLICY_MARKER` | variable | imported only by `tests/image-inspect-mcp.test.ts` |
| `src/security/evidence-capture-policy.ts:20` `EvidencePolicyState` | type | imported only by tests through a whole-module import |
| `src/security/evidence-capture-policy.ts:88` `extractEvidenceCandidatePaths` | function | imported only by `tests/image-inspect-mcp.test.ts` |
| `src/security/sensitive-file.ts:17` `readSensitiveTextFile` | function | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/anthropic-sdk-third-wave.test.ts` |
| `src/security/untrusted-text.ts:79` `neutralizeUntrustedText` | function | imported only by `tests/untrusted-text.test.ts` |
| `src/semantic-ide/protocol.ts:16` `LspResponseError` | class | imported only by `tests/semantic-ide-protocol-hardening.test.ts` |
| `src/semantic-ide/provider-provisioning.ts:31` `ProviderRecipe` | interface | imported only by `tests/semantic-ide-provisioning.test.ts` |
| `src/semantic-ide/source-io.ts:86` `encodeSource` | function | imported only by `tests/semantic-ide-source-safety.test.ts` |
| `src/semantic-ide/transaction.ts:326` `applyWorkspaceEdit` | function | imported only by `tests/semantic-ide-source-safety.test.ts`, `tests/semantic-ide-text-positions.test.ts`, `tests/semantic-ide-transaction-second-wave.test.ts`, `tests/semantic-ide-transaction.test.ts` |
| `src/semantic-ide/workspace-policy.ts:120` `WorkspaceSourceFile` | interface | imported only by tests through a whole-module import |
| `src/semantic-ide/workspace-policy.ts:125` `WorkspaceScanResult` | interface | imported only by tests through a whole-module import |
| `src/skills/claude-plugin.ts:145` `skillIdentifier` | function | imported only by `tests/skill-claude-plugin.test.ts` |
| `src/skills/claude-plugin.ts:150` `walkOrder` | function | imported only by `tests/skill-claude-plugin.test.ts` |
| `src/skills/claude-plugin.ts:228` `findMissingReferences` | function | imported only by `tests/skill-claude-plugin.test.ts` |
| `src/skills/discovery.ts:17` `SkillSearchHit` | interface | imported only by `tests/skill-context-discovery.test.ts` |
| `src/tracker/tool-detail.ts:7` `DETAIL_REQUEST_LIMIT` | variable | imported only by `tests/activity-tool-detail.test.ts` |
| `src/tracker/tool-detail.ts:8` `DETAIL_RESPONSE_LIMIT` | variable | imported only by `tests/activity-tool-detail.test.ts` |
| `src/ui/src/AgentTimeline.tsx:21` `stepCategory` | function | imported only by `src/ui/src/AgentTimeline.test.tsx` |
| `src/ui/src/AgentTimeline.tsx:32` `summarizeSteps` | function | imported only by `src/ui/src/AgentTimeline.test.tsx` |
| `src/ui/src/AgentTimeline.tsx:48` `buildTimeline` | function | imported only by `src/ui/src/AgentTimeline.test.tsx` |
| `src/ui/src/attachments.ts:5` `MAX_ATTACHMENT_BYTES` | variable | imported only by `src/ui/src/attachments.test.ts` |
| `src/ui/src/attachments.ts:6` `MAX_ATTACHMENT_TOTAL_BYTES` | variable | imported only by `src/ui/src/attachments.test.ts` |
| `src/ui/src/ContextMeter.tsx:5` `NEAR_FULL_PERCENT` | variable | imported only by `src/ui/src/ContextMeter.test.tsx` |
| `src/ui/src/ContextMeter.tsx:89` `contextSegmentWidths` | function | imported only by `src/ui/src/ContextMeter.test.tsx` |
| `src/ui/src/host.ts:1` `DesktopStatus` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:12` `ProviderServerSnapshot` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:18` `DesktopHealthSnapshot` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:132` `AgentRunResult` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:148` `AgentChatConversation` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:165` `AgentChatAttachment` | type | imported only by `src/ui/src/ChatAttachments.test.tsx` |
| `src/ui/src/host.ts:209` `AgentMemoryUse` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:217` `AgentChatMessage` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:250` `StepDetailResult` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:251` `StepDetailAction` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:271` `AgentChatDetail` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:321` `AgentProfileMetadata` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:386` `AGENT_ACTIVITY_LIMIT` | variable | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:389` `AgentChatStreamPreview` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:434` `AgentContextUsage` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:510` `TaskChangesRequest` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:523` `AgentChatCompactResult` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:528` `DreamingStatus` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:535` `NativeSkillInfo` | type | imported only by `src/ui/src/SkillsPage.test.tsx` |
| `src/ui/src/host.ts:571` `HostListener` | type | imported only by tests through a whole-module import |
| `src/ui/src/pages.tsx:243` `ActivityLogPage` | function | imported only by `src/ui/src/ActivityLifecyclePresentation.test.tsx`, `src/ui/src/ActivityLogScreenshot.test.tsx`, `src/ui/src/ActivityLogVisualVariants.test.tsx`, `src/ui/src/ToolExecutionEnhancement.test.tsx` |
| `src/ui/src/pages.tsx:429` `ChatPage` | function | imported only by `src/ui/src/AgentActivity.test.tsx`, `src/ui/src/AgentSteps.test.tsx`, `src/ui/src/ChatAttachments.test.tsx`, `src/ui/src/ChatStatusBar.test.tsx` |
| `src/workflows/analyzer.ts:8` `WORKFLOW_SOURCE_LIMITS` | variable | imported only by `tests/workflows-analyzer.test.ts` |
| `src/workflows/analyzer.ts:39` `collectAllowedSources` | function | imported only by `tests/workflows-analyzer.test.ts` |
| `src/workflows/renderer.ts:6` `architectureFromGraph` | variable | imported only by `tests/workflows-renderer.test.ts` |
| `src/workflows/renderer.ts:8` `secureWorkflowHtml` | function | imported only by `tests/workflows-renderer.test.ts` |

#### UNCERTAIN (module imported dynamically/as a namespace) (239)

| Symbol (`path:line`) | Kind | Evidence |
| --- | --- | --- |
| `src/agent-tool-session.ts:10` `AgentToolResult` | interface | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/agent-tool-session.ts:26` `toolImages` | function | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/config.ts:23` `MemoryEmbeddingConfig` | interface | module is loaded dynamically or as a namespace by `scripts/verify/native-critical-thinking-audit.mjs`; name-level use cannot be resolved |
| `src/index.ts:55` `AgentCoreService` | interface | module is loaded dynamically or as a namespace by `scripts/verify/launcher-prototype-parity.mjs`, `src/mcp/restart-tool.ts`; name-level use cannot be resolved |
| `src/index.ts:64` `startAgentCoreService` | function | module is loaded dynamically or as a namespace by `scripts/verify/launcher-prototype-parity.mjs`, `src/mcp/restart-tool.ts`; name-level use cannot be resolved |
| `src/index.ts:439` `createEntrypointGracefulClose` | function | module is loaded dynamically or as a namespace by `scripts/verify/launcher-prototype-parity.mjs`, `src/mcp/restart-tool.ts`; name-level use cannot be resolved |
| `src/learning/service.ts:89` `applyPriorRejectionAdvisory` | function | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/learning/service.ts:100` `withRejectionHistory` | function | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/learning/verified-value-registry.ts:2` `NumericTransform` | type | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/learning/verified-value-registry.ts:4` `NumericSource` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/learning/verified-value-registry.ts:10` `NumericRegistryEntry` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/mcp/result-budget.ts:24` `BudgetableToolResult` | interface | module is loaded dynamically or as a namespace by `scripts/verify/pdf-tool-delivery-check.mjs`; name-level use cannot be resolved |
| `src/mcp/server.ts:67` `SERVER_NAME` | variable | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/memory/controller-session.ts:29` `ControllerRankedSnapshot` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/controller-session.ts:36` `ControllerMemoryBackend` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/disclosure.ts:13` `digestSchema` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/disclosure.ts:14` `Validity` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/disclosure.ts:14` `TimeValue` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-diversity.ts:3` `DiversityDimension` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-diversity.ts:9` `DiversityCandidate` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-diversity.ts:15` `DiversityCell` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-evaluation.ts:5` `MAX_RETRIEVAL_ARTIFACT_BYTES` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/evaluate-retrieval.mjs`, `scripts/memory/evaluation/report-bundle.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-evaluation.ts:25` `retrievalInputDigests` | function | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/evaluate-retrieval.mjs`, `scripts/memory/evaluation/report-bundle.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-novelty.ts:7` `NOVELTY_PAIR_WORK_LIMIT` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-novelty.ts:9` `RetrievalNoveltyRow` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-novelty.ts:15` `RetrievalNoveltyReport` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-pareto.ts:8` `ParetoConfig` | type | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-pareto.ts:9` `ParetoMetric` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-pareto.ts:10` `ParetoCandidate` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-portfolio.ts:4` `reduceCoverageFronts` | function | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-profile.ts:5` `PROFILE_REVISION` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-profile.ts:6` `transitions` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-series.ts:47` `resourceDimensions` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-series.ts:49` `diversityFeatureIds` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-series.ts:58` `paretoMetricIds` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-series.ts:79` `runStatuses` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-series.ts:86` `retrievalSeriesManifestSchema` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-stability.ts:1` `StabilityRound` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-stability.ts:8` `StabilityConfig` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-stability.ts:13` `StabilityWindow` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-verifier.ts:4` `RETRIEVAL_VERIFIER_REVISION` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/evaluate-retrieval.mjs`, `scripts/memory/evaluation/report-bundle.mjs`, `scripts/memory/evaluation/verify-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-verifier.ts:23` `RetrievalVerification` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/evaluate-retrieval.mjs`, `scripts/memory/evaluation/report-bundle.mjs`, `scripts/memory/evaluation/verify-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/experience-types.ts:22` `validitySchema` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/experience-types.ts:31` `verificationSchema` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/experience-types.ts:77` `episodeEventInputSchema` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/experience-types.ts:111` `checkpointTriggerSchema` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:3` `MemoryServiceOptions` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:5` `ControllerRetrievalPolicy` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:6` `RememberInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:7` `UpdateInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:8` `MemoryBatchOperation` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:9` `MemoryBatchResult` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:10` `MemoryLinkInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:11` `EvolutionResult` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:12` `EvolutionPreviewResult` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:16` `CloudflareWorkersAIEmbedder` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:17` `cosineSimilarity` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:20` `MemoryEmbedder` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:21` `MemoryEmbedderIdentity` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:22` `CloudflareEmbedderConfig` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:25` `initializeMemoryRoot` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:26` `MemoryRootOptions` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:28` `resolveMemoryPaths` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:28` `notePath` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:29` `MemoryPaths` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:32` `MemorySearchOptions` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:33` `MemorySearchResult` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:36` `buildMemoryTransferPayload` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:37` `planMemoryImport` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:40` `ControllerMemorySession` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:41` `MemoryControllerError` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `Digest` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `IsoInstant` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `SourceRef` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `Verification` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `RetentionTier` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `EpistemicType` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `TemporalClass` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `DisclosureView` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `ControllerMemoryCapabilities` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `ReadBudget` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `BudgetMetrics` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `Budgeted` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `RecallInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `MemoryHit` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `RecallPage` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `ExpandInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `ExpansionPage` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `MemoryControllerErrorCode` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `RecordExperience` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `RecordKind` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `TimeValue` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `Validity` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `WorkingItem` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `WorkingStateChange` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `EpisodeEventKind` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `EpisodeEvent` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `EpisodeHeader` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `StartEpisodeInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `AppendEventInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `EpisodeAppendResult` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `EpisodeStatusInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `CaptureEvidenceInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `ArtifactAvailability` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `ArtifactReceipt` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `TaskContext` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `CheckpointTrigger` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `CheckpointInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `TaskCapsule` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `TemporalAssertion` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ApplyConsolidationInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationProposal` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationPlan` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `PromotionReceipt` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationPolicy` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationReview` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:56` `RetentionInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:56` `RetentionReceipt` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:58` `CONTROLLER_MEMORY_NOTICE` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryDispatcher` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryMethod` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryResult` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryResponse` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `MEMORY_TRANSFER_V2_VERSION` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `exportMemoryTransferV2` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `previewMemoryTransferV2` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `importMemoryTransferV2` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Policy` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2ExportOptions` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Bundle` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Preview` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Receipt` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:62` `assessMemoryRelevance` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:62` `validateRelevancePolicy` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:63` `RelevancePolicy` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:63` `RelevanceInput` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:63` `RelevanceDecision` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `encodeIntention` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `decodeIntention` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `evaluateIntentions` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `intentionUpsert` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `INTENTION_PREFIX` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:66` `ProspectiveIntention` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:66` `IntentionObservation` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:66` `IntentionEvaluation` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:67` `ContinuityAssessment` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:67` `IngestionBinding` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:67` `IngestionCursor` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:68` `assessTaskContinuity` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `encodeProjectSynthesis` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `decodeProjectSynthesis` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `buildProjectSynthesisAction` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `projectSynthesisRefs` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `checkProjectSynthesisDependencies` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:70` `ProjectSynthesis` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:70` `SynthesisEligibilityReason` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:71` `KnowledgeInterval` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:71` `KnownHistoryCoverage` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:71` `HistoricalMemorySnapshot` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `claimReviewContractSchema` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `claimReviewReadSchema` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `claimReviewWriteSchema` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `externalClaimReviewGuide` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:73` `ClaimReviewContract` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:73` `ClaimReviewRead` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:73` `ClaimReviewWrite` | re-export | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/forgetting-curve.ts:21` `ForgettingScore` | interface | module is loaded dynamically or as a namespace by `scripts/verify/proposal-retention-review.mjs`; name-level use cannot be resolved |
| `src/memory/host-runtime.ts:10` `AgentCoreMemoryRuntime` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`, `scripts/memory/activate-canonical.mjs`, `scripts/verify/proposal-retention-review.mjs`; name-level use cannot be resolved |
| `src/memory/host-runtime.ts:19` `MEMORY_ACTIVATION_LOCK_RELATIVE` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`, `scripts/memory/activate-canonical.mjs`, `scripts/verify/proposal-retention-review.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:5` `Mode` | type | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:6` `OUTCOME_CONTRACT_REVISION` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:43` `outcomeObservationSchema` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:57` `OutcomeCase` | type | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/evaluation.ts:4` `OUTCOME_EVALUATOR_REVISION` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/verifier.ts:6` `OUTCOME_VERIFIER_REVISION` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/package-memory-outcome.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/verifier.ts:83` `verifyOutcomeOracle` | function | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/package-memory-outcome.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/verifier.ts:109` `OutcomeVerification` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-preregistration.mjs`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/package-memory-outcome.mjs`; name-level use cannot be resolved |
| `src/memory/project-synthesis.ts:46` `SynthesisDependencyStatus` | type | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/project-synthesis.ts:47` `SynthesisEligibilityWait` | type | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/project-synthesis.ts:48` `SynthesisDependencyResolver` | type | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/reconsolidation-report.ts:29` `ReconsolidationReport` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/reconsolidation-offline.mjs`; name-level use cannot be resolved |
| `src/memory/reconsolidation-report.ts:35` `ReconsolidationBundle` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/reconsolidation-offline.mjs`; name-level use cannot be resolved |
| `src/memory/retrieval.ts:13` `RetrievalComponents` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/retrieval.ts:44` `FusionSelectionDiagnostics` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/revisions.ts:19` `MemoryRevisionSnapshot` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/revisions.ts:20` `MemoryRevisionFile` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/revisions.ts:22` `revisionStatePath` | function | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/safety.ts:3` `MemorySafetyFinding` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/package-memory-outcome.mjs`; name-level use cannot be resolved |
| `src/memory/service.ts:105` `LinkInput` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/transfer.ts:7` `MEMORY_TRANSFER_VERSION` | variable | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/transfer.ts:10` `MemoryTransferRecord` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/transfer.ts:25` `MemoryTransferPayload` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/transfer.ts:37` `MemoryImportPlan` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/types.ts:12` `EvolutionKind` | type | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/types.ts:83` `MemoryRecordV1` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/types.ts:112` `MemoryHealthStatus` | type | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/workflow-verifier.ts:17` `WorkflowCase` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/portability/paths.ts:22` `discoverProjectRoot` | function | module is loaded dynamically or as a namespace by `scripts/memory/activate-canonical.mjs`, `scripts/verify/proposal-retention-review.mjs`; name-level use cannot be resolved |
| `src/portability/project-structure.ts:14` `PARALLEL_SKILL_HOMES` | variable | module is loaded dynamically or as a namespace by `scripts/portability/project-structure.mjs`; name-level use cannot be resolved |
| `src/portability/project-structure.ts:169` `inspectProjectStructure` | function | module is loaded dynamically or as a namespace by `scripts/portability/project-structure.mjs`; name-level use cannot be resolved |
| `src/portability/project-structure.ts:206` `synchronizeProjectStructure` | function | module is loaded dynamically or as a namespace by `scripts/portability/project-structure.mjs`; name-level use cannot be resolved |
| `src/rdc/tools/fuzzySearchCore.ts:42` `runFuzzySearch` | function | module is loaded dynamically or as a namespace by `src/rdc/tools/fuzzySearch.ts`; name-level use cannot be resolved |
| `src/rdc/tools/pdf/lib/evidence.ts:3` `PDF_EVIDENCE_MAX_BYTES` | variable | module is loaded dynamically or as a namespace by `scripts/verify/pdf-evidence-boundary-check.mjs`, `scripts/verify/pdf-tool-delivery-check.mjs`; name-level use cannot be resolved |
| `src/rdc/tools/pdf/lib/evidence.ts:5` `PDF_EVIDENCE_MAX_ITEMS` | variable | module is loaded dynamically or as a namespace by `scripts/verify/pdf-evidence-boundary-check.mjs`, `scripts/verify/pdf-tool-delivery-check.mjs`; name-level use cannot be resolved |
| `src/rdc/tools/pdf/lib/evidence.ts:6` `PDF_EVIDENCE_MAX_TEXT_CHARS` | variable | module is loaded dynamically or as a namespace by `scripts/verify/pdf-evidence-boundary-check.mjs`, `scripts/verify/pdf-tool-delivery-check.mjs`; name-level use cannot be resolved |
| `src/rdc/tools/pdf/lib/evidence.ts:13` `PdfEvidenceItem` | interface | module is loaded dynamically or as a namespace by `scripts/verify/pdf-evidence-boundary-check.mjs`, `scripts/verify/pdf-tool-delivery-check.mjs`; name-level use cannot be resolved |
| `src/rdc/tools/pdf/lib/evidence.ts:23` `PdfEvidencePage` | interface | module is loaded dynamically or as a namespace by `scripts/verify/pdf-evidence-boundary-check.mjs`, `scripts/verify/pdf-tool-delivery-check.mjs`; name-level use cannot be resolved |
| `src/rdc/utils/system-info.ts:6` `DockerMount` | interface | module is loaded dynamically or as a namespace by `scripts/release/release-compat.mjs`; name-level use cannot be resolved |
| `src/rdc/utils/system-info.ts:14` `ContainerInfo` | interface | module is loaded dynamically or as a namespace by `scripts/release/release-compat.mjs`; name-level use cannot be resolved |
| `src/rdc/utils/system-info.ts:32` `SystemInfo` | interface | module is loaded dynamically or as a namespace by `scripts/release/release-compat.mjs`; name-level use cannot be resolved |
| `src/rdc/utils/system-info.ts:763` `getDevelopmentToolGuidance` | function | module is loaded dynamically or as a namespace by `scripts/release/release-compat.mjs`; name-level use cannot be resolved |
| `src/semantic-ide/service.ts:46` `isRecoverableSemanticTransportError` | function | module is loaded dynamically or as a namespace by `scripts/semantic-ide-smoke.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:38` `SkillExportProfile` | type | module is loaded dynamically or as a namespace by `scripts/release/package-release.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:49` `SkillSourceProvenance` | interface | module is loaded dynamically or as a namespace by `scripts/release/package-release.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:70` `SkillExportResult` | interface | module is loaded dynamically or as a namespace by `scripts/release/package-release.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:131` `parseSkillMarkdown` | function | module is loaded dynamically or as a namespace by `scripts/release/package-release.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:272` `sanitizeSkillArchivePath` | function | module is loaded dynamically or as a namespace by `scripts/release/package-release.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:477` `SkillRetirementRecord` | interface | module is loaded dynamically or as a namespace by `scripts/release/package-release.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:485` `SkillRetirementListing` | interface | module is loaded dynamically or as a namespace by `scripts/release/package-release.mjs`; name-level use cannot be resolved |
| `src/tracker/activity-tracker.ts:8` `TrackerLevel` | type | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/tracker/activity-tracker.ts:9` `TrackerOutcomeProperty` | type | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/tracker/activity-tracker.ts:11` `TrackerFeatureOutcome` | interface | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/tracker/activity-tracker.ts:89` `ActivityTracker` | class | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/tracker/tool-invocation.ts:9` `ToolInvocationOutcome` | type | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/tracker/tool-invocation.ts:11` `InvocationTracker` | interface | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/tracker/tool-invocation.ts:27` `InvocationReconciliationTracker` | interface | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/tracker/tool-invocation.ts:55` `ToolInvocationRequest` | interface | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/verification/evidence-links.ts:26` `ClaimCoverage` | interface | module is loaded dynamically or as a namespace by `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/evidence-links.ts:35` `EvidenceLinkReport` | interface | module is loaded dynamically or as a namespace by `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/evidence-snapshot.ts:11` `EVIDENCE_REPORT_MAX` | variable | module is loaded dynamically or as a namespace by `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/evidence-snapshot.ts:18` `evidenceIdentity` | function | module is loaded dynamically or as a namespace by `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/evidence-snapshot.ts:44` `EvidenceSnapshot` | interface | module is loaded dynamically or as a namespace by `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:19` `WorkbookSpec` | type | module is loaded dynamically or as a namespace by `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:21` `WorkbookRuleReport` | interface | module is loaded dynamically or as a namespace by `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:25` `WorkbookAssertionReport` | interface | module is loaded dynamically or as a namespace by `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:30` `parseWorkbookSpec` | function | module is loaded dynamically or as a namespace by `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:36` `unavailableWorkbookReport` | function | module is loaded dynamically or as a namespace by `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |

### 1.4 Exports whose only production reference is a re-export statement (not listed as candidates)

A `export { x } from` in a reachable file counts as a reference to `x` (as on 2026-11-01), so these are not candidates. They are listed because the re-export may itself have no consumer; dropping the barrel line would make them candidates. 67 names.

| Symbol (`path:line`) | Kind | Only referenced by re-export in |
| --- | --- | --- |
| `src/memory/claim-review.ts:12` `claimReviewContractSchema` | variable | `src/memory/facade.ts` |
| `src/memory/claim-review.ts:28` `claimReviewWriteSchema` | variable | `src/memory/facade.ts` |
| `src/memory/claim-review.ts:47` `ClaimReviewContract` | type | `src/memory/facade.ts` |
| `src/memory/claim-review.ts:48` `ClaimReviewRead` | type | `src/memory/facade.ts` |
| `src/memory/claim-review.ts:49` `ClaimReviewWrite` | type | `src/memory/facade.ts` |
| `src/memory/controller-protocol.ts:7` `CONTROLLER_MEMORY_NOTICE` | variable | `src/memory/facade.ts` |
| `src/memory/controller-protocol.ts:16` `ControllerMemoryMethod` | type | `src/memory/facade.ts` |
| `src/memory/controller-protocol.ts:18` `ControllerMemoryResult` | type | `src/memory/facade.ts` |
| `src/memory/controller-protocol.ts:19` `ControllerMemoryInput` | type | `src/memory/facade.ts` |
| `src/memory/controller-protocol.ts:20` `ControllerMemoryResponse` | interface | `src/memory/facade.ts` |
| `src/memory/controller-session.ts:63` `assessTaskContinuity` | function | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:14` `Digest` | re-export | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:14` `IsoInstant` | re-export | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:14` `Verification` | re-export | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:14` `RetentionTier` | re-export | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:14` `EpistemicType` | re-export | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:14` `TemporalClass` | re-export | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:15` `DisclosureView` | type | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:17` `ReadBudget` | interface | `src/memory/facade.ts` |
| `src/memory/disclosure.ts:18` `BudgetMetrics` | interface | `src/memory/facade.ts` |
| `src/memory/embedder.ts:15` `CloudflareEmbedderConfig` | interface | `src/memory/facade.ts` |
| `src/memory/experience-types.ts:44` `RecordKind` | type | `src/memory/facade.ts` |
| `src/memory/experience-types.ts:79` `EpisodeEventKind` | type | `src/memory/facade.ts` |
| `src/memory/experience-types.ts:81` `IngestionBinding` | type | `src/memory/facade.ts` |
| `src/memory/experience-types.ts:109` `ArtifactAvailability` | type | `src/memory/facade.ts` |
| `src/memory/initialize.ts:11` `MemoryRootOptions` | interface | `src/memory/facade.ts` |
| `src/memory/project-synthesis.ts:10` `ProjectSynthesis` | type | `src/memory/facade.ts` |
| `src/memory/project-synthesis.ts:12` `encodeProjectSynthesis` | function | `src/memory/facade.ts` |
| `src/memory/project-synthesis.ts:20` `buildProjectSynthesisAction` | function | `src/memory/facade.ts` |
| `src/memory/promotion.ts:55` `ConsolidationReview` | type | `src/memory/facade.ts` |
| `src/memory/prospective-intentions.ts:4` `INTENTION_PREFIX` | variable | `src/memory/facade.ts` |
| `src/memory/prospective-intentions.ts:14` `ProspectiveIntention` | type | `src/memory/facade.ts` |
| `src/memory/prospective-intentions.ts:21` `encodeIntention` | function | `src/memory/facade.ts` |
| `src/memory/prospective-intentions.ts:54` `intentionUpsert` | function | `src/memory/facade.ts` |
| `src/memory/revisions.ts:16` `KnowledgeInterval` | type | `src/memory/facade.ts` |
| `src/memory/service.ts:64` `ControllerRetrievalPolicy` | type | `src/memory/facade.ts` |
| `src/memory/service.ts:66` `MemoryLinkInput` | type | `src/memory/facade.ts` |
| `src/memory/service.ts:68` `RememberInput` | interface | `src/memory/facade.ts` |
| `src/memory/service.ts:81` `UpdateInput` | interface | `src/memory/facade.ts` |
| `src/memory/service.ts:93` `MemoryBatchOperation` | type | `src/memory/facade.ts` |
| `src/memory/service.ts:99` `MemoryBatchResult` | interface | `src/memory/facade.ts` |
| `src/memory/service.ts:112` `EvolutionResult` | interface | `src/memory/facade.ts` |
| `src/memory/service.ts:121` `EvolutionPreviewResult` | interface | `src/memory/facade.ts` |
| `src/memory/transfer-v2.ts:21` `MEMORY_TRANSFER_V2_VERSION` | variable | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:22` `MemoryTransferV2Policy` | interface | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:23` `MemoryTransferV2ExportOptions` | interface | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:30` `MemoryTransferV2Bundle` | type | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:31` `MemoryTransferV2Preview` | interface | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:32` `MemoryTransferV2Receipt` | interface | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:247` `exportMemoryTransferV2` | function | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:264` `previewMemoryTransferV2` | function | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer-v2.ts:287` `importMemoryTransferV2` | function | `src/memory/facade.ts`, `src/memory/transfer.ts` |
| `src/memory/transfer.ts:298` `MEMORY_TRANSFER_V2_VERSION` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:298` `exportMemoryTransferV2` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:298` `previewMemoryTransferV2` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:298` `importMemoryTransferV2` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:299` `MemoryTransferV2Policy` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:299` `MemoryTransferV2ExportOptions` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:299` `MemoryTransferV2Bundle` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:299` `MemoryTransferV2Preview` | re-export | `src/memory/facade.ts` |
| `src/memory/transfer.ts:299` `MemoryTransferV2Receipt` | re-export | `src/memory/facade.ts` |
| `src/rdc/tools/fuzzySearchCore.ts:69` `recursiveFuzzyIndexOf` | function | `src/rdc/tools/fuzzySearch.ts` |
| `src/rdc/tools/pdf/extract-images.ts:18` `PageImages` | interface | `src/rdc/tools/pdf/index.ts` |
| `src/rdc/tools/pdf/lib/pdf2md.ts:32` `PdfPageItem` | interface | `src/rdc/tools/pdf/index.ts` |
| `src/rdc/tools/pdf/manipulations.ts:11` `PdfInsertOperation` | type | `src/rdc/tools/pdf/index.ts` |
| `src/rdc/tools/pdf/manipulations.ts:12` `PdfDeleteOperation` | type | `src/rdc/tools/pdf/index.ts` |
| `src/rdc/utils/files/factory.ts:122` `isImageFile` | function | `src/rdc/utils/files/index.ts` |

### 1.5 Refreshed result after the consolidation (edited working tree)

| Measure | Pre-change (`8b77ff8`) | Refreshed |
| --- | --- | --- |
| Source files | 438 | 438 |
| Source files reachable | 433 | 433 |
| Exports in reachable files | 2582 | 2584 |
| Exports with a production reference | 1753 | 1755 |
| Candidates | 829 | 829 |
| `UNREFERENCED IN SCOPE` | 415 | 415 |
| `TEST-ONLY` | 175 | 175 |
| `UNCERTAIN` | 239 | 239 |

Candidate set difference caused by this run: 0 added, 0 removed, 0 changed verdict. The two new exports are referenced, so neither is a candidate: `sha256Digest` (`src/agent-context-compaction.ts`) by `src/agent-turn-checkpoint.ts`, and `pathInside` (`src/portability/paths.ts`) by `src/semantic-ide/path-safety.ts`, `src/code-intelligence/workspace-resolver.ts` and `src/code-intelligence/grafel-runtime.ts`. The removed copies were private helpers, and `inside` stays exported from `path-safety.ts` as a re-export.

### 1.6 Cross-check: real `rg -w` against the in-memory word index

Sample: every 6th `UNREFERENCED` row, 60 rows, searched with real ripgrep (`rg -w -l <name> src tests scripts`) in the frozen worktree. The number of other files containing the whole word agrees with the index for **59 of 60** rows; disagreements: `src/rdc/utils/logger.ts::log (index 104, rg 122)`. The word match is syntactic: a string, comment or unrelated local with the same name counts as an occurrence, which is why the evidence column prints those files for review instead of treating them as uses.

## 2. Pass 2: duplicated logic

Method (same as 2026-11-01): every top-level function declaration and function-valued constant in non-test `src` TypeScript with a printed size of at least 90 characters (2,038 functions in 438 files) was fingerprinted twice: by exact printed text (ignoring the function's own name) and by structure after renaming parameters and locals. Pre-change result: 6 exact groups and 3 structure-only groups, each spanning two or more files. A second run with a 50-character floor found 4 more tiny exact groups and 3 more structure-only groups (helpers such as `reject`/`deny`, `compare`, `json`); they were reviewed and left alone (section 2.2). The code added by the 24 commits (Native compaction digests, the mtime state cache, the `memory_search` and `controller_learning` stage timing, Plan mode) was also read for repeated behavior: only the digest helper below repeats.

### 2.1 Consolidated (2 groups, 7 files edited, no module created)

| Group | Original locations | Canonical owner | Updated callers | Equivalence evidence |
| --- | --- | --- | --- | --- |
| Native turn digest | `src/agent-context-compaction.ts:55` `sha`; `src/agent-turn-checkpoint.ts:112` `digest` | `src/agent-context-compaction.ts` `sha256Digest` (now exported; `agent-turn-checkpoint.ts` already imported this module, so no new edge) | `compactTurnMessages` and `summarizeConversationPrefix` call it directly; `agent-turn-checkpoint.ts` imports it as `digest`, so its three call sites are unchanged; its `createHash` import was dropped | Identical bodies: `'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex')` |
| Path containment ("candidate is root or below it") | `src/semantic-ide/path-safety.ts:14` `inside`; `src/semantic-ide/provider-provisioning.ts:175` `inside`; `src/code-intelligence/workspace-resolver.ts:36` `within`; `src/code-intelligence/grafel-runtime.ts:40` `pathInside` | `src/portability/paths.ts` `pathInside` (the generic path module that already owns `comparablePath`, imports only node built-ins) | `path-safety.ts` imports it as `inside` and still exports `inside`, so every existing importer (`rdc/checkpoints`, `semantic-ide/*`) is unchanged; `provider-provisioning.ts` imports `inside` from `path-safety.js`; `workspace-resolver.ts` imports it as `within`; `grafel-runtime.ts` imports `pathInside` | Same expression over `comparablePath` in all four, same argument order (candidate, root); call sites of each file read before the edit |

Line endings were checked before each edit (`git ls-files --eol`): `agent-turn-checkpoint.ts` is mixed LF/CRLF, so its edit was made byte for byte and each line kept its own ending; the other files are LF.

### 2.2 Left as `OPEN` (equivalence not established, or the merge would couple unrelated modules)

| Group | Locations | Reason |
| --- | --- | --- |
| `sha256:`+hex of a string, other copies | `src/mcp/mutation-safety.ts:51`; `src/memory/page.ts:16`; `src/memory/transfer.ts:46` (same body as the new `sha256Digest`); reported by a `/simplify` reviewer and not verified identical: `src/mcp/phone-game-tools.ts:21`, `src/agent-profile.ts:29`, `src/external-partner-capability.ts:7` | Several subsystems; importing a Native agent module into `src/mcp`, `src/memory` or the others would add a dependency in the wrong direction, and there is no neutral owner for a one-line function |
| JSON digest `'sha256:' + hash(JSON.stringify(value))` | `src/learning/decision-review.ts:72`, `src/memory/evaluation/retrieval-diversity.ts:24` | Two unrelated owners |
| bare-hex `sha256` | `src/learning/external-controller.ts:214`, `src/mcp/failure-loop-advisor.ts:44` | `learning` and `mcp` are separate subsystems |
| `fail` | `src/memory/episodes.ts:46`, `src/memory/promotion.ts:92` | Tiny; each sits next to its own error type |
| `ref` | `src/memory/revisions.ts:24`, `src/memory/temporal.ts:48` | Tiny; would make one module import the other |
| Assertion helper (structure only) | `src/memory/evaluation/retrieval-verifier.ts:6` `requireCondition`, `src/memory/outcome/verifier.ts:8` `requireValue` | Two independent verifiers whose `ObjectValue` and `Obj` types differ |
| Trimmed bounded text (structure only) | `src/memory/provenance.ts:26` `boundedText`, `src/memory/retrieval-ledger.ts:121` `optionalText` | Identical behaviour, but `src/memory` has no text utility module; a new module for four lines adds coupling (same reasoning as `ref` and `fail` on 2026-11-01) |
| Small digests, 50-character floor | `evidenceDigest` (`src/verification/evidence-snapshot.ts:12`) and `workbookDigest` (`src/verification/workbook-input.ts:15`), both exported; `hash` in `retrieval-verifier.ts:22` and `reconsolidation-report.ts:14`; `compare` (3 copies), `json`, `reject`/`deny`, `fail` in `proposal-documents.ts:56`/`transfer-v2.ts:36` | Written as independent adoption modules ("no donor source copied"); each is one line. Not merged. |

### 2.3 Checks run

- `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`: exit 0 on the final tree. The first run after the path-containment edit exited 1 and 35 tests failed with `ReferenceError: inside is not defined`: my own edit had replaced the local `inside` in `path-safety.ts` with `export { pathInside as inside }`, which exports a name but creates no local binding, and the file still calls `inside` four times. Fixed by importing it as `inside` and exporting that binding.
- Native digest edit: 8 test files (187 tests). `tsc` exit 0; 183 passed, 4 failed. The same 4 tests also fail at pure `HEAD` without the edit (section 2.4), so none is caused by it.
- Path-containment edit, final run: 42 files (404 tests) covering `semantic-ide-*`, `code-intelligence-*`, `grafel-*`, `portability-*`, `project-structure*`, `restart-tool`, `command-guards`, checkpoints and `task-changes`: 400 passed, 3 failed. Two are the known red tests with identical figures (section 2.4). The third, `semantic-ide-csharp-project-open` "reports partial evidence when the project-open set is truncated", took 12.2 s of a 15 s limit while 41 other files ran; run alone it passes 3 of 3 in 6.1 s.
- `skills` read-only fix (section 2.5): the new test was red (7 failed, 16 passed) before the change; afterwards the new test and 7 neighbouring files pass (79 tests) and the 3 Plan-mode tests in `agent-controller.test.ts` (`-t "PLAN-1"`) pass.
- `git ls-files --eol` before and after: no file changed its line-ending style.

### 2.4 Red tests: pre-existing and unchanged by this run

| Test | At `HEAD 8b77ff8`, before any edit | After the consolidations |
| --- | --- | --- |
| `tests/mcp-manifest-contract.test.ts` "keeps the full optional-cohort manifest inside the handshake budget" | fails: 132,877 bytes against a 131,072 budget (132,791 on 2026-11-01: +86 bytes since) | fails with the identical figure; no tool name, description or schema changed |
| `tests/semantic-ide-provisioning.test.ts` "requires the explicit public confirmation token before provisioning" | times out at 15,000 ms (19.0 s) | times out at 15,000 ms (23.1 s) |
| `tests/game-mode-advanced.test.ts` "passes expectedPackage through phone_run_macro …" | times out at 15,000 ms (21.5 s) | passes in the 42-file run; its timeout is load dependent |
| `tests/agent-controller.test.ts`, `tests/agent-chat-service.test.ts`, `tests/agent-chat-attachments-wiring.test.ts` | at pure `HEAD`: 6 tests fail (timeouts of 15 s, `EBUSY` and `ENOTEMPTY` on `runtime/tmp`, an `expect(...).not.toHaveProperty('messageOrigin')` mismatch) | with the Native digest edit: the 4 of those 6 that failed again are a subset of the HEAD failures |

How the comparison was made: the files touched by the Native digest edit were restored to `HEAD` from the object database (`git show HEAD:<path>`), the three agent test files were run, then the edit was restored from a copy (checked: `git diff --stat` showed the same 2 files, +5/-9). No stash, no checkout of other paths. Attempts per target: the red tests ran once at baseline and once after the edits, except `semantic-ide-provisioning`, which also ran in the first, broken post-edit run described in section 2.3. The agent test files ran twice (digest edit, pure HEAD).

### 2.5 Defect found by pass 3 and fixed: one read-only table for the `skills` tool (finding N1)

Two tables answered the same question and disagreed. The tool's own set (`src/mcp/skills-tools.ts:42`) treated 11 actions as read-only; the shared table in `src/mcp/mutation-safety.ts:358` listed 4. The Plan-mode hard gate (`src/agent-tool-session.ts:283-287`, `src/agent-controller.ts:1960-1965`) and the mutation journal use the shared table, so in Plan mode `skills` with `status`, `validate`, `list_revisions`, `list_retired`, `proposals`, `self_awareness` or `explain_improvement` was refused as `PLAN_MODE_READ_ONLY` and journaled as a mutation, although each only reads (checked in `src/skills/service.ts` and `src/mcp/skill-proposal-actions.ts`: `validateSource` is documented read-only and contains no write call; `proposals` only lists; `review_outcomes` publishes documents and `propose` and `decide_proposal` record decisions, so they stay out). The change keeps one owner: `mutation-safety.ts` lists all 11 read actions with a comment saying how they were verified, and `skills-tools.ts` asks `isReadOnlyToolCall('skills', undefined, input)` for its activity flag instead of keeping its own set. Test first: `tests/mutation-safety-skills-actions.test.ts` pins every one of the 21 schema actions to read or write, so a new action cannot be forgotten. This is a behaviour change on purpose (Plan mode now allows those seven reads), made in its own commit.

## 3. Pass 3: routes, pages, actions and MCP tools

Produced by one read-only subagent over the frozen worktree of `HEAD 8b77ff8`; the main agent re-read the headline findings (F1, N1, and the 42 zero-caller tool queries it cites) against the source. Section numbers inside this part use `3.x`; where the text says "section 5" or "table 5b" it means 3.5 and its table 5b. The subagent counted 22 commits in its brief; the real count in `319def1..8b77ff8` is 24, which changes nothing it reports.

**Agent Core entry-point inventory, refresh 2026-11-02.** Source: frozen read-only copy of commit `8b77ff8` (tree `scratchpad/wt-head`), refreshing the 2026-11-01 inventory (commit `319def1`, baseline source `055a856`, `docs/verification/Maintenance-Pass-20261101.md` lines 951-1238). Scope: `src/`, `tests/`, `scripts/`, `src/ui/` (React SPA), `src/launcher/*.cs`. All `path:line` values are relative to the repository root of that tree. Static reading only: no build, test, install, network call or server run. `git log/diff` was used read-only in the live repository to attribute changes to commits.

Abbreviations used inside tables (each resolves to a repo-root path):
`app.ts` = `src/http/app.ts`; `svc` = `src/oauth/service.ts`; `CS` = `src/launcher/AgentCoreRuntime.cs`; `MF` = `src/launcher/MainForm.cs`; `U/` = `src/ui/src/`; `T/` = `tests/`; `S/` = `scripts/verify/` (in section 5 only); `NCB` = `scripts/external/native-chat-bridge.mjs`; `gw` = `scripts/tunnel/public-mcp-gateway.mjs`; `SCT` = `scripts/windows/Start-Cloudflare-Tunnel.ps1`; `RA` = `scripts/windows/Restart-Agent-Core.ps1`; `CT` = `docs/Cloudflare-Tunnel.md`.

Framework facts: one plain Node HTTP server (`src/index.ts:276` `createServer(createHttpHandler(...))`, listens at `src/index.ts:353`, host `AGENT_CORE_HOST` default `127.0.0.1` `src/config.ts:201`, port `AGENT_CORE_PORT` default 8765 `src/config.ts:125`); no router library; MCP tools registered with `server.registerTool`; React 19 + Vite SPA in `src/ui` served only by the WebView2 virtual host (not by Node); C# WinForms/WebView2 launcher. There is no Next.js.

Verdict vocabulary: `CALLED` = a named in-repository caller exists; `TEST-ONLY` = only tests call it; `NO IN-REPOSITORY CALLER FOUND` = the exact negative query is given; such entries are classified as framework/dispatch-only, direct browser access, public API/webhook, external integration, or unresolved dynamic call, never as "unused" without that classification.

### 3.0 Delta vs 2026-11-01

Net result of the 24 commits `319def1..8b77ff8` (`git log --oneline` prints 24; the brief named 22, and the seven it did not list are `8b77ff8`, `1b438f1`, `052d1ab`, `52e6d01`, `d36bee5`, `0cc30d9`, `ae6d8f3`, none of which adds a route, tool, message, action or page: docs, a CSS width, regression tests plus a cache fix, a `.bat` launcher and a hook script) on entry points: 0 routes added, 0 removed, 0 renamed; 2 routes moved (made reachable); 0 MCP tools added/removed/renamed (84 registrations, 83 names, all 84 registration lines identical to yesterday); 0 launcher messages or actions added/removed; 0 UI pages added/removed. Changed contracts: the `turns` route body gains `planMode`; the `skills` tool gains two actions; Native no longer has an MCP-transport fallback.

| Kind | Entry | Change | Evidence | Commit |
|---|---|---|---|---|
| Route | R25 `GET /agent/skills` | MOVED out of the `/agent/chat/` branch to top level; now reachable (F1 closed) | `src/http/app.ts:184` (was `:435` inside the block `:182-525`) | 4a60b82 |
| Route | R26 `POST /agent/skills/:name/native-enabled` | MOVED the same way; reachable | `src/http/app.ts:213-214` (was `:464`) | 4a60b82 |
| Route body | R25 response field `digest` | now strips the `sha256:` prefix before the 8-character slice | `src/http/app.ts:198` | 4a60b82 |
| Route body | R21 `POST /agent/chat/conversations/:id/turns` | NEW optional boolean `planMode`; new 400 codes `invalid_agent_chat_plan_mode` and `agent_chat_goal_and_plan_mode_exclusive`; forwarded to `chat.runTurn` | `src/http/app.ts:374-381`, `:420` | 779e6ae (PLAN-1), f50621f (PLAN-2) |
| Route lines | R15-R24, R27-R30, R09, R08 | pure line drift (the skills block now sits above the chat branch, plan-mode validation added inside it). Old -> new: chat branch `182 -> 244`; R15 `190 -> 252`; R16 `198 -> 260`; R17 `219 -> 281`; R18 `230 -> 292`; R19 `250 -> 312`; R20 `270 -> 332`; R21 `281 -> 343`; R22 `372 -> 443`; R23 `402 -> 473`; R24 `409 -> 480`; R27 `495 -> 506`; R28 `502 -> 513`; R29 `509 -> 520`; R30 `523 -> 534`; R09 `527 -> 538`; `/mcp` guard `569 -> 580`; log filters `595-596 -> 606-607`. Unchanged: R01 `137`, R10 `143`, R11/R12 `151`, R13 `157`, R14 `163`, all of `src/oauth/service.ts` (R02-R07) and `src/mcp/handler.ts:160` | `src/http/app.ts` | 4a60b82, 779e6ae |
| Tool | all 83 names / 84 registrations | none added, removed or renamed; every registration `path:line` is identical to yesterday's table | section 5, `inv-scripts/out/tools.json` | none |
| Tool action | `skills` actions `retire`, `list_retired` | ADDED (schema enum, validation, dispatch `case`, read-only set) | `src/mcp/skills-schemas.ts:18`, `:76`, `:96-103`; `src/mcp/skills-tools.ts:42`, `:91-92`; service `src/skills/service.ts:1415` (`retireSkill`), `:1465` (`listRetired`) | adff9d9 |
| Tool support | `hasReadOnlyAction` | NEW export used by the Plan-mode dispatch gate | `src/mcp/mutation-safety.ts:370`; caller `src/agent-tool-session.ts:298` | 779e6ae |
| Native dispatch | `McpToolPort`, `useMcpTransport`, env switch `AGENT_CORE_NATIVE_TOOL_TRANSPORT=mcp` | REMOVED; `ToolPort.kind` narrowed to `'direct'`; `transport` getter is now constant | `src/agent-tool-session.ts:81`, `:173` (no remaining hit for the three removed names under `src tests scripts`) | 3ede662 |
| Launcher message | `agent-chat-send` payload | gains `planMode` (read in the launcher, forwarded as JSON `planMode`) | `src/launcher/MainForm.cs:624`, `:639`; `src/launcher/AgentCoreRuntime.cs:342`, `:353` | f50621f |
| Launcher messages | 28 inbound types, 32 outbound types | none added/removed (same set as yesterday's 28 inbound types) | section 2 | none |
| Launcher actions | 17 `ExecuteActionCoreAsync` cases | none added/removed; case lines moved +4 (`512-542` -> `516-546`) by new code earlier in the file | `src/launcher/AgentCoreRuntime.cs:511` (method), cases `:516-546` | f5dd6ee |
| Launcher internals | watchdog and Cloudflare recovery | watchdog now starts in `InitializeAsync`; Cloudflared Windows-service detection added. No new HTTP route, message or action | `src/launcher/AgentCoreRuntime.cs:71-73`, `:827-833`, `:858`, `:863` | f5dd6ee |
| UI | Plan mode toggle in the chat composer | NEW control, not a page | `src/ui/src/pages.tsx:752-755`; `src/ui/src/App.tsx:340`, `:365` | f50621f |
| UI | 15 page ids / 13 nav items | none added/removed; `RotateCcwIcon` moved `784 -> 799`, `SettingToggle` now `801` (dead legacy helpers, F3) | `src/ui/src/pages.tsx:799`, `:801` | f50621f |
| Script | `scripts/verify/claude-code-post-edit-check.mjs` | NEW hook entry point (stdin JSON; wired outside the tree) | `scripts/verify/claude-code-post-edit-check.mjs:1-4`, only in-repo caller `tests/claude-code-post-edit-check.test.ts:2` | ae6d8f3 |
| Root launcher | `Launch-Claude-Teleport.bat` | NEW, outside the three scopes; no in-repo caller | `Launch-Claude-Teleport.bat:1-3` | 0cc30d9 |
| Tests (new files) | 8 test files | `tests/agent-chat-plan-mode-route.test.ts`, `tests/agent-runtime-normalize-cache.test.ts`, `tests/agent-skills-http.test.ts`, `tests/claude-code-post-edit-check.test.ts`, `tests/external-controller-state-cache.test.ts`, `tests/memory/memory-search-touch-nonblocking.test.ts`, `tests/skill-retirement.test.ts`, `src/launcher.tests/StartupRecoveryTests.cs`, all under `tests/` except the C# one | `git diff --name-status 319def1 8b77ff8 -- src scripts tests`, commit per file via `git log --diff-filter=A` | `agent-chat-plan-mode-route` 779e6ae; `agent-runtime-normalize-cache` 3c46f54; `agent-skills-http` 4a60b82; `claude-code-post-edit-check` ae6d8f3; `external-controller-state-cache` d36bee5; `memory/memory-search-touch-nonblocking` d36bee5; `skill-retirement` adff9d9; `StartupRecoveryTests.cs` f5dd6ee |
| Verdict method | tool callers | STRICTER rule than yesterday (a catalog row or a name-listing test no longer counts as a caller): 42 tools `NO IN-REPOSITORY CALLER FOUND` (yesterday 33), 35 `TEST-ONLY` (yesterday 5), 6 `CALLED` (yesterday 45). Nine tools changed class only because of the rule: `code_refactor`, `code_symbol`, `code_workspace`, `list_directory`, `list_processes`, `read_process_output` (CALLED -> NO CALLER) and `get_prompts`, `memory_update`, `stop_search` (TEST-ONLY -> NO CALLER) | section 5 | none (method) |

### 3.0b Findings F1-F7 and new findings

#### Yesterday's findings re-checked against the frozen tree

| # | Status | Evidence now | What changed |
|---|---|---|---|
| F1 skills routes unreachable | **CLOSED** | `GET /agent/skills` is now dispatched at `src/http/app.ts:184` (`if (route === '/agent/skills')`), `POST .../native-enabled` at `src/http/app.ts:213-214`; both sit BEFORE the chat branch `src/http/app.ts:244` and carry their own `authorizeAgentUi` (`:185`, `:215`). HTTP-level test now exists: `tests/agent-skills-http.test.ts:52-87` (list, toggle, 404/400/405, 401, 503) using `createHttpHandler`. End-to-end chain intact (read, not executed; the launcher leg has no automated test: `src/launcher.tests` has none for skills and the UI tests mock the host): `U/App.tsx:275-281` (`agent-skills-list` on every visit to `#skills`) -> `MF:494-499` -> `CS:285` -> `app.ts:184`; `U/App.tsx:411` (`agent-skill-set`) -> `MF:507-516` -> `CS:293` -> `app.ts:213`. | Fixed by moving the two branches out of the chat block (commit 4a60b82). Launcher leg checked by reading: `CS:290-296` posts JSON `{"enabled": <bool>}` with `application/json` to `/agent/skills/{name}/native-enabled`, matching the parser at `app.ts:229-235`; `U/LauncherPages.tsx:142` `shortDigest` strips any prefix up to `:` and slices 8 characters, so the prefix-free digest from `app.ts:198` displays unchanged. Side effects verified: 404 now stops at `skill_not_found` only for an unknown name; the `digest` field drops the `sha256:` prefix before the 8-char slice (`app.ts:198`). |
| F2 `POST /agent/run` has no UI trigger | **OPEN** (unchanged) | Chain still ends at a prop nobody calls: `U/App.tsx:315-318` defines `onAgentRun` and posts `agent-run`; `U/App.tsx:470` passes it; `U/pages.tsx:45` (type), `:805-806` (destructure and spread into `props`). Query `rg -n -F -e "onAgentRun(" src/ui/src` returns no match at all (the prop is only defined, passed and, in tests, mocked as `onAgentRun={...}`); tests only pass mocks (11 test files, e.g. `U/ChatStatusBar.test.tsx:13`). Launcher path still works: `MF:733-751` -> `CS:141-144`. | Nothing in the 24 commits touched it. |
| F3 legacy pages in `pages.tsx` unreachable | **OPEN** (unchanged, list extended) | Zero references outside their own file: `DashboardPage` `U/pages.tsx:100`, `CoreRuntimePage` `:146`, `SystemsPage` `:202` (+ `SystemInspector` `:225`), `DiagnosticsPage` `:321`, `SettingsPage` `:344`; `ActivityLogPage` `:243` (+ `LogInspector` `:282`) referenced only by tests (`U/ActivityLogScreenshot.test.tsx:6`, `U/ActivityLogVisualVariants.test.tsx:6`, `U/ToolExecutionEnhancement.test.tsx:4`, `U/ActivityLifecyclePresentation.test.tsx:3`). The dead closure computed by `inv-scripts/legacy-closure.mjs` also contains helpers yesterday did not list: `levelTone` `:77`, `latest` `:78`, `memoryPercent` `:79`, `Breadcrumb` `:86`, `HealthCounts` `:90`, `ChevronDownIcon` `:276`, `prettyModule` `:278`, `buildChecks` `:303`, `RotateCcwIcon` `:799`, `SettingToggle` `:801`. Live code instead: `ReferenceUi` `U/pages.tsx:805-812` with the chain at `:807`. | `RotateCcwIcon` moved `784 -> 799` (plan-mode commit f50621f). Retain per the maintenance rule. |
| F4 launcher actions without sender | **OPEN** (unchanged, lines +4) | `activity-monitor` `CS:516` and `tunnel-details` `CS:519`; query `rg -n -F -e "activity-monitor" -e "tunnel-details" src tests scripts extensions tunnel-client .github` returns only the two `case` labels. | Line shift only (f5dd6ee added code above). |
| F5 tools without literal caller | **CHANGED** (method) | Registration set is identical (83 names, 84 registrations). With the stricter rule used in this refresh, 42 of 83 names have `NO IN-REPOSITORY CALLER FOUND` (section 5b); yesterday's 33 used a looser rule that counted a catalog row plus a listing test as a caller. All 42 stay reachable through `POST /mcp` (R08), and 35 of them (those with a catalog row; the 7 memory mutators `memory_batch`, `memory_delete`, `memory_evolve`, `memory_import`, `memory_reindex`, `memory_remember`, `memory_update` have none) through Native dispatch. | Nine reclassifications are listed in the delta table; none is caused by code movement. |
| F6 `scripts/release/release-compat.mjs` stale | **OPEN** (unchanged) | `scripts/release/release-compat.mjs:176` still lists `src/mcp/partner-tools.ts` and `:190` `src/mcp/partner-schemas.ts`, neither file exists in the tree; `publicRoutes()` regex at `:53` only matches `route === '...'`/`pathname === '...'`, so it sees `/agent/skills` (top level since 4a60b82) but not any `route.match(...)` route (steps, detail, turns, resume, pause, compact, cancel, archive, native-enabled); manifest check hard-codes `toolCount !== 79` at `:209`; `tests/mcp-manifest-contract.test.ts:71` also expects 79 (that fixture omits `memory_v2_read`, `memory_v2_write`, `artifact_inspect`, `controller_learning`: 83 - 4 = 79). `git diff --stat 319def1 8b77ff8 -- scripts/release` is empty. | None. |
| F7 `/health` and `/favicon.ico` are log filters | **OPEN** (informational, lines +11) | `src/http/app.ts:606` (`route === '/health'` skips the finish logger) and `:607` (`/favicon.ico` 404 skipped); no `/favicon.ico` handler exists. | Line shift only. |

#### New findings introduced or exposed by the 24 commits

| # | Severity | Finding | Evidence | Commit |
|---|---|---|---|---|
| N1 | medium (inferred from source, not executed) | Two divergent read-only action tables for the `skills` tool. The tool's own set treats 11 actions as read-only (`status`, `list`, `inspect`, `search`, `read`, `validate`, `list_revisions`, `list_retired`, `proposals`, `self_awareness`, `explain_improvement`); the shared mutation-safety table lists only 4 (`list`, `inspect`, `search`, `read`). The Plan-mode hard gate and the mutation journal use the second table, so in Plan mode `skills` with `status`, `validate`, `list_revisions`, `list_retired`, `proposals`, `self_awareness` or `explain_improvement` is refused as `PLAN_MODE_READ_ONLY` although the tool itself classifies them as reads; the newly added `list_retired` was added only to the first table. | `src/mcp/skills-tools.ts:42` vs `src/mcp/mutation-safety.ts:358-360`; gate `src/agent-tool-session.ts:283-287` (`isMutating`), `src/agent-controller.ts:1960-1965` (`planModeDenied`); presented-schema filter `src/agent-tool-session.ts:289-299` (`hasReadOnlyPath`) | adff9d9 (list_retired), 779e6ae (gate) |
| N2 | low | `skills` actions `retire` and `list_retired` have no in-repository application caller and no tool-level test: tests cover the service (`tests/skill-retirement.test.ts:21-49`) and the schema (`:78`, `:85`), not the `case 'retire'` / `case 'list_retired'` dispatch. Externally reachable only through `POST /mcp` (R08). | `src/mcp/skills-tools.ts:91-92`; `tests/skill-retirement.test.ts:21`, `:78`, `:85` | adff9d9 |
| N3 | low | Host messages `agent-chat-pause-result` and `agent-chat-cancel-result` are sent by the launcher but have no UI receiver; they exist only as type declarations. The UI relies on the `agent-chat-state` message that follows. (Existed on 2026-11-01; first reported here.) | senders `MF:672`, `MF:677`; declarations `U/host.ts:561`, `:564`; no branch in `U/App.tsx:70-240` (query `rg -n -F -e "agent-chat-pause-result" -e "agent-chat-cancel-result" src` returns only `U/host.ts:561,564` and `MF:672,677`) | pre-existing |
| N4 | low | `AgentRuntimeToolSession.transport` is now a constant (`'direct'`) after the fallback removal and its only caller is a test; `ToolPort` has a single implementation (`DirectToolPort`). | `src/agent-tool-session.ts:81`, `:173`; sole reference `tests/in-process-tool-host.test.ts:124` | 3ede662 |
| N5 | low (inferred from source, not executed) | Inconsistent error handling in the moved skills route: the list branch wraps `options.skills.list()` in try/catch and answers 503 (`app.ts:191-207`), but the toggle branch calls `options.skills.list()` (`app.ts:221`) and `setEnabled` (`app.ts:236`) unguarded, so a failing catalog read ends in the generic 500 `internal_error` from `src/http/app.ts:629-631`. | `src/http/app.ts:221`, `:236` | 4a60b82 |
| N6 | info | `scripts/verify/claude-code-post-edit-check.mjs` is a Claude Code hook entry point wired in `.claude/settings.local.json` (per its header comment, `:3`), which is outside the tracked tree; its only in-repository caller is the test. Classification: external integration. | `scripts/verify/claude-code-post-edit-check.mjs:1-4`; `tests/claude-code-post-edit-check.test.ts:2` | ae6d8f3 |
| N7 | info | `Launch-Claude-Teleport.bat` (repo root) has no caller (direct user execution), hard-codes `E:\Projects\Agent-Core` and a Claude session id. Outside the three scopes, listed for completeness. | `Launch-Claude-Teleport.bat:2-3` | 0cc30d9 |
| N8 | info | No new route, tool, launcher message/action or page was added without a caller. The one new request field (`planMode`) has a complete chain: toggle `U/pages.tsx:752` -> `U/App.tsx:365` -> `MF:624,639` -> `CS:353` -> `app.ts:374,420` -> `chat.runTurn`, with tests `tests/agent-chat-plan-mode-route.test.ts:38-84` and `U/App.test.tsx` (36 added lines). | as listed | 779e6ae, f50621f |

### 3.1 HTTP routes

Dispatch order in `handleRequest` (`src/http/app.ts:128`): `/health` (`:137`) -> `/agent/workflows` (`:143`) -> `/agent/proposals[/read]` (`:151`) -> `/agent/task-changes` (`:157`) -> `/agent/dreaming` (`:163`) -> `/agent/skills` (`:184`) -> `/agent/skills/:name/native-enabled` (`:213`) -> chat branch `/agent/chat/*` (`:244`) -> `/agent/run` (`:538`) -> `oauthService.handle` (`:578`, `src/oauth/service.ts:111`) -> `route !== '/mcp'` 404 (`:580`) -> `/mcp` (origin `:585`, auth `:590`, handler `:598`). There is no URL rewrite, redirect table, CORS/OPTIONS handler or static-file branch in `src/http`, `src/oauth`, `src/mcp/handler.ts` or `src/index.ts` (queries `rg -n -i -e "access-control" src/http src/oauth src/mcp src/index.ts`, `rg -n -w -e "OPTIONS" src/http src/oauth src/mcp src/index.ts` and `rg -n -e "createReadStream" -e "serve-static" -e "sendFile" src/http src/oauth src/mcp/handler.ts src/index.ts` all return nothing). Streams: only the two NDJSON routes R21 and R22 (`content-type: application/x-ndjson`, `app.ts:406-409`, `:446-449`); `/mcp` may answer with the MCP SDK's JSON or event-stream body, chosen inside `src/mcp/handler.ts:124-141`. No SSE endpoint and no `EventSource`/`WebSocket` client exists in the tree (the one `text/event-stream` literal, `src/phone/gateway.ts:75`, is an outbound `accept` header).

"UI-token auth" = `authorizeAgentUi` (`app.ts:86-106`): loopback check (`src/http/security-policy.ts:138`) + header `x-agent-core-ui-token` compared in constant time with `AGENT_CORE_UI_TOKEN` (`src/config.ts:312`), which only the launcher sets (`CS:1382`). The header `x-agent-core-chat-origin: external-controller` marks calls from `NCB`.

UI note: the SPA contains no `fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource` (query `rg -n -e "fetch\(" -e "XMLHttpRequest" -e "WebSocket" -e "EventSource" src/ui/src -g '!*.test.*'` returns nothing), so every UI-to-server path goes `postHost` -> launcher (section 2) -> `CS` -> HTTP. "UI" in the caller columns therefore means the message chain, shown as `CS:line <- MF:line <- U/file:line`.

#### 3.1a Node server routes (`src/http/app.ts`, `src/oauth/service.ts`): 30 entries

| ID | Method | Pattern | Declaration | Dispatch evidence (enclosing condition) | Auth / exposure | Application callers | Test callers | Class |
|---|---|---|---|---|---|---|---|---|
| R01 | GET | `/health` | `src/http/app.ts:137-141`; payload `src/index.ts:288` | `app.ts:137` `request.method === 'GET' && route === '/health'` | none (no loopback check); not allowlisted at the tunnel gateway (`gw:7-9`), `SCT:103` asserts 404 through the tunnel | `CS:971` (`IsCoreReadyAsync`), `CS:1036` (snapshot probe); `RA:491`; `scripts/windows/Invoke-ActivityLog-Cutover.ps1:154`, `...-V2.ps1:154`, `...-V3.ps1:154`; `SCT:103` (negative check). No other src module or UI call (`U/systems.ts:99,105,111,117` are display strings `'/health.skills'`; `src/phone/controller.ts:479,515`, `src/rdc/config-manager.ts:134` are comments) | `T/http-auth.test.ts:36,49`; `T/authenticity-maintenance.test.ts:81`; `T/desktop-status.test.ts:41`; `T/process-identity.test.ts:84`; `T/restart-readiness.test.ts:168` (fixture server: tests the PowerShell probe, not this route); `T/memory/memory-maintenance.test.ts:277,280`; `src/launcher.tests/HealthResponseTimeoutTests.cs:49` | CALLED |
| R02 | GET | `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` | `svc:120-123` (body `:124-131`) | prefix gate `svc:114`; reached through `app.ts:578` | none; public via `gw:9` | `CS:787` (launcher waits for it before starting tunnel-client); `svc:97` (401 `www-authenticate` header advertises the `/mcp` variant); `SCT:99,113`; external OAuth clients (ChatGPT, Claude via the Worker) | `T/oauth.test.ts:64,196,198` | CALLED; public API |
| R03 | GET | `/.well-known/oauth-authorization-server` | `svc:134` (body `:135-147`) | `svc:114`, `app.ts:578` | none; public | `svc:127` (R02 body points to it); `SCT:100` | `T/oauth.test.ts:70` | CALLED; public discovery |
| R04 | POST | `/oauth/register` | `svc:149` (body `:150-183`; rate limit `svc:75-77,150`) | `svc:114`, `app.ts:578` | none, shared 20/min window; public | none (query `rg -n -F -e "/oauth/register" src scripts extensions tunnel-client` returns `svc:75,140,149` only: handler, comment, discovery document) | `T/oauth.test.ts:48`; `T/oauth-registration-limits.test.ts:75` | NO IN-REPOSITORY CALLER FOUND (application); public API / external integration (connectors register themselves) |
| R05 | GET | `/oauth/authorize` | `svc:186` (`renderAuthorizationForm` `:267`) | `svc:114`, `app.ts:578` | validates client, redirect, PKCE S256, resource; public | `SCT:102` (expects 400 on empty request); browsers redirected by connectors | `T/oauth.test.ts:102,117,205` | CALLED (operator script); direct browser access |
| R06 | POST | `/oauth/authorize` | `svc:191` (`approveAuthorization` `:293`) | `svc:114`, `app.ts:578` | API key typed in the form; public | own HTML form `svc:278` (`action="/oauth/authorize"`) | `T/oauth.test.ts:151,205` | CALLED (own form) |
| R07 | POST | `/oauth/token` | `svc:196` (`exchangeToken` `:326`) | `svc:114`, `app.ts:578` | client secret + PKCE or refresh token; public | none (query `rg -n -F -e "/oauth/token" src scripts extensions tunnel-client` returns `svc:139,196` only) | `T/oauth.test.ts:158,217`; `T/oauth-atomic-exchange-review.test.ts:23` | NO IN-REPOSITORY CALLER FOUND (application); public API / external integration |
| R08 | any (only POST served) | `/mcp` | `app.ts:580-598`; handler `src/mcp/handler.ts:144-200`, POST-only gate `handler.ts:160`; wired `src/index.ts:329` | `app.ts:580` `route !== '/mcp'` falls through to the guarded section | `validateMcpOrigin` (`security-policy.ts:108`), Bearer API key or OAuth token (`src/http/auth.ts:13`), per-key tool grants, `controller_contract`. Public via `gw:7` and the OpenAI tunnel | `S/native-chat-completion.mjs:13`; `S/mcp-external-acceptance.mjs:144,262`; `S/mcp-task-effectiveness-eval.mjs:143,295`; `gw:7` (proxy allowlist; forwards at `gw:31-48`); `tunnel-client/agent-core.example.yaml:19` (the local `tunnel-client/agent-core.yaml` is untracked, not in the tree); `SCT:101,114-115`; `src/index.ts:462` prints the URL only; MCP clients (ChatGPT via the tunnel, Claude via the Worker, the Codex key `S/native-chat-completion.mjs:8`) | 12 files, 18 lines, by what they exercise. Route level (real `createHttpHandler` or `startAgentCore`): `T/bridge-runtime.test.ts:37`; `T/http-auth.test.ts:61,63,79,95`; `T/image-inspect-http.test.ts:51`; `T/oauth.test.ts:139,169,226`; `T/trusted-proposal-http.test.ts:34`. Handler level only (bare server around `createMcpHttpHandler`, bypassing `app.ts:580-598`): `T/controller-contract.test.ts:134`; `T/learning-task-selector-http.test.ts:34`; `T/memory/memory-task-reconnect.test.ts:23`; `T/memory/memory-v2-host-integration.test.ts:150`; `T/web-research-mcp.test.ts:135`. Fixture MCP servers that register their own tools (they test the verify scripts, not this route): `T/mcp-external-acceptance-harness.test.ts:71,107`; `T/mcp-task-effectiveness-eval.test.ts:44` | CALLED; external MCP clients |
| R09 | POST (405 else) | `/agent/run` | `app.ts:538-576`; wired `src/index.ts:284` | `app.ts:538` `route === '/agent/run'`; own loopback `:543` and token `:551` checks (not `authorizeAgentUi`) | loopback + UI token; not public | `CS:144` (`RunAgentAsync` `CS:141`) <- `MF:744` (type `agent-run`, `MF:733`) <- `U/App.tsx:318`, but `onAgentRun` is never invoked (F2) | `T/agent-ui-transport.test.ts:164,170,188,205` | CALLED (launcher path); no UI trigger |
| R10 | GET (405 else) | `/agent/workflows` | `app.ts:143-149` | `app.ts:143`; auth `:144`, method `:145` | UI token | `CS:172` <- `MF:403` <- `U/WorkflowsPage.tsx:44` (page `#workflows`) | `T/workflows-http.test.ts:8`; `T/workflows-launcher-contract.test.ts:26` (source assertion); `U/WorkflowsPage.test.tsx:15` | CALLED |
| R11 | GET | `/agent/proposals` | `app.ts:151-155` -> `src/http/proposals.ts:6-26` (list `:15`; 503 when no reader `:10`, reader wired only if `learningService.hasSkillProposals()` `src/index.ts:278`) | `app.ts:151` `route === '/agent/proposals' \|\| route === '/agent/proposals/read'` | UI token | `CS:220` <- `MF:438` <- `U/ProposalCards.tsx:25` (rendered by live `PrototypeDashboard` `U/PrototypePages.tsx:36`; also by dead `DashboardPage` `U/pages.tsx:111`) | `T/proposal-http.test.ts:19,20,21,25` | CALLED |
| R12 | GET | `/agent/proposals/read?id&revisionDigest&documentDigest` | same branch; read `src/http/proposals.ts:17-19` | `app.ts:151` | UI token | `CS:228` <- `MF:444` <- `U/ProposalCards.tsx:32` | `T/proposal-http.test.ts:30,33,35` | CALLED |
| R13 | GET | `/agent/task-changes?taskId` | `app.ts:157-161` -> `src/http/task-changes.ts:14-21` | `app.ts:157` | UI token | `CS:200` <- `MF:421` <- `U/useTaskChanges.ts:40`, hosted by `U/TaskChangesPanel.tsx:97` (`U/LauncherPages.tsx:102`, `U/pages.tsx:681`) and `U/LauncherInspector.tsx:50` | `T/task-changes.test.ts:160,195` | CALLED |
| R14 | GET status / POST run (405 else) | `/agent/dreaming` | `app.ts:163-180` (GET `:169`, POST `:172-179`) | `app.ts:163`; rejects `x-agent-core-chat-origin` `:165` | UI token, owner only | `CS:278` <- `MF:709` <- `U/App.tsx:400` <- `LearningPage` `U/LauncherPages.tsx:114,119,120` | `T/agent-ui-transport.test.ts:111,114,123,125,126,128`; `src/launcher.tests/AgentChatSelectionStepTransportTests.cs:25` | CALLED |
| R15 | GET | `/agent/chat/conversations[?archived=1]` | `app.ts:252-259` | chat branch `app.ts:244` (auth `:245`, 503 `:246-250`), then `:252` and `:253` | UI token | `CS:259` <- `MF:458` <- `U/App.tsx:80,254`; `MF:723` re-lists after archive; `NCB:220` (the only caller of `?archived=1`; reached by tool `native_chat_bridge` `list`) | `T/agent-ui-transport.test.ts:221,249`; `T/native-chat-bridge-facade.test.ts:109` (recording fake server: tests `NCB`, not this route) | CALLED |
| R16 | POST | `/agent/chat/conversations` | `app.ts:260-276` | `app.ts:252` and `:260` | UI token | `CS:300` <- `MF:535` <- `U/App.tsx:325`; `NCB:237` | `T/agent-ui-transport.test.ts:224`; `T/native-chat-bridge-facade.test.ts:109` (fake server) | CALLED |
| R17 | GET | `/agent/chat/providers` | `app.ts:281-290` | `app.ts:281` | UI token | `CS:265` <- `MF:471` <- `U/App.tsx:81,255` (`NCB:262` is a comment only) | `T/agent-ui-transport.test.ts:303,304,325` | CALLED |
| R18 | PUT (405 else) | `/agent/chat/selection` | `app.ts:292-310` | `app.ts:292`, method `:293`; `external-controller` origin -> 403 `:297` | UI token, owner only | `CS:317` <- `MF:567` <- `U/App.tsx:379` | `T/agent-ui-transport.test.ts:331,332`; `src/launcher.tests/AgentChatSelectionStepTransportTests.cs:37` | CALLED |
| R19 | GET | `/agent/chat/steps/:turnId/:seq` | `app.ts:312-330` (regex `:312`) | `app.ts:313` `if (stepMatch)`; external-controller -> 403 `:318` | UI token, owner only | `CS:328` <- `MF:587` <- `U/App.tsx:423` | `T/agent-ui-transport.test.ts:346,353`; `AgentChatSelectionStepTransportTests.cs:53` | CALLED |
| R20 | GET | `/agent/chat/conversations/:id` | `app.ts:332-341` (regex `:332`) | `app.ts:333` `detailMatch && request.method === 'GET'` (other methods fall to R30) | UI token | `CS:311` <- `MF:552,640,650,681` <- `U/App.tsx:178,295,303,337`; `NCB:185,229` | `T/agent-ui-transport.test.ts:243`; `T/native-chat-bridge-facade.test.ts:109` (fake server) | CALLED |
| R21 | POST (NDJSON stream) | `/agent/chat/conversations/:id/turns` | `app.ts:343-441` (regex `:343`; now parses `planMode` `:374-381`) | `app.ts:344` `turnMatch && request.method === 'POST'` | UI token; larger body cap `app.ts:112,351`; external controllers may not attach files `:385` | `CS:346` (`RunAgentTurnStreamAsync` `CS:332`) <- `MF:633` (type `agent-chat-send`, `MF:596`) <- `U/App.tsx:359`; `NCB:133` (tool `native_chat_bridge` `send`) | `T/agent-ui-transport.test.ts:134,151,261,309`; `T/agent-chat-attachments-wiring.test.ts:50`; `T/agent-chat-plan-mode-route.test.ts:38`; `T/native-chat-bridge-facade.test.ts:26,53` (real handler); `T/native-chat-bridge-facade.test.ts:93` and `T/native-chat-bridge.test.ts:68` (recording fake servers: test `NCB`) | CALLED |
| R22 | POST (NDJSON stream) | `/agent/chat/turns/:id/resume` | `app.ts:443-471` | `app.ts:444` `resumeMatch && POST` | UI token | `CS:365` <- `MF:631` <- `U/App.tsx:436` | none at HTTP level (service level `T/dtc1-durable-turn-continuation.test.ts:625,630,633`, `T/agent-chat-attachments-wiring.test.ts:253`) | CALLED |
| R23 | POST | `/agent/chat/turns/:id/pause` | `app.ts:473-478` | `app.ts:474` | UI token | `CS:414` <- `MF:671` <- `U/App.tsx:428` | none at HTTP level (service level `T/dtc1-durable-turn-continuation.test.ts:612`) | CALLED |
| R24 | GET | `/agent/chat/slash-commands` | `app.ts:480-504` | `app.ts:480` (method gate `:481`) | UI token | `CS:272` <- `MF:484` <- `U/App.tsx:394` | none at HTTP level (`U/App.test.tsx:193-199` mocks the host) | CALLED |
| R25 | GET (405 else) | `/agent/skills` | `app.ts:184-211` | `app.ts:184` `route === '/agent/skills'` (top level, before the chat branch) | UI token | `CS:285` <- `MF:498` <- `U/App.tsx:277,116` (SkillsPage `U/LauncherPages.tsx:144`) | `T/agent-skills-http.test.ts:52,63,67,70-73,76,83-87` | CALLED (reachable since 4a60b82) |
| R26 | POST (405 else) | `/agent/skills/:name/native-enabled` | `app.ts:213-242` (regex `:213`) | `app.ts:214` `if (skillsMatch)` | UI token | `CS:293` <- `MF:516` <- `U/App.tsx:411` | `T/agent-skills-http.test.ts:63,67,70-73,85` | CALLED (reachable since 4a60b82) |
| R27 | POST | `/agent/chat/turns/:id/compact` | `app.ts:506-511` | `app.ts:507` | UI token | `CS:426` <- `MF:696` <- `U/App.tsx:390`, `U/LauncherInspector.tsx:101` | none at HTTP level (service level `T/agent-chat-service.test.ts:1282-1293`) | CALLED |
| R28 | POST | `/agent/chat/turns/:id/cancel` | `app.ts:513-518` | `app.ts:514` | UI token | `CS:406` <- `MF:676` <- `U/App.tsx:386`; `NCB:271` | `T/native-chat-bridge-facade.test.ts:109` (fake server, not this route); service level `T/agent-chat-service.test.ts:639,1050` | CALLED |
| R29 | POST | `/agent/chat/conversations/:id/archive` | `app.ts:520-532` | `app.ts:521` | UI token | `CS:445` <- `MF:722` <- `U/App.tsx:440` | none at HTTP level (service level `T/agent-chat-service.test.ts:1062-1134`) | CALLED |
| R30 | any | any other `/agent/chat/*` | `app.ts:534-535` | chat branch `app.ts:244` | UI token | framework fallback (404 `not_found`) | `T/agent-ui-transport.test.ts` 404/405 cases (e.g. `:332`, `:351`) | framework/dispatch-only |

Routes with no HTTP-level test: R22, R23, R24, R27, R29 (service-level or none). Queries: `rg -n -P "agent/chat/(turns|conversations)/[^\s]*/(resume|pause|compact|archive)" tests src/ui/src src/launcher.tests` returns nothing; the same for `.../cancel` returns only the fake-server assertion `T/native-chat-bridge-facade.test.ts:109`; `agent/chat/slash-commands` appears in tests only as the UI message type (`U/App.test.tsx:193-199`).

**Zero-caller tally (section 1).** Application callers in the repository: 27 of the 30 entries in 1a have at least one; `NO IN-REPOSITORY CALLER FOUND` for 3: R04 `POST /oauth/register` and R07 `POST /oauth/token` (public OAuth API for external connectors; tests only) and the framework fallback R30. R09 has a launcher caller but no UI trigger (F2). The four gateway entries G01-G04 in 1b have no in-repository HTTP caller by design (external tunnel traffic; launcher only starts the process) and no test; they are counted separately, not in the 30. Test-only routes: R04, R07. Routes with no HTTP-level test: R22, R23, R24, R27, R29, G01-G04.

#### 3.1b Second HTTP listener: public MCP gateway (`scripts/tunnel/public-mcp-gateway.mjs`)

Separate Node process on `127.0.0.1:8788` (`gw:4`, `gw:56`), started and watched by the launcher; it proxies an allowlist to the Core and answers everything else itself.

| ID | Method | Pattern | Declaration | Dispatch evidence | Callers | Tests | Class |
|---|---|---|---|---|---|---|---|
| G01 | GET/POST/DELETE/OPTIONS (`gw:11`) | `^/mcp(?:\?.*)?$` | `gw:7` | `gw:21` `!methods.has(...) \|\| !allow.some(...)` -> else proxy `gw:30-48` | Cloudflare VPC route / Worker (external); started `CS:577` (path), `CS:800-819` (`EnsurePublicGatewayAsync`), watchdog `CS:723-726`, probe `CS:974-981` | none (`rg -n -F -e "public-mcp-gateway" tests` returns nothing) | external integration |
| G02 | same | `^/oauth/(register\|authorize\|token)(?:\?.*)?$` | `gw:8` | same | same | none | external integration |
| G03 | same | `^/.well-known/oauth-(protected-resource(/mcp)?\|authorization-server)(?:\?.*)?$` | `gw:9` | same | same | none | external integration |
| G04 | any | everything else | `gw:21-26` | 404 `text/plain` | none (`/health` and every `/agent/*` path stop here) | none | framework/dispatch-only |

Node still answers only POST on `/mcp` (`handler.ts:160`) although the gateway forwards GET, DELETE and OPTIONS.

#### 3.1c Public-tunnel exposure (carried over, repo-verifiable parts only)

| Path | Mechanism | Exposed | Not exposed |
|---|---|---|---|
| (a) Cloudflare VPC route -> gateway `127.0.0.1:8788` | allowlist `gw:7-9`, methods `gw:11`, forced upstream Host `gw:30`; launcher `CS:800-819` | `/mcp`, `/oauth/(register\|authorize\|token)`, `/.well-known/oauth-(protected-resource(/mcp)?\|authorization-server)` | `/health`, `/agent/*`, everything else |
| (b) Cloudflare named tunnel (cloudflared) | dashboard rule, regex in `CT:17` (not inspectable here); verified by `SCT:98-104` | same three groups per `CT:14-20` | `/health`, `/agent/*` must return 404 (`SCT:103`) |
| (c) OpenAI `tunnel-client.exe` | `tunnel-client/agent-core.example.yaml:15-19` -> `http://127.0.0.1:8765/mcp`; started `CS:775-788` | `/mcp` | what else the unsigned binary forwards is UNCERTAIN |

Loopback checks cannot tell tunnel traffic from local traffic (all arrives from 127.0.0.1), so `/agent/*` protection rests on the path allowlist plus the UI token.

#### 3.1d Pseudo-routes and static serving

| Entry | Evidence | Class |
|---|---|---|
| Log filters for `/health` and `/favicon.ico` | `app.ts:606-607` (finish logger skips them); no handler for `/favicon.ico` | not routes (F7) |
| UI static files | none from Node; the SPA is served by the WebView2 virtual host `app.agentcore.local` -> `dist/ui` (`MF:263`, `MF:288-289`), navigated at `MF:318`, trusted source check `MF:321-330`; Vite `outDir` `src/ui/vite.config.ts:11` | framework (WebView2), not an HTTP route |
| Other HTTP listeners in the tree | `scripts/verify/native-memory-reuse.mjs:140` and `tests/skill-proposal-fixture.ts:43` are test fixture servers; `src/launcher/WindowsTcpListener.cs` only queries listener PIDs | not product routes |
| Outbound-only HTTP from the launcher | tunnel admin `127.0.0.1:8787`, `/readyz` probe `CS:994`, TCP probe of port 8788 `CS:979` | served by `tunnel-client.exe` / gateway, out of scope |

### 3.2 Launcher actions

The launcher exposes no HTTP server: `rg -n -e "HttpListener" -e "Kestrel" -e "new TcpListener" -e "NamedPipe" -e "WebSocketServer" src/launcher` returns nothing; `src/launcher/WindowsTcpListener.cs` only queries listener PIDs through the IP Helper API. Its only listening socket is the Unix-domain socket of the Chrome native-messaging relay (section 2d). The UI talks to it exclusively through WebView2 messages. Trusted sender only: the top-level document `https://app.agentcore.local/index.html` (`MF:321-330`, check at `MF:336`); the virtual host maps `dist/ui` (`MF:263`, `MF:288-289`) and navigates at `MF:318`. Unrecognised `type` values fall through to the `type != "action"` guard at `MF:755` and are ignored.

Totals: 28 inbound message types (27 + `action`), 32 outbound message types, 17 `action` ids, 9 process-level entries. Same counts as 2026-11-01 (28 inbound types); no message or action was added or removed.

#### 3.2a Inbound messages, UI -> launcher (`OnWebMessageReceivedAsync`, `src/launcher/MainForm.cs:332`)

Abbreviations as in the header (`MF`, `CS`, `U/`). A "Route" cell names the section 1a entry that the runtime call reaches.

| # | Message type (UI -> launcher) | Sender (UI emitter) | Receiver: `OnWebMessageReceivedAsync` branch | Runtime call and HTTP target | Route | Reply to UI | UI test refs (file:first line) | Class |
|---|---|---|---|---|---|---|---|---|
| 1 | `window-size-get` | U/components.tsx:280 | MF:342 | MF-local `LauncherWindowSizeStore` (MF:349-366); no HTTP | none | window-size-state/-error | U/WindowSizeDialog.test.tsx:22 | CALLED |
| 2 | `window-size-set` | U/components.tsx:280 | MF:342 | same | none | window-size-state/-error | U/WindowSizeDialog.test.tsx:23 | CALLED |
| 3 | `ui-diagnostic-error` | src/launcher/MainForm.cs:279 (script injected by the launcher itself, not UI code) | MF:372 | `CaptureFailure` CS:556; no HTTP | none | none | none by literal | CALLED (launcher-injected script) |
| 4 | `ready` | U/App.tsx:239 | MF:379 | `PushStatusAsync` MF:767-773 -> `GetSnapshotAsync` CS:113 (probes `GET /health`, R01) | none | status, snapshot, logs (MF:770-772, 382) | U/App.test.tsx:392 | CALLED |
| 5 | `activity-detail-get` | U/ToolExecutionDetail.tsx:98; U/ToolExecutionDetail.tsx:103; U/ToolExecutionDetail.tsx:152 | MF:385 | `GetActivityDetail` CS:66 (local journal; no HTTP) | none | activity-detail-result | U/ActivityLifecyclePresentation.test.tsx:37; U/ActivityLogScreenshot.test.tsx:32; U/ActivityLogVisualVariants.test.tsx:75 (+2 files) | CALLED |
| 6 | `workflows-get` | U/WorkflowsPage.tsx:44 | MF:396 | `GetWorkflowsAsync` CS:168 -> CS:172 | R10 | workflows-result/-error | U/WorkflowsPage.test.tsx:15 | CALLED |
| 7 | `task-changes-get` | U/useTaskChanges.ts:40 | MF:412 | `GetTaskChangesAsync` CS:194 -> CS:200 | R13 | task-changes-result/-error | U/TaskChangesPanel.test.tsx:7; U/useTaskChanges.test.tsx:21 | CALLED |
| 8 | `proposals-get` | U/ProposalCards.tsx:25 | MF:430 | `GetProposalDocumentsAsync` CS:220 | R11 | proposals-result/-error | U/ProposalCards.test.tsx:11 | CALLED |
| 9 | `proposal-read` | U/ProposalCards.tsx:32 | MF:430 | `ReadProposalDocumentAsync` CS:222 -> CS:228 | R12 | proposal-read-result/-error | U/ProposalCards.test.tsx:11 | CALLED |
| 10 | `agent-chat-list` | U/App.tsx:80; U/App.tsx:254 | MF:454 | `ListAgentConversationsAsync` CS:257 -> CS:259 | R15 | agent-chat-list-result / agent-chat-error | U/App.test.tsx:706 | CALLED |
| 11 | `agent-chat-providers` | U/App.tsx:81; U/App.tsx:255 | MF:467 | `ListAgentProvidersAsync` CS:263 -> CS:265 | R17 | agent-chat-providers-result / agent-chat-error | U/App.test.tsx:664 | CALLED |
| 12 | `agent-chat-slash-commands` | U/App.tsx:394 | MF:480 | `ListSlashCommandsAsync` CS:270 -> CS:272 | R24 | agent-chat-slash-commands-result | U/App.test.tsx:197 | CALLED |
| 13 | `agent-skills-list` | U/App.tsx:116; U/App.tsx:277 | MF:494 | `ListNativeSkillsAsync` CS:283 -> CS:285 | R25 | agent-skills-result/-error | U/App.test.tsx:172 | CALLED; server route reachable since 4a60b82 (F1 CLOSED) |
| 14 | `agent-skill-set` | U/App.tsx:411 | MF:507 | `SetNativeSkillEnabledAsync` CS:290 -> CS:293 | R26 | agent-skill-set-result | U/App.test.tsx:182 | CALLED; server route reachable since 4a60b82 (F1 CLOSED) |
| 15 | `agent-chat-create` | U/App.tsx:325 | MF:525 | `CreateAgentConversationAsync` CS:298 -> CS:300 | R16 | agent-chat-state / agent-chat-error | U/App.test.tsx:250 | CALLED |
| 16 | `agent-chat-open` | U/App.tsx:178; U/App.tsx:295; U/App.tsx:303; U/App.tsx:337 | MF:545 | `ReadAgentConversationAsync` CS:308 -> CS:311 | R20 | agent-chat-state / agent-chat-error | U/App.test.tsx:298 | CALLED |
| 17 | `agent-chat-select` | U/App.tsx:379 | MF:561 | `SelectAgentChatAsync` CS:315 -> CS:317 | R18 | none | U/App.test.tsx:629 | CALLED |
| 18 | `agent-chat-step` | U/App.tsx:423 | MF:577 | `ReadAgentStepAsync` CS:325 -> CS:328 | R19 | agent-chat-step-result / agent-chat-error | none by literal | CALLED |
| 19 | `agent-chat-send` | U/App.tsx:359 | MF:596 | `RunAgentTurnStreamAsync` CS:332 -> CS:346 (NDJSON); now forwards `planMode` MF:624,639 -> CS:342,353 | R21 (+R20 re-read) | agent-chat-event (stream), agent-chat-state, agent-chat-error | U/App.test.tsx:222 | CALLED |
| 20 | `agent-chat-resume` | U/App.tsx:436 | MF:596,628 | `ResumeAgentTurnStreamAsync` CS:362 -> CS:365 (NDJSON) | R22 (+R20) | agent-chat-event (stream), agent-chat-state, agent-chat-error | U/App.test.tsx:238 | CALLED |
| 21 | `agent-chat-cancel` | U/App.tsx:386 | MF:658,674 | `CancelAgentTurnAsync` CS:403 -> CS:406 | R28 (+R20) | agent-chat-cancel-result (no UI receiver), agent-chat-state | U/App.test.tsx:273 | CALLED |
| 22 | `agent-chat-pause` | U/App.tsx:428 | MF:658,669 | `PauseAgentTurnAsync` CS:411 -> CS:414 | R23 (+R20) | agent-chat-pause-result (no UI receiver), agent-chat-state | U/App.test.tsx:263 | CALLED |
| 23 | `agent-chat-compact` | U/App.tsx:390; U/LauncherInspector.tsx:101 | MF:688 | `CompactAgentTurnAsync` CS:423 -> CS:426 | R27 | agent-chat-compact-result | U/LauncherInspectorContext.test.tsx:125 | CALLED |
| 24 | `agent-dreaming-status` | U/App.tsx:400 | MF:705 | `ReadDreamingAsync(false)` CS:276 -> CS:278 | R14 GET | agent-dreaming-state/-error | U/LauncherMigration.test.tsx:22 | CALLED |
| 25 | `agent-dreaming-run` | U/App.tsx:400 | MF:705,709 | `ReadDreamingAsync(true)` CS:276 -> CS:278 | R14 POST | agent-dreaming-state/-error | U/LauncherMigration.test.tsx:22 | CALLED |
| 26 | `agent-chat-archive` | U/App.tsx:440 | MF:715 | `ArchiveAgentConversationAsync` CS:442 -> CS:445, then list CS:259 | R29 (+R15) | agent-chat-list-result / agent-chat-error | none by literal | CALLED |
| 27 | `agent-run` | U/App.tsx:318 | MF:733 | `RunAgentAsync` CS:141 -> CS:144 | R09 | agent-result | none by literal | CALLED by launcher only: UI emitter U/App.tsx:318 exists, but `onAgentRun` is never invoked (F2) |
| 28 | `action` | U/App.tsx:312 | MF:755 | `ExecuteActionAsync` CS:481 -> `ExecuteActionCoreAsync` CS:511 (section 2c) | none | logs (clear-logs only, MF:759) + status/snapshot/logs push (MF:758) | none by literal | CALLED |

Inbound classification: 26 `CALLED`, 1 `CALLED` with a dead UI trigger (`agent-run`, F2), 1 launcher-injected (`ui-diagnostic-error`); 0 messages without a sender. Test refs for `agent-chat-step`, `agent-chat-archive`, `agent-run` and the dreaming pair are absent by literal (the dreaming pair is exercised through callback props at `U/LauncherMigration.test.tsx:22`).

#### 3.2b Outbound messages, launcher -> UI (`Send(...)` implemented at `MF:815`)

Receivers are the `subscribeHost` handlers; the typed union is `U/host.ts:536-570` (`HostEnvelope`).

| # | Message type (launcher -> UI) | Sent at | UI receiver | Class |
|---|---|---|---|---|
| 1 | `activity-detail-result` | MF:393 | U/ToolExecutionDetail.tsx:83-84 | RECEIVED |
| 2 | `agent-chat-cancel-result` | MF:677 | NONE (type only: U/host.ts:561) | NO UI RECEIVER (sender exists; type-only declaration in host.ts) |
| 3 | `agent-chat-compact-result` | MF:702 | U/App.tsx:89 | RECEIVED |
| 4 | `agent-chat-error` | MF:463, MF:476, MF:541, MF:557, MF:592, MF:647, MF:685, MF:729 | U/App.tsx:208, 215 | RECEIVED |
| 5 | `agent-chat-event` | MF:621 | U/App.tsx:173 | RECEIVED |
| 6 | `agent-chat-list-result` | MF:459, MF:724 | U/App.tsx:127 | RECEIVED |
| 7 | `agent-chat-pause-result` | MF:672 | NONE (type only: U/host.ts:564) | NO UI RECEIVER (sender exists; type-only declaration in host.ts) |
| 8 | `agent-chat-providers-result` | MF:472 | U/App.tsx:137 | RECEIVED |
| 9 | `agent-chat-slash-commands-result` | MF:485, MF:490 | U/App.tsx:90 | RECEIVED |
| 10 | `agent-chat-state` | MF:536, MF:553, MF:641, MF:651, MF:682 | U/App.tsx:149 | RECEIVED |
| 11 | `agent-chat-step-result` | MF:588 | U/App.tsx:203 | RECEIVED |
| 12 | `agent-dreaming-error` | MF:712 | U/App.tsx:87 | RECEIVED |
| 13 | `agent-dreaming-state` | MF:710 | U/App.tsx:86 | RECEIVED |
| 14 | `agent-result` | MF:745, MF:751 | U/App.tsx:119 | RECEIVED |
| 15 | `agent-skill-set-result` | MF:517, MF:521 | U/App.tsx:105 | RECEIVED |
| 16 | `agent-skills-error` | MF:503 | U/App.tsx:101 | RECEIVED |
| 17 | `agent-skills-result` | MF:499 | U/App.tsx:91 | RECEIVED |
| 18 | `error` | MF:249, MF:257, MF:764 | U/App.tsx:234 | RECEIVED |
| 19 | `log` | MF:95 | U/App.tsx:88 | RECEIVED |
| 20 | `logs` | MF:382, MF:759, MF:772 | U/App.tsx:85 | RECEIVED |
| 21 | `proposal-read-error` | MF:450 | U/ProposalCards.tsx:50 | RECEIVED |
| 22 | `proposal-read-result` | MF:446 | U/ProposalCards.tsx:50 | RECEIVED |
| 23 | `proposals-error` | MF:450 | U/ProposalCards.tsx:37 | RECEIVED |
| 24 | `proposals-result` | MF:446 | U/ProposalCards.tsx:37 | RECEIVED |
| 25 | `snapshot` | MF:771 | U/App.tsx:71 | RECEIVED |
| 26 | `status` | MF:770 | U/App.tsx:230 | RECEIVED |
| 27 | `task-changes-error` | MF:426 | U/useTaskChanges.ts:47 | RECEIVED |
| 28 | `task-changes-result` | MF:422 | U/useTaskChanges.ts:44-45 | RECEIVED |
| 29 | `window-size-error` | MF:368 | U/components.tsx:292 | RECEIVED |
| 30 | `window-size-state` | MF:783 | U/components.tsx:285 | RECEIVED |
| 31 | `workflows-error` | MF:408 | U/WorkflowsPage.tsx:52 | RECEIVED |
| 32 | `workflows-result` | MF:404 | U/WorkflowsPage.tsx:49-52 | RECEIVED |

Outbound classification: 30 received, 2 without a UI receiver (`agent-chat-pause-result`, `agent-chat-cancel-result`; new finding N3). `agent-result` is received (`U/App.tsx:119`) but only reachable through `agent-run`, whose UI trigger is dead (F2).

#### 3.2c `action` ids (`ExecuteActionCoreAsync`, `src/launcher/AgentCoreRuntime.cs:511`; sender `U/App.tsx:312` `onAction`, branch `MF:755-759`)

Senders listed under `U/pages.tsx:` belong to the dead legacy pages (F3); every id except the first two also has a sender in live code (`U/components.tsx`, `U/PrototypePages.tsx`, `U/LauncherPages.tsx`).

| # | Action id | Declaration (`ExecuteActionCoreAsync` case) | UI senders (U/ = src/ui/src/) | UI test refs | Class |
|---|---|---|---|---|---|
| 1 | `activity-monitor` | src/launcher/AgentCoreRuntime.cs:516 | none | none by literal | NO IN-REPOSITORY CALLER FOUND |
| 2 | `tunnel-details` | src/launcher/AgentCoreRuntime.cs:519 | none | none by literal | NO IN-REPOSITORY CALLER FOUND |
| 3 | `open-tunnel-admin` | src/launcher/AgentCoreRuntime.cs:522 | U/components.tsx:175, U/PrototypePages.tsx:74 | U/App.test.tsx:434 | CALLED |
| 4 | `open-folder` | src/launcher/AgentCoreRuntime.cs:523 | U/components.tsx:177, U/components.tsx:191, U/components.tsx:201, U/components.tsx:207, U/components.tsx:210, U/components.tsx:248, U/LauncherPages.tsx:98, U/pages.tsx:348, U/PrototypePages.tsx:68, U/PrototypePages.tsx:87 | U/App.test.tsx:431 | CALLED |
| 5 | `open-runtime-folder` | src/launcher/AgentCoreRuntime.cs:524 | U/components.tsx:122, U/components.tsx:183, U/pages.tsx:350, U/PrototypePages.tsx:55, U/PrototypePages.tsx:68 | none by literal | CALLED |
| 6 | `open-memory-folder` | src/launcher/AgentCoreRuntime.cs:525 | U/components.tsx:170, U/components.tsx:211, U/LauncherPages.tsx:55, U/pages.tsx:349, U/PrototypePages.tsx:68 | none by literal | CALLED |
| 7 | `open-logs` | src/launcher/AgentCoreRuntime.cs:526 | U/components.tsx:171, U/components.tsx:193, U/components.tsx:198, U/components.tsx:205, U/components.tsx:212, U/pages.tsx:351, U/PrototypePages.tsx:55, U/PrototypePages.tsx:64, U/PrototypePages.tsx:68, U/PrototypePages.tsx:81 | none by literal | CALLED |
| 8 | `start-core` | src/launcher/AgentCoreRuntime.cs:527 | U/components.tsx:135, U/components.tsx:251, U/PrototypePages.tsx:64 | none by literal | CALLED |
| 9 | `stop-core` | src/launcher/AgentCoreRuntime.cs:528 | U/components.tsx:137, U/components.tsx:252, U/PrototypePages.tsx:64 | none by literal | CALLED |
| 10 | `restart-core` | src/launcher/AgentCoreRuntime.cs:533 | U/components.tsx:118, U/components.tsx:136, U/components.tsx:186, U/components.tsx:251, U/PrototypePages.tsx:64 | U/App.test.tsx:423 | CALLED |
| 11 | `restart-tunnel` | src/launcher/AgentCoreRuntime.cs:534 | U/components.tsx:119, U/components.tsx:176, U/components.tsx:190, U/PrototypePages.tsx:55, U/PrototypePages.tsx:64 | none by literal | CALLED |
| 12 | `restart-all` | src/launcher/AgentCoreRuntime.cs:535 | U/components.tsx:180, U/components.tsx:187, U/components.tsx:195, U/components.tsx:214, U/PrototypePages.tsx:55, U/PrototypePages.tsx:64 | U/WorkflowsPage.test.tsx:189 | CALLED |
| 13 | `view-process-details` | src/launcher/AgentCoreRuntime.cs:536 | U/components.tsx:123, U/components.tsx:184, U/components.tsx:206, U/PrototypePages.tsx:55, U/PrototypePages.tsx:64 | none by literal | CALLED |
| 14 | `system-snapshot` | src/launcher/AgentCoreRuntime.cs:540 | U/components.tsx:172, U/components.tsx:178, U/components.tsx:185, U/components.tsx:192, U/components.tsx:200, U/components.tsx:204, U/pages.tsx:329, U/pages.tsx:337, U/PrototypePages.tsx:45, U/PrototypePages.tsx:55, U/PrototypePages.tsx:62 | U/App.test.tsx:437 | CALLED |
| 15 | `reset-oauth` | src/launcher/AgentCoreRuntime.cs:544 | U/components.tsx:179, U/components.tsx:194, U/components.tsx:213, U/PrototypePages.tsx:64, U/PrototypePages.tsx:74 | none by literal | CALLED |
| 16 | `toggle-autostart` | src/launcher/AgentCoreRuntime.cs:545 | U/pages.tsx:365, U/PrototypePages.tsx:71 | U/App.test.tsx:459 | CALLED |
| 17 | `clear-logs` | src/launcher/AgentCoreRuntime.cs:546 | U/components.tsx:199, U/pages.tsx:260, U/PrototypePages.tsx:81 | none by literal | CALLED |

Zero-sender actions: `activity-monitor` (`CS:516`) and `tunnel-details` (`CS:519`). Exact negative query: `rg -n -F -e "activity-monitor" -e "tunnel-details" src tests scripts extensions tunnel-client .github` -> only the two `case` labels. Classification: dispatch-only branches with no UI trigger (candidates for removal or for a UI button; F4).

**Zero-caller tally (section 2).** Inbound messages with no sender: 0 of 28. Actions with no sender: 2 of 17 (`activity-monitor`, `tunnel-details`). Outbound messages with no UI receiver: 2 of 32 (`agent-chat-pause-result`, `agent-chat-cancel-result`). Messages whose only UI trigger is dead: 1 (`agent-run`).

#### 3.2d Process-level and OS-level entry points

| Identity | Declaration | Callers (application / test) | Class |
|---|---|---|---|
| Single-instance mutex `Local\AgentCoreDesktop` | `src/launcher/Program.cs:13` | a second launch exits or signals Show `src/launcher/Program.cs:19`; `RA:430` opens it to detect a running launcher | CALLED |
| Event `Local\AgentCoreDesktop.Show` | `MF:30`, listener `MF:56` (`ListenForSignal` `MF:193`) | `src/launcher/Program.cs:19` (second instance) | CALLED |
| Event `Local\AgentCoreDesktop.Exit` | `MF:31`, listener `MF:57` | `RA:51`, `RA:379`; `T/launcher-exit-signal.test.ts:10` | CALLED |
| Tray menu `Show App` / `Exit` | `MF:156-162` | user click | direct user access |
| Launcher control file (`AGENT_CORE_LAUNCHER_CONTROL_FILE`) | writer `CS:587-589` (path `CS:54`), env `CS:1381`, delete `CS:1595`; reader `src/index.ts:485-512` (250 ms poll), `src/config.ts:203` | launcher shutdown only | CALLED |
| CLI helper `--browser-use-transport <sock>` | `src/launcher/BrowserUseNativeHost.cs:24-30`, `RunTransportAsync` `:64` | `src/rdc/browser-control/open-browser-use.ts:97`; `scripts/verify/launcher-package.mjs:12`; `T/launcher/BrowserUseNativeHostTests.cs:333` | CALLED |
| Chrome native-messaging host mode (`chrome-extension://<id>/` argument, optional `--parent-window`) | `src/launcher/BrowserUseNativeHost.cs:35-56` (`RunOwnedAsync` `:128`) | Chrome via the `NativeMessagingHosts` registry key (referenced by `src/rdc/browser-control/open-browser-use-runtime.ts:99`); `extensions/agent-core-open-browser-use/background.js:119` (`connectNative`) | external integration |
| Unix-domain-socket listener of the relay (`runtime/rdc/browser-control/managed/<guid>.sock`) | `src/launcher/BrowserUseNativeHost.cs:206`, `:227-229` | connected by the `--browser-use-transport` helper (`BrowserUseNativeHost.cs:72`), which `open-browser-use.ts:97` spawns | CALLED (not listed on 2026-11-01) |
| CLI helper `--native-dump-helper <pid> <a> <b>` | `src/launcher/NativeDumpDiagnostics.cs:215-217` | self-spawn `NativeDumpDiagnostics.cs:209`; filtered by `RA:204-206` | CALLED |

### 3.3 UI pages

Entry chain: `src/ui/index.html:18-19` (`<div id="root">`, `<script type="module" src="/src/main.tsx">`) -> `src/ui/src/main.tsx:7-11` `createRoot(...).render(<App/>)` -> `src/ui/src/App.tsx:28` `App` -> `src/ui/src/App.tsx:463` `<ReferenceUi page=... />` -> `src/ui/src/pages.tsx:805` `ReferenceUi` -> one ternary chain at `src/ui/src/pages.tsx:807` choosing the page component inside `AppShell` (`src/ui/src/components.tsx:238`, rendered at `src/ui/src/pages.tsx:808`).

There is no router library. The page id is the location hash: `pageFromHash` `U/App.tsx:19-24` (valid set `U/App.tsx:17`, aliases `workspace -> chat`, `runtime -> core`, `integrations -> systems`, `dreaming -> learning`, unknown hash -> `chat`), `setPage` `U/App.tsx:306-309` (writes `window.location.hash`), `hashchange` listener `U/App.tsx:63-66`. Page ids are typed in `U/components.tsx:16` (`PageId`). Left navigation: `navItems` `U/components.tsx:37-51` (13 items, rendered at `U/components.tsx:223`); `workflows` and `wizard` have no nav item. The default branch of the chain (`U/pages.tsx:807`, last operand) renders `PrototypeSettings` for any id not matched, which makes `settings` the fallback. The built output is served by WebView2 only (section 1d).

#### 3.3a Reachable pages (15 ids)

| id (hash) | Component | Declaration | Selected by | Reached from | Tests / harness | Class |
|---|---|---|---|---|---|---|
| `chat` (default) | `ChatPage` | `U/pages.tsx:429` | `U/pages.tsx:807` | nav item `U/components.tsx:38`; brand and "New Chat" buttons `U/components.tsx:220,247,253`; fallback of `pageFromHash` | `U/NativeChatReliability.test.tsx`, `U/chatStreaming.test.tsx`, `U/ChatAttachments.test.tsx`, `U/App.test.tsx` and others (`inv-scripts/out`) | CALLED |
| `dashboard` | `PrototypeDashboard` | `U/PrototypePages.tsx:24` | `U/pages.tsx:807` | nav `U/components.tsx:39`; hosts `ProposalCards` `U/PrototypePages.tsx:36` | `scripts/verify/launcher-prototype-parity.mjs:84` | CALLED |
| `goals` | `GoalsPage` | `U/LauncherPages.tsx:65` | `U/pages.tsx:807` | nav `:40`; `U/pages.tsx:744` | `U/LauncherMigration.test.tsx:82` | CALLED |
| `artifacts` | `ArtifactsPage` | `U/LauncherPages.tsx:93` | `U/pages.tsx:807` | nav `:41`; inspector link `U/components.tsx:262`; hosts `TaskChangesPanel` `U/LauncherPages.tsx:102` | parity script `:84` | CALLED |
| `systems` | `PrototypeTools` | `U/PrototypePages.tsx:40` | `U/pages.tsx:807` | nav `:42`; `U/PrototypePages.tsx:28,35,87`; `U/pages.tsx:745` | `U/LauncherMigration.test.tsx:120` | CALLED |
| `skills` | `SkillsPage` | `U/LauncherPages.tsx:144` | `U/pages.tsx:807` | nav `:43`; loads data on every visit `U/App.tsx:279-281` | `U/SkillsPage.test.tsx:22` (mocked host); HTTP leg now tested `T/agent-skills-http.test.ts` | CALLED (server route reachable since 4a60b82) |
| `models` | `ModelsPage` | `U/LauncherPages.tsx:20` | `U/pages.tsx:807` | nav `:44`; `U/PrototypePages.tsx:74,87` | `U/LauncherMigration.test.tsx:50,59` | CALLED |
| `memory` | `MemoryPage` | `U/LauncherPages.tsx:47` | `U/pages.tsx:807` | nav `:45` | `U/LauncherMigration.test.tsx:65` | CALLED |
| `learning` | `LearningPage` | `U/LauncherPages.tsx:108` | `U/pages.tsx:807` | nav `:46` (label "Dreaming Review"); alias `#dreaming` | `U/LauncherMigration.test.tsx:22,109` | CALLED |
| `core` | `PrototypeRuntime` | `U/PrototypePages.tsx:51` | `U/pages.tsx:807` | nav `:47`; top bar `U/components.tsx:250` | parity script `:84` | CALLED |
| `workflows` | `WorkflowsPage` | `U/WorkflowsPage.tsx:9` | `U/pages.tsx:807` (first operand) | no nav item; button `U/PrototypePages.tsx:46`; direct hash | `U/WorkflowsPage.test.tsx`; `U/LauncherMigration.test.tsx:120` | CALLED |
| `activity` | `PrototypeActivity` | `U/PrototypePages.tsx:78` | `U/pages.tsx:807` | nav `:48`; `U/LauncherPages.tsx:137` | `U/LauncherMigration.test.tsx:129` | CALLED |
| `diagnostics` | `PrototypeDiagnostics` | `U/PrototypePages.tsx:60` | `U/pages.tsx:807` | nav `:49`; top bar `U/components.tsx:255`; `U/PrototypePages.tsx:35,47` | parity script `:84` | CALLED |
| `settings` | `PrototypeSettings` | `U/PrototypePages.tsx:67` | default branch `U/pages.tsx:807` | nav `:50` | parity script `:84` | CALLED |
| `wizard` | `PrototypeSetup` | `U/PrototypePages.tsx:84` | `U/pages.tsx:807` | no nav item; "Setup Wizard" buttons `U/components.tsx:227,256` | `U/LauncherMigration.test.tsx:137` | CALLED |

#### 3.3b Legacy components that no navigation reaches (6 pages + helpers)

| Component | Declaration | Selector | References | Class |
|---|---|---|---|---|
| `DashboardPage` | `U/pages.tsx:100` | none | none (definition only) | NO IN-REPOSITORY CALLER FOUND |
| `CoreRuntimePage` | `U/pages.tsx:146` | none | none | NO IN-REPOSITORY CALLER FOUND |
| `SystemsPage` (+ `SystemInspector` `:225`) | `U/pages.tsx:202` | none | none | NO IN-REPOSITORY CALLER FOUND |
| `ActivityLogPage` (+ `LogInspector` `:282`, `ChevronDownIcon` `:276`, `prettyModule` `:278`) | `U/pages.tsx:243` | none | tests only: `U/ActivityLogScreenshot.test.tsx:6,26`, `U/ToolExecutionEnhancement.test.tsx:4,34`, `U/ActivityLogVisualVariants.test.tsx:6,71`, `U/ActivityLifecyclePresentation.test.tsx:3,19` | TEST-ONLY |
| `DiagnosticsPage` (+ `buildChecks` `:303`) | `U/pages.tsx:321` | none | none | NO IN-REPOSITORY CALLER FOUND |
| `SettingsPage` (+ `RotateCcwIcon` `:799`, `SettingToggle` `:801`) | `U/pages.tsx:344` | none | none | NO IN-REPOSITORY CALLER FOUND |
| helpers used only by the six pages above | `levelTone` `U/pages.tsx:77`, `latest` `:78`, `memoryPercent` `:79`, `Breadcrumb` `:86`, `HealthCounts` `:90` | n/a | `inv-scripts/legacy-closure.mjs` output | dead closure (F3) |

Classification: unreachable legacy code, retained under the maintenance rule. `ReasoningMenu` (`U/pages.tsx:394`) and `statusTone` (`:68`) look legacy but are used by the live `ChatPage`.

Other surfaces: the Chrome extension popup `extensions/agent-core-open-browser-use/popup.html` (manifest `action.default_popup`) is an external UI, not inventoried deeper; it makes no request to the Core (query `rg -n -e "fetch\(" -e "XMLHttpRequest" -e "8765" extensions` returns nothing).

**Zero-caller tally (section 3).** Live pages without a navigation path: 0 of 15. Unreachable legacy page components: 5 with no reference at all (`DashboardPage`, `CoreRuntimePage`, `SystemsPage`, `DiagnosticsPage`, `SettingsPage`) and 1 referenced only by tests (`ActivityLogPage`), plus their helper closure.

### 3.4 Server actions

None. This is not a Next.js, Remix or similar application, so the category does not exist. Negative evidence:

| Check | Query / evidence | Result |
|---|---|---|
| Framework dependencies | `src/ui/package.json` dependencies (runtime: `react`, `react-dom`, `lucide-react`; build: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`; test: `vitest`, `jsdom`, testing-library); root `package.json` (no web-framework or router package) | no `next`, `@remix-run`, `react-router`, `@tanstack/*router` |
| Directives and server-function APIs | `rg -n -e "use server" -e "use client" -e "createServerFn" -e "getServerSideProps" -e "next/" -e "pages/api" -e "app/api" src scripts tests extensions subagents` | no match |
| Framework config files | `Glob` for `next.config.*`, `remix.config.*`, `astro.config.*`, `nuxt.config.*`, `svelte.config.*` at the root and under `src/ui` | none |
| UI network use | `rg -n -e "fetch(" -e "XMLHttpRequest" -e "WebSocket" -e "EventSource" src/ui/src -g '!*.test.*'` | no match |
| Nearest equivalents | (1) MCP tool handlers (section 5); (2) WebView2 `postHost` messages handled at `src/launcher/MainForm.cs:332` (section 2a); (3) the `/agent/*` HTTP routes (section 1a) | n/a |

### 3.5 MCP tools

84 registrations, 83 unique names. `reconstruction_harness` is registered twice (external `src/mcp/external-reconstruction-harness-tools.ts:21`, native `src/mcp/reconstruction-harness-tools.ts:10`); the two registrations never share a registry (external `!native` `src/mcp/server.ts:489`, native-only `src/mcp/server.ts:494-496`). Registration forms, found by script: 54 direct `server.registerTool('name', ...)` calls, 29 `tool(server, 'name', ...)` calls that funnel through the helper at `src/mcp/server.ts:141-144`, and 1 bound `register('controller_contract', ...)` at `src/mcp/controller-contract.ts:70`. Cohort sizes: RDC group 29, `controller_contract` 1, `controller_learning` 1, `memory_*` 17, `memory_v2_*` 2, `learning` 1, Semantic IDE 2, `skills` 1, `phone_*` 14, `phone_game_*` 2, code intelligence 7, `artifact_inspect` 1, `restart_agent_core` 1, `native_chat_bridge` 1, `reconstruction_harness` 2, web research 2 (= 84).

How tools are reached: (i) external MCP client -> `POST /mcp` (R08) -> `createAgentCoreMcpServer` `src/mcp/server.ts:302`; (ii) Native: the model's tool call -> `src/agent-controller.ts:2022` `toolSession.call(call.function.name, ...)` (a name chosen at run time, so not enumerable) -> `src/agent-tool-session.ts:318-327` -> `DirectToolPort` `:137` -> `InProcessToolHost.callTool` `src/mcp/in-process-tool-host.ts:94`, gated by the family catalog `src/agent-capability-catalog.ts`; since 3ede662 there is no MCP client in this path; (iii) scripts that open an MCP client (`S/` = `scripts/verify/`); (iv) `native_chat_bridge` spawns `NCB`, which calls R15, R16, R20, R21, R28. No UI code and no launcher code invokes a tool: the UI only maps tool names to labels and icons (`U/activityPhase.ts`, `U/AgentTimeline.tsx`, `U/activityStates.ts`, `U/activityGraphics.ts`, `U/ToolReadableCode.tsx`, `U/ToolExecutionDetail.tsx`), which are references, not callers.

Verdict rule (stricter than 2026-11-01, applied uniformly; the last column shows the old verdict):
- `CALLED (script + test)` / `CALLED (script)`: a script under `scripts/` opens an MCP client or session and calls the tool by name.
- `TEST-ONLY`: at least one test executes the registered handler or the dispatch path by name (MCP client `callTool`, `tools/call` over HTTP, in-process `session.call`, `registered.get('name')(...)`, a scripted Native model tool call). Counted per file with the first matching line.
- `NO IN-REPOSITORY CALLER FOUND`: the name appears only in the registration, in `src/agent-capability-catalog.ts`, in label maps, or in tests that list names, budget results, record usage, register a fake tool of the same name, or assert a denial before the handler runs. Such tools remain reachable through `POST /mcp` and, where a catalog row exists, through Native dispatch (a "dynamic call" class, not unused code).
- Not counted as calls (listed in the Verdict cell of the affected row): grant-denied calls (`T/agent-capability-execution-parity.test.ts:68`, `T/agent-controller.test.ts:787`, `T/agent-os-tool-grant-adoption.test.ts:26`), fixture servers that register their own fake tool (`T/capability-disclosure-integration.test.ts:53-64`, `T/mcp-task-effectiveness-eval.test.ts:15,19`, `T/mcp-external-acceptance-harness.test.ts:21,30`, `T/learning-external-scope.test.ts:30,68`), and provider-adapter conversion tests (`T/agent-provider.test.ts`, `T/agent-provider-anthropic.test.ts`).
- Script allow-lists are not direct calls: `S/cumulative-workflow-eval.mjs:152` grants `read_file`, `write_file`, `start_process`, `read_process_output` and `:153` adds `controller_learning`, `learning` to a model-driven evaluation; `S/native-memory-reuse.mjs:210` instructs a model to use `browser_control`. They are shown as "indirect" in the Script column.

Distribution: 6 CALLED (`controller_contract`, `memory_list`, `memory_status`, `native_chat_bridge`, `read_file`, `reconstruction_harness`), 35 TEST-ONLY, 42 NO IN-REPOSITORY CALLER FOUND (35 with a Native catalog row, 7 memory mutators without one). Product code never has a literal tool call: every row's real callers are external MCP clients or the Native model loop.

"Native family (catalog)" = the family in `src/agent-capability-catalog.ts` that grants the tool to Native, with its line. Full per-line reference lists (tests, src, UI) for every tool are in `C:UsersIkbalAppDataLocalTempclaudeE--Projects-Agent-Core86195bb7-9408-4b33-9f87-43ba8f9787bescratchpadmaintinv-scriptsout	ools.json` (machine-readable, produced by `tool-scan.mjs` in the same folder); this scratch folder is not part of the repository.

#### 3.5a Registration and caller table (84 rows)

| # | Tool | Registration | Registered when | Native family (catalog) | Test invocations (real handler or dispatch; first line per file) | Script callers (direct) | Verdict | 2026-11-01 verdict (looser method) |
|---|---|---|---|---|---|---|---|---|
| 1 | `artifact_inspect` | `src/mcp/artifact-inspect-tools.ts:54` | `runtime.artifactAuthorization` `src/mcp/server.ts:475` (3 branches 476-485) | artifact.inspect (catalog L54) | T/native-shared-tool-registry.test.ts:223 | none | TEST-ONLY | CALLED |
| 2 | `browser_control` | `src/mcp/server.ts:372` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | browser.navigate (catalog L120); browser.act (catalog L129) | T/agent-os-tool-grant-adoption.test.ts:35; T/agent-tool-session.test.ts:153; T/browser-session-ownership.test.ts:59; T/native-donor-workflows.test.ts:473 | none (indirect: S/native-memory-reuse.mjs:210 (prompt text)) | TEST-ONLY<br>not counted (fixture/denied): T/agent-os-tool-grant-adoption.test.ts:26 | CALLED |
| 3 | `code_analysis` | `src/mcp/code-intelligence-tools.ts:396` | `runtime.codeIntelligence` `src/mcp/server.ts:468` | code.intelligence (catalog L142) | T/grafel-regrounding-g20-g25.test.ts:239 | none | TEST-ONLY | CALLED |
| 4 | `code_graph` | `src/mcp/code-intelligence-tools.ts:233` | `runtime.codeIntelligence` `src/mcp/server.ts:468` | code.intelligence (catalog L140) | none | none | NO IN-REPOSITORY CALLER FOUND<br>not counted (fixture/denied): T/capability-disclosure-integration.test.ts:53, T/capability-disclosure-integration.test.ts:60, T/capability-disclosure-integration.test.ts:62 | NO CALLER |
| 5 | `code_orient` | `src/mcp/code-intelligence-tools.ts:172` | `runtime.codeIntelligence` `src/mcp/server.ts:468` | code.intelligence (catalog L139) | T/grafel-regrounding-g20-g25.test.ts:225 | none | TEST-ONLY | CALLED |
| 6 | `code_patterns` | `src/mcp/code-intelligence-tools.ts:463` | `runtime.codeIntelligence` `src/mcp/server.ts:468` | code.intelligence (catalog L144) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 7 | `code_refactor` | `src/mcp/semantic-ide-tools.ts:79` | `runtime.semanticIde` `src/mcp/server.ts:444` | code.modify (catalog L153) | none | none | NO IN-REPOSITORY CALLER FOUND | CALLED |
| 8 | `code_repair` | `src/mcp/code-intelligence-tools.ts:637` | `runtime.codeIntelligence` `src/mcp/server.ts:468` | code.intelligence (catalog L145); code.modify (catalog L154) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 9 | `code_surface` | `src/mcp/code-intelligence-tools.ts:291` | `runtime.codeIntelligence` `src/mcp/server.ts:468` | code.intelligence (catalog L141) | T/graft-graphify-adoption.test.ts:307 | none | TEST-ONLY | CALLED |
| 10 | `code_symbol` | `src/mcp/semantic-ide-tools.ts:35` | `runtime.semanticIde` `src/mcp/server.ts:444` | semantic.ide (catalog L163) | none | none | NO IN-REPOSITORY CALLER FOUND | CALLED |
| 11 | `code_workspace` | `src/mcp/code-intelligence-tools.ts:552` | `runtime.codeIntelligence` `src/mcp/server.ts:468` | code.intelligence (catalog L143); code.modify (catalog L155) | none | none | NO IN-REPOSITORY CALLER FOUND | CALLED |
| 12 | `controller_contract` | `src/mcp/controller-contract.ts:70` | external only: `installControllerContract` `src/mcp/server.ts:329` (skipped when `nativeTaskId` or `toolTarget` set) | not in `src/agent-capability-catalog.ts` (not Native-grantable) | T/controller-contract-fixture.ts:4; T/controller-contract.test.ts:118; T/image-inspect-http.test.ts:64 | S/native-chat-completion.mjs:33; S/native-chat-completion.mjs:37 | CALLED (script + test) | CALLED |
| 13 | `controller_learning` | `src/mcp/controller-learning-tools.ts:18` | `runtime.externalControllerLearning && runtime.controllerSessionId` `src/mcp/server.ts:398` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | T/external-learning-promotion-api.test.ts:48; T/learning-task-selector-http.test.ts:46; T/memory/memory-scope-mcp.test.ts:80; T/memory/memory-task-reconnect.test.ts:38; T/memory/memory-v2-host-integration.test.ts:168; T/skill-discovery-tools.test.ts:93; T/trusted-proposal-http.test.ts:45 | none (indirect: S/cumulative-workflow-eval.mjs:153 (model allow-list)) | TEST-ONLY | CALLED |
| 14 | `create_directory` | `src/mcp/server.ts:368` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | files.mutate (catalog L92) | T/bridge-runtime.test.ts:91; T/project-structure-filesystem.test.ts:280 | none | TEST-ONLY | CALLED |
| 15 | `edit_block` | `src/mcp/server.ts:384` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | files.mutate (catalog L93) | T/bridge-runtime.test.ts:100 | none | TEST-ONLY | CALLED |
| 16 | `file_checkpoint` | `src/mcp/server.ts:371` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | files.mutate (catalog L89) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 17 | `force_terminate` | `src/mcp/server.ts:388` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | process.admin (catalog L113) | none | none | NO IN-REPOSITORY CALLER FOUND<br>function-level test, not by tool name: T/authenticity-maintenance.test.ts:146 (forceTerminate) | NO CALLER |
| 18 | `get_config` | `src/mcp/server.ts:357` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L60) | T/agent-controller.test.ts:590; T/agent-cumulative-learning.test.ts:118; T/agent-runtime-integration.test.ts:60; T/agent-tool-session.test.ts:15; T/bridge-runtime.test.ts:104; T/capability-disclosure-integration.test.ts:58; T/controller-contract.test.ts:94; T/dtc1-durable-turn-continuation.test.ts:532; T/external-reconstruction-harness.test.ts:78; T/in-process-tool-host.test.ts:129; T/instructions-budget.test.ts:26; T/native-shared-tool-registry.test.ts:97; T/reflexion-second-wave.test.ts:60 | none | TEST-ONLY | CALLED |
| 19 | `get_file_info` | `src/mcp/server.ts:383` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L65) | T/bridge-runtime.test.ts:102 | none | TEST-ONLY | CALLED |
| 20 | `get_more_search_results` | `src/mcp/server.ts:380` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | search.local (catalog L79) | T/bridge-runtime.test.ts:117 | none | TEST-ONLY | CALLED |
| 21 | `get_prompts` | `src/mcp/server.ts:396` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L70) | none | none | NO IN-REPOSITORY CALLER FOUND<br>function-level test, not by tool name: T/authenticity-maintenance.test.ts:88-92 (getPrompts) | TEST-ONLY |
| 22 | `get_recent_tool_calls` | `src/mcp/server.ts:394` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L69) | T/bridge-runtime.test.ts:136 | none | TEST-ONLY<br>not counted (fixture/denied): T/mcp-external-acceptance-harness.test.ts:30 | CALLED |
| 23 | `get_usage_stats` | `src/mcp/server.ts:393` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L68) | T/bridge-runtime.test.ts:134 | none | TEST-ONLY<br>not counted (fixture/denied): T/agent-controller.test.ts:787 | CALLED |
| 24 | `give_feedback_to_desktop_commander` | `src/mcp/server.ts:395` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | feedback.send (catalog L252) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 25 | `image_inspect` | `src/mcp/server.ts:360` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L62) | T/image-inspect-http.test.ts:71; T/image-inspect-mcp.test.ts:76; T/native-shared-tool-registry.test.ts:139; T/native-tool-images.test.ts:62 | none | TEST-ONLY | CALLED |
| 26 | `interact_with_process` | `src/mcp/server.ts:387` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | process.execute (catalog L104) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 27 | `kill_process` | `src/mcp/server.ts:391` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | process.admin (catalog L113) | none | none | NO IN-REPOSITORY CALLER FOUND<br>function-level test, not by tool name: T/rdc-kill-process-guard.test.ts:9,18 (killProcess)<br>not counted (fixture/denied): T/agent-capability-execution-parity.test.ts:68, T/capability-disclosure-integration.test.ts:64 | NO CALLER |
| 28 | `learning` | `src/mcp/learning-tools.ts:34` | `runtime.learningService` `src/mcp/server.ts:432` | learning.manage (catalog L246) | T/learning-evaluation.test.ts:110; T/learning-external-scope.test.ts:31; T/learning-pending-review-health.test.ts:44; T/memory/memory-task-reconnect.test.ts:51 | none (indirect: S/cumulative-workflow-eval.mjs:153 (model allow-list)) | TEST-ONLY | CALLED |
| 29 | `list_directory` | `src/mcp/server.ts:369` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L64) | none | none | NO IN-REPOSITORY CALLER FOUND | CALLED |
| 30 | `list_processes` | `src/mcp/server.ts:390` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L67); process.execute (catalog L106) | none | none | NO IN-REPOSITORY CALLER FOUND | CALLED |
| 31 | `list_searches` | `src/mcp/server.ts:382` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | search.local (catalog L80) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 32 | `list_sessions` | `src/mcp/server.ts:389` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L66); process.execute (catalog L105) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 33 | `memory_batch` | `src/memory/mcp/tools.ts:298` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 34 | `memory_consolidate` | `src/memory/mcp/tools.ts:367` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L231) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 35 | `memory_delete` | `src/memory/mcp/tools.ts:284` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 36 | `memory_evolve` | `src/memory/mcp/tools.ts:356` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 37 | `memory_export` | `src/memory/mcp/tools.ts:219` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L232) | T/memory/memory-v2-host-integration.test.ts:88 | none | TEST-ONLY | CALLED |
| 38 | `memory_feedback` | `src/memory/mcp/tools.ts:309` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | T/metaclaw-feedback-target-adoption.test.ts:100 | none | TEST-ONLY | TEST-ONLY |
| 39 | `memory_import` | `src/memory/mcp/tools.ts:241` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 40 | `memory_list` | `src/memory/mcp/tools.ts:97` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L224) | T/four-plan-adoption-wave.test.ts:301; T/memory/memory-v2-host-integration.test.ts:82 | S/native-chat-completion.mjs:38 | CALLED (script + test) | CALLED |
| 41 | `memory_page` | `src/memory/mcp/tools.ts:120` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L225) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 42 | `memory_read` | `src/memory/mcp/tools.ts:145` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L226) | T/four-plan-adoption-wave.test.ts:302; T/memory/memory-v2-host-integration.test.ts:80; T/metaclaw-feedback-target-adoption.test.ts:31 | none | TEST-ONLY | CALLED |
| 43 | `memory_reindex` | `src/memory/mcp/tools.ts:349` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 44 | `memory_remember` | `src/memory/mcp/tools.ts:256` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 45 | `memory_retirement_review` | `src/memory/mcp/tools.ts:323` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L229) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 46 | `memory_retrieval_diagnostics` | `src/memory/mcp/tools.ts:207` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L228) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 47 | `memory_search` | `src/memory/mcp/tools.ts:166` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L227) | T/four-plan-adoption-wave.test.ts:303; T/memory/memory-task-reconnect.test.ts:107; T/memory/memory-v2-host-integration.test.ts:84; T/native-donor-workflows.test.ts:246 | none | TEST-ONLY | CALLED |
| 48 | `memory_status` | `src/memory/mcp/tools.ts:335` | `runtime.memoryService` `src/mcp/server.ts:410` | memory.read (catalog L230) | T/memory/memory-v2-host-integration.test.ts:86 | S/mcp-external-acceptance.mjs:200; S/mcp-external-acceptance.mjs:267 | CALLED (script + test)<br>not counted (fixture/denied): T/mcp-external-acceptance-harness.test.ts:21, T/mcp-task-effectiveness-eval.test.ts:15 | CALLED |
| 49 | `memory_update` | `src/memory/mcp/tools.ts:273` | `runtime.memoryService` `src/mcp/server.ts:410` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | none | NO IN-REPOSITORY CALLER FOUND<br>not counted (fixture/denied): T/mcp-task-effectiveness-eval.test.ts:19 | TEST-ONLY |
| 50 | `memory_v2_read` | `src/memory/mcp/experience-tools.ts:95` | `runtime.memoryExperience` `src/mcp/server.ts:419` | memory.read (catalog L233) | T/memory/memory-external-recall-deadline.test.ts:29; T/memory/memory-scope-mcp.test.ts:12; T/memory/memory-task-reconnect.test.ts:118; T/memory/memory-task-test-utils.ts:20; T/memory/memory-v2-host-integration.test.ts:114; T/native-shared-tool-registry.test.ts:170 | none | TEST-ONLY | CALLED |
| 51 | `memory_v2_write` | `src/memory/mcp/experience-tools.ts:124` | `runtime.memoryExperience` `src/mcp/server.ts:419` | memory.write (catalog L240) | T/memory/memory-scope-mcp.test.ts:96; T/memory/memory-task-reconnect.test.ts:143; T/memory/memory-task-test-utils.ts:20 | none | TEST-ONLY | CALLED |
| 52 | `move_file` | `src/mcp/server.ts:370` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | files.mutate (catalog L94) | T/project-structure-filesystem.test.ts:292 | none | TEST-ONLY | CALLED |
| 53 | `native_chat_bridge` | `src/mcp/native-chat-bridge-tools.ts:90` | external only: `src/mcp/server.ts:488`; early return when a native task id is passed `src/mcp/native-chat-bridge-tools.ts:89` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | none | S/native-chat-completion.mjs:46; S/native-chat-completion.mjs:67 | CALLED (script)<br>function-level test, not by tool name: T/native-chat-bridge-facade.test.ts:50,87,107,120 (runNativeChatBridge) | CALLED |
| 54 | `phone_back` | `src/mcp/phone-tools.ts:199` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L195) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 55 | `phone_game_inspect` | `src/mcp/phone-game-tools.ts:32` | `runtime.phoneController` `src/mcp/server.ts:462` via `registerPhoneGameTools` `src/mcp/phone-tools.ts:276` | phone.observe (catalog L179); phone.act (catalog L201) | T/game-mode-advanced.test.ts:139 | none | TEST-ONLY | CALLED |
| 56 | `phone_game_manage` | `src/mcp/phone-game-tools.ts:112` | `runtime.phoneController` `src/mcp/server.ts:462` via `registerPhoneGameTools` `src/mcp/phone-tools.ts:276` | phone.act (catalog L202) | T/game-mode-advanced.test.ts:159 | none | TEST-ONLY | CALLED |
| 57 | `phone_home` | `src/mcp/phone-tools.ts:206` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L196) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 58 | `phone_input_text` | `src/mcp/phone-tools.ts:179` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L193) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 59 | `phone_key` | `src/mcp/phone-tools.ts:189` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L194) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 60 | `phone_launch_app` | `src/mcp/phone-tools.ts:213` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L197) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 61 | `phone_list_named_actions` | `src/mcp/phone-tools.ts:223` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.observe (catalog L178); phone.act (catalog L189) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 62 | `phone_long_press` | `src/mcp/phone-tools.ts:169` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L192) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 63 | `phone_observe` | `src/mcp/phone-tools.ts:95` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.observe (catalog L177); phone.act (catalog L188) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 64 | `phone_run_macro` | `src/mcp/phone-tools.ts:250` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L200) | T/game-mode-advanced.test.ts:94 | none | TEST-ONLY | CALLED |
| 65 | `phone_run_named_action` | `src/mcp/phone-tools.ts:240` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L199) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 66 | `phone_save_verified_action` | `src/mcp/phone-tools.ts:230` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L198) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 67 | `phone_status` | `src/mcp/phone-tools.ts:88` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.observe (catalog L176); phone.act (catalog L187) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 68 | `phone_swipe` | `src/mcp/phone-tools.ts:154` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L191) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 69 | `phone_tap` | `src/mcp/phone-tools.ts:144` | `runtime.phoneController` `src/mcp/server.ts:462` | phone.act (catalog L190) | none | none | NO IN-REPOSITORY CALLER FOUND | NO CALLER |
| 70 | `read_file` | `src/mcp/server.ts:359` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L61); browser.navigate (catalog L121) | T/agent-capability-execution-parity.test.ts:57; T/agent-context-compaction.test.ts:98; T/agent-cumulative-learning.test.ts:142; T/agent-tool-session.test.ts:18; T/agent-turn-outcomes.test.ts:100; T/bridge-runtime.test.ts:99; T/capability-residual-wave.test.ts:107; T/dtc1-durable-turn-continuation.test.ts:236; T/native-donor-workflows.test.ts:207; T/native-shared-tool-registry.test.ts:94; T/reflexion-second-wave.test.ts:61 | S/rea-harness-registration.mjs:45 | CALLED (script + test)<br>not counted (fixture/denied): T/agent-provider-anthropic.test.ts:17, T/agent-provider-anthropic.test.ts:257, T/agent-provider-anthropic.test.ts:258, T/agent-provider-anthropic.test.ts:338, T/agent-provider-anthropic.test.ts:480, T/agent-provider.test.ts:72, T/agent-provider.test.ts:96, T/learning-external-scope.test.ts:30, T/learning-external-scope.test.ts:68 | CALLED |
| 71 | `read_multiple_files` | `src/mcp/server.ts:365` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | observe.local (catalog L63) | T/native-donor-workflows.test.ts:423 | none | TEST-ONLY | CALLED |
| 72 | `read_process_output` | `src/mcp/server.ts:386` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | process.execute (catalog L103) | none | none (indirect: S/cumulative-workflow-eval.mjs:152 (model allow-list)) | NO IN-REPOSITORY CALLER FOUND | CALLED |
| 73 | `reconstruction_harness (external)` | `src/mcp/external-reconstruction-harness-tools.ts:21` | external only: `!native` `src/mcp/server.ts:489` | reconstruction.harness (catalog L51) | T/external-reconstruction-harness.test.ts:74; T/native-shared-tool-registry.test.ts:210 | S/rea-harness-registration.mjs:36; S/rea-harness-registration.mjs:52 | CALLED (script + test) | CALLED |
| 74 | `reconstruction_harness (native)` | `src/mcp/reconstruction-harness-tools.ts:10` | native only: `sharedNativeRegistry` / `nativeTaskId && nativeWorkspace` `src/mcp/server.ts:494-496` | same name | same name; see the row above | same name | same as row above |  |
| 75 | `restart_agent_core` | `src/mcp/restart-tool.ts:59` | external only: `!native` `src/mcp/server.ts:487` | not in `src/agent-capability-catalog.ts` (not Native-grantable) | T/restart-tool.test.ts:97 | none | TEST-ONLY | TEST-ONLY |
| 76 | `set_config_value` | `src/mcp/server.ts:358` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | admin.config (catalog L258) | T/bridge-runtime.test.ts:89 | none | TEST-ONLY | CALLED |
| 77 | `skills` | `src/mcp/skills-tools.ts:55` | `runtime.skillsService` `src/mcp/server.ts:450` | skills.inspect (catalog L210); skills.manage (catalog L217) | T/agent-tool-session.test.ts:97; T/capability-disclosure-integration.test.ts:81; T/capability-native-loop.test.ts:24; T/native-shared-tool-registry.test.ts:188; T/skill-discovery-observation.test.ts:32; T/skill-discovery-tools.test.ts:77; T/skill-read-coverage.test.ts:97; T/trusted-proposal-http.test.ts:51 | none | TEST-ONLY | CALLED |
| 78 | `start_process` | `src/mcp/server.ts:385` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | process.execute (catalog L102) | T/agent-capability-execution-parity.test.ts:61; T/agent-controller.test.ts:489; T/bridge-runtime.test.ts:125; T/reflexion-second-wave.test.ts:87 | none (indirect: S/cumulative-workflow-eval.mjs:152 (model allow-list)) | TEST-ONLY | CALLED |
| 79 | `start_search` | `src/mcp/server.ts:379` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | search.local (catalog L78) | T/bridge-runtime.test.ts:109 | none | TEST-ONLY | CALLED |
| 80 | `stop_search` | `src/mcp/server.ts:381` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | search.local (catalog L81) | none | none | NO IN-REPOSITORY CALLER FOUND<br>function-level test, not by tool name: T/authenticity-maintenance.test.ts:143 (handleStopSearch) | TEST-ONLY |
| 81 | `web_open` | `src/mcp/web-research-tools.ts:108` | `runtime.webResearch` `src/mcp/server.ts:497` | web.research (catalog L264) | T/web-research-mcp.test.ts:144 | none | TEST-ONLY | CALLED |
| 82 | `web_search` | `src/mcp/web-research-tools.ts:100` | `runtime.webResearch` `src/mcp/server.ts:497` | web.research (catalog L264) | T/web-research-mcp.test.ts:150 | none | TEST-ONLY | CALLED |
| 83 | `write_file` | `src/mcp/server.ts:366` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | files.mutate (catalog L90) | T/agent-capability-execution-parity.test.ts:50; T/agent-controller.test.ts:839; T/agent-os-tool-grant-adoption.test.ts:32; T/agent-tool-session.test.ts:101; T/bridge-runtime.test.ts:92; T/in-process-tool-host.test.ts:132; T/native-chat-reliability.test.ts:258; T/native-donor-workflows.test.ts:206; T/native-provider-wait.test.ts:120 | none (indirect: S/cumulative-workflow-eval.mjs:152 (model allow-list)) | TEST-ONLY | CALLED |
| 84 | `write_pdf` | `src/mcp/server.ts:367` | unconditional, native + external (`tool()` helper `src/mcp/server.ts:141-144`) | files.mutate (catalog L91) | T/bridge-runtime.test.ts:155 | none | TEST-ONLY | CALLED |

#### 3.5b Tools with `NO IN-REPOSITORY CALLER FOUND` (42): exact query and every surviving hit

Query form: `rg -n -P "[\x27\x22\x60]<tool>[\x27\x22\x60]" src tests scripts extensions tunnel-client` (matches the name in single, double or back quotes). Every hit listed is one of: the registration or implementation file's own telemetry/schema/description text, the Native catalog row, a label map in the UI, or a test that lists, budgets, records usage for, or fakes the tool. `T/rdc-parity.test.ts`, `T/mcp-manifest-contract.test.ts` and `T/agent-capability-resolver.test.ts` appear as list assertions only.

| Tool | Exact query (repo root) | Surviving hits (all are non-calls) | Reachable by |
|---|---|---|---|
| `code_graph` | `rg -n -P "[\x27\x22\x60]code_graph[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:140; src/capability-awareness.ts:80; src/mcp/code-intelligence-tools.ts:89,121,146,244,254,262,275,284; U/activityPhase.test.ts:29; U/AgentTimeline.test.tsx:17; T/capability-awareness.test.ts:15; T/capability-disclosure-integration.test.ts:11,52,53,60,62; T/capability-usage.test.ts:9,13,27,37 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `code_patterns` | `rg -n -P "[\x27\x22\x60]code_patterns[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:144; src/capability-awareness.ts:80; src/mcp/code-intelligence-tools.ts:478,490,543 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `code_refactor` | `rg -n -P "[\x27\x22\x60]code_refactor[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:153; src/capability-awareness.ts:80; src/mcp/external-controller-tool-support.ts:59; src/mcp/semantic-ide-tools.ts:85,94,106; U/activityPhase.ts:99; T/agent-capability-resolver.test.ts:26,184,192; T/capability-usage.test.ts:14; T/semantic-ide-mcp.test.ts:28,48 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `code_repair` | `rg -n -P "[\x27\x22\x60]code_repair[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:145,154; src/capability-awareness.ts:80; src/mcp/code-intelligence-tools.ts:707,715,758,769 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `code_symbol` | `rg -n -P "[\x27\x22\x60]code_symbol[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:163; src/capability-awareness.ts:83; src/mcp/semantic-ide-tools.ts:41,54,71; T/agent-os-tool-grant-adoption.test.ts:44; T/semantic-ide-mcp.test.ts:28,48 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `code_workspace` | `rg -n -P "[\x27\x22\x60]code_workspace[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:143,155; src/capability-awareness.ts:82; T/agent-capability-resolver.test.ts:27,192; T/agent-os-tool-grant-adoption.test.ts:44; T/semantic-ide-mcp.test.ts:33 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `file_checkpoint` | `rg -n -P "[\x27\x22\x60]file_checkpoint[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:89; src/mcp/external-controller-tool-support.ts:39; src/mcp/server.ts:355; src/rdc/checkpoints/service.ts:295; src/rdc/checkpoints/task-changes.ts:79; src/security/evidence-capture-policy.ts:55,132; U/activityPhase.ts:102; T/agent-capability-resolver.test.ts:18,126; T/native-shared-tool-registry.test.ts:156; T/rdc-parity.test.ts:8 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `force_terminate` | `rg -n -P "[\x27\x22\x60]force_terminate[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:113; src/agent-turn-events.ts:165; src/capability-awareness.ts:87; src/rdc/utils/usageTracker.ts:50; U/activityPhase.ts:69; T/rdc-parity.test.ts:11 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `get_prompts` | `rg -n -P "[\x27\x22\x60]get_prompts[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:70; src/mcp/result-budget.ts:19; T/rdc-parity.test.ts:13 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `give_feedback_to_desktop_commander` | `rg -n -P "[\x27\x22\x60]give_feedback_to_desktop_commander[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:252; T/rdc-parity.test.ts:13 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `interact_with_process` | `rg -n -P "[\x27\x22\x60]interact_with_process[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:104; src/agent-turn-events.ts:165; src/capability-awareness.ts:87; src/rdc/utils/usageTracker.ts:50; U/activityPhase.ts:65; U/ToolExecutionDetail.tsx:11; U/ToolExecutionEnhancement.test.tsx:133; U/ToolReadableCode.tsx:37; T/authenticity-maintenance.test.ts:130; T/rdc-parity.test.ts:11 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `kill_process` | `rg -n -P "[\x27\x22\x60]kill_process[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:113; src/capability-awareness.ts:87; src/rdc/utils/usageTracker.ts:54; U/activityPhase.ts:68; U/AgentTimeline.test.tsx:19; T/agent-capability-execution-parity.test.ts:68; T/agent-capability-resolver.test.ts:28,149,209,217; T/agent-capability-self-attestation.test.ts:7,19,25; T/capability-disclosure-integration.test.ts:64; T/rdc-parity.test.ts:12 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `list_directory` | `rg -n -P "[\x27\x22\x60]list_directory[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:64; src/agent-controller.ts:508; src/agent-turn-events.test.ts:23; src/agent-turn-events.ts:195; src/rdc/tools/filesystem.ts:552; src/rdc/utils/usageTracker.ts:49; src/security/evidence-capture-policy.ts:53,115; U/activityPhase.ts:37; U/AgentTimeline.test.tsx:15; T/agent-capability-resolver.test.ts:9,57,61; T/agent-turn-outcomes.test.ts:87; T/rdc-parity.test.ts:7 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `list_processes` | `rg -n -P "[\x27\x22\x60]list_processes[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:67,106; src/rdc/utils/usageTracker.ts:54; U/activityPhase.ts:67; T/agent-os-result-integrity-adoption.test.ts:22,80; T/capability-usage.test.ts:8; T/mcp-result-budget.test.ts:27; T/rdc-parity.test.ts:11 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `list_searches` | `rg -n -P "[\x27\x22\x60]list_searches[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:80; src/rdc/utils/usageTracker.ts:52; U/activityPhase.ts:41; T/agent-capability-resolver.test.ts:14; T/rdc-parity.test.ts:9 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `list_sessions` | `rg -n -P "[\x27\x22\x60]list_sessions[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:66,105; src/mcp/failure-loop-advisor.ts:40; src/rdc/utils/usageTracker.ts:50; T/mcp-result-budget.test.ts:20; T/rdc-parity.test.ts:11 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `memory_batch` | `rg -n -P "[\x27\x22\x60]memory_batch[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/memory/mcp/tools.ts:303; U/activityPhase.ts:57; T/rdc-parity.test.ts:19 | MCP `tools/call` (R08) only; not Native-grantable |
| `memory_consolidate` | `rg -n -P "[\x27\x22\x60]memory_consolidate[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:231; src/memory/mcp/tools.ts:373; T/rdc-parity.test.ts:20 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `memory_delete` | `rg -n -P "[\x27\x22\x60]memory_delete[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/memory/mcp/tools.ts:289; T/rdc-parity.test.ts:18 | MCP `tools/call` (R08) only; not Native-grantable |
| `memory_evolve` | `rg -n -P "[\x27\x22\x60]memory_evolve[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/memory/mcp/tools.ts:361; T/rdc-parity.test.ts:20 | MCP `tools/call` (R08) only; not Native-grantable |
| `memory_import` | `rg -n -P "[\x27\x22\x60]memory_import[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/memory/mcp/tools.ts:246; T/mcp-manifest-contract.test.ts:86; T/rdc-parity.test.ts:18 | MCP `tools/call` (R08) only; not Native-grantable |
| `memory_page` | `rg -n -P "[\x27\x22\x60]memory_page[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:225; src/memory/mcp/tools.ts:125; src/memory/retrieval-ledger.ts:45,210; U/activityPhase.ts:48; T/mcp-manifest-contract.test.ts:83; T/rdc-parity.test.ts:17 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `memory_reindex` | `rg -n -P "[\x27\x22\x60]memory_reindex[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/memory/mcp/tools.ts:354; T/rdc-parity.test.ts:19 | MCP `tools/call` (R08) only; not Native-grantable |
| `memory_remember` | `rg -n -P "[\x27\x22\x60]memory_remember[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/memory/mcp/tools.ts:262; U/activityPhase.test.ts:26; U/activityPhase.ts:55; T/rdc-parity.test.ts:18 | MCP `tools/call` (R08) only; not Native-grantable |
| `memory_retirement_review` | `rg -n -P "[\x27\x22\x60]memory_retirement_review[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:229; src/memory/mcp/tools.ts:329; T/mcp-manifest-contract.test.ts:82; T/rdc-parity.test.ts:19 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `memory_retrieval_diagnostics` | `rg -n -P "[\x27\x22\x60]memory_retrieval_diagnostics[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:228; src/memory/mcp/tools.ts:213; U/activityPhase.ts:50; T/mcp-manifest-contract.test.ts:84; T/rdc-parity.test.ts:17 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `memory_update` | `rg -n -P "[\x27\x22\x60]memory_update[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/memory/mcp/tools.ts:278; U/activityPhase.ts:56; T/mcp-task-effectiveness-eval.test.ts:19,62,63; T/memory/memory-reference-wave-16-21-adoption.test.ts:152; T/rdc-parity.test.ts:18 | MCP `tools/call` (R08) only; not Native-grantable |
| `phone_back` | `rg -n -P "[\x27\x22\x60]phone_back[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:195; src/mcp/phone-tools.ts:204 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_home` | `rg -n -P "[\x27\x22\x60]phone_home[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:196; src/mcp/phone-tools.ts:211 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_input_text` | `rg -n -P "[\x27\x22\x60]phone_input_text[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:193; src/mcp/phone-tools.ts:184 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_key` | `rg -n -P "[\x27\x22\x60]phone_key[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:194; src/mcp/phone-tools.ts:194 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_launch_app` | `rg -n -P "[\x27\x22\x60]phone_launch_app[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:197; src/mcp/phone-tools.ts:218 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_list_named_actions` | `rg -n -P "[\x27\x22\x60]phone_list_named_actions[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:178,189; src/capability-awareness.ts:86; src/mcp/phone-tools.ts:76,228 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_long_press` | `rg -n -P "[\x27\x22\x60]phone_long_press[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:192; src/mcp/phone-tools.ts:174 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_observe` | `rg -n -P "[\x27\x22\x60]phone_observe[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:177,188; src/mcp/phone-tools.ts:76,100; T/agent-capability-resolver.test.ts:31 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_run_named_action` | `rg -n -P "[\x27\x22\x60]phone_run_named_action[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:199; src/mcp/phone-tools.ts:245 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_save_verified_action` | `rg -n -P "[\x27\x22\x60]phone_save_verified_action[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:198; src/mcp/phone-tools.ts:235 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_status` | `rg -n -P "[\x27\x22\x60]phone_status[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:176,187; src/capability-awareness.ts:86; src/mcp/phone-tools.ts:76,93; T/agent-capability-resolver.test.ts:30; T/agent-os-tool-grant-adoption.test.ts:44; T/agent-tool-session.test.ts:48,49 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_swipe` | `rg -n -P "[\x27\x22\x60]phone_swipe[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:191; src/mcp/phone-tools.ts:159 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `phone_tap` | `rg -n -P "[\x27\x22\x60]phone_tap[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:190; src/mcp/phone-tools.ts:149; U/AgentTimeline.test.tsx:27,39; T/agent-capability-resolver.test.ts:32 | MCP `tools/call` (R08) + Native dispatch (catalog) |
| `read_process_output` | `rg -n -P "[\x27\x22\x60]read_process_output[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:103; src/agent-controller.ts:512; src/agent-turn-events.ts:165; src/launcher.tests/ActivityExecutionJournalTests.cs:41; src/mcp/failure-loop-advisor.ts:38; src/rdc/utils/usageTracker.ts:50; U/ActivityLogScreenshot.test.tsx:14; U/ActivityLogVisualVariants.test.tsx:35; U/activityPhase.ts:66; U/ToolExecutionDetail.tsx:11; U/ToolExecutionEnhancement.test.tsx:94; T/activity-tool-detail.test.ts:48; T/activity-visual-capture/ActivityJournalFixture.cs:24; T/agent-capability-resolver.test.ts:20; T/authenticity-maintenance.test.ts:129; T/rdc-parity.test.ts:10; S/cumulative-workflow-eval.mjs:152,174,238 | MCP `tools/call` (R08) + Native dispatch (catalog); script allow-list S/cumulative-workflow-eval.mjs:152 (model allow-list) |
| `stop_search` | `rg -n -P "[\x27\x22\x60]stop_search[\x27\x22\x60]" src tests scripts extensions tunnel-client` | src/agent-capability-catalog.ts:81; src/rdc/utils/usageTracker.ts:52; U/activityPhase.ts:42; T/agent-capability-resolver.test.ts:15; T/rdc-parity.test.ts:9 | MCP `tools/call` (R08) + Native dispatch (catalog) |

#### 3.5c Notes that change how to read the verdicts

| Topic | Evidence |
|---|---|
| Function-level tests exist for some zero-caller tools (not by tool name): `get_prompts` `T/authenticity-maintenance.test.ts:88-92`; `stop_search` and `force_terminate` `T/authenticity-maintenance.test.ts:143,146`; `kill_process` `T/rdc-kill-process-guard.test.ts:9,18`; `native_chat_bridge` handler `T/native-chat-bridge-facade.test.ts:50,87,107,120` | these exercise the handler function, so the code is covered; the verdict only says nobody calls it by its MCP name |
| `skills` has two read-only action tables that disagree | finding N1: `src/mcp/skills-tools.ts:42` vs `src/mcp/mutation-safety.ts:358-360` |
| `skills` actions `retire` / `list_retired` | finding N2; no application caller, service and schema tests only |
| `native_chat_bridge` is external only | `src/mcp/native-chat-bridge-tools.ts:89` returns when a native task id is passed; `T/mcp-manifest-contract.test.ts:67` asserts it is absent from the Native surface |
| 79 vs 83 | `T/mcp-manifest-contract.test.ts:71` pins 79 for a fixture without Memory v2 (2), `artifact_inspect` (1) and `controller_learning` (1); 83 - 4 = 79 (F6) |

### 3.6 Coverage and limits

#### Counts and cross-checks

| Check | Command (read-only) | Result |
|---|---|---|
| Direct registrations | `rg -c "registerTool\(" src` summed over non-test files | 58 matches = 54 literal registrations + 4 non-literal sites (`src/mcp/server.ts:144` helper, `:335` wrapper, `src/mcp/in-process-tool-host.ts:6` comment, `:71` method definition) |
| Helper registrations | `tool-scan.mjs` pattern `^\s*tool\(server,\s*'name'` in `src/mcp/server.ts` | 29 |
| Bound register | `^\s*register\(\s*'name'` | 1 (`controller_contract`, `src/mcp/controller-contract.ts:70`) |
| Total | 54 + 29 + 1 | 84 registrations; 83 unique names; table 5a has 84 rows; names identical to the 83 of 2026-11-01 (0 added, 0 removed) |
| Registration lines vs yesterday | parsed the registration column of the 2026-11-01 table | 84 of 84 identical |
| Catalog coverage | `inv-scripts/catalog-map.mjs` | 71 tools have a row in `src/agent-capability-catalog.ts`; 12 do not (`controller_contract`, `controller_learning`, `native_chat_bridge`, `restart_agent_core`, and the memory mutators `memory_batch`, `memory_delete`, `memory_evolve`, `memory_feedback`, `memory_import`, `memory_reindex`, `memory_remember`, `memory_update`); 0 catalog rows without a registration |
| Routes | manual read of `src/http/app.ts` (all 635 lines), `src/oauth/service.ts:60-360`, `src/mcp/handler.ts:124-200`, `src/index.ts:265-360`, `scripts/tunnel/public-mcp-gateway.mjs` (all) | 30 entries in 1a (R01-R30), 4 in 1b (G01-G04); caller search by URL fragment with `inv-scripts/route-callers.mjs` over `src tests scripts extensions tunnel-client` and the repo-root `*.cmd/*.bat/*.ps1/*.yaml` files |
| Launcher messages | `inv-scripts/launcher-scan.mjs`, `inv-scripts/launcher-table.mjs` | 28 inbound types, 32 outbound types, 17 action ids; every inbound branch of `OnWebMessageReceivedAsync` (`MF:332-762`) mapped to its runtime call |
| UI pages | `inv-scripts/symbol-refs.mjs`, `inv-scripts/legacy-closure.mjs` | 15 page ids, 13 nav items, 6 legacy page components plus their helper closure |

Scripts used (all in the run's scratch folder, outside the repository; output in its `out` subfolder): `tool-scan.mjs` (registrations and per-name hits), `tool-classify.mjs` and `tool-final.mjs` (invocation-shaped test hits, verdicts), `catalog-map.mjs`, `route-callers.mjs`, `launcher-scan.mjs`, `launcher-table.mjs`, `gen-launcher.mjs`, `gen-tools.mjs`, `symbol-refs.mjs`, `legacy-closure.mjs`. Git was used read-only in the live repository (`git log 319def1..8b77ff8`, `git diff --name-status`, `git diff` on `src/http/app.ts`, `src/launcher/*.cs`, `src/ui/src/host.ts`, `src/ui/src/pages.tsx`, `src/mcp/skills-*.ts`, `src/agent-tool-session.ts`) only to attribute changes to commits.

#### What could not be resolved

- Dynamic callers: Native model tool calls (`src/agent-controller.ts:2022`), external MCP clients, browsers hitting OAuth pages, connectors registering or exchanging tokens. They are classified as framework/dispatch or external integration, never as unused.
- Real traffic was not observed: no logs, no server run, no `dist/` inspection (the running build may differ from source).
- Cloudflare dashboard hostname/path rules, the external Worker `agent-core-mcp.joefreccejunior50.workers.dev`, and the unsigned `tunnel-client.exe` filtering cannot be checked from the repository; `tunnel-client/agent-core.yaml` is untracked, so only the example profile was read.
- Verification pass: all 42 queries of table 5b were re-run verbatim with `rg -P` over `src tests scripts extensions tunnel-client` (`verify-queries.mjs`) and return exactly the listed hits (0 extra, 0 missing). The other cited negative queries (F2, F4, N3, R07, UI network, extension, gateway tests, framework directives) were re-run as written; the R04 and R07 queries return the `svc` lines listed.
- Test classification is textual: a test that builds a tool name at run time or calls a handler through a helper that hides the literal would be missed. The 42 zero-caller rows were each re-read line by line; the 35 `TEST-ONLY` rows rely on one or more invocation-shaped lines (first line shown per file).
- The 2026-11-01 verdict method differs (see Delta). Tool counts are therefore not comparable one-to-one; the registration set is.
- Out of scope and not read: `runtime/`, `dist/`, `vendor/`, `SubProject/`, `node_modules/`, `Backups/`, `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/`, `.env` files, `docs/` (documentation mentions are not callers), skill documents under `runtime/skills`, and the launcher binaries.
- The package scripts in `package.json` and about 90 files under `scripts/` were scanned for route and tool references only, not enumerated as entry points; the one new script entry point found is `scripts/verify/claude-code-post-edit-check.mjs`.
- Git Bash rewrites arguments that start with `/` into Windows paths; queries that begin with a route (for example `/health`) were therefore re-run with `MSYS_NO_PATHCONV=1`, otherwise they return nothing.

## 4. Final simplification review

`/simplify` was run with `code-simplifier.md` over the diff of this run (9 source files and 1 new test). Three read-only reviewers on `haiku` examined reuse, simplification and efficiency; the altitude angle was reviewed by the main agent because the concurrency limit is 3 and the fourth reviewer was refused.

Applied:

- `src/mcp/skills-tools.ts`: `isReadOnlyToolCall('skills', undefined, input)` is computed once as `readOnly` before the `try` instead of twice in the success and error returns.
- Two doc comments shortened (`mutation-safety.ts` table, `sha256Digest`); the unverifiable "single owner" wording was removed.
- `tests/mutation-safety-skills-actions.test.ts`: one `it.each` over `(action, expected)` pairs, and the last case split into two.

Skipped, with the reason:

- Renaming call sites to drop the aliases `pathInside as within` (`workspace-resolver.ts`) and `sha256Digest as digest` (`agent-turn-checkpoint.ts`): the previous pass set the convention that local names stay through import aliases, which keeps each edit to the import line.
- Hoisting `comparablePath(target)` out of the `.filter`/`.some` loops (`workspace-resolver.ts:220`, `:241`, `portability/project-structure.ts`): it is older code outside this diff, and it would be speed work.
- `src/security/verified-result-artifact.ts:26` `inside`: the reviewer confirmed it is `relative`-based and returns false for the root itself, so it is not equivalent and was not merged.

Altitude (main agent): each owner fits its module (`pathInside` next to `comparablePath`; `sha256Digest` in the module `agent-turn-checkpoint.ts` already imports; the read-only table in the module that the mutation journal and the Plan-mode gate already ask). A deeper change would declare the read-only set next to the action enum in `src/mcp/skills-schemas.ts` so the schema and the gate cannot drift; the new test pins all 21 actions instead, which fails loudly when one is added. All 11 read actions were checked in source to write nothing (section 2.5). The seven newly read-only actions also skip `runMutation` (no journal entry, drain gate or idempotency receipt), exactly as the other four reads already did.

## 5. Open work

1. Pre-existing at `HEAD`, unchanged by this run, needs its own task: the manifest budget (132,877 > 131,072 bytes, +86 since the last pass); 15 s timeouts under load in `semantic-ide-provisioning` (and `game-mode-advanced`, which passed when the machine was less loaded); and six failures at pure `HEAD` in `agent-controller`, `agent-chat-service` and `agent-chat-attachments-wiring`, where the `messageOrigin` assertion is a plain mismatch, not a timeout.
2. The `OPEN` duplicate groups in section 2.2.
3. 829 export candidates (415 / 175 / 239) are retained as requested; none was deleted. Dropping an unneeded `export` keyword on the 415 is a separate decision.
4. Entry-point findings still open (section 3.0): F2 (no UI trigger for `POST /agent/run`), F3 (six legacy pages unreachable), F4 (two launcher actions without a sender), F5 (42 tools without a literal in-repository caller, now with a stricter rule), F6 (stale `scripts/release/release-compat.mjs`), F7 (informational); new N2 (`skills` actions `retire` and `list_retired` have no tool-level test or application caller), N3 (two launcher result messages with no UI receiver), N4 (`transport` is now a constant), N5 (the toggle branch of the moved skills route has no `try/catch`, so a failing catalog read ends in the generic 500). N1 is closed by this run.
5. `.anchor/` and `.recall/` (untracked plugin state) are not declared in `docs/PROJECT-STRUCTURE.md`, so `npm run structure:check` and the post-edit path-policy hook fail. Declaring them (as `052d1ab` did for the `remember` folder) or ignoring them is a decision for the owner; they were not touched.
6. The Pass 1 analyser and its scripts live in the run's scratch folder, not in the repository; keeping them in the repository would be a separate decision.
