# SecondSight - Source-Qualified Steal/Use Integration Plan

> Status: COMPLETE — SS-P1 LIVE-ACTIVATED / INSTALLED-RUNTIME VERIFIED; SS-P2 IMPLEMENTED / TARGETED VERIFIED as an explicit source CLI; NO ADDITIONAL CURRENT-FIT ADOPTION; REFERENCE RETIRED / DELETED.
> Date: 2026-09-23.
> Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/steal-use-repos/02-SecondSight`.
> Pin: `3f05d3f681f4b08767aa0026f02d28ab027c442d` (roymondliao/SecondSight).
> Disposition: REFERENCE DELETED after final zero-value/dependency/process/reparse census. Native SS-P1/SS-P2 provenance remains in this plan and Agent Core evidence.
> Licensing: no LICENSE/COPYING/NOTICE path was found in the tracked census; README and pyproject did not establish a grant. Permission review is required before incorporating upstream source/tests.

## 1. Goal and architecture

Make an interrupted machine-control invocation distinguishable from no invocation, then optionally summarize the completeness of explicitly supplied operation evidence. Preserve the existing Activity Tracker, tool history and Reflexion owners. Do not install SecondSight's daemon, SDK agents, SQL database, hook framework, dashboard or transcript collection.

Native source comparison establishes a precise gap: the `tool(...)` wrapper in `src/mcp/server.ts` records successful/handled-failure results after the handler returns, and exceptions in its catch branch. It has no invocation-start record or stable invocation ID joining the beginning to its terminal event. `TrackerEvent.id` identifies a journal event, not a whole invocation. Consequently an operation interrupted before returning has no corresponding outer-wrapper terminal record to summarize; absence must not be interpreted as success or no activity.

This is a source-level observation, not a claim that production calls were deliberately interrupted or that every internal subsystem lacks start events. The first proposed wiring covers the 26 machine-control registrations through this wrapper, not all 62 public tools. Other tool families remain separate owners.

## 2. Source and test evidence

| Pinned source | Mechanism actually inspected |
| --- | --- |
| `src/secondsight/analysis/segmenter.py::Segmenter` | Assembles pre-segmented events, retains orphan starts/ends, refuses invalid sequence ordering. |
| Same file, `_assemble_events` | Pairs by FIFO `(tool_name, target)`; this is not reliable identity for concurrent identical invocations and is not the proposed native pairing rule. |
| `tests/analysis/test_segmenter.py` | Explicit orphan, empty/pre-prompt segment, sequence-order, ordinary pairing and sub-agent cases. Read, not executed. |
| `analysis/metrics.py::compute_segment_metrics` | Unknown outcomes do not count as failed; advisory rather than autonomous decisions. Missing token counts are nevertheless added as zero, which will not be ported. |
| `feedback/directive_identity.py` | Project-scoped identity reuse and explicit semantic ambiguity. Existing Memory links and report identity are preferable native owners. |
| `feedback/effectiveness.py` | Compares flag frequencies across sessions and drives lifecycle judgments. Its flagged-session denominator and missing-data assumptions do not establish causal effectiveness. |
| `storage/raw_trace_store.py` | Atomic per-event JSON persistence and explicit corrupt-read errors. Do not duplicate the native journal with one file per event. |
| Native `src/tracker/activity-tracker.ts` | Existing redaction, journal/TXT mirror, event IDs and failure snapshots. Reuse, do not instantiate a second tracker. |
| Native `src/mcp/server.ts` | Existing result/error classification, history and failure-loop advisory boundaries must remain intact. |

The targets below are independently specified Agent Core requirements grounded in that comparison. This is not a translated implementation, a clean-room certification, or a claim that the repository grants reuse rights. Resolve permission before taking substantive upstream code, tests or prompts.

## 3. SS-P1 â€” Correlated invocation boundaries in the existing journal

**Historical implementation checkpoint (superseded by the 2026-09-24 closure below): APPROVED â€” IMPLEMENTED â€” TARGETED VERIFIED â€” NODE ACTIVATION PENDING at that time.**

Proposed files: `src/mcp/server.ts`; a small `src/tracker/tool-invocation.ts` helper only if it prevents duplicate lifecycle logic; `tests/mcp-invocation-evidence.test.ts`. Do not change public tool inputs/outputs or expose a new MCP tool.

Proposed behavior:
1. For calls already tracked by the wrapper, allocate a bounded opaque invocation ID and emit one start event before calling the handler. Include only tool name, invocation ID and a source/process-session discriminator; do not include argument values, transcript, hidden reasoning or credentials.
2. Enrich the existing terminal event with the same invocation ID and an explicit outcome (`success`, `handled-failure`, `exception`). Preserve existing kind/level behavior and tool return values; a handled failure logged at info level must not be inferred successful by the reader.
3. Exactly one terminal event is attempted for each completed wrapper call. An internal history/usage write failure is not a second terminal outcome for the underlying tool. The helper's terminal transition is idempotent.
4. Keep UI-origin suppression unchanged. Define `get_recent_tool_calls` explicitly: retain its existing history exclusion while making any new tracker boundary behavior consistent and nonrecursive.
5. Tracker recording is best-effort and must not authorize, block, retry or alter the operation. A persisted start without an end means `terminal-unobserved`, not a proven process crash or failed operation.
6. Use monotonic elapsed time for newly introduced duration evidence where practical, while preserving existing external duration fields and distinguishing unknown duration. Never infer token/API cost from elapsed time.

Because the existing journal writer is fail-soft, neither a start callback nor a terminal callback proves disk persistence. Tests must include tracker failure without changing the user's tool result. Do not add a new database, durable counter, global lock, background watcher or memory capture.

### Tasks after selection
- [x] SS1.1 Confirmed exact wrapper callsites and preserved registration count/annotations/history/advisor behavior.
- [x] SS1.2 Added native in-memory fixtures for success, handled failure, exception and tracker write failure without importing SecondSight tests.
- [x] SS1.3 Added `src/tracker/tool-invocation.ts` and narrow wrapper wiring; new fields contain only safe identifiers/outcome/duration metadata.
- [x] SS1.4 Concurrent identical calls receive distinct IDs; terminal transition is once-only and tracker failures remain non-blocking.
- [x] SS1.5 Missing terminal evidence remains `terminal-unobserved`; no synthetic production journal or memory entry is created.
- [x] SS1.6 Final targeted matrix is 70/70 PASS including MCP manifest/schema regressions; selected compile/candidate smoke pass. Active Node cutover remains separate.

## 4. SS-P2 â€” Optional read-only operation-completeness report

**Selection: APPROVED â€” IMPLEMENTED â€” TARGETED VERIFIED. Legacy evidence remains explicitly limited.**

Proposed files: `scripts/inspect/operation-completeness.mjs`, a pure parser/assembler helper if useful, and `tests/operation-completeness.test.ts`. Input is one explicit operator-selected journal snapshot, not automatic scanning of tracker history or imported agent conversations.

Pair by exact invocation ID plus declared process/session namespace, never by filename/tool-name FIFO. Preserve file order and event IDs; report ambiguous or duplicate boundaries, unknown terminal outcomes, orphan starts and end-only legacy evidence. Existing uncorrelated historical events remain `legacy-unpaired`; do not reconstruct a fictitious start or timestamp.

Completeness is evidence coverage, not process liveness. A partial window can contain a legitimate invocation end whose start is outside the window. The report must state byte/line range, cutoff, omitted/invalid counts, final unterminated-line status and input hash. A malformed line or truncated input prevents a full-coverage claim. A missing end does not authorize retry or process termination.

Proposed limits: 16 MiB snapshot, 256 KiB per line, 20,000 lines, 5,000 active invocation keys and a bounded result. Exceeding a bound yields explicit partial evidence or refusal, never silently drops rows while calling the report complete. Reuse identity-safe reading and redaction. Read a captured prefix/immutable input; do not chase a growing journal indefinitely. Recheck input identity/hash according to the chosen snapshot contract.

Output: counts, safe IDs/tool names, statuses and source pointers only. No thought/response/prompt bodies or raw argument/result payloads. Token costs remain unknown. Output file, when requested, must be new/exclusive and cannot overwrite the source. No `ActivityTracker` import that constructs a live singleton just to parse a file.

### Tasks after selection
- [x] SS2.1 Defined the additive SS-P1 and legacy event schema plus explicit snapshot/partial-window semantics using native fixtures only.
- [x] SS2.2 Covered same-tool concurrency through exact IDs, missing/end-only boundaries, duplicate boundaries, malformed rows and unterminated tails; process-session identity is part of the key.
- [x] SS2.3 Implemented the bounded pure assembler and CLI with unknown outcomes distinct from failures.
- [x] SS2.4 CLI smoke preserves the explicit snapshot and returns `success, terminal-unobserved` without inferring crash/liveness/causal improvement.
- [x] SS2.5 Docs/CODEBASE/memory and the combined pending patch intent reflect only implemented functionality.

After approval, targeted commands can use existing project-local Node/Vitest:
```powershell
& './runtime/node/node.exe' './node_modules/vitest/vitest.mjs' run tests/mcp-invocation-evidence.test.ts
& './runtime/node/node.exe' './node_modules/vitest/vitest.mjs' run tests/operation-completeness.test.ts
```

## 5. Family ledger and rejected transplantation

| Family | Disposition |
| --- | --- |
| Adapters, observation tracking and segment assembly | SS-P1/P2 reuse the boundary/completeness ideas, not platform hook ingestion or FIFO identity. |
| Analysis metrics | Unknown-vs-failed distinction retained; no missing-token-as-zero accounting. |
| Analysis agents/dispatch/orchestrator/SDK/CLI providers | No second model or autonomous analysis daemon; controller remains semantic analyzer. |
| Behavioral flags, aggregation and effectiveness | No unvalidated 30-percent rule, flagged-session denominator or automatic obsolete transition. Native controlled evaluation remains owner. |
| Convention, directive identity/revisions/dedup/lifecycle | Native Memory, typed links, revisions and Learning proposal boundaries already exist. No parallel instruction store or automatic injection. |
| Storage SQL/raw files/backfill/retention | Native canonical Memory and Tracker remain owners. Do not introduce SQLAlchemy or per-event files. |
| API/server/frontend/install hooks | Separate product architecture; not needed for native correlation evidence. |
| Lazy cache/config/provider selection | Existing native caches, explicit config and provider ownership; no source-qualified new consumer demonstrated. |
| Changes/bugfix history, fixtures, user docs and workflows | Audit context rather than implemented Agent Core features or executable acceptance proof. |

## 6. Boundaries, rollback and current evidence

SS-P1 is operational tracing, not an authorization layer. SS-P2 is explicit inspection, not an auto-curator. The two proposals share one event contract and must not be implemented as competing schemas. Reef RF-P1 addresses transport failure semantics and does not create a second tracker.

Rollback only the new wrapper metadata/start record and selected helper/CLI/tests, preserving all pre-existing logs and memory. Readers must tolerate already-recorded additive fields. No historical journal migration or deletion is needed. A patch intent is appropriate only when a selected behavior is implemented; no intent or version change occurs now.

Census: 814 regular tracked files / 7,252,413 bytes excluding Git; 311 code-suffix files structurally indexed, including frontend/tests. Source-family accounting and hashes are in `runtime/tmp/four-ref-grounding-20260923/`. Selected source/test bodies above were read; full application execution, every analysis prompt and all historical migrations were not independently validated.

No explicit repository license grant was located in the inspected tracked metadata. Keep this uncertainty visible; do not label the project MIT/Apache or treat public visibility as permission. No upstream source/test/prompt copying or installation is performed here.

Historical implementation-time outcome: SS-P1 and SS-P2 were approved and implemented in native Agent Core source. The selected matrix was 70/70 PASS; MCP manifest/schema regressions remained green; candidate compile/smoke passed. SS-P2 was immediately usable as a source CLI, while SS-P1 had not yet been copied to active `dist` or restarted at that checkpoint. The 2026-09-24 closure below supersedes only that activation-pending boundary. No SecondSight code/test/prompt was copied, no dependency was installed, and no automatic Memory capture/retry/authorization layer was introduced.

## 7. Post-SS-P1/P2 final residual census and retirement — 2026-09-23

**Status: NO ADDITIONAL CURRENT-FIT ADOPTION FOUND — REFERENCE RETIREMENT AUTHORIZED BY USER.** SS-P1/SS-P2 native implementations and their provenance remain outside the checkout.

Residual source families were re-read against current Agent Core owners. `analysis/output_recovery.py` has a detailed JSON/schema/transport failure taxonomy, bounded output-repair feedback and executor evidence confidence; however Agent Core has no current model-output JSON-schema consumer for this mechanism. MCP tool JSON decoding already uses `parseCallToolResultJson`; outbound transport retry/timeout policy is separately owned; Hermes consumes a JSON HTTP envelope and leaves partner output opaque/string for lead verification rather than reparsing it into a native schema. Importing SecondSight's model-output repair layer would therefore create an unused second recovery authority.

`feedback/directive_identity.py` and semantic reuse overlap canonical Memory IDs/links/evolution; `feedback/effectiveness.py` uses a fixed 30% behavior-frequency heuristic and automatic lifecycle implications that do not meet Agent Core's evidence/approval boundary. `storage/retention.py`, raw-trace/SQL/backfill and `observation/pipeline.py` belong to SecondSight's dual filesystem+SQL architecture; Agent Core deliberately uses native file-backed Tracker/Memory and has no corresponding SQL mirror consumer. Analysis agents/runtime/orchestrator, API/UI/hooks and provider selection would introduce a second analysis agent or product architecture.

Source census: HEAD `3f05d3f681f4b08767aa0026f02d28ab027c442d`, 814 tracked regular files / 7,252,413 logical bytes, 312 code-suffix files, 3,753 extracted definitions. The checkout was Git-clean. No LICENSE/COPYING/NOTICE grant was found in the earlier and current local metadata review; no upstream implementation/test/prompt was copied for SS-P1/P2.

Pre-retirement dependency safety: exact Agent Core production-source/script/test search outside docs/runtime/dist found zero `SecondSight` or `02-SecondSight` references. No reparse points were present. The only process hit during the first precheck was the audit PowerShell process itself because its command line contained the searched path; it was not a runtime dependency. Full tracked-file SHA-256 evidence is stored in `runtime/tmp/five-ref-regrounding-20260923/secondsight-retirement-precheck.json`.

Disposition: DELETE as a current-fit corpse after the final exact-path/clean/readback check. This is not a claim that SecondSight has no value in its own product domain or could never inspire future work; it means the locally available pinned source has no additional current Agent Core adoption proposal after SS-P1/P2. This plan and the re-grounding audit preserve the source pin, census and rejection rationale.


## 8. Installed-runtime closure — 2026-09-24

**COMPLETE — SS-P1 LIVE-ACTIVATED / INSTALLED-RUNTIME VERIFIED; SS-P2 TARGETED VERIFIED.** Active `dist/tracker/tool-invocation.js` and `dist/mcp/server.js` now match the current-source qualified build. A live MCP `get_config` call produced `tool-invocation-start` and terminal `tool-call` Activity Tracker records carrying the same opaque `invocationId`, proving the correlated boundary is active in the running Core.

SS-P2 remains an explicit snapshot-analysis CLI and needs no resident service. The SecondSight reference remains physically retired/deleted; no upstream source/test/prompt was restored or copied. Combined activation evidence: `docs/Six-Plan-Activation-20260924.md`.
