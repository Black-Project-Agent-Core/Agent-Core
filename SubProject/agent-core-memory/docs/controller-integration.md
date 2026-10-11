# Controller integration and isolated transfer

## Status and boundary

The package provides an **allowlisted, transport-neutral dispatcher** over `ControllerMemorySession`. It does not start an MCP server, authenticate users, call a model, or register tools in Agent Core. A host can map these methods onto its already-authorized transport. Agent Core does this in its own `src/mcp/memory-experience-tools.ts` through `memory_v2_read` and `memory_v2_write`, using the activated engine selected by `src/memory/host-runtime.ts`. The deterministic A→B example is protocol replay, not evidence that an autonomous live model used memory correctly. See [T9 verification](verification/memory-controller-transfer.md).

The host authorizes the memory root and constructs the session:

```ts
import { initializeStandaloneMemory, createControllerMemoryDispatcher } from 'agent-core-memory';
const memory = await initializeStandaloneMemory({
  baseDir: authorizedProjectRoot,
  memoryRoot: authorizedMemoryRoot,
  experience: { enabled: true },
});
const call = createControllerMemoryDispatcher(memory.controller({
  workspaceKey: authorizedWorkspace,
  taskId: authorizedTask,
  controllerId: authenticatedController,
}));
const result = await call({ method: 'memory_task_context', input: {} });
```

Root, workspace, task, roles, policy, and verifier registration are host-bound, never request fields. Controller IDs identify an origin; they do not authenticate it. A shared daemon must isolate users at its root/session boundary and authorize every request. A cloned root retains its logical identity and is not a new multi-tenant security boundary. A source-memory statement cannot grant permission or override the current user.

## Controller call sequence

1. Inspect `memory_capabilities`. Experience writes require `writeMode: experience-v2`. Legacy roots remain readable without silently activating a migration.
2. Resume with `memory_task_context`; start a genuinely new task with `memory_task_start`. Reuse stable operation/start keys for retries. Missing context is not permission to silently replace an existing task.
3. If the capsule is absent, stale, uncertain, or omitted for budget, expand the exact `episodeRef` with `memory_expand` and follow every cursor. Inspect current sources when freshness is uncertain; retained source bytes do not prove that a live file still matches.
4. Recall compact-first with `memory_recall`; selectively expand the exact returned refs. Do not treat an abstract as complete evidence or silently substitute a latest revision for a historical ref.
5. Append meaningful changes with `memory_event_append`, including constraints, decisions, obligations, failures, successes and the next action. Use the returned revision for the next CAS operation. Capture authorized text or workspace-file evidence with `memory_evidence_capture`.
6. Checkpoint after milestones, corrections and handoff with `memory_checkpoint`. Mandatory overflow is explicit; never drop a hard constraint to make a capsule fit.
7. Preview durable changes with `memory_consolidation_preview`, obtain the host's existing review when required, then `memory_consolidation_apply`. A checksum or remembered “approved” text is not verification or approval.
8. Use `memory_episode_status` only when the intended completion/pause/abandon semantics hold. `memory_retention_set` changes exposure, not source preservation or verification status.

The dispatcher accepts only `{method,input}`. It exposes capabilities, recall, expand, evidence capture, task start, event append, task context, checkpoint, consolidation preview/apply, retention set, and episode status. Unknown methods, fields, and scope overrides are rejected by strict schemas. Existing errors and CAS/replay semantics remain in effect.

Read budgets cover the **entire dispatcher JSON envelope**, including advisory text and metadata. `metrics.payloadBytes` is exact UTF-8 output bytes; `estimatedTokens` is Unicode code points divided by four, rounded up. It is not a model-token guarantee. Requests below the 896-byte facade-plus-reserve threshold are validated and return `insufficient-budget` without invoking the facade, so no undelivered exposure or unseen checkpoint is recorded. A result that cannot fit returns `insufficient-budget`; callers must handle this before accessing `data`. The dispatcher may reserve space from the facade budget or replace an oversized response with explicit insufficiency. Writes and capabilities do not claim a configurable read budget. Transport-specific framing must be measured by the host.

