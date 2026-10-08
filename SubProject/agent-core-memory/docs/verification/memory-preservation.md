# T2: schema, source preservation, and transaction recovery

Verified on 2026-10-07 UTC against the reviewed T1 baseline `4d656329c7b45907857e19f3f3b4efedeb76f8ba`. This is the T2 implementation evidence, subject to the separate phase review. It does not claim the later episode, capsule, promotion, temporal-query, retention, or transfer/2 gates.

## Result and reproduction

- Debian 13.6 Linux x86_64, Node 24.19.0, npm 11.9.0. No dependency or lockfile change.
- `npm run verify`: build exit 0; 120/120 tests across nine files, no skipped/pending tests.
- `npm test -- tests/memory-preservation.test.ts tests/memory-experience-migration.test.ts tests/memory-transaction-recovery.test.ts`: 61/61 tests. The files contain 30 preservation/schema/disclosure, eight migration, and 23 transaction/recovery checks respectively.
- `git diff --check`: exit 0.
- `npm pack --dry-run --json`: 264 package files; synthetic runtime, test helpers, journals, and execution reports excluded. No package was published.
- Existing npm environment emits its inherited `Unknown env config "http-proxy"` warning. It is not a test failure.

The test helpers use temporary synthetic roots. The child-process helper loads the built `dist` output, so run the build before targeted process tests. The aggregate `verify` command already does this.

## Supported contract

`MemoryRecord` is now a union of unchanged-layout `MemoryRecordV1` and `MemoryRecordV2`, which adds required `experience`. TypeScript consumers assuming the union always has literal `version: 1` must narrow on the discriminant. Legacy initialization and the existing three arguments remain valid. The additive fourth argument is `MemoryService.initialize(baseDir, memoryRoot?, embedder?, { experience: { enabled: true } })`; standalone accepts the same `experience` option.

Activation requires a fresh, foundation-only root. Existing canonical notes, available revision history, or auxiliary evidence block in-place activation. The complete activation manifest, root identity, and initial foundation snapshot are committed under the common lock. Omitting the option on restart cannot disable an existing manifest. Missing manifests with v2 records/archive/state remnants, incomplete manifests, unsupported formats, and live v1 notes added to an activated root fail closed. The foundational operating note stays special and is not elevated by an experience label.

Strict v2 parsing rejects unknown top-level and nested fields rather than silently discarding them. Partial time precision stays partial; instants require explicit offsets and normalize to UTC; invalid dates and non-forward exact validity intervals are rejected. Legacy defaults are `note`, `durable`, `unknown`, `unknown`, unknown validity, and unverified with no evidence. Migration does not classify knowledge.

Verification is a discriminated provenance-shape contract: supported requires nonempty evidence; verified additionally requires nonempty method, verifier revision, and verified timestamp. This corrects the loose optional-field design sketch. Parsing an asserted status does not execute its verifier, validate semantic truth, or grant authority. Future promotion/controller writers must bind an actual host-verifier result and resolvable evidence before accepting a verified assertion. Matching hashes never upgrade status.

## Preservation and identity

V1 semantic digests are unchanged from T1; a fixed known-answer fixture guards the digest. V2 uses a separate semantic domain and adds the explicit experience fields. Access counts, access/update timestamps, and derived evolution history are excluded from both semantic digests. Typed metadata changes affect compact labels and the derived index fingerprint.

All canonical create, update, link/evolution, batch, import, and access mutations route through the store transaction owner. Activated roots retain immutable snapshots before and after semantic changes, including metadata-only edits. Recent undo history still has its eight-revision bound, but it is no longer the historical source of truth. Unknown/corrupt typed recent revisions cannot be silently rotated away.

An immutable semantic ref maps to its first exact retained snapshot. Archive object hashes bind the UTF-8 snapshot bytes separately from semantic identity. Equivalent access-only snapshots do not create unbounded objects or overwrite a ref. Newly recorded non-retrieved audit history with otherwise unchanged semantics gets a separate immutable audit manifest and before/after object snapshots. Audit refs are discoverable by record ID, and their mapping is checksum-bound. A regression retains the audit through 65 access reads and bounded history rotation without changing the semantic revision or adding read-only audit objects. Bounded telemetry is not presented as complete historical evidence.

