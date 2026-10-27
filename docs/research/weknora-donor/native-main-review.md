# Main review of Native partner audit

Native was genuinely called as the requested partner through the authenticated existing bridge. Wave3 task `355fd7a9-0964-469f-a52f-5c7554d0cd65` executed20 tool calls with no recorded tool failures, including full assigned lexical triage and source reads, and wrote `native-agent-audit.md`. It used30 provider attempts and finalized failed at16:07Z; the bridge independently disconnected before the final task state. No coverage JSON or successful completion is claimed. Original report SHA-256 is retained by the runtime artifact. Per the user's later instruction, Native now stays quiet; Main and Raka continue.

The report is useful candidate input but contains material inaccuracies. It cannot serve as an authority for absent Core functionality or wholesale adoption. Main independently opened the source ranges below; `main-read-log.json` is the excerpt manifest. Mechanical coverage remains `native-lexical-triage.json`, not a fabricated semantic coverage file.

## Corrections and disposition

| Partner claim | Source check and decision |
| --- | --- |
| Core estimated-context helper is at1029 | The helper is `src/agent-controller.ts:452–455`;1029 is its resumed-route consumer. It estimates JSON bytes/4+1024. This is a heuristic, not a provider tokenizer. |
| Compactor preparation/algorithm/checkpoint at47–145 | `internal/agent/compaction/compactor.go:43–78` defines Result/Checkpoint; actual `Compact:112–140` calls Prepare, summarizeHistory, appendTurnPrefix and Apply. Failure fallback has more code below145. The report's exact line descriptions must not be reused. |
| Core retries identical history on length at1056–1076 | Those lines handle a pool pause, persist provider-wait and update metrics. They do not prove the claimed length-retry behavior. Core persists full continuation state and bounds individual initial history messages at200,000 chars (`931–945`). No semantic compactor was established in the inspected controller, but this narrow observation is not a global absence proof. |
| Core has no citation-currentness equivalent | Rejected. Core Memory provides digest/revision-bound retrieval evidence, exact quote checks and a separate retrieval/use ledger (`memory/evidence-excerpt.ts:42–56`, `retrieval-ledger.ts`). Donor source-handle presentation and Core canonical Memory evidence have different domains. Never replace existing revision/trust gates with a display registry. |
| Core stream endpoint `/api/agent/turn/:turnId/stream` / ReadableStream | Incorrect. Actual HTTP owner uses NDJSON POST `/agent/chat/conversations/:id/turns` (`http/app.ts:187–240`) and POST `/agent/chat/turns/:id/resume` (`244–271`), with ServerResponse.write. Turn IDs/clientRequestId are persisted. Do not implement against the invented endpoint. |
| Redis TTL bounds list memory | TTL bounds retention time after inactivity; it is not a byte/count bound while traffic refreshes TTL. Donor memory events append into arrays; `memory_manager.go::GetEvents:112–139` copies the suffix from a supplied offset. No general backpressure or memory superiority follows from this. |
| Every family marked DONE / named donor tests | Only selected paths/ranges were read. Listed test names/line anchors require individual verification; no donor tests ran. `native-coverage.json` did not exist after task finalization. |

## N-01 — semantic context compaction and calibration

The donor has a real richer mechanism: `Compactor.Compact:112–140` summarizes old history and returns before/after counts, degraded state and a turn checkpoint. `agent/token/estimator.go:46–103` uses cl100k BPE with an observed-provider scale clamped0.5–1.5. Its own comments distinguish estimated counts from authoritative API Usage. This is source-present connected capability; no equal-budget task-quality or recovery benchmark was run here.

**Decision: defer a semantic compactor/calibrated tokenizer port.** It would add model calls, token/provider coupling, semantic-loss behavior and checkpoint/version policy to an existing runtime owner. It needs a preserved-history task oracle (tool pairing, user authorization, unresolved work, exact evidence, file edits and source revisitation), token/cost/deadline limits and a real context-overflow fixture before acceptance. A raw truncated archive is not a lossless fallback, and a provider Usage count is not directly comparable if hidden/tool/image tokens differ. No new compaction runtime or tokenizer dependency is installed. Main's W-02 transport boundary and Raka's direct XLSX locations have narrower independent oracles.

## N-02 — structured source-centric tool views

`modelcontext/model_output.go::ModelOutput:22–69` leaves canonical ToolResult.Output intact while rendering selected structured types for the model. Successful current tool results register eligible references; failure output takes a separate branch. `annotateSearchNotes:384–419` explicitly distinguishes budget omissions, ranked candidate subsets and partial failures; the candidate count is not a corpus total. These are useful exact semantics, not a generic XML correctness advantage.

**Decision: retain the principle, defer renderer/handle-registry import.** Core already has per-owner bounded source/evidence structures and a generic transport result budget with persistence integrity and PDF evidence handling. A second registry would overlap those owners. Adoption requires a specific Core tool whose important omission/failure metadata is currently lost, plus an end-to-end fixture demonstrating the loss; no such missing metadata consumer was established here. K-LOC-01 extends the existing evidence owner directly, rather than introducing donor `display_type`/XML as a parallel schema. No statement that generic tool output is evidence of successful use is accepted.

## N-03 — distributed stream coordination, steer and reconnect

Donor stream managers expose stored event suffixes and separate steering data, plus Redis coordination for a multi-replica product. This is broader than a single local resident UI, but does not justify adding Redis. Core already persists turns, deduplicates clientRequestId across conversations (`agent-chat-service.ts:364–369`), preserves full execution checkpoints and exposes authenticated recovery.

**Decision: no Redis/append-only stream owner or mid-run injection in this goal.** A future multi-consumer/replica requirement needs explicit event retention bytes/count, replay identity, authorization and idempotent side effects. Core's current NDJSON writer does not await drain in the inspected lines; that is a concrete source observation, not a measured production bottleneck or proof that the donor is bounded. An event-cursor design must be evaluated on the actual Core HTTP/UI consumers, not the invented endpoint.

## N-04 — MCP clients, sandbox, browser skills and remaining clients

`internal/mcp/manager.go:76–157` keys OAuth connections by principal, refuses disabled/stdio services, singleflights in-progress connections and retires old versions. Core already has OAuth, authenticated MCP transport/tool grants and scoped runtime owners; donor remote-client management is a product-specific role, not a replacement server. No new remote server was connected.

`internal/sandbox/manager.go:68–104` selects the existing sandbox, copies env overlays and invokes script validation unless its internal config skips it. Source-present Docker/remote/local/container/browser families require their own credential, lifecycle and platform contract. Core's process ledger already verifies Windows process creation identity, and the computer/browser owners remain separate. **Decision: no shell validation regex as a security boundary, no container/desktop/browser process owner import.** Interface families/tests/configs were mechanically scanned; selected source snippets do not prove isolation on any platform.

Frontend/client/CLI/packages/miniprogram are classified by their actual module roles. Main's platform report traces CLI MCP registration, upload confinement, wait cancellation and accepted-POST reconnect discipline. Generated clients, translations, icon/media, lockfiles, component variants and story/fixture files are support material, not independent proof of a missing Core feature. No wholesale Vue/SDK/CLI import or UI redesign is accepted. Semantic-only unknowns remain visible in the combined coverage ledger; choosing no port for a product-specific family is separate from claiming every member deeply reviewed.

## User steering

Native stays quiet temporarily. Main continues with Raka, whose canonical Agent Core Memory access is explicitly authorized by the user for this work. The user's separate idea of multiple direct accesses sharing one Memory Agent Core is **future/deferred**; no multi-direct architecture, grants or new engine is implemented here.