[`examples/controller-continuation.ts`](../examples/controller-continuation.ts) shows a fresh controller using only this public dispatcher. Tests verify exact mandatory state, evidence reconstruction, an intentionally incorrect mandatory fixture that fails, and stale-capsule fallback. The example is deliberately a protocol fixture, not an autonomous planning agent.

## Transfer/1 and transfer/2

Transfer/1 remains a legacy knowledge-record format. It is not an experience-v2 recovery format. Transfer/2 is a complete **isolated whole-root restore** or an explicitly incomplete knowledge-only export:

```ts
import { exportMemoryTransferV2, previewMemoryTransferV2, importMemoryTransferV2 } from 'agent-core-memory';
const policy = { allowedWorkspaces: ['project-a', 'project-b'], allowUnscoped: false };
const bundle = await exportMemoryTransferV2(authorizedSourceRoot, {
  ...policy, completeness: 'complete', chunkBytes: 65536,
});
const preview = previewMemoryTransferV2(bundle, policy);
// Host reviews destination, included scopes, counts, bytes and any omissions.
const receipt = await importMemoryTransferV2(bundle, authorizedEmptyDestination, policy);
```

- Export holds the source lock and recovers outstanding transactions before snapshotting. There is no 500-record truncation. Files are split into independently checksummed, deduplicated chunks (1 KiB–1 MiB each). The API returns an in-memory bundle; it is not a streaming network protocol, and memory grows with the full bundle size.
- Complete export preserves canonical v2 bytes, bootstrap, live episode/event/capsule state, available legacy revision files, retained archive manifests and objects, feedback/visibility state, retrieval/use ledgers, operation receipts, and consolidation state. Derived indexes, transaction journals and transfer receipts are deliberately omitted. Historical timestamps, provenance, source IDs, links and uncertainty are not rewritten.
- All included workspaces must be explicitly authorized by the host, including recent and retained retrieval attempts/use receipts after ledger rotation. Persisted telemetry is validated by its domain owner and contributes its exact stored workspace; unscoped telemetry requires `allowUnscoped`. Retained feedback subjects use available canonical provenance, otherwise require unscoped authorization. Unscoped ordinary records require `allowUnscoped: true`; pinned foundation data is treated separately. Export does not filter away unauthorized data and call the remainder complete.
- Preview validates manifest/chunk/file checksums, relative-path allowlists, case-fold collisions, strict persistence schemas, object links, cross-file live-state linkage and retained source-ref reachability before destination mutation. Every retained episode snapshot also passes the same owner/header, event count/revision/sequence and deterministic state-reduction checks used by the episode reader, including old snapshots not selected by the current context. Hashes prove byte integrity, not authenticity or truth. Accept bundles only from an authorized trusted source; source content remains advisory.
- Import rejects active/nonempty roots. It first publishes an **incomplete** activation marker and bundle/destination-bound receipt. Incomplete roots cannot be read as healthy active stores. It writes/verifies all objects and publishes the completed activation/receipt last through the transaction owner.
- Exact replay verifies existing bytes, resumes missing writes, and rejects a changed bundle, changed destination identity, extra retained payload, or changed copied bytes. A normal completed duplicate returns `duplicate: true`; it is not a merge operation. Replay can clean unpublished atomic temporary siblings belonging to this incomplete bundle. It never overwrites a conflicting canonical file.
- Logical `sourceRootId` remains unchanged so retained owners and operation receipts still match. Destination-path-bound disclosure cursors from the source are rejected; request new pages after restore. Separately cloned roots are not synchronized and do not establish tenant isolation.
- Knowledge-only output says `completeness: knowledge-only`, lists omitted experience/evidence/history, and may report unresolved refs. The complete restore API refuses it. It is **not a recovery backup**. Transfer/2 requires an already active experience-v2 source. The package does not expose a generic production legacy-migration command; populated legacy roots cannot be activated in place. Agent Core separately owns reviewed, host-specific activation/rollback scripts and snapshot checks. Use the [host installation procedure](../../../docs/Agent-Core-Memory-v2-Installation-20261008.md) for that deployment; do not generalize its migration policy to arbitrary roots. No workflow invents lost history.
- Original artifact bytes remain available after a source-file rename or destination move. Workspace aliases/live-source roots are host configuration and must be re-registered at the destination; transfer does not copy workspace files, credentials, plugins or policy. Missing or changed live sources remain stale/unknown.