Existing archive objects and ref mappings must have matching bytes/identity. Conflicts or corruption fail closed, and retained objects are independent of feedback reset/reconcile, reindex, and recent-revision rotation. Archive here stores canonical/audit snapshots and explicitly retained text objects; binary artifact capture and full essential-receipt retention belong to their later owners.

Both service deletion and batch deletion refuse `MEMORY_PRESERVATION_REQUIRED` on v2. Delete followed by recreation in one batch is also refused. Archive does not silently replace deletion semantics. Legacy deletion and its existing single-record degraded-store tolerance remain supported. Legacy single-record creates/mutations validate the touched/new record’s links, preserving unrelated dangling-link tolerance; legacy batch and every v2 write retain whole-store link validation.

## Exact retained expansion

The existing controller record expansion can resolve a retained older memory revision, including after more than eight metadata edits and restart. It verifies the retained object checksum and semantic digest, while requiring an existing currently visible record and matching current and historical workspace scopes. Forgotten/expired/superseded visibility is not bypassed. Missing/corrupt feedback state still fails closed, including restart. Unknown revisions fail explicitly; no fallback to the latest content.

This is exact-ref expansion, not archive search. Archive search, episode/evidence views, experience-writing methods, temporal queries, and retention commands remain gated. The facade advertises its supported read-only methods honestly. Compact current discovery remains the T1 behavior, with typed labels; full v2 retention selection waits for its owning phase.

## Transaction guarantees and costs

`FileMemoryStore.transact` takes the common lock once, performs validated recovery, captures canonical and activation-manifest bytes with their own fingerprints plus declared logical state keys, runs a synchronous planner, validates the resulting records and write set, checks the read set, and commits canonical/state/archive changes together. Batch and ordinary mutations reuse this owner, without nested-lock acquisition. Immutable state destinations accept absence or identical bytes only. State deletion and arbitrary paths are not exposed. New experience-state writes require activation. Local snapshot reads, facade visibility selection, and startup recovery share the lock.

The coordinator reuses `writeOwnedFileAtomic` for durable staging, replacement/retry, and markers. It rejects duplicate/aliased targets, containment escapes, symlinks including ancestor aliases, malformed journals, missing/corrupt snapshots, and invalid identities. Journal version 2 binds both source and target checksums. All pending journals are validated before replay begins. An unfinished apply rolls back to verified source bytes; a committed marker remains committed. Cleanup failure after that marker neither rolls back nor reports the canonical write as failed. Canonical transaction receipts support exact replay after a lost response; T2's receipt test is an internal fixture, not an implemented episode/promotion operation API.

Pending version-1 journals are preserved and explicitly block with `MEMORY_TRANSACTION_RECOVERY_BLOCKED: MEMORY_TRANSACTION_JOURNAL_VERSION_UNSUPPORTED`. Legacy canonical records are supported; unverifiable legacy in-flight journals are not automatically converted or replayed. Upgrade preflight must stop. Any assessed operator recovery with the matching prior engine is separate; the new engine does not launch an old binary or downgrade automatically.

Fault tests kill actual child processes after preparing, prepared, mid-apply, committed, and before response delivery. They verify one consistent side, unchanged source/target counts, ref reachability through the other preservation tests, and identical receipt replay. Another fault injects cleanup failure after the committed marker. Startup is tested while a live writer holds an applying journal; it waits rather than rolling the writer back. Same-process and two-process writers retain every increment and operation receipt. Tests mature only the killed process's synthetic lease timestamp, rather than waiting the full stale-lock interval or deleting the lock.

These are local-filesystem, cooperating-engine, process-crash guarantees. They do not establish network-filesystem atomicity, power-loss safety on every device, protection against a privileged concurrent external writer, or automatic recovery of unreadable journals. Old binaries must never share a v2 root. A format manifest cannot make an old writer obey the new protocol. Direct live-store edits are unsupported; detectable byte drift is refused. Retention has no background purge, so disk use grows with meaningful retained history. Windows execution, reparse-point behavior, and atomic-replace behavior require a separate Windows evidence run and are not claimed here.

## Synthetic copy-upgrade and rollback

