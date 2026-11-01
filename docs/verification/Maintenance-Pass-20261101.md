# Maintenance pass: Agent Core source (2026-11-01)

Status: the consolidation is committed locally (no push). The 3 red targeted tests are **pre-existing at `HEAD 055a856`** with identical failures (section 2.4); the remaining items stay `OPEN` (section 5). No unused candidate was deleted.

Scope requested: an explicit `/maintenance "E:\Projects\Agent-Core"` run, meaning all three passes plus the final simplification step. Baseline: `HEAD 055a856`, branch `docs/restart-agent-core-via-cmd`, clean working tree before the run.

## 0. Coverage and limitations

| Item | Value |
| --- | --- |
| Analysed | every `.ts/.tsx/.mts/.cts/.js/.mjs/.cjs` under `src/`, `tests/`, `scripts/`: 954 files before the change, 957 after (435 → 438 source files, 443 test files) |
| Excluded | `node_modules`, `dist`, `runtime/`, `SubProject/`, `vendor/`, `extensions/`, `docs/`, `.changeset/`, `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/`, build output (`bin`, `obj`) |
| Not analysed for unused code | C# launcher (38 files), Go, Rust and Python trees (they live under `SubProject/` and `vendor/`) |
| Tooling | TypeScript compiler API 6.0.3 from `typescript-lsp-runtime` (module resolution `Bundler`), ripgrep 15.1.0 for the independent name cross-check, `tsc` 7.0.2 and vitest for verification. No analyser was installed. |
| Production roots | 131: `src/index.ts`, every `dist/<x>.js` named by scripts, launcher, `package.json` (mapped back to `src/<x>.ts`), tsconfig-excluded entry files, the Vite entry, tool configs loaded by convention, and all of `scripts/**` |
| Test roots | `tests/**` and `src/**/*.test.*` (443 files) |

How a verdict is produced:

- **Edges** come from static imports, `export … from`, dynamic `import()`, `require()`, `import('x').T` types, `new URL('./x.js', import.meta.url)` entries, and `dist/<path>.js` strings in scripts and tests.
- **Name usage** is resolved per `file::export`: named imports, default imports, namespace member access (`ns.x`, `ns['x']`, `ns.T`), destructured dynamic imports, re-export chains and `export *`. A namespace or dynamic import whose members cannot be resolved marks the whole module `UNCERTAIN`.
- **Cross-check:** every unreferenced name was searched as a whole word in `src`, `tests`, `scripts`. 397 of the 419 `UNREFERENCED` names occur in no other file; for the other 22 the two nearest files are printed in the evidence column.
- Not resolvable from source: string-keyed registries, reflection, external MCP and OAuth clients, anything under `dist/`.
- The entry-point inventory in part 3 was produced by a read-only subagent while this run edited files, so lines marked `*` there may have shifted by a few lines. Only helper functions moved; no route, page or tool declaration changed.

## 1. Pass 1: unreferenced files and symbols (all retained)

Pre-change run: 430 of 435 source files reachable from the production roots; 2563 exports in reachable files, 1724 with a production reference, 839 without.
Refreshed after the consolidation: 433 of 438; 2573 exports, 1734 referenced, 839 not. The candidate set is identical (419 / 203 / 217); the three new shared modules and their 10 exports are all referenced.

### 1.1 Files not reachable from the production roots

| File | Importers (graph) | Other references | Group | Verdict |
| --- | --- | --- | --- | --- |
| `src/auth/persistent-file.ts` | none | none | 1 | UNREACHABLE FROM KNOWN ROOTS. No importer in src, tests or scripts; only a historical file list in docs/agent-core/Agent-Core-17.md mentions it. Retained. |
| `src/memory/outcome/diagnostics-verifier.ts` | `src/memory/outcome/diagnostics.ts` | `scripts/memory/consolidation-source-map.json` | 2 | UNREACHABLE FROM KNOWN ROOTS (see pair above). Retained. |
| `src/memory/outcome/diagnostics.ts` | `src/memory/outcome/diagnostics-verifier.ts` | `scripts/memory/consolidation-source-map.json` | 2 | UNREACHABLE FROM KNOWN ROOTS (isolated pair with diagnostics-verifier.ts: each is imported only by the other). docs/memory/PLAN-EXTERNAL-MEMORY-WORKFLOW-COMPLETION.md records the verifier as intentionally kept; scripts/memory/consolidation-source-map.json lists both paths. Retained. |

### 1.2 Files reachable only from tests

| File | Test importers | Verdict |
| --- | --- | --- |
| `src/memory/examples/controller-continuation.ts` | `tests/memory/engine/memory-controller-continuation.test.ts:3` (static import) | TEST-ONLY. Retained. |
| `src/memory/migration.ts` | `tests/memory/engine/memory-experience-migration.test.ts:29` (dynamic import) | TEST-ONLY. Retained. |

### 1.3 Exported symbols with no production reference

Every row is an export of a file that is reachable from the production roots. The evidence column is the negative query result for that exact `file::name` pair.

#### UNREFERENCED IN SCOPE (419)