Keep bundles outside source-control/package publication unless their contents have been separately reviewed and authorized for sharing. A bundle can contain sensitive history and original provenance paths; this implementation does not sanitize historical bytes or establish encryption/authentication.

## Platform evidence boundaries

The imported T9/final-integration evidence covers Linux protocol replay, restore, Unicode/casing/CRLF paths, retained evidence after rename, atomic replacement and lock-contention fixtures. **Autonomous live controller A→B and the separate full Windows matrix were NOT RUN in that work.** Later [Agent Core host acceptance](../../../docs/Agent-Core-Memory-v2-Live-Acceptance-20261009.md) records scoped Windows/external-MCP integration. Keep those distinct from T9 and from unverified cross-provider or Native-Agent-specific continuation. This documentation refresh runs no runtime checks.

## Cross-phase consolidation preservation

Complete snapshots preserve pending and applied consolidation state using the promotion owner's full strict schema, including its required eligible-record IDs. Pending transition outputs are shape/hash-checked planned values; they become retained archive references only after publication. Actual input refs and applied outputs remain required, and persisted bytes are unchanged. Restored pending apply still requires the destination host's review policy. See [final integration verification](verification/memory-integration.md) for public retain/create/temporal restore and replay evidence and its completed final independent acceptance within the documented synthetic Linux scope.

## Continuity assessment (Memory 12)

Before resuming continuity-sensitive work, both external and Native controllers read the host-scoped task_context surface. Its optional continuity assessment is advisory: ready means a current capsule, never task completion, independent outcome verification, usage attribution or permission. A paused, completed or abandoned episode must not be automatically resumed; the current user stop wins.

- expand-required: expand the exact episodeRef with paging; critical state was not discarded.
- revalidate-required: inspect stale/unknown source evidence before relying on it.
- checkpoint-required: preserve the current goal and state, then checkpoint when appropriate, including handoff. An absent capsule is not a new task.
- ready: use the current capsule subject to episode status and current user intent.

Reads never append progress or resume episodes. Checkpoint retries retain their operationId and exact input. Full-envelope byte limits include the assessment; insufficient-budget is explicit. Observer compliance is separate from the task outcome and cannot establish that a model understood or obeyed every instruction. Memory remains fail-soft and never gates machine control.

## Explicit ingestion receipts (Memory 13)

The existing evidence_capture then event_append flow accepts optional ingestion metadata: streamId, batchId, positive sequence, sourceDigest and previousReceipt (required after sequence 1, forbidden for sequence 1). The stream belongs to the current host-authorized task episode. No log scraping, background job, implicit promotion or second store is introduced.

Compute sourceDigest with disclosureDigest over the ordered array of exact UTF-8 artifact texts referenced by event.sourceRefs, excluding non-artifact references. It hashes the canonical JSON string array, without normalization, trimming or secret content in the receipt. At least one distinct available artifact is required; unavailable/reference-only capture cannot advance ingestion. Keep capture and append operationIds stable across delivery retries. Reusing an operationId with changed ingestion or event input, reusing a stream batch under another operation, gaps, or an inexact predecessor are explicit conflicts.

Read the committed sequence with memory_v2_read(action=ingestion_cursor,payload={streamId}) or the bound dispatcher method memory_ingestion_cursor. Zero means no accepted batch in that stream of the active episode; it does not mean corrupt or inaccessible state was reset. The cursor derives from retained events, exact accepted operation receipts and available captured evidence. Append and its receipt publish through the same existing transaction/CAS. Capture may remain available after an interrupted append and be reused; it is never auto-deleted.

An ingestion receipt proves committed input only. It does not prove the input claim, delivery to the user, model use, promotion eligibility, task success or Learning finalization. Complete transfer preserves the chain and validates source bodies and operation receipt bindings. Persistence is additive to strict event schema version 1; old strict decoders reject new fields rather than silently dropping ingestion metadata. Roll back code only with a reader supporting these fields; do not reset or strip retained state.

### Opt-in prospective intentions (Memory18)

`intentionUpsert(itemId, value, sourceRefs)` creates a critical, active, unverified obligation in the existing episode reducer. Persist it through `appendEvent`; rescheduling an active critical obligation uses an explicit `correction` event, preserving its ID and prior source references. Cancellation uses an explicit `resolve` state change with reason and evidence. Replay and expectedRevision remain authoritative.