Production migration consists only of pure `upgradeLegacySnapshot`; it does not perform I/O or expose a migration UI/CLI. The fixture-only orchestrator exercises real lock, transaction, archive, checksum, and activation primitives:

1. Lock and snapshot a synthetic v1 source, retaining its exact available text files, current records, eight available old revisions, and auxiliary evidence.
2. Mark a separate empty target incomplete. Preserve source and upgraded record snapshots plus source-byte manifests.
3. Check counts, canonical checksums, archive objects, and every retained ref, then publish complete activation last.
4. Interrupt after incomplete activation or copied data, prove normal target opening is blocked, and replay the same source snapshot without changing the source. Conflicting immutable destination evidence is refused.
5. Reopen the unchanged v1 root for rollback readback.

History completeness is explicitly `available-only`. Tests create more than eight historical revisions, then assert only the eight still available are imported; missing previously pruned versions are not fabricated. This proves the foundations with a synthetic harness, not a production migration product.

Transfer/1 continues for legacy v1. Activated-root export, even with no ordinary records, and attempted v2 record export reject `MEMORY_TRANSFER_V2_UNSUPPORTED`. Transfer/2, production migration, artifact/evidence capture, episode operations, capsules, promotion, temporal selection, full retention, and Windows certification are not part of G2.

## RED/GREEN and acceptance mapping

The first three-file run had eight expected missing-feature failures and one passing v1 compatibility control. Subsequent RED/GREEN regressions covered temporal/typed parsing, missing activation, historical scope/visibility, canonical-byte/CAS timing, concurrent bootstrap, symlink roots/ancestors, delete/recreate, immutable migration replay, audit integrity, typed safety, empty-root auxiliary evidence, corrupt typed revisions, and aliased journal targets. The actual baseline coordinator was temporarily exercised with only the path-helper adapter required by the new store; four failures confirmed its duplicate/escape/recovery and post-commit cleanup faults before the strengthened implementation was restored. The final full suite has no intentionally failing or skipped cases.

One process-test fixture initially tried to age an already released lock at the response boundary. It was corrected to accept ENOENT only there; no production behavior was changed to hide it. A TypeScript nullable callback narrowing during historical expansion was corrected before the next successful build.

- E03: empty v2 roots, standalone write/read/search compatibility, restart, activation protection.
- E04: synthetic-only corpus and package boundary check; no personal data or credentials migrated.
- E09: process-kill, commit/response replay, post-marker cleanup, shared startup lock, corruption blockers.
- E23: unchanged v1 roundtrip/digest, strict typed v2 roundtrip, validity precision and verification uncertainty; full typed transfer is explicitly deferred.
- E28: metadata-only and >8 revisions, audit-only retention, reset/reconcile/reindex independence, available-only copy-upgrade and rollback, checksums and ref reachability.
- E32: Linux process/lock, UTF-8/CRLF source-byte retention, path containment and symlink cases. Windows remains unrun.


## T2 review round 1

Review of `d2fd638ee205a54c05fd0b228e046fa7fd1d960d` identified two bounded issues. Both were reproduced before the fix: four legacy entry points rejected independent work because an unrelated owner linked to a corrupt note, and activation decisions could be paired with a later fingerprint after the manifest changed. The complete RED run had eight expected failures and two passing safeguard controls.

Legacy service update/remember and store mutate/create now validate the touched/new record’s links as the previous engine did. Changed or newly introduced invalid links still fail. Batch and activated-root single writes continue validating the entire loaded link graph. Tests explicitly distinguish malformed unrelated target data, changed-owner rejection, and strict dangling-link controls.

Activation parsing now returns the parsed manifest and fingerprint of the exact same bytes, with null bound to original absence. The transaction compares this captured fingerprint before commit. Complete-to-incomplete, manifest removal, changed generation, and absent-to-present fault injections all refuse the write with `MEMORY_REVISION_CONFLICT`, leaving canonical bytes, archive counts, and the externally changed manifest untouched. This closes detectable drift; it does not claim atomicity against arbitrary writers that ignore the common lock.

Fresh round-1 full build/verify passes 120/120 tests; the three T2 files pass 61/61 with zero pending/skipped. Production changes are confined to the existing store owner. No dependency, lockfile, capability, migration, or later-phase scope changes were made. Phase re-review is still required before approval/push.