| Symbol (`path:line`) | Kind | Evidence |
| --- | --- | --- |
| `src/agent-capability-catalog.ts:32` `AgentCapabilityTool` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-capability-catalog.ts:37` `AgentCapabilityDescriptor` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:18` `AgentCapabilityPolicyConfig` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-capability-resolver.ts:24` `AgentCapabilityRequest` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-capability-resolver.ts:33` `AgentCapabilityDenied` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:43` `AgentCapabilityResolution` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-capability-resolver.ts:101` `inferUserRiskCeiling` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-chat-service.ts:40` `SlashSkillCatalog` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-chat-service.ts:64` `AgentChatEventSink` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-chat-service.ts:68` `AgentChatTurnResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-context-accounting.ts:59` `ContextSource` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-context-compaction.ts:8` `HISTORY_SUMMARY_MARKER` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-context-compaction.ts:36` `TurnCompaction` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-context-usage.ts:30` `CHARS_PER_TOKEN` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:14` `knowledgeRevision` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:23` `AgentKnowledgePacket` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:35` `KnowledgeSourceStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/agent-knowledge-synthesis.ts:55` `KnowledgePacketCoverage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-learning-loop.ts:101` `AgentStrategyDeclaration` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/agent-learning-loop.ts:148` `procedureContract` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/agent-provider-errors.ts:56` `parseRetryAfterMs` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-provider-errors.ts:86` `parseResetAtMs` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-provider-readiness.ts:10` `ReadinessRoute` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (14 occurrences); the word occurs in no other file |
| `src/agent-provider-scheduler.ts:16` `ProviderPoolCursor` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); same word also occurs in `src/agent-provider-state.ts` (different symbol or text, not an import of this one) |
| `src/agent-provider-scheduler.ts:28` `ScheduledProviderCredential` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-provider-scheduler.ts:34` `SchedulerSelectionResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-provider-state.ts:11` `ProviderCredentialOperationalState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-provider-state.ts:18` `ProviderBreakerState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/agent-provider-state.ts:20` `ProviderCredentialDescriptor` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/agent-provider-state.ts:83` `ProviderSelectionResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-provider.ts:57` `AgentProviderRouteConfig` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:190` `AgentProviderRouteHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:208` `AgentProviderHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:243` `AgentProviderRouteTransition` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:244` `AgentProviderRoutingKey` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/agent-provider.ts:250` `AgentProviderRoutingRoute` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:12` `AgentMemoryUse` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); same word also occurs in `src/agent-turn-checkpoint.ts`, `src/agent-chat-store.ts` +3 (different symbol or text, not an import of this one) |
| `src/agent-runtime.ts:41` `AgentRuntimeTaskStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:51` `AgentRuntimeSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:60` `AgentRuntimeFinalizationState` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-runtime.ts:72` `AgentRuntimeTask` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (13 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:106` `AgentRuntimeHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:135` `FinalizeTaskInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:143` `AgentCumulativeEvaluationSummary` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-runtime.ts:158` `AgentCumulativeEvaluation` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:21` `AGENT_TURN_CHECKPOINT_MAX_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:36` `AgentTurnArtifactReference` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:42` `AgentTurnPendingTool` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:51` `AgentTurnMemoryEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-turn-checkpoint.ts:57` `AgentTurnFinalResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-turn-events.ts:5` `AgentTurnEventType` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-turn-events.ts:116` `TOOL_STEP_TEXT_LIMIT` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/agent-turn-outcomes.ts:65` `ToolOutcome` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/artifact-analysis/asar.ts:4` `AsarInspect` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/artifact-analysis/contracts.ts:2` `ArtifactOutcome` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/artifact-analysis/javascript.ts:5` `inspectJavaScript` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/artifact-analysis/worker.ts:5` `WorkerSummary` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/artifact-analysis/worker.ts:12` `activeArtifactWorkers` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/auth/key-store.ts:228` `KEY_PREFIX` | export-list | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/auth/key-types.ts:13` `AuthenticationMode` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/auth/tool-grant.ts:5` `toolGrantSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:18` `ReviewHunk` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:24` `ReviewChangedFile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:30` `ReviewSeed` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/code-intelligence/change-review.ts:49` `ChangedSymbolReview` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/code-intelligence/changed-source-security.ts:6` `AdvisorySeverity` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/code-intelligence/changed-source-security.ts:8` `AdditiveSecurityRule` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/changed-source-security.ts:17` `SecurityAdvisoryFinding` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/code-intelligence/graph-observability.ts:17` `GraphIntegritySnapshot` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/code-intelligence/graph-observability.ts:43` `SourceRepresentationObservation` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/code-intelligence/types.ts:3` `CodeIntelligenceStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/code-intelligence/types.ts:6` `CodeIntelligenceResourcePolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/code-intelligence/types.ts:97` `CodeIsolationHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/code-intelligence/types.ts:102` `CodeProviderAttestationState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/code-intelligence/workspace-resolver.ts:26` `WorkspaceHygieneRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/code-intelligence/workspace-resolver.ts:47` `deriveWorkspaceName` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/failure-evidence.ts:48` `failureText` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); same word also occurs in `src/agent-controller.ts` (different symbol or text, not an import of this one) |
| `src/failure-evidence.ts:83` `boundedEvidenceExcerpt` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:10` `caseKind` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); same word also occurs in `scripts/verify/rea-harness-registration.mjs`, `src/harness/reconstruction/obligations.ts` +3 (different symbol or text, not an import of this one) |
| `src/harness/reconstruction/contracts.ts:11` `authority` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); same word also occurs in `src/agent-runtime.ts`, `src/agent-profile.ts` +79 (different symbol or text, not an import of this one) |
| `src/harness/reconstruction/contracts.ts:14` `claimSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:20` `obligationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:25` `selectionSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:28` `contradictionSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/harness/reconstruction/contracts.ts:49` `ProofAuthority` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/harness/reconstruction/obligations.ts:3` `CaseResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/harness/reconstruction/readiness.ts:5` `HarnessStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/http/auth.ts:6` `parseBearerToken` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/http/process-identity.ts:5` `ProcessIdentity` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); same word also occurs in `tests/process-ledger.test.ts`, `src/rdc/process-ledger.ts` (different symbol or text, not an import of this one) |
| `src/http/process-identity.ts:13` `BuildFreshness` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/curation-delta.ts:15` `curationDeltaSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/curation-delta.ts:23` `curationDeltaFingerprint` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/learning/decision-evidence.ts:55` `LearningDecisionRecorder` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/decision-projection.ts:4` `DecisionEvidenceItem` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/decision-review.ts:44` `decisionAssessmentSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/decision-review.ts:57` `DecisionAssessment` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/external-controller.ts:78` `ExternalArtifactKind` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:79` `ExternalArtifactResult` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/external-controller.ts:80` `ExternalControllerEvent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:95` `ExternalMemoryBinding` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:97` `ExternalControllerEpisode` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (23 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:132` `ExternalProcedureCandidate` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:157` `ExternalControllerContextInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:177` `ExternalArtifactReceiptInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/external-controller.ts:195` `ExternalProcedureInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/external-evaluation.ts:24` `ExternalEvaluationOutcome` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/learning/external-evaluation.ts:38` `ExternalEvaluationOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/external-improvements.ts:13` `externalImprovementInput` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/procedure-scaffold.ts:9` `PROCEDURE_SCAFFOLD_QUESTIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/skill-proposal-files.ts:50` `assertProposalPath` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/skill-proposal-notification.ts:4` `skillNoticeText` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/skill-proposal-notification.ts:41` `appendSkillNotices` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/learning/skill-proposal-types.ts:9` `ProposalStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/skill-proposal-types.ts:10` `SkillProposalNoticeReceipt` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/skill-proposal-types.ts:21` `SkillProposalFulfillment` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/state.ts:16` `LearningStateOwner` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/learning/types.ts:1` `LearningCandidateKind` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:21` `LearningEffectClaimType` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:22` `LearningEffectStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:81` `LearningCurationEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/types.ts:103` `LearningOrphanResolution` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/types.ts:179` `LearningCuratorRecommendation` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/types.ts:243` `EvaluatedEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/types.ts:248` `LearningVerification` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/learning/types.ts:274` `LearningCorrection` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/learning/workflow-evidence.ts:6` `validBrowserReceipt` | export-list | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/agent-learning-loop.ts`, `src/learning/service.ts` +1 (different symbol or text, not an import of this one) |
| `src/learning/workflow-evidence.ts:8` `BrowserUseResolution` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/artifact-inspect-tools.ts:50` `ArtifactInvocationValidator` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/call-tool-result.ts:1` `JsonToolResultLike` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/controller-contract.ts:6` `ContractSnapshot` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/external-controller-tool-support.ts:18` `ExternalControllerToolCall` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/failure-loop-advisor.ts:37` `FAILURE_LOOP_EXEMPT_TOOLS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/handler.ts:30` `BridgeMcpHttpOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/in-process-tool-host.ts:14` `HostToolConfig` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/in-process-tool-host.ts:22` `HostCallOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/in-process-tool-host.ts:31` `RegisteredHostTool` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/mutation-safety.ts:41` `MutationSafetyStatus` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/mcp/phone-game-schemas.ts:7` `region` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); same word also occurs in `scripts/verify/launcher-prototype-parity.mjs`, `src/ui/src/App.test.tsx` +13 (different symbol or text, not an import of this one) |
| `src/mcp/phone-game-schemas.ts:32` `gameProfile` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/mcp/skills-schemas.ts:6` `skillProposalDraft` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/bm25.ts:13` `Bm25Profile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/cognitive-config.ts:21` `CognitiveFeature` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/memory/cognitive-config.ts:30` `REM_MODEL_ASSIST_ENV_FLAG` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/cognitive-config.ts:31` `RemModelAssist` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/cognitive-maintenance.ts:37` `ContradictionReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/cognitive-maintenance.ts:44` `IntegrityReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/cognitive-maintenance.ts:52` `CognitiveCycleReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/memory/consolidation.ts:5` `ConsolidationCandidate` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/contradiction.ts:13` `ContradictionReason` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/contradiction.ts:25` `ContradictionPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/embedding-repair.ts:13` `EmbeddingRepairStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/embedding-repair.ts:15` `EmbeddingRepairJob` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/episodes.ts:133` `EpisodeExpansion` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/epistemic-confidence.ts:9` `EpistemicStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/epistemic-confidence.ts:18` `EpistemicLinkCounts` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/evidence-excerpt.ts:7` `ContentSpan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/evolution.ts:20` `AppliedEvolution` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/feedback.ts:15` `MEMORY_SALIENCE_MIN` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:16` `MEMORY_SALIENCE_MAX` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:17` `MEMORY_SALIENCE_STEP` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:21` `MemoryFeedbackEvent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:27` `MemoryLifecycleEvent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/feedback.ts:59` `MemoryLifecycleResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/graph-traversal.ts:13` `TraversalSeed` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/graph-traversal.ts:18` `TraversalHit` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/graph-traversal.ts:29` `TraversalOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/graph-traversal.ts:40` `MAX_TRAVERSAL_HOPS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/identifier-tokenizer.ts:5` `IdentifierTokens` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/index.ts:14` `IndexedPassage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/index.ts:19` `MemoryIndexOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/index.ts:20` `PassageScore` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/index.ts:23` `IndexEntry` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/memory/index.ts:32` `MemoryIndexFile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (12 occurrences); the word occurs in no other file |
| `src/memory/intelligence.ts:148` `proposalLinks` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/memory/memory-tiers.ts:15` `MemoryTierPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/memory-tiers.ts:42` `isStrongEvidence` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/memory-tiers.ts:47` `TieredSearchOutcome` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/passages.ts:8` `PASSAGE_WINDOW` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/passages.ts:9` `PASSAGE_OVERLAP` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/passages.ts:10` `MAX_MEMORY_PASSAGES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/privacy-masking.ts:15` `MaskResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/privacy-masking.ts:88` `MaskedInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/project-synthesis.ts:46` `SynthesisDependencyStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/project-synthesis.ts:47` `SynthesisEligibilityWait` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/project-synthesis.ts:48` `SynthesisDependencyResolver` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/query-embedding-cache.ts:4` `QueryEmbeddingKey` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/query-intent.ts:9` `FusionChannelName` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/query-intent.ts:11` `QueryIntent` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/query-intent.ts:13` `QueryIntentResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/reconsolidation-experiment.ts:6` `reconsolidationFixtureSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:17` `REM_TAG` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:53` `emptyDigestReasons` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:57` `DigestReasons` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/rem-consolidation.ts:138` `DigestOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/rem-model-assist.ts:12` `DreamingCompletionRequest` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/rem-model-assist.ts:15` `AssistRejection` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/rem-model-assist.ts:16` `AssistCheck` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:26` `MemoryRetrievalStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:27` `MemoryRetrievalDeliveryStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:28` `MemoryRetrievalDisposition` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:30` `MemoryRetrievalExposure` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:73` `MemoryRetrievalDiagnosticsInput` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:79` `MemoryUseApplicability` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:80` `MemoryUseResult` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/retrieval-ledger.ts:99` `MemoryUseReceipt` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (12 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:9` `MemorySearchDeliveryDetail` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:11` `MemorySearchDelivery` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:19` `MemorySearchRetrievalEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:31` `MemorySearchProjectionDisposition` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/search-projection.ts:37` `MemorySearchProjection` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/self-repair.ts:10` `OrphanReference` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/self-repair.ts:17` `EmbeddingDriftStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:6` `Subquestion` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); same word also occurs in `scripts/memory/consolidation-source-map.json`, `tests/memory/memory-subquestion-protocol.test.ts` (different symbol or text, not an import of this one) |
| `src/memory/subquestion-retrieval.ts:15` `RetrievalBudget` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:54` `RetrievalOrigin` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:58` `MergedRetrievalHit` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/subquestion-retrieval.ts:59` `QuestionCoverage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/transfer.ts:7` `MEMORY_TRANSFER_VERSION` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/memory/transfer.ts:10` `MemoryTransferRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/transfer.ts:25` `MemoryTransferPayload` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/memory/transfer.ts:37` `MemoryImportPlan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/net/outbound-request.ts:4` `OutboundSafety` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/net/outbound-request.ts:19` `OutboundRequestPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/oauth/store.ts:73` `RegisteredClient` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/oauth/store.ts:85` `PublicClient` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/oauth/store.ts:91` `OAuthResetOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/oauth/store.ts:95` `OAuthResetResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/oauth/store.ts:124` `OAuthExchange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/persistence/bounded-event-log.ts:14` `BoundedEventLogOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/persistence/bounded-event-log.ts:21` `EventLogAppendOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/controller.ts:24` `PhoneStatusReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/controller.ts:35` `Coordinate` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/phone/game-mode-types.ts:10` `GameStateCondition` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/game-mode-types.ts:17` `GameStateRule` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/game-mode-types.ts:23` `GameActionCategory` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/game-mode-types.ts:27` `GameActionSemantic` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/game-mode-types.ts:60` `GameObservationSummary` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/game-perception.ts:32` `measureRegion` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/phone/image.ts:4` `EncodedImage` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/portability/runtime-relocation.ts:16` `PortabilityPreparation` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/portability/runtime-relocation.ts:31` `currentMachineId` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/portability/runtime-relocation.ts:35` `PortabilityReindexRequest` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/control-state.ts:2` `ControlState` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/open-browser-use-runtime.ts:7` `OBU_EXTERNAL_HOST` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/open-browser-use.ts:24` `ObuConfiguration` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/open-browser-use.ts:25` `ObuDependencies` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:5` `BrowserShapeRole` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:6` `BrowserShapeBucket` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:57` `validBrowserShape` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:85` `compareBrowserShapes` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/browser-control/procedure-context.ts:107` `BrowserCompatibility` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/browser-control/service.ts:24` `BrowserOpenOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/browser-control/service.ts:25` `BrowserObserveOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/checkpoints/service.ts:54` `RestorePreview` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:20` `TASK_CHANGES_LIMITS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:26` `DiffState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:27` `ChangeState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:28` `AppliedChange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:42` `ExternalChange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/checkpoints/task-changes.ts:53` `RequestRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/config-field-definitions.ts:1` `ConfigFieldValueType` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/config-field-definitions.ts:3` `ConfigFieldDefinition` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/config-field-definitions.ts:43` `ConfigFieldKey` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/config-manager.ts:23` `ClientInfo` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/config-manager.ts:28` `RdcConfigHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/config-manager.ts:34` `normalizeTelemetryEnabledValue` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/config-manager.ts:51` `isTelemetryDisabledValue` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/config.ts:14` `TOOL_CALL_FILE` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/config.ts:15` `TOOL_CALL_FILE_MAX_SIZE` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/document-projection/archive-converter.ts:14` `ZipPreflightPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/archive-converter.ts:21` `PACKAGE_ZIP_PREFLIGHT` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/helpers.ts:167` `firstDescendant` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/document-projection/helpers.ts:226` `resolveHtmlLinks` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/helpers.ts:287` `basenameFromSource` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/document-projection/html-main-content.ts:9` `MainHtmlSelection` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/service.ts:47` `ProjectBytesOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/document-projection/service.ts:87` `DocumentProjectionService` | class | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/types.ts:6` `ProjectionEvidence` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/types.ts:49` `ProjectionContext` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/document-projection/types.ts:61` `ProjectedFileMetadata` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/document-projection/xlsx-evidence.ts:10` `XLSX_EVIDENCE_MAX_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/process-ledger.ts:8` `ProcessLedgerStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/process-ledger.ts:43` `processCommandDigest` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/process-ledger.ts:51` `queryProcessIdentitySync` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/search-manager.ts:15` `SearchResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/rdc/search-manager.ts:22` `SearchSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/search-manager.ts:38` `SearchSessionOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/search-manager.ts:55` `SearchManager` | class | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/terminal-manager.ts:81` `PaginatedOutputResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/edit.ts:118` `performSearchReplace` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); same word also occurs in `src/rdc/utils/files/text.ts` (different symbol or text, not an import of this one) |
| `src/rdc/tools/fuzzySearch.ts:6` `recursiveFuzzyIndexOf` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/rdc/tools/fuzzySearchCore.ts` (different symbol or text, not an import of this one) |
| `src/rdc/tools/fuzzySearch.ts:9` `FUZZY_SEARCH_TIMEOUT_MS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/image-review.ts:22` `ImageReviewCriteria` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/image-source-dependencies.ts:19` `ReadBudget` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); same word also occurs in `src/memory/facade.ts`, `src/memory/disclosure.ts` (different symbol or text, not an import of this one) |
| `src/rdc/tools/image-source-dependencies.ts:20` `SourceReading` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/tools/image-source-dependencies.ts:21` `SourceDependenciesReport` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/tools/pdf/extract-images.ts:23` `ImageCompressionOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/rdc/tools/process.ts:16` `parseWindowsTasklistCsv` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/process.ts:36` `parsePsAux` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/prompts.ts:18` `PromptsData` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/tools/prompts.ts:32` `loadPromptsData` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:4` `GetConfigArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:24` `ListProcessesArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:85` `PdfInsertOperationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:93` `PdfDeleteOperationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:98` `PdfOperationSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:176` `FileCheckpointArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:231` `GetUsageStatsArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:234` `GiveFeedbackArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:271` `ListSearchesArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/tools/schemas.ts:274` `GetPromptsArgsSchema` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/types.ts:72` `CompletedSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/rdc/terminal-manager.ts` (different symbol or text, not an import of this one) |
| `src/rdc/types.ts:76` `ServerResponseContent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/types.ts:79` `FilePreviewStructuredContent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/types.ts:97` `ToolHandler` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/ui/file-preview/shared/preview-file-types.ts:8` `MARKDOWN_PREVIEW_EXTENSIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/ui/file-preview/shared/preview-file-types.ts:9` `HTML_PREVIEW_EXTENSIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/ui/file-preview/shared/preview-file-types.ts:11` `TEXT_PREVIEW_EXTENSIONS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/capture.ts:5` `runInUiOriginCallContext` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/capture.ts:9` `isInsideUiOriginCall` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/capture.ts:13` `isTelemetryDisabledByEnv` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/capture.ts:17` `sanitizeError` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/capture.ts:23` `captureBase` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/capture.ts:25` `capture_call_tool` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/capture.ts:26` `capture_ui_event` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/capture.ts:27` `captureRemote` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/files/factory.ts:122` `isImageFile` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/rdc/utils/files/index.ts`, `src/rdc/tools/mime-types.ts` +1 (different symbol or text, not an import of this one) |
| `src/rdc/utils/files/index.ts:10` `isImageFile` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/rdc/utils/files/factory.ts`, `src/rdc/tools/mime-types.ts` +1 (different symbol or text, not an import of this one) |
| `src/rdc/utils/files/index.ts:14` `ImageFileHandler` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/rdc/utils/files/image.ts`, `src/rdc/utils/files/factory.ts` (different symbol or text, not an import of this one) |
| `src/rdc/utils/files/index.ts:15` `BinaryFileHandler` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/rdc/utils/files/text.ts`, `src/rdc/utils/files/factory.ts` +1 (different symbol or text, not an import of this one) |
| `src/rdc/utils/files/index.ts:16` `ExcelFileHandler` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/rdc/utils/files/text.ts`, `src/rdc/utils/files/base.ts` +3 (different symbol or text, not an import of this one) |
| `src/rdc/utils/lineEndingHandler.ts:4` `LineEndingStyle` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/rdc/utils/lineEndingHandler.ts:47` `analyzeLineEndings` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/logger.ts:1` `LogLevel` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); same word also occurs in `src/semantic-ide/provider-registry.ts` (different symbol or text, not an import of this one) |
| `src/rdc/utils/logger.ts:3` `log` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (9 occurrences); same word also occurs in `scripts/research/skill-upstream-drift.mjs`, `scripts/inspect/work-receipt.mjs` +120 (different symbol or text, not an import of this one) |
| `src/rdc/utils/logger.ts:19` `logToStderr` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/ripgrep-resolver.ts:94` `clearRipgrepCache` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/rdc/utils/toolHistory.ts:10` `ToolCallRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/rdc/utils/toolHistory.ts:30` `CompactToolCallRecord` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/rdc/utils/usageTracker.ts:4` `ToolUsageStats` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (8 occurrences); the word occurs in no other file |
| `src/rdc/utils/usageTracker.ts:32` `OnboardingState` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/rdc/utils/usageTracker.ts:38` `UsageSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/security/environment.ts:16` `getAgentCoreOwnedSecretKeys` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/security/sensitive-file.ts:14` `assertSensitiveRegularFile` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/security/verified-result-artifact.ts:10` `RESULT_ARTIFACT_MAX_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/security/verified-result-artifact.ts:23` `ownedResultArtifactRoot` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/diagnostic-payload.ts:2` `DiagnosticPayload` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/freshness.ts:3` `WorkspaceFreshnessResult` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (10 occurrences); same word also occurs in `src/semantic-ide/types.ts`, `src/semantic-ide/language-server.ts` (different symbol or text, not an import of this one) |
| `src/semantic-ide/freshness.ts:7` `FreshnessSession` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:18` `ProviderArtifactRecipe` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (6 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:39` `ProvisionProviderOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:43` `ProvisionProviderResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:791` `provisionableProviderIds` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/provider-provisioning.ts:897` `ManagedProviderIssue` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:18` `ProviderCapabilityRequirement` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:23` `ProviderReadiness` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:34` `ProviderServerRequestResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:50` `ProviderPostInitializePlan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/semantic-ide/provider-registry.ts:55` `SemanticProviderAdapter` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/text-position.ts:11` `PositionPolicy` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/semantic-ide/text-position.ts:32` `validateTextRange` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/semantic-ide/transaction.ts:19` `TextFilePlan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/semantic-ide/transaction.ts:32` `RenamePlan` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/semantic-ide/transaction.ts:46` `WorkspacePlan` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/semantic-ide/transaction.ts:194` `WorkspaceApplyOptions` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/skills/claude-plugin.ts:13` `PluginFile` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:14` `SkillAdaptationChange` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:15` `ClaudeSkillStatus` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:21` `StrictSkillParser` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:23` `ClaudeSkillAnalysis` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:36` `ClaudePluginOtherComponent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:46` `ClaudeMarketplace` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:53` `ClaudeDeclaredComponent` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/skills/claude-plugin.ts:109` `PluginInventory` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/skills/discovery.ts:43` `SkillSearchResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/skills/discovery.ts:77` `MAX_SKILL_SEARCH_BYTES` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/skills/discovery.ts:78` `MAX_SKILL_EMBEDDING_UNITS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/tracker/tool-detail.ts:5` `DetailPhase` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/tracker/tool-detail.ts:6` `DETAIL_CHUNK_CHARS` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/ui/src/AgentTimeline.tsx:6` `StepCategory` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (5 occurrences); the word occurs in no other file |
| `src/ui/src/AgentTimeline.tsx:43` `TimelineItem` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/ContextMeter.tsx:22` `ContextMeterModel` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/ContextMeter.tsx:43` `ContextBreakdownRow` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/ContextMeter.tsx:67` `ContextMeterSegment` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/SlashMenu.tsx:3` `SLASH_MENU_LIMIT` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:3` `CodeLanguage` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:4` `CodePresentation` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:20` `shellLanguage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/ToolReadableCode.tsx:26` `fileLanguage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/activityPhase.ts:15` `ActivityPhaseInput` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/activityPhase.ts:22` `ActivityPhase` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/activityStates.ts:8` `ActivityGroup` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/activityStates.ts:12` `ActivityState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/activityStates.ts:415` `ACTIVITY_STATE_ORDER` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/src/chatSelection.ts:4` `ChatSelection` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (13 occurrences); the word occurs in no other file |
| `src/ui/src/chatSelection.ts:5` `ChatSelectionResolution` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/ui/src/components.tsx:37` `navItems` | variable | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/components.tsx:115` `RestartMenu` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/components.tsx:142` `ProcessCard` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/components.tsx:152` `Sidebar` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/src/components.tsx:318` `EmptyAction` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/src/pages.tsx:100` `DashboardPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/src/pages.tsx:146` `CoreRuntimePage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/src/pages.tsx:202` `SystemsPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/src/pages.tsx:321` `DiagnosticsPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/src/pages.tsx:344` `SettingsPage` | function | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/src/useTaskChanges.ts:8` `UseTaskChangesState` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/ui/vite.config.ts:5` `default` | default-expression | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/ui/vitest.config.ts:3` `default` | default-expression | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; the word occurs in no other file |
| `src/web-research/service.ts:14` `WebSearchMode` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:15` `WebSearchProvider` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (9 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:18` `WebOpenProvider` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:19` `WebOpenReader` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/web-research/service.ts:20` `WebContentScope` | type | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (2 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:40` `WebSearchResult` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (4 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:53` `WebSearchResponse` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (3 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:60` `WebOpenResponse` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (7 occurrences); the word occurs in no other file |
| `src/web-research/service.ts:84` `WebResearchHealth` | interface | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; used inside its own file (1 occurrence); the word occurs in no other file |
| `src/workflows/renderer.ts:5` `diagramId` | re-export | no import/re-export/namespace-member/dynamic reference in src, tests, scripts; not used inside its own file either; same word also occurs in `src/workflows/text.ts`, `src/workflows/diagram.ts` (different symbol or text, not an import of this one) |

#### TEST-ONLY (203)

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
| `src/agent-chat-store.ts:76` `AgentChatMessage` | interface | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:86` `AgentChatStepMeta` | interface | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:101` `NARRATION_STEP_TOOL` | variable | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:111` `STEP_RETENTION_MS` | variable | imported only by tests through a whole-module import |
| `src/agent-chat-store.ts:128` `AgentChatCheckpointRecord` | interface | imported only by tests through a whole-module import |
| `src/agent-context-accounting.ts:4` `OUTPUT_RESERVE_TOKENS` | variable | imported only by `tests/agent-context-accounting.test.ts` |
| `src/agent-context-accounting.ts:7` `AUTOMATIC_CONTEXT_MAX_BYTES` | variable | imported only by `tests/agent-context-accounting.test.ts` |
| `src/agent-context-compaction.ts:6` `TURN_SUMMARY_MARKER` | variable | imported only by `tests/agent-context-compaction.test.ts` |
| `src/agent-context-usage.ts:17` `contextUsagePercent` | function | imported only by `src/agent-context-usage.test.ts` |
| `src/agent-controller.ts:157` `RESPONSE_STYLE_CONTRACT` | variable | imported only by tests through a whole-module import |
| `src/agent-controller.ts:169` `WORKING_RULES_CONTRACT` | variable | imported only by tests through a whole-module import |
| `src/agent-controller.ts:377` `NativeAgentTaskInput` | interface | imported only by tests through a whole-module import |
| `src/agent-controller.ts:410` `NativeAgentContinuationHooks` | interface | imported only by tests through a whole-module import |
| `src/agent-controller.ts:422` `NativeAgentConversationTurnInput` | interface | imported only by tests through a whole-module import |
| `src/agent-provider-readiness.ts:62` `readinessDigest` | function | imported only by `tests/agent-provider-health.test.ts`, `tests/agent-provider-readiness.test.ts` |
| `src/agent-provider-state.ts:241` `summarizeCredentialVerdicts` | function | imported only by `tests/agent-provider-scheduler.test.ts` |
| `src/agent-provider.ts:68` `AgentProviderConfig` | interface | imported only by `tests/agent-provider-health.test.ts`, `tests/agent-provider-pool.test.ts`, `tests/agent-context-accounting.test.ts` |
| `src/agent-provider.ts:130` `AgentAnthropicContentBlock` | type | imported only by `tests/agent-provider-anthropic.test.ts` |
| `src/agent-provider.ts:453` `OpenAICompatibleProvider` | class | imported only by `tests/agent-provider.test.ts`, `tests/agent-provider-response-transport.test.ts`, `tests/agent-provider-anthropic.test.ts` |
| `src/agent-turn-checkpoint.ts:227` `normalizeAgentTurnCheckpoint` | function | imported only by `tests/agent-context-compaction.test.ts`, `tests/dtc1-durable-turn-continuation.test.ts`, `tests/native-proposal-promotion.test.ts` |
| `src/capability-awareness.ts:7` `CapabilityDisclosurePolicy` | type | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:8` `CapabilityKind` | type | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:17` `CAPABILITY_LABELS` | variable | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:152` `SkillReadCoverageEntry` | interface | imported only by tests through a whole-module import |
| `src/capability-awareness.ts:208` `skillReferenceRead` | function | imported only by `tests/skill-read-coverage.test.ts`, `tests/skill-discovery-observation.test.ts`, `tests/capability-native-loop.test.ts` |
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
| `src/learning/external-procedure.ts:25` `ExternalProcedureAdmission` | type | imported only by `tests/external-procedure.test.ts`, `tests/external-learning-promotion-api.test.ts` |
| `src/learning/external-procedure.ts:40` `parseExternalProcedureAdmission` | function | imported only by `tests/external-procedure.test.ts` |
| `src/learning/proposal-documents.ts:19` `ProposalDocumentList` | interface | imported only by tests through a whole-module import |
| `src/learning/proposal-documents.ts:20` `ProposalDocumentReadInput` | interface | imported only by tests through a whole-module import |
| `src/learning/proposal-documents.ts:21` `ProposalDocumentRead` | interface | imported only by tests through a whole-module import |
| `src/learning/proposal-documents.ts:39` `needsUserDecision` | function | imported only by tests through a whole-module import |
| `src/learning/proposal-documents.ts:59` `assertProposalDocumentPath` | function | imported only by tests through a whole-module import |
| `src/learning/salience-review.ts:39` `SalienceReviewInput` | type | imported only by `tests/salience-review.test.ts` |
| `src/learning/state.ts:27` `defaultLearningState` | function | imported only by `tests/cumulative-workflow.test.ts`, `tests/external-improvements.test.ts`, `tests/learning-finalization-continuity.test.ts` |
| `src/mcp/code-intelligence-tools.ts:48` `collectBoundedGraphTouches` | function | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/grafel-regrounding-g20-g25.test.ts` |
| `src/mcp/handler.ts:54` `bindAbortClose` | function | imported only by `tests/anthropic-sdk-third-wave.test.ts` |
| `src/mcp/native-chat-bridge-tools.ts:8` `nativeChatBridgeSchema` | variable | imported only by `tests/native-chat-bridge-facade.test.ts` |
| `src/mcp/native-chat-bridge-tools.ts:43` `runNativeChatBridge` | function | imported only by `tests/native-chat-bridge-facade.test.ts` |
| `src/mcp/restart-tool.ts:42` `requestAgentCoreRestart` | function | imported only by `tests/restart-tool.test.ts` |
| `src/mcp/streamable-http.ts:10` `parseJsonRpcHttpResponse` | function | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/mcp-streaming-response.test.ts` |
| `src/mcp/streamable-http.ts:48` `JsonRpcResponseOptions` | interface | imported only by tests through a whole-module import |
| `src/memory/archive.ts:128` `readMemoryAuditRefs` | function | imported only by `tests/memory/engine/memory-retention.test.ts` |
| `src/memory/cognitive-config.ts:9` `COGNITIVE_FEATURES` | variable | imported only by `tests/memory/memory-cognitive-scoring.test.ts` |
| `src/memory/cognitive-config.ts:24` `COGNITIVE_ENV_FLAG` | variable | imported only by `tests/memory/memory-cognitive-scoring.test.ts` |
| `src/memory/controller-session.ts:29` `ControllerRankedSnapshot` | interface | imported only by `tests/memory/engine/memory-relevance-controller.test.ts` |
| `src/memory/controller-session.ts:36` `ControllerMemoryBackend` | interface | imported only by `tests/memory/engine/memory-relevance-controller.test.ts` |
| `src/memory/disclosure.ts:13` `digestSchema` | re-export | imported only by tests through a whole-module import |
| `src/memory/disclosure.ts:14` `Validity` | re-export | imported only by tests through a whole-module import |
| `src/memory/disclosure.ts:14` `TimeValue` | re-export | imported only by tests through a whole-module import |
| `src/memory/evidence-excerpt.ts:48` `verifyMemoryExcerpt` | function | imported only by `tests/memory/engine/memory-evidence-excerpt-integration.test.ts`, `tests/memory/engine/memory-evidence-excerpt.test.ts`, `tests/memory/engine/memory-remaining-plans-integration.test.ts` |
| `src/memory/experience-types.ts:22` `validitySchema` | variable | imported only by tests through a whole-module import |
| `src/memory/experience-types.ts:31` `verificationSchema` | variable | imported only by tests through a whole-module import |
| `src/memory/experience-types.ts:77` `episodeEventInputSchema` | variable | imported only by tests through a whole-module import |
| `src/memory/experience-types.ts:111` `checkpointTriggerSchema` | variable | imported only by tests through a whole-module import |
| `src/memory/feedback.ts:372` `applyFeedbackSalience` | function | imported only by `tests/ecosystem-residual-adoption.test.ts` |
| `src/memory/mcp/tools.ts:17` `memoryTrust` | function | imported only by `tests/four-plan-adoption-wave.test.ts` |
| `src/memory/mcp/tools.ts:32` `memoryRememberLearningFinalizationAdvisory` | function | imported only by `tests/learning-finalization-continuity.test.ts` |
| `src/memory/memory-tiers.ts:20` `classifyMemoryTier` | function | imported only by `tests/memory/memory-cognitive-retrieval.test.ts` |
| `src/memory/memory-tiers.ts:32` `partitionByTier` | function | imported only by `tests/memory/memory-cognitive-retrieval.test.ts` |
| `src/memory/provenance.ts:10` `MemoryStalenessStatus` | type | imported only by tests through a whole-module import |
| `src/memory/provenance.ts:12` `MemoryStalenessAssessment` | interface | imported only by tests through a whole-module import |
| `src/memory/query-embedding-cache.ts:20` `DEFAULT_QUERY_CACHE_LIMITS` | variable | imported only by `tests/memory/engine/memory-query-embedding-cache.test.ts`, `tests/memory/engine/memory-remaining-plans-integration.test.ts`, `tests/memory/engine/memory-query-cache-integration.test.ts` |
| `src/memory/query-intent.ts:19` `NEUTRAL_FUSION_WEIGHTS` | variable | imported only by `tests/memory/memory-cognitive-retrieval.test.ts` |
| `src/memory/revisions.ts:19` `MemoryRevisionSnapshot` | interface | imported only by tests through a whole-module import |
| `src/memory/revisions.ts:20` `MemoryRevisionFile` | interface | imported only by tests through a whole-module import |
| `src/memory/revisions.ts:22` `revisionStatePath` | function | imported only by tests through a whole-module import |
| `src/memory/service.ts:64` `ControllerRetrievalPolicy` | type | imported only by `tests/memory/engine/memory-controller-ranking-policy.test.ts` |
| `src/memory/service.ts:105` `LinkInput` | interface | imported only by tests through a whole-module import |
| `src/memory/store.ts:17` `LoadedMemories` | interface | imported only by tests through a whole-module import |
| `src/memory/store.ts:24` `MemoryBatchPlan` | interface | imported only by tests through a whole-module import |
| `src/memory/store.ts:38` `StateSnapshot` | type | imported only by tests through a whole-module import |
| `src/memory/store.ts:40` `StorePlan` | type | imported only by tests through a whole-module import |
| `src/memory/subquestion-retrieval.ts:120` `markEvidenceReviewed` | function | imported only by `tests/memory/fixtures/memory-subquestion/replay.ts`, `tests/memory/memory-subquestion-merge.test.ts` |
| `src/memory/temporal.ts:10` `parseTimeValue` | function | imported only by `tests/memory/engine/memory-temporal.test.ts` |
| `src/memory/temporal.ts:16` `TemporalCandidate` | interface | imported only by tests through a whole-module import |
| `src/memory/temporal.ts:44` `TemporalTransitionInput` | type | imported only by tests through a whole-module import |
| `src/memory/transfer-v2.ts:30` `MemoryTransferV2Bundle` | type | imported only by `tests/memory/engine/memory-promotion-transfer.test.ts`, `tests/memory/engine/memory-transfer-review.test.ts` |
| `src/memory/transfer-v2.ts:247` `exportMemoryTransferV2` | function | imported only by `tests/memory/engine/memory-ingestion-receipt.test.ts`, `tests/memory/engine/memory-portability.test.ts`, `tests/memory/engine/memory-promotion-transfer.test.ts` |
| `src/memory/transfer-v2.ts:264` `previewMemoryTransferV2` | function | imported only by `tests/memory/engine/memory-promotion-transfer.test.ts`, `tests/memory/engine/memory-transfer-review.test.ts`, `tests/memory/engine/memory-transfer-v2.test.ts` |
| `src/memory/transfer-v2.ts:287` `importMemoryTransferV2` | function | imported only by `tests/memory/engine/memory-ingestion-receipt.test.ts`, `tests/memory/engine/memory-portability.test.ts`, `tests/memory/engine/memory-promotion-transfer.test.ts` |
| `src/memory/transfer.ts:298` `exportMemoryTransferV2` | re-export | imported only by `tests/memory/engine/memory-ingestion-receipt.test.ts`, `tests/memory/engine/memory-portability.test.ts`, `tests/memory/engine/memory-promotion-transfer.test.ts` |
| `src/memory/transfer.ts:298` `previewMemoryTransferV2` | re-export | imported only by `tests/memory/engine/memory-promotion-transfer.test.ts`, `tests/memory/engine/memory-transfer-review.test.ts`, `tests/memory/engine/memory-transfer-v2.test.ts` |
| `src/memory/transfer.ts:298` `importMemoryTransferV2` | re-export | imported only by `tests/memory/engine/memory-ingestion-receipt.test.ts`, `tests/memory/engine/memory-portability.test.ts`, `tests/memory/engine/memory-promotion-transfer.test.ts` |
| `src/memory/transfer.ts:299` `MemoryTransferV2Bundle` | re-export | imported only by `tests/memory/engine/memory-promotion-transfer.test.ts`, `tests/memory/engine/memory-transfer-review.test.ts` |
| `src/net/outbound-request.ts:6` `OutboundAttemptEvent` | interface | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/anthropic-sdk-third-wave.test.ts`, `tests/outbound-body-replayability.test.ts` |
| `src/net/public-address.ts:6` `NormalizedAddress` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:10` `PublicUrlBytes` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:11` `PublicReadOptions` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:13` `PublicReadDependencies` | interface | imported only by tests through a whole-module import |
| `src/net/public-url-read.ts:112` `createPublicUrlReader` | function | imported only by tests through a whole-module import |
| `src/oauth/store.ts:10` `MAX_UNAUTHORIZED_CLIENTS` | variable | imported only by `tests/oauth-registration-limits.test.ts` |
| `src/oauth/store.ts:25` `OAuthPrincipal` | interface | imported only by `tests/oauth-concurrency-review.test.ts` |
| `src/persistence/atomic-file.ts:9` `OwnedAtomicWriteOptions` | interface | imported only by tests through a whole-module import |
| `src/rdc/browser-control/canvas-observation.ts:22` `projectRaster` | function | imported only by `tests/systemone-browser-adoption.test.ts` |
| `src/rdc/browser-control/open-browser-use-runtime.ts:24` `ManagedBrowserUseRuntime` | class | imported only by `tests/managed-browser-use.test.ts`, `tests/browser-use-owner-startup.test.ts` |
| `src/rdc/browser-control/open-browser-use.ts:59` `obuSocketCandidates` | function | imported only by `tests/open-browser-use.test.ts` |
| `src/rdc/browser-control/service.ts:392` `BrowserControlService` | class | imported only by `tests/browser-control.test.ts`, `tests/systemone-browser-adoption.test.ts`, `tests/browser-panel-scroll.test.ts` |
| `src/rdc/command-guards.ts:20` `splitSegments` | function | imported only by `tests/command-guards.test.ts` |
| `src/rdc/document-projection/public-url.ts:10` `PublicDocumentOptions` | interface | imported only by tests through a whole-module import |
| `src/rdc/mutation-coordinator.ts:59` `PathMutationCoordinator` | class | imported only by `tests/four-plan-adoption-wave.test.ts` |
| `src/rdc/process-ledger.ts:11` `ProcessIdentity` | interface | imported only by `tests/process-ledger.test.ts` |
| `src/rdc/process-ledger.ts:89` `ProcessLedger` | class | imported only by `tests/process-ledger.test.ts` |
| `src/rdc/terminal-manager.ts:168` `TerminalManager` | class | imported only by `tests/terminal-manager-process-ledger-race.test.ts` |
| `src/rdc/tools/filesystem.ts:52` `READ_OPERATION_TIMEOUT_MS` | variable | imported only by tests through a whole-module import |
| `src/rdc/tools/filesystem.ts:396` `readFileFromUrl` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/filesystem.ts:493` `readFileFromDisk` | function | imported only by `tests/rdc-safe-regular-file.test.ts`, `tests/document-projection.test.ts`, `tests/xlsx-projection-evidence.test.ts` |
| `src/rdc/tools/filesystem.ts:937` `searchFiles` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/extract-images.ts:18` `PageImages` | interface | imported only by `tests/agixt-public-url-adoption.test.ts` |
| `src/rdc/tools/pdf/index.ts:2` `PdfInsertOperation` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:2` `PdfDeleteOperation` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:4` `PdfPageItem` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:4` `PdfParseResult` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:4` `PdfParseOptions` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:8` `extractImagesFromPdf` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:9` `ImageInfo` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/index.ts:9` `PageImages` | re-export | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/lib/pdf2md.ts:32` `PdfPageItem` | interface | imported only by `tests/agixt-public-url-adoption.test.ts` |
| `src/rdc/tools/pdf/manipulations.ts:15` `PdfInsertOperation` | export-list | imported only by `tests/agixt-public-url-adoption.test.ts` |
| `src/rdc/tools/pdf/manipulations.ts:15` `PdfDeleteOperation` | export-list | imported only by `tests/agixt-public-url-adoption.test.ts` |
| `src/rdc/tools/pdf/markdown.ts:86` `findPuppeteerChrome` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/pdf/markdown.ts:116` `pruneOldPuppeteerChromeBuilds` | function | imported only by tests through a whole-module import |
| `src/rdc/tools/schemas.ts:151` `BrowserControlArgsSchema` | variable | imported only by `tests/systemone-browser-adoption.test.ts` |
| `src/rdc/tools/schemas.ts:295` `toolArgSchemas` | variable | imported only by `tests/mcp-schema-contract.test.ts`, `tests/rdc-parity.test.ts` |
| `src/rdc/utils/files/safe-regular-file.ts:99` `RegularFileOpenOptions` | interface | imported only by tests through a whole-module import |
| `src/rdc/utils/files/safe-regular-file.ts:105` `GuardedRegularFile` | interface | imported only by tests through a whole-module import |
| `src/rdc/utils/files/safe-regular-file.ts:214` `regularFileGuardState` | function | imported only by `tests/rdc-safe-regular-file.test.ts` |
| `src/rdc/utils/toolHistory.ts:84` `ToolHistory` | class | imported only by `tests/reflexion-second-wave.test.ts`, `tests/capability-residual-wave.test.ts`, `tests/image-inspect-mcp.test.ts` |
| `src/security/environment.ts:6` `recordAgentCoreOwnedSecretKey` | function | imported only by `tests/anthropic-sdk-third-wave.test.ts` |
| `src/security/evidence-capture-policy.ts:9` `EVIDENCE_POLICY_MARKER` | variable | imported only by `tests/image-inspect-mcp.test.ts` |
| `src/security/evidence-capture-policy.ts:20` `EvidencePolicyState` | type | imported only by tests through a whole-module import |
| `src/security/evidence-capture-policy.ts:88` `extractEvidenceCandidatePaths` | function | imported only by `tests/image-inspect-mcp.test.ts` |
| `src/security/sensitive-file.ts:17` `readSensitiveTextFile` | function | imported only by `tests/anthropic-sdk-fourth-wave.test.ts`, `tests/anthropic-sdk-third-wave.test.ts` |
| `src/security/untrusted-text.ts:79` `neutralizeUntrustedText` | function | imported only by `tests/untrusted-text.test.ts` |
| `src/semantic-ide/protocol.ts:16` `LspResponseError` | class | imported only by `tests/semantic-ide-protocol-hardening.test.ts` |
| `src/semantic-ide/provider-provisioning.ts:31` `ProviderRecipe` | interface | imported only by `tests/semantic-ide-provisioning.test.ts` |
| `src/semantic-ide/source-io.ts:86` `encodeSource` | function | imported only by `tests/semantic-ide-source-safety.test.ts` |
| `src/semantic-ide/transaction.ts:326` `applyWorkspaceEdit` | function | imported only by `tests/semantic-ide-source-safety.test.ts`, `tests/semantic-ide-transaction-second-wave.test.ts`, `tests/semantic-ide-transaction.test.ts` |
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
| `src/ui/src/ContextMeter.tsx:5` `NEAR_FULL_PERCENT` | variable | imported only by `src/ui/src/ContextMeter.test.tsx` |
| `src/ui/src/ContextMeter.tsx:70` `contextSegmentWidths` | function | imported only by `src/ui/src/ContextMeter.test.tsx` |
| `src/ui/src/attachments.ts:5` `MAX_ATTACHMENT_BYTES` | variable | imported only by `src/ui/src/attachments.test.ts` |
| `src/ui/src/attachments.ts:6` `MAX_ATTACHMENT_TOTAL_BYTES` | variable | imported only by `src/ui/src/attachments.test.ts` |
| `src/ui/src/host.ts:1` `DesktopStatus` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:12` `ProviderServerSnapshot` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:18` `DesktopHealthSnapshot` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:132` `AgentRunResult` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:148` `AgentChatConversation` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:165` `AgentChatAttachment` | type | imported only by `src/ui/src/ChatAttachments.test.tsx` |
| `src/ui/src/host.ts:203` `AgentMemoryUse` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:211` `AgentChatMessage` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:244` `StepDetailResult` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:245` `StepDetailAction` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:265` `AgentChatDetail` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:310` `AgentProfileMetadata` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:375` `AGENT_ACTIVITY_LIMIT` | variable | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:378` `AgentChatStreamPreview` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:423` `AgentContextUsage` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:485` `TaskChangesRequest` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:498` `AgentChatCompactResult` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:503` `DreamingStatus` | type | imported only by tests through a whole-module import |
| `src/ui/src/host.ts:510` `NativeSkillInfo` | type | imported only by `src/ui/src/SkillsPage.test.tsx` |
| `src/ui/src/host.ts:546` `HostListener` | type | imported only by tests through a whole-module import |
| `src/ui/src/pages.tsx:243` `ActivityLogPage` | function | imported only by `src/ui/src/ActivityLogScreenshot.test.tsx`, `src/ui/src/ToolExecutionEnhancement.test.tsx`, `src/ui/src/ActivityLogVisualVariants.test.tsx` |
| `src/ui/src/pages.tsx:429` `ChatPage` | function | imported only by `src/ui/src/NativeChatReliability.test.tsx`, `src/ui/src/AgentActivity.test.tsx`, `src/ui/src/AgentSteps.test.tsx` |
| `src/workflows/analyzer.ts:8` `WORKFLOW_SOURCE_LIMITS` | variable | imported only by `tests/workflows-analyzer.test.ts` |
| `src/workflows/analyzer.ts:39` `collectAllowedSources` | function | imported only by `tests/workflows-analyzer.test.ts` |
| `src/workflows/renderer.ts:6` `architectureFromGraph` | variable | imported only by `tests/workflows-renderer.test.ts` |
| `src/workflows/renderer.ts:8` `secureWorkflowHtml` | function | imported only by `tests/workflows-renderer.test.ts` |

#### UNCERTAIN (module imported dynamically/as namespace) (217)

| Symbol (`path:line`) | Kind | Evidence |
| --- | --- | --- |
| `src/agent-tool-session.ts:12` `AgentToolResult` | interface | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/agent-tool-session.ts:28` `toolImages` | function | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`; name-level use cannot be resolved |
| `src/config.ts:23` `MemoryEmbeddingConfig` | interface | module is loaded dynamically or as a namespace by `scripts/verify/native-critical-thinking-audit.mjs`; name-level use cannot be resolved |
| `src/index.ts:55` `AgentCoreService` | interface | module is loaded dynamically or as a namespace by `tests/desktop-status.test.ts`, `tests/release-recovery-repair.test.ts`, `tests/memory/engine/memory-query-cache-integration.test.ts`; name-level use cannot be resolved |
| `src/index.ts:64` `startAgentCoreService` | function | module is loaded dynamically or as a namespace by `tests/desktop-status.test.ts`, `tests/release-recovery-repair.test.ts`, `tests/memory/engine/memory-query-cache-integration.test.ts`; name-level use cannot be resolved |
| `src/index.ts:439` `createEntrypointGracefulClose` | function | module is loaded dynamically or as a namespace by `tests/desktop-status.test.ts`, `tests/release-recovery-repair.test.ts`, `tests/memory/engine/memory-query-cache-integration.test.ts`; name-level use cannot be resolved |
| `src/learning/service.ts:89` `applyPriorRejectionAdvisory` | function | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/learning/service.ts:100` `withRejectionHistory` | function | module is loaded dynamically or as a namespace by `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/learning/verified-value-registry.ts:2` `NumericTransform` | type | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/learning/verified-value-registry.ts:4` `NumericSource` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/learning/verified-value-registry.ts:10` `NumericRegistryEntry` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/mcp/result-budget.ts:24` `BudgetableToolResult` | interface | module is loaded dynamically or as a namespace by `scripts/verify/pdf-tool-delivery-check.mjs`; name-level use cannot be resolved |
| `src/mcp/server.ts:67` `SERVER_NAME` | variable | module is loaded dynamically or as a namespace by `scripts/verify/rea-harness-registration.mjs`, `scripts/verify/agents-md-audit.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-diversity.ts:3` `DiversityDimension` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-diversity.ts:9` `DiversityCandidate` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-diversity.ts:15` `DiversityCell` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-evaluation.ts:5` `MAX_RETRIEVAL_ARTIFACT_BYTES` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/evaluate-retrieval.mjs`, `scripts/memory/evaluation/report-bundle.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-evaluation.ts:25` `retrievalInputDigests` | function | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/evaluate-retrieval.mjs`, `scripts/memory/evaluation/report-bundle.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-novelty.ts:7` `NOVELTY_PAIR_WORK_LIMIT` | variable | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-novelty.ts:9` `RetrievalNoveltyRow` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-novelty.ts:15` `RetrievalNoveltyReport` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-pareto.ts:8` `ParetoConfig` | type | module is loaded dynamically or as a namespace by `tests/shinkaevolve-pareto-adoption.test.ts`, `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-pareto.ts:9` `ParetoMetric` | interface | module is loaded dynamically or as a namespace by `tests/shinkaevolve-pareto-adoption.test.ts`, `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
| `src/memory/evaluation/retrieval-pareto.ts:10` `ParetoCandidate` | interface | module is loaded dynamically or as a namespace by `tests/shinkaevolve-pareto-adoption.test.ts`, `scripts/memory/evaluation/analyze-retrieval.mjs`; name-level use cannot be resolved |
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
| `src/memory/facade.ts:3` `MemoryServiceOptions` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:5` `ControllerRetrievalPolicy` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:6` `RememberInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:7` `UpdateInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:8` `MemoryBatchOperation` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:9` `MemoryBatchResult` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:10` `MemoryLinkInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:11` `EvolutionResult` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:12` `EvolutionPreviewResult` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:16` `CloudflareWorkersAIEmbedder` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:17` `cosineSimilarity` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:20` `MemoryEmbedder` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:21` `MemoryEmbedderIdentity` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:22` `CloudflareEmbedderConfig` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:25` `initializeMemoryRoot` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:26` `MemoryRootOptions` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:28` `resolveMemoryPaths` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:28` `notePath` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:29` `MemoryPaths` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:32` `MemorySearchOptions` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:33` `MemorySearchResult` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:36` `buildMemoryTransferPayload` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:37` `planMemoryImport` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:40` `ControllerMemorySession` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:41` `MemoryControllerError` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `Digest` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `IsoInstant` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `Verification` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `RetentionTier` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `EpistemicType` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:43` `TemporalClass` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `DisclosureView` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `ControllerMemoryCapabilities` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `ReadBudget` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `BudgetMetrics` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:44` `Budgeted` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `RecallInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `MemoryHit` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `RecallPage` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `ExpandInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `ExpansionPage` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:45` `MemoryControllerErrorCode` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `RecordExperience` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `RecordKind` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `TimeValue` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:48` `Validity` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `WorkingStateChange` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `EpisodeEventKind` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `EpisodeEvent` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:50` `EpisodeHeader` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `StartEpisodeInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `AppendEventInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `EpisodeAppendResult` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `EpisodeStatusInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:51` `CaptureEvidenceInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `ArtifactAvailability` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `ArtifactReceipt` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `TaskContext` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `CheckpointTrigger` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `CheckpointInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `TaskCapsule` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:52` `TemporalAssertion` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ApplyConsolidationInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationProposal` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationPlan` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `PromotionReceipt` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationPolicy` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:54` `ConsolidationReview` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:56` `RetentionInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:56` `RetentionReceipt` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:58` `CONTROLLER_MEMORY_NOTICE` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryMethod` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryResult` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:59` `ControllerMemoryResponse` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `MEMORY_TRANSFER_V2_VERSION` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `exportMemoryTransferV2` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `previewMemoryTransferV2` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:60` `importMemoryTransferV2` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Policy` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2ExportOptions` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Bundle` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Preview` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:61` `MemoryTransferV2Receipt` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:62` `assessMemoryRelevance` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:62` `validateRelevancePolicy` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:63` `RelevancePolicy` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:63` `RelevanceInput` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:63` `RelevanceDecision` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `encodeIntention` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `decodeIntention` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `evaluateIntentions` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `intentionUpsert` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:65` `INTENTION_PREFIX` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:66` `ProspectiveIntention` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:66` `IntentionObservation` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:66` `IntentionEvaluation` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:67` `ContinuityAssessment` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:67` `IngestionBinding` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:67` `IngestionCursor` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:68` `assessTaskContinuity` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `encodeProjectSynthesis` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `decodeProjectSynthesis` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `buildProjectSynthesisAction` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `projectSynthesisRefs` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:69` `checkProjectSynthesisDependencies` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:70` `ProjectSynthesis` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:70` `SynthesisEligibilityReason` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:71` `KnowledgeInterval` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:71` `KnownHistoryCoverage` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:71` `HistoricalMemorySnapshot` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `claimReviewContractSchema` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `claimReviewReadSchema` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `claimReviewWriteSchema` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:72` `externalClaimReviewGuide` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:73` `ClaimReviewContract` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:73` `ClaimReviewRead` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/facade.ts:73` `ClaimReviewWrite` | re-export | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/forgetting-curve.ts:21` `ForgettingScore` | interface | module is loaded dynamically or as a namespace by `scripts/verify/proposal-retention-review.mjs`; name-level use cannot be resolved |
| `src/memory/host-runtime.ts:10` `AgentCoreMemoryRuntime` | interface | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-runner.test.ts`, `scripts/verify/proposal-retention-review.mjs`, `scripts/memory/activate-canonical.mjs`; name-level use cannot be resolved |
| `src/memory/host-runtime.ts:19` `MEMORY_ACTIVATION_LOCK_RELATIVE` | variable | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-runner.test.ts`, `scripts/verify/proposal-retention-review.mjs`, `scripts/memory/activate-canonical.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:5` `Mode` | type | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-contract.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/memory-outcome-preregistration.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:6` `OUTCOME_CONTRACT_REVISION` | variable | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-contract.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/memory-outcome-preregistration.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:43` `outcomeObservationSchema` | variable | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-contract.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/memory-outcome-preregistration.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/contract.ts:57` `OutcomeCase` | type | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-contract.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/memory-outcome-preregistration.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/evaluation.ts:4` `OUTCOME_EVALUATOR_REVISION` | variable | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-bundle.test.ts`, `tests/memory/memory-outcome-evaluation.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/evaluation.ts:33` `validateOutcomePreregistration` | function | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-bundle.test.ts`, `tests/memory/memory-outcome-evaluation.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/evaluation.ts:73` `evaluateOutcome` | function | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-bundle.test.ts`, `tests/memory/memory-outcome-evaluation.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/verifier.ts:6` `OUTCOME_VERIFIER_REVISION` | variable | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-evaluation.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/memory-outcome-preregistration.mjs`; name-level use cannot be resolved |
| `src/memory/outcome/verifier.ts:109` `OutcomeVerification` | interface | module is loaded dynamically or as a namespace by `tests/memory/memory-outcome-evaluation.test.ts`, `scripts/memory/outcome/memory-outcome-eval.mjs`, `scripts/memory/outcome/memory-outcome-preregistration.mjs`; name-level use cannot be resolved |
| `src/memory/reconsolidation-report.ts:29` `ReconsolidationReport` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/reconsolidation-offline.mjs`; name-level use cannot be resolved |
| `src/memory/reconsolidation-report.ts:35` `ReconsolidationBundle` | interface | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/reconsolidation-offline.mjs`; name-level use cannot be resolved |
| `src/memory/reconsolidation-report.ts:41` `runReconsolidationExperiment` | function | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/reconsolidation-offline.mjs`; name-level use cannot be resolved |
| `src/memory/reconsolidation-report.ts:58` `verifyReconsolidationExperiment` | function | module is loaded dynamically or as a namespace by `scripts/memory/evaluation/reconsolidation-offline.mjs`; name-level use cannot be resolved |
| `src/memory/retrieval.ts:13` `RetrievalComponents` | interface | module is loaded dynamically or as a namespace by `tests/memory/engine/memory-controller-ranking-pagination.test.ts`, `tests/memory/engine/memory-controller-ranking-policy.test.ts`, `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/retrieval.ts:44` `FusionSelectionDiagnostics` | interface | module is loaded dynamically or as a namespace by `tests/memory/engine/memory-controller-ranking-pagination.test.ts`, `tests/memory/engine/memory-controller-ranking-policy.test.ts`, `scripts/memory/outcome/memory-outcome-adapter.mjs`; name-level use cannot be resolved |
| `src/memory/safety.ts:3` `MemorySafetyFinding` | interface | module is loaded dynamically or as a namespace by `scripts/memory/outcome/package-memory-outcome.mjs`; name-level use cannot be resolved |
| `src/memory/types.ts:12` `EvolutionKind` | type | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/types.ts:112` `MemoryHealthStatus` | type | module is loaded dynamically or as a namespace by `tests/learning-curation-promotion.test.ts`, `tests/memory/engine/helpers/memory-capsule-child.mjs`, `tests/memory/engine/helpers/memory-episode-child.mjs`; name-level use cannot be resolved |
| `src/memory/workflow-verifier.ts:17` `WorkflowCase` | interface | module is loaded dynamically or as a namespace by `tests/adoption-reuse-wiring.test.ts`, `tests/batch16-exact-task-verification.test.ts`, `tests/memory/memory-outcome-safe-engineering.test.ts`; name-level use cannot be resolved |
| `src/portability/paths.ts:22` `discoverProjectRoot` | function | module is loaded dynamically or as a namespace by `tests/project-structure-filesystem.test.ts`, `scripts/verify/proposal-retention-review.mjs`, `scripts/memory/activate-canonical.mjs`; name-level use cannot be resolved |
| `src/portability/project-structure.ts:14` `PARALLEL_SKILL_HOMES` | variable | module is loaded dynamically or as a namespace by `tests/project-structure-filesystem.test.ts`, `scripts/portability/project-structure.mjs`; name-level use cannot be resolved |
| `src/portability/project-structure.ts:169` `inspectProjectStructure` | function | module is loaded dynamically or as a namespace by `tests/project-structure-filesystem.test.ts`, `scripts/portability/project-structure.mjs`; name-level use cannot be resolved |
| `src/portability/project-structure.ts:206` `synchronizeProjectStructure` | function | module is loaded dynamically or as a namespace by `tests/project-structure-filesystem.test.ts`, `scripts/portability/project-structure.mjs`; name-level use cannot be resolved |
| `src/rdc/tools/fuzzySearchCore.ts:42` `runFuzzySearch` | function | module is loaded dynamically or as a namespace by `src/rdc/tools/fuzzySearch.ts`; name-level use cannot be resolved |
| `src/rdc/tools/fuzzySearchCore.ts:69` `recursiveFuzzyIndexOf` | function | module is loaded dynamically or as a namespace by `src/rdc/tools/fuzzySearch.ts`; name-level use cannot be resolved |
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
| `src/skills/service.ts:37` `SkillExportProfile` | type | module is loaded dynamically or as a namespace by `tests/skill-pack-lint.test.ts`, `scripts/release/package-release.mjs`, `scripts/verify/skill-pack-lint.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:48` `SkillSourceProvenance` | interface | module is loaded dynamically or as a namespace by `tests/skill-pack-lint.test.ts`, `scripts/release/package-release.mjs`, `scripts/verify/skill-pack-lint.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:69` `SkillExportResult` | interface | module is loaded dynamically or as a namespace by `tests/skill-pack-lint.test.ts`, `scripts/release/package-release.mjs`, `scripts/verify/skill-pack-lint.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:130` `parseSkillMarkdown` | function | module is loaded dynamically or as a namespace by `tests/skill-pack-lint.test.ts`, `scripts/release/package-release.mjs`, `scripts/verify/skill-pack-lint.mjs`; name-level use cannot be resolved |
| `src/skills/service.ts:271` `sanitizeSkillArchivePath` | function | module is loaded dynamically or as a namespace by `tests/skill-pack-lint.test.ts`, `scripts/release/package-release.mjs`, `scripts/verify/skill-pack-lint.mjs`; name-level use cannot be resolved |
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
| `src/verification/evidence-snapshot.ts:11` `EVIDENCE_REPORT_MAX` | variable | module is loaded dynamically or as a namespace by `tests/decision-review.test.ts`, `tests/memory/memory-reuse-reliability.test.ts`, `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/evidence-snapshot.ts:18` `evidenceIdentity` | function | module is loaded dynamically or as a namespace by `tests/decision-review.test.ts`, `tests/memory/memory-reuse-reliability.test.ts`, `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/evidence-snapshot.ts:44` `EvidenceSnapshot` | interface | module is loaded dynamically or as a namespace by `tests/decision-review.test.ts`, `tests/memory/memory-reuse-reliability.test.ts`, `scripts/verify/verify-evidence-links.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:19` `WorkbookSpec` | type | module is loaded dynamically or as a namespace by `tests/aios-workbook-assertions-adoption.test.ts`, `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:21` `WorkbookRuleReport` | interface | module is loaded dynamically or as a namespace by `tests/aios-workbook-assertions-adoption.test.ts`, `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:25` `WorkbookAssertionReport` | interface | module is loaded dynamically or as a namespace by `tests/aios-workbook-assertions-adoption.test.ts`, `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:30` `parseWorkbookSpec` | function | module is loaded dynamically or as a namespace by `tests/aios-workbook-assertions-adoption.test.ts`, `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |
| `src/verification/workbook-assertions.ts:36` `unavailableWorkbookReport` | function | module is loaded dynamically or as a namespace by `tests/aios-workbook-assertions-adoption.test.ts`, `scripts/verify/verify-workbook.mjs`; name-level use cannot be resolved |


## 2. Pass 2: duplicated logic

Method: all top-level function declarations and function-valued constants in non-test `src` TypeScript with a printed size of at least 90 characters (1,901 functions in 405 files) were fingerprinted twice: by exact printed text, and by structure after renaming parameters and locals. Result: 15 exact groups and 3 structure-only groups, each spanning two or more files.

### 2.1 Consolidated (7 groups, 22 files edited, 3 modules created)

| Group | Original locations | Canonical owner | Updated callers | Equivalence evidence |
| --- | --- | --- | --- | --- |
| Case-folded path key | `src/semantic-ide/path-safety.ts:6` `comparable`; `src/semantic-ide/provider-provisioning.ts:174` `comparable`; `src/code-intelligence/grafel-runtime.ts:39` `comparablePath`; `src/code-intelligence/workspace-resolver.ts:35` `comparable` | `src/portability/paths.ts` `comparablePath` (existing generic path module, imports only node built-ins) | path-safety re-exports it as `comparable` so `source-io.ts` and others are unchanged; the other three import it | Identical bodies: `path.resolve` then lower-case on win32 |
| File existence probe | `src/semantic-ide/provider-provisioning.ts:280` `exists`; `provider-registry.ts:410` `exists`; `transaction.ts:150` `pathExists` | `src/semantic-ide/path-safety.ts` `pathExists` | the three files import it (the unused `access` imports were dropped) | Identical: `access()` then true, otherwise false. The third copy was below the detector's size floor and was found by reading. |
| Byte fingerprint | `src/semantic-ide/source-io.ts:20`; `src/semantic-ide/transaction.ts:48` `fingerprintBytes` | `source-io.ts` (now exported; `transaction.ts` already imported from it) | `transaction.ts` | Identical SHA-256 hex of a Buffer |
| ZIP member text, semantic-projection flag | `src/rdc/document-projection/office-converters.ts:29` `semanticRequested` and `:33` `zipText`; `long-tail-converters.ts:19` `zipText`; `markup-converters.ts:15` `semanticRequested` | `src/rdc/document-projection/helpers.ts` | the three converter files | Identical bodies; `helpers.ts` already imports `./types.js`, no cycle |
| Workflow text helpers | `src/workflows/renderer.ts:5` `diagramId` (exported) and `:6` `escape`; `diagram.ts:5` `id` and `:6` `esc`; `controller-cycle.ts:6` `esc` | new `src/workflows/text.ts` (`diagramId`, `escapeHtml`) | renderer, diagram, controller-cycle; renderer keeps `export { diagramId }` | Identical bodies; `renderer` imports `diagram`, so the owner had to be a third module to avoid a cycle |
| No-store JSON reply | `src/http/proposals.ts:4` `send`; `src/http/task-changes.ts:8` `send` | new `src/http/json-response.ts` `sendNoStoreJson` | both handlers | Identical bodies |
| MCP text/error results | `src/mcp/phone-game-tools.ts:23` `compactText`; `semantic-ide-tools.ts:9` `textResult` and `:13` `errorResult`; `code-intelligence-tools.ts:14` and `:18`; `controller-learning-tools.ts:10` `text`; `phone-tools.ts:11` `text` | new `src/mcp/text-result.ts` (`jsonTextResult`, `errorTextResult`) | the five tool files, through import aliases so call sites are unchanged | Same JSON text content and `Error: ` prefix; return type stays `any` as before |

Line-ending note: `semantic-ide-tools.ts` and `markup-converters.ts` were CRLF in the working tree but LF in the index; they were rewritten as LF so the diff shows only the real change.

### 2.2 Left as `OPEN` (equivalence not established or the merge would couple unrelated modules)

| Group | Locations | Reason |
| --- | --- | --- |
| `sha256` returning bare hex | `src/mcp/mutation-safety.ts:51`, `src/mcp/failure-loop-advisor.ts:44`, `src/learning/external-controller.ts:214` | Three subsystems, no shared owner; a new cross-subsystem utility would add coupling for a one-line function |
| `sha256` returning `sha256:`+hex | `src/memory/page.ts:16`, `src/memory/transfer.ts:46` | Same subsystem but different output from the group above; no neutral home inside `memory` |
| JSON digest `'sha256:' + hash(JSON.stringify(value))` | `src/learning/decision-review.ts:72`, `src/memory/evaluation/retrieval-diversity.ts:24`, `src/artifact-analysis/service.ts:8`, `src/capability-awareness.ts:16`; canonical-JSON variant `src/memory/evaluation/retrieval-curve.ts:13`, `src/harness/reconstruction/readiness.ts:13` | Four unrelated owners; the canonical-JSON pair differs in serialisation |
| `ref` | `src/memory/revisions.ts:24`, `src/memory/temporal.ts:48` | Tiny; would make one module import the other |
| `fail` | `src/memory/episodes.ts:46`, `src/memory/promotion.ts:92` | Tiny; each is next to its own error type |
| Memory MCP results | `src/memory/mcp/tools.ts:13` `text` and `:51` | `src/memory` must not import from `src/mcp` (layering) |
| Other result builders | `src/mcp/skills-tools.ts:14` (compact flag), `web-research-tools.ts:38`, `phone-tools.ts` `failure()` (records activity) | Different behaviour |
| HTTP JSON replies | `src/http/app.ts:49` `sendJson` (no `cache-control`), `src/oauth/service.ts:12` `sendJson` | Different headers and signature from `sendNoStoreJson` |

### 2.3 Checks run

- `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`: exit 0.
- `vitest run` on the 40 test files that import or exercise the touched modules: **468 passed, 3 failed, 1 skipped** (472). The 3 failures reproduce at `HEAD` without the consolidation (section 2.4).
- `npm run structure:check`: PASS (the Impeccable plugin's `.impeccable/hook.cache.json` was removed first; the plugin recreates it and then the check reports an undeclared directory).

### 2.4 Red tests: pre-existing, not caused by the consolidation

| Test | At `HEAD 055a856` (before the consolidation) | With the consolidation |
| --- | --- | --- |
| `tests/mcp-manifest-contract.test.ts` "keeps the full optional-cohort manifest inside the handshake budget" | fails: 132,791 bytes against a 131,072 budget | fails with the identical figure; the diff changes no tool name, description or schema |
| `tests/semantic-ide-provisioning.test.ts` "requires the explicit public confirmation token before provisioning" | times out at 15,000 ms (19.9 s) | times out at 15,000 ms; passes with `--testTimeout=60000` in 16.5 s |
| `tests/game-mode-advanced.test.ts` "passes expectedPackage through phone_run_macro …" | times out at 15,000 ms (16.8 s) | times out at 15,000 ms; passes with `--testTimeout=60000` in 24.6 s |

Method: attempt 3 ran the three files with a 60 s timeout on the changed tree, then the same three files at `HEAD` through a temporary `git stash --include-untracked` (restored afterwards, 29 entries again). The two timeouts are slow cold imports of large module graphs on the project drive: the tests load `mcp/phone-tools` and the semantic IDE service dynamically. `game-mode-advanced` uses a fake MCP server and a fake controller and never touches a device. The manifest overshoot (+1,719 bytes, 1.3%) is a real budget violation that predates this run; the 2026-10-31 Native registry commits `a29ddf7` and `6f7081f` touched `src/mcp/server.ts` and are the likely cause, but that attribution is not proven.
## 3. Pass 3: routes, pages, actions and MCP tools

The subagent's read-only inventory follows verbatim, with headings demoted one level. Server actions: the category does not exist (see "Server actions" in the inventory).

## Agent Core entry-point inventory (read-only)

Snapshot: HEAD `055a856`, dirty working tree (25 entries in `git status` at 2026-11-01 22:51 +07), scanned 2026-11-01 ~22:40-22:51. Files edited concurrently by another process: `src/http/proposals.ts`, `src/http/task-changes.ts`, `src/mcp/{phone-tools,phone-game-tools,semantic-ide-tools,code-intelligence-tools,controller-learning-tools}.ts` and others; their line numbers below are from the second scan (after the edits seen at that time). `src/http/app.ts`, `src/oauth/service.ts`, `src/index.ts`, `src/launcher/*.cs`, `src/ui/src/*` were unmodified (re-verified for app.ts). Re-verify marked lines before acting. `dist/` was not inspected, so the running build may differ from source.

Abbreviations: `app.ts`=src/http/app.ts, `svc`=src/oauth/service.ts, `CS`=src/launcher/AgentCoreRuntime.cs, `MF`=src/launcher/MainForm.cs, `UI`=src/ui/src, `T`=tests, `NCB`=scripts/external/native-chat-bridge.mjs, `gw`=scripts/tunnel/public-mcp-gateway.mjs, `CT`=docs/Cloudflare-Tunnel.md, `RA`=scripts/windows/Restart-Agent-Core.ps1, `SCT`=scripts/windows/Start-Cloudflare-Tunnel.ps1.

### 0. Findings first

| # | Finding | Evidence |
|---|---|---|
| F1 | `GET /agent/skills` and `POST /agent/skills/:name/native-enabled` are declared but unreachable. Both sit inside the block `if (route === '/agent/chat/conversations' \|\| route.startsWith('/agent/chat/'))` (app.ts:182-525). `/agent/skills` does not start with `/agent/chat/`, so the request skips the block, `oauthService.handle` returns false, and it ends in the 404 at app.ts:569-572. Launcher callers (CS:283, CS:291) and the UI Skills page get 404. Both branches repeat `authorizeAgentUi` (app.ts:436, :466) although app.ts:183 already did, consistent with a block pasted in the wrong place. No HTTP test covers them; docs claim they work. | AST scan (`route-scan.cjs`): `route===/agent/skills` and `route.match(/^\/agent\/skills.../)` have enclosing `if@182-525`. Re-read of app.ts:182, 435, 464, 523, 569. Zero hits for `agent/skills`/`native-enabled` in `tests/`. Docs: docs/CODEBASE.md:65,67; .changeset/native-skill-switch-server.md:5. Not executed (no server run allowed). |
| F2 | `POST /agent/run` has a launcher caller but no UI trigger. Chain: CS:142 `RunAgentAsync` <- MF:732 (`agent-run`) <- UI/App.tsx:318 `onAgentRun` (App.tsx:315). `onAgentRun` is passed to `ReferenceUi` (App.tsx:469, pages.tsx:45,790,791) but no component invokes it. | Identifier search `onAgentRun` in src/ui/src: only definition, prop type, pass-through; test files only build mocks. Message literal `agent-run`: only App.tsx:318, MF:732. |
| F3 | Legacy pages in `UI/pages.tsx` are not reachable: `DashboardPage` :100, `CoreRuntimePage` :146, `SystemsPage` :202 (+`SystemInspector` :225), `DiagnosticsPage` :321, `SettingsPage` :344 have zero references anywhere; `ActivityLogPage` :243 (+`LogInspector` :282, `ChevronDownIcon` :276) is referenced only by tests. Helpers `Breadcrumb` :86, `HealthCounts` :90, `RotateCcwIcon` :784 are used only inside these. `ReferenceUi` (pages.tsx:792) renders the `Prototype*` pages instead. Retain (maintenance rule). | `symbol-refs.cjs` over src/ui/src (app vs test split). |
| F4 | Launcher actions `activity-monitor` (CS:512) and `tunnel-details` (CS:515) have no sender. Every other `ExecuteActionCoreAsync` case has a UI caller. | `string-refs.cjs` quoted and unquoted: only the `case` label. |
| F5 | 33 of 83 MCP tool names have no literal in-repo caller (only registration, Native catalog, label or listing-test hits). See section 5. They are still reachable through `POST /mcp` and Native dispatch. | `tool-scan.cjs`, `tool-callers.tsv`. |
| F6 | `scripts/release/release-compat.mjs` is stale in two places: `mcpFiles` lists `src/mcp/partner-tools.ts` (line 176) and `schemaFiles` lists `src/mcp/partner-schemas.ts` (line 190); neither file exists (`current()` returns null on ENOENT). Its `publicRoutes()` regex (line 53) only sees `route === '...'`, not `route.match(/.../)` routes; manifest check hard-codes 79 tools (line 209), and `T/mcp-manifest-contract.test.ts:71` also expects 79. | Test-Path false for both files. |
| F7 | `/health` (app.ts:595) and `/favicon.ico` (app.ts:596) in `createHttpHandler` are log-suppression filters, not routes. `/favicon.ico` has no handler (404, log-filtered only). | app.ts:590-624. |

### 1. HTTP routes (Node process, only server: `src/index.ts:276` `createServer(createHttpHandler(...))`, listens `AGENT_CORE_HOST` default 127.0.0.1 : `AGENT_CORE_PORT` default 8765, config.ts:125,201)

Dispatch order in `handleRequest` (app.ts:128): `/health` -> `/agent/*` branches -> `/agent/run` -> `oauthService.handle` (svc:111) -> `route !== '/mcp'` 404 (app.ts:569) -> `/mcp`. No router library, no `app.get`. UI-route auth = `authorizeAgentUi` (app.ts:86): loopback (`security-policy.ts:138`) + header `x-agent-core-ui-token` (constant-time, token `AGENT_CORE_UI_TOKEN`, set only by the launcher CS:1358). "UI token" below means that pair. Header `x-agent-core-chat-origin: external-controller` marks calls from NCB.

| ID | kind | pattern | method | declaration | handler (path:line) | auth / exposure | application callers | test callers | doc mentions | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| R01 | route | `/health` | GET | app.ts:137 | inline app.ts:138-140 -> `healthProvider` index.ts:288 | none (no loopback check). Tunnel: not allowlisted (gw 404; SCT:103 asserts 404) | CS:947 (`IsCoreReadyAsync`), CS:1012; `RA`:491 (readiness, fn :237); scripts/windows/Invoke-ActivityLog-Cutover{,-V2,-V3}.ps1:154 | T/http-auth.test.ts:36,49; T/process-identity.test.ts:84; T/desktop-status.test.ts:41; T/restart-readiness.test.ts:168; src/launcher.tests/HealthResponseTimeoutTests.cs:49 | docs/CODEBASE.md:129; CT:20,77; ~330 doc lines | CALLED |
| R02 | route | `/.well-known/oauth-protected-resource` and `/.../oauth-protected-resource/mcp` | GET | svc:120-123 (via app.ts:567) | inline svc:124-131 | none. Public: yes (gw:9, CT:17). External OAuth connectors | CS:778 (launcher waits for bare path before starting tunnel-client); `challenge()` header svc:96-99; SCT:99,113 (operator Verify) | T/oauth.test.ts:64,196,198 | CT:17,46,75; docs/CODEBASE.md:135 | CALLED |
| R03 | route | `/.well-known/oauth-authorization-server` | GET | svc:134 | inline svc:135-147 | none. Public: yes. External connectors discover it via R02 `authorization_servers` (svc:127) | SCT:100 (operator Verify only) | T/oauth.test.ts:70 | CT:17 | CALLED (operator script); external integration |
| R04 | route | `/oauth/register` | POST | svc:149 | inline svc:150-183 -> `store.registerClient` (store.ts) | none; shared rate limit 20/min (svc:76-77,150). Public: yes. Public API for external OAuth connectors (ChatGPT per svc:61-69; Claude via Worker) | none in repo | T/oauth.test.ts:48; T/oauth-registration-limits.test.ts:75 | CT:78; docs/CODEBASE.md:302 | TEST-ONLY by repo evidence; external integration (do not read as unused) |
| R05 | route | `/oauth/authorize` | GET | svc:186 | `renderAuthorizationForm` svc:267 | none (validates client, redirect, PKCE S256, resource). Public: yes. Direct browser access | SCT:102 (expects 400 on empty); browser redirect from connectors | T/oauth.test.ts:102,117,205 | CT:22,45 | CALLED (operator script); direct browser access |
| R06 | route | `/oauth/authorize` | POST | svc:191 | `approveAuthorization` svc:293 | API key typed in form (`keyStore.verify`). Public: yes | own HTML form svc:278 (`action="/oauth/authorize"`) | T/oauth.test.ts:151,205 | CT:22 | CALLED (own form); external browser flow |
| R07 | route | `/oauth/token` | POST | svc:196 | `exchangeToken` svc:326 | client_secret_post + PKCE / refresh token. Public: yes. Public API for external connectors | none in repo | T/oauth.test.ts:158,217; T/oauth-atomic-exchange-review.test.ts:23 | CT:17 | TEST-ONLY by repo evidence; external integration |
| R08 | route | `/mcp` | all methods reach auth; only POST served (handler.ts:160 405 otherwise) | app.ts:569-587 | `createMcpHttpHandler` src/mcp/handler.ts:144 (closure :159) wired index.ts:329 | Origin check `validateMcpOrigin` (security-policy.ts:108) + Bearer API key or OAuth token (src/http/auth.ts:13) + per-key tool grants + `controller_contract`. Public: yes (3 tunnel paths, see 1b) | scripts/verify/mcp-external-acceptance.mjs:144,167,262; scripts/verify/mcp-task-effectiveness-eval.mjs:143,153,295; scripts/verify/native-chat-completion.mjs:13; gw:7,31-37 (proxy); tunnel-client/agent-core.yaml:17 (+example :19) | T/http-auth.test.ts:61,63,79,95; T/oauth.test.ts:169,226; T/bridge-runtime.test.ts:37; T/image-inspect-http.test.ts:51; T/trusted-proposal-http.test.ts:34; T/mcp-external-acceptance-harness.test.ts:47; T/mcp-task-effectiveness-eval.test.ts:29 | CT:9,17,22,53 | CALLED; external MCP clients (ChatGPT, Claude, Codex) |
| R09 | route | `/agent/run` | POST | app.ts:527 | inline app.ts:528-564 -> `agentRun` index.ts:284 -> `NativeAgentController.runTask` agent-controller.ts:669 | loopback + UI token (inline check app.ts:532-543). Not public | CS:142 `RunAgentAsync` <- MF:732 <- UI/App.tsx:318. No UI invoker of `onAgentRun` (F2) | T/agent-ui-transport.test.ts:164,170,188,205 | CHANGELOG.md:191; docs/Agent-Core-31.md:23 | CALLED (launcher path); no in-repo UI trigger |
| R10 | route | `/agent/workflows` | GET (405 else) | app.ts:143 | inline app.ts:147 -> `WorkflowService.snapshot` src/workflows/service.ts:53 | UI token. Not public | CS:170 <- MF:396 <- UI/WorkflowsPage.tsx:44 (page `#workflows`) | T/workflows-http.test.ts:8; T/workflows-launcher-contract.test.ts:26 (source assertion); UI/WorkflowsPage.test.tsx:15 | docs/plans/2026-10-09-unified-workflows.md:12 | CALLED |
| R11 | route | `/agent/proposals` | GET | app.ts:151 | `handleProposalDocuments` src/http/proposals.ts:6* -> `listForReview` learning/proposal-documents.ts:190; reader only when `learningService.hasSkillProposals()` (index.ts:278), else 503 | UI token. Not public | CS:218 <- MF:430 (`proposals-get`) <- UI/ProposalCards.tsx:25 (rendered by PrototypeDashboard PrototypePages.tsx:36) | T/proposal-http.test.ts:19-25 | docs/CODEBASE.md:294; docs/plans/Proposal-Completion.md:17 | CALLED |
| R12 | route | `/agent/proposals/read?id&revisionDigest&documentDigest` | GET | app.ts:151 (same branch) | proposals.ts:6* -> `read` proposal-documents.ts:194 | UI token | CS:226 <- MF:430 (`proposal-read`) <- UI/ProposalCards.tsx:32 | T/proposal-http.test.ts:30,33,35 | docs/CODEBASE.md:294 | CALLED |
| R13 | route | `/agent/task-changes?taskId` | GET | app.ts:157 | `handleTaskChanges` src/http/task-changes.ts:14* -> `computeTaskChanges` rdc/checkpoints/task-changes.ts:262 | UI token | CS:198 <- MF:412 <- UI/useTaskChanges.ts:40 <- TaskChangesPanel.tsx:95 (LauncherPages.tsx:102, pages.tsx:673) | T/task-changes.test.ts:160,195 | docs/CODEBASE.md:291-292 | CALLED |
| R14 | route | `/agent/dreaming` | GET status, POST run (405 else) | app.ts:163 | inline app.ts:164-179 -> `dreamingStatus` memory/service.ts:1841, `runCognitiveMaintenance` :1876 | UI token; rejects `x-agent-core-chat-origin` (owner only, app.ts:165) | CS:276 <- MF:704 <- UI/App.tsx:399 <- LearningPage LauncherPages.tsx:114-120 | T/agent-ui-transport.test.ts:111-128; src/launcher.tests/AgentChatSelectionStepTransportTests.cs:25 | docs/CODEBASE.md:12; docs/proposals/Dreaming-Berbantuan-Model.md:26 | CALLED |
| R15 | route | `/agent/chat/conversations[?archived=1]` | GET | app.ts:182,190-197 | `listConversations` agent-chat-service.ts:251 | UI token (app.ts:183) | CS:257 <- MF:454 <- UI/App.tsx:80,254; NCB:220 (<- MCP tool `native_chat_bridge` list) | T/agent-ui-transport.test.ts:221,249; T/native-chat-bridge-facade.test.ts:109 | docs/CODEBASE.md:47 | CALLED |
| R16 | route | `/agent/chat/conversations` | POST | app.ts:198-214 | `createConversation` agent-chat-service.ts:276 | UI token | CS:298 <- MF:525 <- UI/App.tsx:325; NCB:237 (create) | T/agent-ui-transport.test.ts:224; T/native-chat-bridge-facade.test.ts:109 | docs/CODEBASE.md:47 | CALLED |
| R17 | route | `/agent/chat/providers` | GET | app.ts:219 | `refreshProviderCapabilities` :492, `listProviders` :456, `getLastSelection` :471 | UI token | CS:263 <- MF:467 <- UI/App.tsx:81,255 (NCB:262 is a comment only) | T/agent-ui-transport.test.ts:303-325 | docs/CODEBASE.md:282,320,385 | CALLED |
| R18 | route | `/agent/chat/selection` | PUT (405 else) | app.ts:230 | `recordOwnerSelection` agent-chat-service.ts:477 | UI token; external-controller origin -> 403 | CS:313 <- MF:561 <- UI/App.tsx:378 | T/agent-ui-transport.test.ts:331-340; src/launcher.tests/AgentChatSelectionStepTransportTests.cs:37 | docs/CODEBASE.md:24,385 | CALLED |
| R19 | route | `/agent/chat/steps/:turnId/:seq` | GET | app.ts:250 (regex) | `readStepDetail` agent-chat-service.ts:374 | UI token; external-controller origin -> 403 | CS:326 <- MF:577 <- UI/App.tsx:422 | T/agent-ui-transport.test.ts:346,353; AgentChatSelectionStepTransportTests.cs:53 | docs/CODEBASE.md:24,26 | CALLED |
| R20 | route | `/agent/chat/conversations/:id` | GET (other methods fall to 404) | app.ts:270 (regex) | `readConversation` agent-chat-service.ts:261 | UI token | CS:309 <- MF:545,552,639,649,680 <- UI/App.tsx:178,295,303,337; NCB:185,229 | T/agent-ui-transport.test.ts:243; T/native-chat-bridge-facade.test.ts:109 | docs/CODEBASE.md:47 | CALLED |
| R21 | route | `/agent/chat/conversations/:id/turns` (NDJSON stream) | POST | app.ts:281 (regex) | `runTurn` agent-chat-service.ts:551 | UI token; attachments body cap app.ts:112; external-controller: no attachments | CS:343 <- MF:596 (`agent-chat-send`) <- UI/App.tsx:358; NCB:133 (<- tool `native_chat_bridge` send) | T/agent-ui-transport.test.ts:134,151,261,309; T/agent-chat-attachments-wiring.test.ts:50; T/native-chat-bridge-facade.test.ts:26,53,93; T/native-chat-bridge.test.ts:68 | docs/CODEBASE.md:47 | CALLED |
| R22 | route | `/agent/chat/turns/:id/resume` (NDJSON) | POST | app.ts:372 (regex) | `resumeTurn` agent-chat-service.ts:846 | UI token | CS:361 <- MF:596,627 (`agent-chat-resume`) <- UI/App.tsx:435 <- pages.tsx:696,772 | none at HTTP level; service-level only (T/native-provider-wait.test.ts, T/native-chat-reliability.test.ts) | docs/CODEBASE.md:47,94 | CALLED |
| R23 | route | `/agent/chat/turns/:id/pause` | POST | app.ts:402 (regex) | `pauseTurn` agent-chat-service.ts:1148 | UI token | CS:410 <- MF:657,668 <- UI/App.tsx:427 <- pages.tsx:695 | none at HTTP level; service-level T/dtc1-durable-turn-continuation.test.ts:610 | docs/CODEBASE.md:47 | CALLED |
| R24 | route | `/agent/chat/slash-commands` | GET | app.ts:409 | inline app.ts:414-432 -> `SkillService.list` skills/service.ts:767 + `NativeSkillSettings.isDisabled` | UI token | CS:270 <- MF:480 <- UI/App.tsx:393 <- pages.tsx:512 | none at HTTP level; UI/App.test.tsx:197 (mocked host) | docs/CODEBASE.md:82,84 | CALLED |
| R25 | route | `/agent/skills` | GET | app.ts:435 | inline app.ts:441-461 -> `SkillService.list` + `NativeSkillSettings` (native-skill-settings.ts:37,41). DECLARED-UNREACHABLE: dead branch (F1) | intended UI token; actual: 404 | CS:283 <- MF:494 <- UI/App.tsx:116,277; SkillsPage LauncherPages.tsx:156 | none (UI tests mock the host) | docs/CODEBASE.md:65,67 | CALLED (by launcher); target unreachable |
| R26 | route | `/agent/skills/:name/native-enabled` | POST | app.ts:464 (regex) | inline app.ts:471-491 -> `NativeSkillSettings.setEnabled` native-skill-settings.ts:45. DECLARED-UNREACHABLE: dead branch (F1) | intended UI token; actual: 404 | CS:291 <- MF:507 <- UI/App.tsx:410; LauncherPages.tsx:164 | none | docs/CODEBASE.md:65,67 | CALLED (by launcher); target unreachable |
| R27 | route | `/agent/chat/turns/:id/compact` | POST | app.ts:495 (regex) | `requestCompaction` agent-chat-service.ts:1126 | UI token | CS:422 <- MF:687 <- UI/App.tsx:389, LauncherInspector.tsx:97, pages.tsx:557 | none at HTTP level; service-level T/agent-chat-service.test.ts:1282-1293 | docs/CODEBASE.md:36,73 | CALLED |
| R28 | route | `/agent/chat/turns/:id/cancel` | POST | app.ts:502 (regex) | `stopTurn` agent-chat-service.ts:1133 | UI token | CS:402 <- MF:657,674 <- UI/App.tsx:385; NCB:271 (cancel) | T/native-chat-bridge-facade.test.ts:109 (fake server, not the real route); service-level T/agent-chat-service.test.ts | docs/CODEBASE.md:47 | CALLED |
| R29 | route | `/agent/chat/conversations/:id/archive` | POST | app.ts:509 (regex) | `archiveConversation` agent-chat-service.ts:1162 | UI token | CS:441 <- MF:714 <- UI/App.tsx:439 <- pages.tsx:603 | none at HTTP level; service-level T/agent-chat-service.test.ts:1062-1166 | docs/CODEBASE.md:47 | CALLED |
| R30 | fallback | any other `/agent/chat/*` | any | app.ts:523 | `sendJson 404 not_found` | UI token | n/a | T/agent-ui-transport.test.ts (404 cases) | n/a | framework fallback |

`*` = file modified concurrently (line from second read). Route tests with no HTTP-level coverage: R22, R23, R24, R25, R26, R27, R29 (service-level or none).

#### 1b. Public-tunnel exposure (three distinct paths)

| Path | Mechanism | Evidence class | Exposed | Not exposed |
|---|---|---|---|---|
| (a) Cloudflare VPC route -> local gateway `127.0.0.1:8788` | gw allowlist regexes gw:6-10, methods GET/POST/DELETE/OPTIONS gw:11, upstream Host forced to the Worker hostname gw:30; started by CS:795-806 (`EnsurePublicGatewayAsync`), watchdog CS:719 | repo-verifiable | `/mcp`, `/oauth/(register\|authorize\|token)`, `/.well-known/oauth-(protected-resource(/mcp)?\|authorization-server)` (each with optional `?query`) | `/health`, `/agent/*`, everything else (gateway 404). Node still answers only POST on `/mcp` (handler.ts:160) although DELETE/OPTIONS are forwarded |
| (b) Cloudflare named tunnel (cloudflared, token in `.env`) | hostname/path rule configured in the Cloudflare dashboard, regex CT:17; verified by SCT `-Action Verify` (SCT:98-104) | doc claim only; dashboard config not inspectable from the repo | same 3 groups as (a) per CT:14-20 | `/health`, `/agent/*` must return 404 (SCT:103-104 asserts) |
| (c) OpenAI `tunnel-client.exe` | tunnel-client/agent-core.yaml:15-17 `mcp.server_urls[0].url = http://127.0.0.1:8765/mcp`; started CS:762-788 | repo shows config only; filtering done by the unsigned binary | `/mcp` (config); OAuth discovery usage implied by CS:778 | UNCERTAIN what else the binary forwards |

Loopback checks cannot tell tunnel traffic from local traffic (all arrive from 127.0.0.1; CT:14), so `/agent/*` protection relies on the path allowlist plus the UI token. External Worker `agent-core-mcp.joefreccejunior50.workers.dev` is outside the repo (CT:49).

### 2. C# launcher (`src/launcher/*.cs`)

No HttpListener, Kestrel, TcpListener-as-server or named-pipe server exists (`WindowsTcpListener.cs` only queries listener PIDs via IP Helper). Inbound surfaces are listed below.

#### 2a. WebView2 inbound messages (`OnWebMessageReceivedAsync` MF:332; trusted source only `https://app.agentcore.local/index.html`, MF:321; virtual host -> `dist/ui` MF:288-291, navigate MF:318). 28 message types.

| type | MF line | runtime fn (CS) | HTTP route | UI emitter | UI/other tests | verdict |
|---|---|---|---|---|---|---|
| `ready` | 379 | `GetSnapshotAsync`/`PushStatusAsync` | /health | App.tsx:239 | UI/App.test.tsx | CALLED |
| `window-size-get` / `window-size-set` | 342 | MF-local `LauncherWindowSizeStore` | none | UI/components.tsx:280 | UI/WindowSizeDialog.test.tsx:22-68; scripts/verify/launcher-prototype-parity.mjs:63,80 | CALLED |
| `ui-diagnostic-error` | 372 | `CaptureFailure` | none | injected script MF:279 (not UI code) | none | CALLED |
| `activity-detail-get` | 385 | `GetActivityDetail` | none | UI/ToolExecutionDetail.tsx:98,103,152 | UI/ToolExecutionDetail.test.tsx:28-48 and 3 more files | CALLED |
| `workflows-get` | 396 | CS:166 | R10 | UI/WorkflowsPage.tsx:44 | UI/WorkflowsPage.test.tsx:15 | CALLED |
| `task-changes-get` | 412 | CS:192 | R13 | UI/useTaskChanges.ts:40 | UI/TaskChangesPanel.test.tsx:7,48,96; UI/useTaskChanges.test.tsx:21 | CALLED |
| `proposals-get` / `proposal-read` | 430 | CS:218 / CS:220 | R11 / R12 | UI/ProposalCards.tsx:25 / :32 | UI/ProposalCards.test.tsx:11,46,56 | CALLED |
| `agent-chat-list` | 454 | CS:255 | R15 | App.tsx:80,254 | App.test.tsx:670,738,745 | CALLED |
| `agent-chat-providers` | 467 | CS:261 | R17 | App.tsx:81,255 | App.test.tsx:628,746 | CALLED |
| `agent-chat-slash-commands` | 480 | CS:268 | R24 | App.tsx:393 | App.test.tsx:197 | CALLED |
| `agent-skills-list` | 494 | CS:281 | R25 (dead) | App.tsx:116,277 | App.test.tsx:172,190 (mocked) | CALLED; server 404 |
| `agent-skill-set` | 507 | CS:288 | R26 (dead) | App.tsx:410 | App.test.tsx:182 (mocked) | CALLED; server 404 |
| `agent-chat-create` | 525 | CS:296 | R16 | App.tsx:325 | App.test.tsx:250,315-334,446 | CALLED |
| `agent-chat-open` | 545 | CS:306 | R20 | App.tsx:178,295,303,337 | App.test.tsx:298,304,680,691,706 | CALLED |
| `agent-chat-select` | 561 | CS:313 | R18 | App.tsx:378 | App.test.tsx:593,603 | CALLED |
| `agent-chat-step` | 577 | CS:323 | R19 | App.tsx:422 | none by literal (docs/CODEBASE.md:18) | CALLED |
| `agent-chat-send` / `agent-chat-resume` | 596 | CS:330 / CS:358 | R21 / R22 | App.tsx:358 / :435 | App.test.tsx:222-449 / :238,243,271 | CALLED |
| `agent-chat-cancel` / `agent-chat-pause` | 657 | CS:399 / CS:407 | R28 / R23 | App.tsx:385 / :427 | App.test.tsx:273 / :263 | CALLED |
| `agent-chat-compact` | 687 | CS:419 | R27 | App.tsx:389; LauncherInspector.tsx:97 | UI/LauncherInspectorContext.test.tsx:95; NativeChatReliability.test.tsx | CALLED |
| `agent-dreaming-status` / `agent-dreaming-run` | 704 | CS:274 | R14 | App.tsx:399 | via prop UI/LauncherMigration.test.tsx:111 | CALLED |
| `agent-chat-archive` | 714 | CS:438 | R29 | App.tsx:439 | none by literal | CALLED |
| `agent-run` | 732 | CS:139 | R09 | App.tsx:318, but `onAgentRun` never invoked (F2) | none | CALLED (launcher path); no UI trigger |
| `action` | 754 | `ExecuteActionAsync` -> CS:507 | none | App.tsx:312 | App.test.tsx:387,395,398,401,423 | CALLED |

#### 2b. `action` ids (`ExecuteActionCoreAsync` CS:507-543)

| action | CS line | UI senders | verdict |
|---|---|---|---|
| `activity-monitor` | 512 | none | NO IN-REPOSITORY CALLER FOUND |
| `tunnel-details` | 515 | none | NO IN-REPOSITORY CALLER FOUND |
| `open-tunnel-admin` | 518 | PrototypePages.tsx:74; components.tsx:175 | CALLED (test App.test.tsx:398) |
| `open-folder` | 519 | LauncherPages.tsx:98; components.tsx:177,248 and 7 more | CALLED (App.test.tsx:395) |
| `open-runtime-folder` | 520 | PrototypePages.tsx:55,68; components.tsx:122,183; pages.tsx:350 | CALLED |
| `open-memory-folder` | 521 | LauncherPages.tsx:55; components.tsx:170,211; pages.tsx:349; PrototypePages.tsx:68 | CALLED |
| `open-logs` | 522 | PrototypePages.tsx:55,64,68,81; components.tsx:171,193,198,205,212 | CALLED |
| `start-core` / `stop-core` | 523 / 524 | components.tsx:135,251 / :137,252; PrototypePages.tsx:64 | CALLED |
| `restart-core` | 529 | components.tsx:118,136,186,251; PrototypePages.tsx:64 | CALLED (App.test.tsx:387) |
| `restart-tunnel` | 530 | components.tsx:119,176,190; PrototypePages.tsx:55,64 | CALLED |
| `restart-all` | 531 | components.tsx:180,187,195,214; PrototypePages.tsx:55,64 | CALLED (WorkflowsPage.test.tsx:189) |
| `view-process-details` | 532 | components.tsx:123,184,206; PrototypePages.tsx:55,64 | CALLED |
| `system-snapshot` | 536 | components.tsx:172,178,185,192,200,204; PrototypePages.tsx:45,55,62; pages.tsx:329 | CALLED (App.test.tsx:401) |
| `reset-oauth` | 540 | components.tsx:179,194,213; PrototypePages.tsx:64,74 | CALLED |
| `toggle-autostart` | 541 | PrototypePages.tsx:71; pages.tsx:365 | CALLED (App.test.tsx:423) |
| `clear-logs` | 542 | components.tsx:199; PrototypePages.tsx:81; pages.tsx:260 | CALLED |

#### 2c. Process-level and OS-level entry points

| identity | declaration | callers (application / test) | verdict |
|---|---|---|---|
| Single-instance mutex `Local\AgentCoreDesktop` | src/launcher/Program.cs:13 | second launch exits or signals Show (Program.cs:19) | CALLED |
| Event `Local\AgentCoreDesktop.Show` | MF:30, listener MF:56 | Program.cs:19 (second instance) | CALLED |
| Event `Local\AgentCoreDesktop.Exit` | MF:31, listener MF:57 | `RA`:51,379; T/launcher-exit-signal.test.ts | CALLED |
| Tray menu `Show App` / `Exit` | MF:156-162 | user click | direct user access |
| Control file `AGENT_CORE_LAUNCHER_CONTROL_FILE` | writer CS:583-586; env set CS:1357; reader src/index.ts:485-512 (250 ms poll), config.ts:203 | launcher shutdown only | CALLED |
| CLI helper `--browser-use-transport <sock>` | BrowserUseNativeHost.cs:24 | src/rdc/browser-control/open-browser-use.ts:97; scripts/verify/launcher-package.mjs:12; T/launcher/BrowserUseNativeHostTests.cs:333 | CALLED |
| Chrome native-messaging host mode (`chrome-extension://bgjoih.../` [+ `--parent-window`]) | BrowserUseNativeHost.cs:35-56 | Chrome via `NativeMessagingHosts\<host>` registry key (referenced at open-browser-use-runtime.ts:99); extensions/agent-core-open-browser-use/background.js:119 (`connectNative`) | external integration |
| CLI helper `--native-dump-helper <pid> a b` | NativeDumpDiagnostics.cs:215 | self-spawn NativeDumpDiagnostics.cs:209 | CALLED |
| Outbound only: tunnel admin UI `http://127.0.0.1:8787/` (CS:904), `/readyz` (CS:970), TCP probe 8788 (CS:950) | n/a | served by `tunnel-client.exe`, not by this repo | out of scope |

### 3. UI pages (React 19 + Vite SPA in `src/ui`; entry `src/ui/index.html` -> `/src/main.tsx:9` -> `App.tsx:28`)

No router library and no `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource` in non-test UI code; all I/O goes through `postHost`/`subscribeHost` (host.ts:556,558, WebView2). Page id = location hash: `pageFromHash` App.tsx:19 (valid set App.tsx:17, aliases workspace->chat, runtime->core, integrations->systems, dreaming->learning), `setPage` App.tsx:306. Dispatch: `ReferenceUi` pages.tsx:790 (one ternary chain at :792) inside `AppShell` (components.tsx:238), rendered at App.tsx:462. Left nav = `navItems` components.tsx:37-51 (13 items; `workflows` and `wizard` are not in it). Built output `dist/ui` is served by WebView2 at `https://app.agentcore.local/index.html` (MF:288-318).

| id (hash) | component | declaration | how selected | renders / reached from | tests / harness | verdict |
|---|---|---|---|---|---|---|
| `chat` (default) | `ChatPage` | pages.tsx:429 | nav "AI Workspace"; fallback of `pageFromHash`; brand click components.tsx:247 | pages.tsx:792 | UI/NativeChatReliability.test.tsx (many), App.test.tsx; parity script :90 | CALLED |
| `dashboard` | `PrototypeDashboard` | PrototypePages.tsx:24 | nav "Dashboard" | pages.tsx:792; hosts `ProposalCards` :36 | parity script :84 | CALLED |
| `goals` | `GoalsPage` | LauncherPages.tsx:65 | nav "Goals & Plans"; pages.tsx:736 | pages.tsx:792 | UI/LauncherMigration.test.tsx:76,83 | CALLED |
| `artifacts` | `ArtifactsPage` | LauncherPages.tsx:93 | nav "Artifacts"; LauncherInspector `onArtifacts` components.tsx:262 | pages.tsx:792; hosts `TaskChangesPanel` :102 | parity script :84 | CALLED |
| `models` | `ModelsPage` | LauncherPages.tsx:20 | nav "AI Models"; PrototypePages.tsx:74,87 | pages.tsx:792 | UI/LauncherMigration.test.tsx:52,61 | CALLED |
| `memory` | `MemoryPage` | LauncherPages.tsx:47 | nav "Memory Explorer" | pages.tsx:792 | UI/LauncherMigration.test.tsx:66 | CALLED |
| `learning` | `LearningPage` | LauncherPages.tsx:108 | nav "Dreaming Review" | pages.tsx:792 | UI/LauncherMigration.test.tsx:111 | CALLED |
| `core` | `PrototypeRuntime` | PrototypePages.tsx:51 | nav "Core Runtime"; topbar components.tsx:250 | pages.tsx:792 | parity script :84 | CALLED |
| `systems` | `PrototypeTools` | PrototypePages.tsx:40 | nav "Tools Hub & MCP" | pages.tsx:792 | UI/LauncherMigration.test.tsx:121 | CALLED |
| `workflows` | `WorkflowsPage` | WorkflowsPage.tsx:9 | no nav item; `setPage('workflows')` PrototypePages.tsx:46; direct hash | pages.tsx:792 | UI/WorkflowsPage.test.tsx; LauncherMigration.test.tsx:123 | CALLED |
| `activity` | `PrototypeActivity` | PrototypePages.tsx:78 | nav "Activity Log" | pages.tsx:792; hosts `ToolExecutionDetail` | UI/LauncherMigration.test.tsx:130 | CALLED |
| `diagnostics` | `PrototypeDiagnostics` | PrototypePages.tsx:60 | nav "Diagnostics & Recovery"; topbar components.tsx:255 | pages.tsx:792 | parity script :84 | CALLED |
| `settings` | `PrototypeSettings` | PrototypePages.tsx:67 | nav "Settings"; default branch of the chain | pages.tsx:792 | parity script :84 | CALLED |
| `wizard` | `PrototypeSetup` | PrototypePages.tsx:84 | no nav item; Setup Wizard buttons components.tsx:227,256 | pages.tsx:792 | UI/LauncherMigration.test.tsx:138 | CALLED |
| `skills` | `SkillsPage` | LauncherPages.tsx:144 | nav "Skill"; reload via `onSkillsReload` | pages.tsx:792 | UI/SkillsPage.test.tsx (mocked host) | CALLED; its data route is dead (F1) |
| (none) | `DashboardPage` | pages.tsx:100 | no selector | nothing | none | NO IN-REPOSITORY CALLER FOUND |
| (none) | `CoreRuntimePage` | pages.tsx:146 | no selector | nothing | none | NO IN-REPOSITORY CALLER FOUND |
| (none) | `SystemsPage` (+`SystemInspector` :225) | pages.tsx:202 | no selector | nothing | none | NO IN-REPOSITORY CALLER FOUND |
| (none) | `ActivityLogPage` (+`LogInspector` :282) | pages.tsx:243 | no selector | only tests | UI/ActivityLogScreenshot.test.tsx:6,26; ToolExecutionEnhancement.test.tsx:4,34; ActivityLogVisualVariants.test.tsx:6,71 (+2) | TEST-ONLY |
| (none) | `DiagnosticsPage` | pages.tsx:321 | no selector | nothing | none | NO IN-REPOSITORY CALLER FOUND |
| (none) | `SettingsPage` | pages.tsx:344 | no selector | nothing | none | NO IN-REPOSITORY CALLER FOUND |
| other surface | Chrome extension popup `extensions/agent-core-open-browser-use/popup.html` (manifest action.default_popup) | manifest.json:15 | user click in Chrome | n/a | none | external UI surface, not inventoried deeper |

### 4. Server actions

Category absent. Evidence: `src/ui/package.json` deps are react, react-dom, vite, tailwind, lucide-react only; no `next`, `@remix-run`, `react-router`, `@tanstack/*router`; zero matches for `"use server"`, `'use server'`, `"use client"`, `createServerFn`, `getServerSideProps`, `pages/api`, `app/api`, `next/` in src, scripts, tests, extensions, subagents; no framework config files (next/remix/astro/nuxt/svelte). Nearest equivalents: (1) MCP tool handlers (section 5); (2) WebView2 `postHost` messages dispatched in `MF:332` (section 2a); (3) the HTTP `/agent/*` routes (section 1). `runtime/skills` was grepped for route declarations (`createServer`, `.listen(`, `route ===`, `pathname ===`, `app.get/post`, `HttpListener`, `use server`): none.

### 5. MCP tools (registered via `server.registerTool`; 84 registrations, 83 unique names, `reconstruction_harness` registered twice)

How callers reach every tool: (i) external MCP client -> `POST /mcp` (R08) -> `createAgentCoreMcpServer` (src/mcp/server.ts:302); (ii) Native runtime: model tool-call -> agent-controller.ts:1859 -> agent-tool-session.ts (in-process `InProcessToolHost`, no HTTP), gated by the family catalog `src/agent-capability-catalog.ts` (column Cat); (iii) static MCP-client scripts (column Scripts); (iv) `native_chat_bridge` spawns NCB, which calls routes R15-R16, R20-R21, R28. External callers by docs only: ChatGPT via OpenAI tunnel, Claude via Worker/Cloudflare (CT:53-54), Codex key (native-chat-completion.mjs:8); this session's Claude Code tool list shows all 83 names as `mcp__agent-core__*` (observation, not a call). Hits in `agent-capability-catalog.ts`, `evidence-capture-policy.ts`, `usageTracker.ts`, `activityPhase.ts`, `agent-turn-events.ts` are references, not callers.

Registration condition (src/mcp/server.ts): RDC group (29 tools, lines 357-396): always, native + external. `controller_contract` (controller-contract.ts:70, installed server.ts:329): external only. `controller_learning`: needs `externalControllerLearning`+`controllerSessionId` (server.ts:398). `memory_*` (17): `memoryService` (:410). `memory_v2_*`: `memoryExperience` (:419). `learning`: `learningService` (:432). `code_symbol`,`code_refactor`: `semanticIde` (:444). `skills`: `skillsService` (:450). `phone_*`(14)+`phone_game_*`(2): `phoneController` (:462; game tools via phone-tools.ts:279). `code_*`(7): `codeIntelligence` (:468). `artifact_inspect`: `artifactAuthorization` (:475). `restart_agent_core`: external only (:487). `native_chat_bridge`: external only (:488). `reconstruction_harness` (external, external-reconstruction-harness-tools.ts:21): external only (:489); `reconstruction_harness` (native, reconstruction-harness-tools.ts:10): native only (:494-496). `web_search`,`web_open`: `webResearch` (:497).

Legend for the verdict (heuristic, auditable via `tool-verdict-inputs.txt`): Cat = line in `src/agent-capability-catalog.ts` (Native-grantable; "-" = not in catalog, so external-only or not grantable). Scripts = script that names the tool in a call. Beh = test files naming the tool that are not pure listing/grant/UI-label tests; List = tests that only list names (`rdc-parity`, `mcp-manifest-contract`, `agent-capability-resolver`, `agent-os-tool-grant-adoption`, `authenticity-maintenance`, `capability-usage`, `native-shared-tool-registry`, `agent-tool-session`, and similar). CALLED = Scripts>0, or Cat present and Beh>0, or external-only with Beh>0 and Scripts>0. TEST-ONLY = Beh>0 or handler-level test but no Cat and no Scripts (or handler-level test only). NO IN-REPOSITORY CALLER FOUND = nothing but registration, Cat, labels and listing tests; still reachable via MCP `tools/call` and Native dispatch (framework dispatch, `mcp-manifest-contract.test.ts:71` exercises registration collectively). Handler for in-place registrations = the callback in the registration file.

| tool | registration | handler | Cat | Scripts | Beh / List (test files) | docs (live+archive files) | verdict |
|---|---|---|---|---|---|---|---|
| get_config | mcp/server.ts:357 | rdc/tools/config.ts:93 | 60 | none | 16 / 7 (e.g. T/agent-runtime-integration.test.ts) | 17+10 | CALLED |
| set_config_value | server.ts:358 | rdc/tools/config.ts:161 | 258 | none | 1 / 3 (T/bridge-runtime.test.ts) | 7+0 | CALLED |
| read_file | server.ts:359 | rdc/handlers/filesystem-handlers.ts:83 | 61 | cumulative-workflow-eval.mjs:47; pdf-tool-delivery-check.mjs:43; rea-harness-registration.mjs:34 | 46 / 9 | 45+22 | CALLED |
| image_inspect | server.ts:360 | rdc/tools/image-inspect.ts:181 | 62 | none | 7 / 5 (T/image-inspect-http.test.ts, image-inspect-mcp.test.ts) | 23+7 | CALLED |
| read_multiple_files | server.ts:365 | filesystem-handlers.ts:298 | 63 | none | 2 / 2 | 14+2 | CALLED |
| write_file | server.ts:366 | filesystem-handlers.ts:363 | 90 | cumulative-workflow-eval.mjs:152 | 17 / 6 | 20+5 | CALLED |
| write_pdf | server.ts:367 | filesystem-handlers.ts:556 | 91 | none | 1 / 2 (T/bridge-runtime.test.ts) | 7+1 | CALLED |
| create_directory | server.ts:368 | filesystem-handlers.ts:435 | 92 | none | 2 / 1 (T/project-structure-filesystem.test.ts) | 9+0 | CALLED |
| list_directory | server.ts:369 | filesystem-handlers.ts:451 | 64 | none | 2 / 2 | 16+1 | CALLED |
| move_file | server.ts:370 | filesystem-handlers.ts:480 | 94 | none | 2 / 1 | 24+1 | CALLED |
| file_checkpoint | server.ts:371 | rdc/handlers/checkpoint-handlers.ts:4 | 89 | none | 0 / 3 | 15+7 | NO IN-REPOSITORY CALLER FOUND (checkpoint service is wired at server.ts:355 and tested through its service, not by tool name) |
| browser_control | server.ts:372 | rdc/handlers/browser-control-handlers.ts:5 | 120 | verify/native-memory-reuse.mjs:210 | 3 / 7 | 22+9 | CALLED |
| start_search | server.ts:379 | search-handlers.ts:13 | 78 | none | 3 / 2 | 10+2 | CALLED |
| get_more_search_results | server.ts:380 | search-handlers.ts:85 | 79 | none | 2 / 2 | 9+1 | CALLED |
| stop_search | server.ts:381 | search-handlers.ts:180 | 81 | none | 0 / 2; handler-level T/authenticity-maintenance.test.ts:143,146 | 6+0 | TEST-ONLY |
| list_searches | server.ts:382 | search-handlers.ts:221 | 80 | none | 0 / 2 | 6+0 | NO IN-REPOSITORY CALLER FOUND |
| get_file_info | server.ts:383 | filesystem-handlers.ts:529 | 65 | none | 1 / 2 | 8+0 | CALLED |
| edit_block | server.ts:384 | rdc/tools/edit.ts:424 | 93 | none | 4 / 3 | 20+1 | CALLED |
| start_process | server.ts:385 | terminal-handlers.ts:22 | 102 | cumulative-workflow-eval.mjs:152 | 11 / 6 | 27+10 | CALLED |
| read_process_output | server.ts:386 | terminal-handlers.ts:30 | 103 | cumulative-workflow-eval.mjs:152 | 3 / 3 | 12+1 | CALLED |
| interact_with_process | server.ts:387 | terminal-handlers.ts:38 | 104 | none | 0 / 2 | 9+1 | NO IN-REPOSITORY CALLER FOUND |
| force_terminate | server.ts:388 | terminal-handlers.ts:45 | 113 | none | 0 / 1 | 6+0 | NO IN-REPOSITORY CALLER FOUND |
| list_sessions | server.ts:389 | terminal-handlers.ts:53 | 66 | none | 0 / 2 | 9+2 | NO IN-REPOSITORY CALLER FOUND |
| list_processes | server.ts:390 | process-handlers.ts:15 | 67 | none | 1 / 3 | 9+2 | CALLED |
| kill_process | server.ts:391 | process-handlers.ts:22 | 113 | none | 0 / 5 | 11+7 | NO IN-REPOSITORY CALLER FOUND |
| get_usage_stats | server.ts:393 | rdc/tools/usage.ts:7 | 68 | none | 2 / 2 | 6+0 | CALLED |
| get_recent_tool_calls | server.ts:394 | rdc/handlers/history-handlers.ts:4 | 69 | none | 2 / 2 | 12+5 | CALLED |
| give_feedback_to_desktop_commander | server.ts:395 | rdc/tools/feedback.ts:19 | 252 | none | 0 / 1 | 5+0 | NO IN-REPOSITORY CALLER FOUND |
| get_prompts | server.ts:396 | rdc/tools/prompts.ts:38 | 70 | none | 0 / 2; handler-level T/authenticity-maintenance.test.ts:91,92 | 6+0 | TEST-ONLY |
| controller_contract | mcp/controller-contract.ts:70 | inline (same file) | - (external only) | verify/native-chat-completion.mjs:33; verify/agents-md-audit.mjs:100 | 9 / 3 | 13+13 | CALLED |
| controller_learning | mcp/controller-learning-tools.ts:18* | inline | - (external only) | verify/cumulative-workflow-eval.mjs:153 | 9 / 1 | 44+15 | CALLED |
| native_chat_bridge | mcp/native-chat-bridge-tools.ts:90 | `runNativeChatBridge` :43 -> spawns NCB -> R15-R16,R20-R21,R28 | - (external only) | verify/native-chat-completion.mjs:27,46 | 2 / 2 | 7+3 | CALLED |
| restart_agent_core | mcp/restart-tool.ts:59 | inline | - (external only) | none | 1 / 2 (T/restart-tool.test.ts) | 18+9 (docs/instructions/release-and-refresh.md procedure) | TEST-ONLY |
| reconstruction_harness (external) | mcp/external-reconstruction-harness-tools.ts:21 | inline | 51 (native twin) | verify/rea-harness-registration.mjs:27 | 2 / 3 | 7+6 | CALLED |
| reconstruction_harness (native) | mcp/reconstruction-harness-tools.ts:10 | inline | 51 | same script | same | same | CALLED |
| artifact_inspect | mcp/artifact-inspect-tools.ts:54 | inline | 54 | none | 1 / 3 (T/artifact-inspect-external-freshness.test.ts) | 13+6 | CALLED |
| learning | mcp/learning-tools.ts:34 | inline | 246 | verify/cumulative-workflow-eval.mjs:138 (name literal is generic; upper bound) | 23 / 2 | 22+10 | CALLED |
| skills | mcp/skills-tools.ts:55 | inline | 210 | verify/cumulative-workflow-eval.mjs:138; agents-md-audit.mjs:51; skill-pack-lint.mjs:13; research/skill-upstream-drift.mjs:11 (generic name; upper bound) | 14 / 7 | 24+14 | CALLED |
| web_search | mcp/web-research-tools.ts:100 | inline | 264 | none | 2 / 4 (T/web-research-mcp.test.ts) | 11+11 | CALLED |
| web_open | web-research-tools.ts:108 | inline | 264 | none | 1 / 4 | 18+7 | CALLED |
| memory_list | memory/mcp/tools.ts:97 | inline | 224 | verify/native-chat-completion.mjs:38 | 3 / 1 | 23+3 | CALLED |
| memory_page | tools.ts:120 | inline | 225 | none | 0 / 2 | 10+2 | NO IN-REPOSITORY CALLER FOUND |
| memory_read | tools.ts:145 | inline | 226 | none | 6 / 3 | 30+3 | CALLED |
| memory_search | tools.ts:166 | inline | 227 | none | 11 / 2 | 43+14 | CALLED |
| memory_retrieval_diagnostics | tools.ts:207 | inline | 228 | none | 0 / 2 | 12+3 | NO IN-REPOSITORY CALLER FOUND |
| memory_export | tools.ts:219 | inline | 232 | none | 1 / 2 (T/memory/memory-v2-host-integration.test.ts) | 11+2 | CALLED |
| memory_import | tools.ts:241 | inline | - | none | 0 / 2 | 11+2 | NO IN-REPOSITORY CALLER FOUND |
| memory_remember | tools.ts:256 | inline | - | none | 0 / 1 (+UI label activityPhase.ts:55) | 27+3 | NO IN-REPOSITORY CALLER FOUND |
| memory_update | tools.ts:273 | inline | - | none | 2 / 1 | 24+6 | TEST-ONLY |
| memory_delete | tools.ts:284 | inline | - | none | 0 / 1 | 15+2 | NO IN-REPOSITORY CALLER FOUND |
| memory_batch | tools.ts:298 | inline | - | none | 0 / 1 | 26+4 | NO IN-REPOSITORY CALLER FOUND |
| memory_feedback | tools.ts:309 | inline | - | none | 1 / 2 (T/metaclaw-feedback-target-adoption.test.ts) | 16+7 | TEST-ONLY |
| memory_retirement_review | tools.ts:323 | inline | 229 | none | 0 / 2 | 8+4 | NO IN-REPOSITORY CALLER FOUND |
| memory_status | tools.ts:335 | inline | 230 | verify/mcp-external-acceptance.mjs:200 | 3 / 2 | 30+6 | CALLED |
| memory_reindex | tools.ts:349 | inline | - | none | 0 / 1 | 8+0 | NO IN-REPOSITORY CALLER FOUND |
| memory_evolve | tools.ts:356 | inline | - | none | 0 / 1 | 11+1 | NO IN-REPOSITORY CALLER FOUND |
| memory_consolidate | tools.ts:367 | inline | 231 | none | 0 / 1 | 9+1 | NO IN-REPOSITORY CALLER FOUND |
| memory_v2_read | memory/mcp/experience-tools.ts:95 | inline | 233 | none | 7 / 2 | 31+7 | CALLED |
| memory_v2_write | experience-tools.ts:124 | inline | 240 | none | 4 / 2 | 20+2 | CALLED |
| code_symbol | mcp/semantic-ide-tools.ts:35* | inline | 163 | none | 1 / 1 (T/semantic-ide-mcp.test.ts) | 26+1 | CALLED |
| code_refactor | semantic-ide-tools.ts:79* | inline | 153 | none | 1 / 2 | 23+1 | CALLED |
| code_orient | mcp/code-intelligence-tools.ts:172* | inline | 139 | none | 1 / 0 (T/grafel-regrounding-g20-g25.test.ts) | 23+4 | CALLED |
| code_graph | code-intelligence-tools.ts:233* | inline | 140 | none | 0 / 3 | 14+1 | NO IN-REPOSITORY CALLER FOUND |
| code_surface | code-intelligence-tools.ts:291* | inline | 141 | none | 1 / 0 (T/graft-graphify-adoption.test.ts) | 20+7 | CALLED |
| code_analysis | code-intelligence-tools.ts:396* | inline | 142 | none | 1 / 0 | 16+11 | CALLED |
| code_patterns | code-intelligence-tools.ts:463* | inline | 144 | none | 0 / 0 | 14+3 | NO IN-REPOSITORY CALLER FOUND |
| code_workspace | code-intelligence-tools.ts:552* | inline | 143 | none | 1 / 2 | 17+4 | CALLED |
| code_repair | code-intelligence-tools.ts:637* | inline | 145 | none | 0 / 0 | 12+2 | NO IN-REPOSITORY CALLER FOUND |
| phone_status | mcp/phone-tools.ts:88* | inline | 176 | none | 0 / 3 | 9+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_observe | phone-tools.ts:95* | inline | 177 | none | 0 / 1 | 10+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_tap | phone-tools.ts:144* | inline | 190 | none | 0 / 1 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_swipe | phone-tools.ts:154* | inline | 191 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_long_press | phone-tools.ts:169* | inline | 192 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_input_text | phone-tools.ts:179* | inline | 193 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_key | phone-tools.ts:189* | inline | 194 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_back | phone-tools.ts:199* | inline | 195 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_home | phone-tools.ts:206* | inline | 196 | none | 0 / 0 | 8+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_launch_app | phone-tools.ts:213* | inline | 197 | none | 0 / 0 | 8+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_list_named_actions | phone-tools.ts:223* | inline | 178 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_save_verified_action | phone-tools.ts:230* | inline | 198 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_run_named_action | phone-tools.ts:240* | inline | 199 | none | 0 / 0 | 7+0 | NO IN-REPOSITORY CALLER FOUND |
| phone_run_macro | phone-tools.ts:250* | inline | 200 | none | 1 / 0 (T/game-mode-advanced.test.ts:86,94) | 8+1 | CALLED |
| phone_game_inspect | mcp/phone-game-tools.ts:32* | inline | 179 | none | 1 / 1 (T/game-mode-advanced.test.ts) | 7+0 | CALLED |
| phone_game_manage | phone-game-tools.ts:112* | inline | 202 | none | 1 / 1 | 7+0 | CALLED |

Totals: 45 CALLED, 5 TEST-ONLY (`get_prompts`, `stop_search`, `memory_update`, `memory_feedback`, `restart_agent_core`), 33 NO IN-REPOSITORY CALLER FOUND (reachable externally through `tools/call` and, where Cat is set, Native dispatch). "docs" counts are file counts (live docs / archive docs under docs/research and docs/history-agent-core); full per-file lists for every tool, including test and doc paths, are in `tool-callers.tsv`.

### 6. Coverage limits and commands

Not covered or not provable:
- `dist/`, `vendor/`, `SubProject/`, `node_modules/`, `runtime/` (except `runtime/skills`, grepped: no route declarations), `release/` (untracked versioned snapshots v0.8.1 and later), `Backups/`, `.git`, `.grafel`, `.rdc-standalone/` excluded. `.env`, `secrets/`, `runtime/bridge-auth`, `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT` never opened. `tunnel-client.exe` and `src/launcher/bin|obj` are binaries, not read.
- Cloudflare dashboard hostname/path rules, the external Worker, and the OpenAI tunnel service filtering cannot be checked from the repo. Real traffic was not observed (no logs, no server run, no production call).
- Dynamic callers cannot be enumerated: Native model tool calls (agent-controller.ts:1859), external MCP clients, browsers hitting OAuth pages.
- Tool name matching is textual: `skills` and `learning` use quoted-literal matching everywhere (upper bounds); tests that loop over `registerTool` registrations without naming a tool count as "listing". Handler behavior may be tested through service-level code without the tool name.
- `scripts/` (about 90 CLI files) were scanned for route and tool references only, not enumerated as entry points. `package.json` scripts `start` (`node dist/index.js`) and the entry guard `src/index.ts:457-523` are the Node entry; `src/index.ts` also polls the launcher control file.
- Working tree changed during the scan (see snapshot); `*` lines may have shifted again.
- The shell tool's `Glob docs/*unnel*` timed out, so `docs/Cloudflare-Tunnel.md` was read directly.

Commands and scripts used (all read-only; scratch scripts are in `C:\Users\Ikbal\AppData\Local\Temp\claude\E--Projects-Agent-Core\728bcb42-f665-4261-adc2-ad000f58bad8\scratchpad\inventory\`):
- `route-scan.cjs <file>`: TypeScript-AST scan of `route ===`, `route.startsWith`, `route.match` with enclosing `if` line spans (run on src/http/app.ts; this proved F1).
- `tool-scan.cjs <out.json>`: finds every `registerTool('x'`, `register('x'`, `tool(server,'x'` in src/mcp and src/memory/mcp (84 hits), then searches 1,834 files (src, tests, scripts, docs, extensions, subagents, .github, .changeset, tunnel-client, root md) for each name; output `tools.json`, `tool-callers.tsv`, `tool-verdict-inputs.txt`.
- `string-refs.cjs <literal...>` (env `CAP`): literal search by scope (src/launcher/ui/script/test/doc/docArchive); used for all route paths, WebView2 message types, action ids, `agent-run`, `onAgentRun`, `StreamableHTTPClientTransport`, handler names (second-method checks for every "none").
- `symbol-refs.cjs <name...>`: definition and reference split (app vs test) under src/ui/src for all page and helper components.
- Grep patterns: `createServer|express\(|app\.(get|post)|router\.|http\.Server|new Hono|fastify`; `IncomingMessage|request\.url|req\.url|\.pathname\s*===|\.listen\(|node:http|node:net`; `createServer\(|\.listen\(|HttpListener|TcpListener|Kestrel|WebSocketServer` over src, scripts, tests, extensions, tunnel-client, .github; `"use server"|use client|from 'next|@remix-run|react-router|createServerFn|getServerSideProps|pages/api|app/api`; `fetch\(|XMLHttpRequest|EventSource|WebSocket|axios` in src/ui/src; `NamedPipe|Mutex|ControlFile|--[a-z-]+|OpenStandard` in src/launcher; `@modelcontextprotocol/client` in src; `setPage\(|location\.hash|hashchange` in src/ui/src; `route|pathname` regexes over runtime/skills.
- PowerShell: directory listings, `Select-String` for `/agent/`, `/health`, MainForm/AgentCoreRuntime references in tests, handler line lookup, `git status --short`, `git log -S native-enabled`, `Test-Path` for partner-tools files.


## 4. Final simplification review

`code-simplifier.md` guidance was applied to the code changed by this run only (the diff is moves of identical helpers). Nothing further was changed: call sites keep their names through import aliases, new modules are single-purpose, and no nested ternaries or dense one-liners were introduced. The only deliberate non-simplification is `any` as the return type of the MCP result helpers, kept to match the previous helpers exactly.

## 5. Open work

1. Pre-existing at HEAD, needs its own task: the manifest budget overshoot (132,791 > 131,072 bytes) and the two tests whose dynamic imports take longer than the 15 s test timeout.
2. The `OPEN` duplicate groups in section 2.2.
3. 839 export candidates (419 / 203 / 217) are retained as requested; none was deleted. Dropping an unneeded `export` keyword on the 419 is a separate decision.
4. Defect found by pass 3, outside this change: `GET /agent/skills` and `POST /agent/skills/:name/native-enabled` sit inside the `/agent/chat/` branch of `src/http/app.ts` (declared at lines 435 and 464, enclosing `if` at line 182), so they answer 404 and the launcher's Skills page cannot load. Verified by reading `app.ts:182-186, 435-440, 464-468, 523-525, 569-572`. No HTTP test covers them. Proposed separate task: move both branches before line 182 and add an HTTP test.
5. Other inventory findings F2–F7 in part 3 (no UI trigger for `POST /agent/run`; legacy pages unreachable; two launcher actions without sender; 33 MCP tools without a literal in-repo caller; stale `scripts/release/release-compat.mjs`).