The envelope prefix is `agent-core-intention/v1\n`, followed by strict JSON with `summary`, `cue` (`at-or-after` with an offset-qualified `instant`, or `observed-event` with a bounded key), and optional `expiresAt`. No executable conditions or natural-language parsing are supported. Ordinary obligations remain unchanged.

`getTaskContext({intentions:{now,eventKeys,limit}})` and `memory_v2_read(action=task_context, payload={intentions:{...}})` return optional `intentionEvaluation` on the same current episode snapshot, including `episodeRevision`. It is advisory only: `eligible` is neither permission, action execution nor completion. Re-read after a change; do not act on an old revision. Invalid envelopes are unknown with a warning; truncated results are explicit. A too-small budget returns a handle/insufficient-budget response without silently exposing a partial actionable intention set. There is no background polling, scheduler or provider call.

### Host publication history and project synthesis (Memory 14–15)

On an already active experience-v2 root, `temporalKnownAt: true` advertises bounded host-publication history. `recall({validAt, knownAt})` first reconstructs exact revisions committed by the host at the knowledge cutoff, then applies the existing valid-time selector. Both values require an explicit timezone; `knownAt` requires `validAt`, and neither combines with `asOf`. `validAt` alone and legacy `asOf` still mean valid time with current evidence and report `not-known-at`.

Historical query ranking is lexical over the reconstructed records only. It does not use current embeddings, salience, current excerpts or future links. Scope and forgotten status remain current authorization boundaries; retention comes from the selected revision. Historical expansion is exact-revision or unavailable. Cursors include both clocks, coverage and revision snapshot. `knowledgeCoverage` is explicit: legacy publication evidence, retained-history gaps, host clock rollback and the 500-record scan bound cannot silently fall back to current content. Eight previous revisions and at most 1,000,000 revision-file bytes are retained. Equal-time commits have distinct host publication order.

Persistence compatibility: canonical semantic creates/changes on an already activated v2 store atomically publish a revision-file version 2 and the optional `knowledgeClock` watermark in the existing experience manifest. Query, read and initialization do not add this metadata, activate a root, migrate old files or infer timestamps from `updatedAt`/`capturedAt`. Old manifests and version-1 revision files remain readable but have no invented knowledge-time coverage. The manifest formatVersion remains 2, with an additive strict extension: older strict readers reject the new watermark or revision file rather than downgrading/resetting it. Rollback requires a reader compatible with this metadata or disabling the new query consumer; never strip publication metadata to make an old writer run. Transfer preserves intervals/watermark and rejects linkage mismatches. Checksums establish integrity, not source authenticity.

Project syntheses are advisory ordinary v2 records with category `project-synthesis` and a strict JSON envelope. The pure builder emits existing create/amend proposals, applied through the existing review/CAS/promotion owner. Every claim has exact citations; the envelope is bounded to 16 claims, 32 unique dependencies and 8192 UTF-8 bytes. Empty/malformed refreshes, self-reference and unsupported controller verification claims are rejected before publication. Mutable Memory dependencies must still have the exact current revision at preview/apply; immutable artifacts remain exact eligible historical evidence.

Current recall checks direct and nested synthesis dependencies before ranking, with at most 32 unique resolver calls shared across the entire request. Nested resolution runs after releasing the source snapshot lock; dependency cycles become unknown rather than awaiting their own cached promise. Changed, unavailable, malformed or budget-unchecked syntheses are omitted with an explicit warning; ordinary eligible evidence remains available. Unrelated record edits do not invalidate an otherwise unchanged synthesis. Historical knownAt queries conservatively omit syntheses rather than validate them using future knowledge. No model call, autonomous refresh, second writer, store, activation or demonstrated quality/performance benefit is implied.

If a watermark is missing while version-2 publication history remains, initialization marks Memory unavailable and subsequent canonical writes fail with `MEMORY_PUBLICATION_CLOCK_REQUIRED`. No metadata is reset or synthesized and no runtime-wide gate is added. The host retains the existing fail-soft Memory boundary. This differs from a legitimate older root with version-1 snapshots, which remains readable with unproven knowledge-time coverage until later authorized semantic writes establish new intervals.
