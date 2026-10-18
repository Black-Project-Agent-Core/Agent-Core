# Batch 17 #18 — Linux Skill writer coordination and activation recovery

Date: 2026-10-15 UTC. Status: source implemented and officially built; publication is a separate reviewed step. Windows resident activation and live concurrency/recovery cases were not performed.

## Published baseline and scope

- GitHub `main` and `codex/cumulative-learning-workflow` independently read at `bbbd75c7c8784f11f3c7cd1d0c0393265caa762d`, whose sole parent is `70b12611374e1d2aa632f652758a4ced1997fd43`. The 49-path published change contains Windows B13–B16. The clean Linux checkout was fast-forwarded without replacing dirty work.
- Direct HTTPS Git fetch lacked noninteractive authentication. The existing authorized GitHub connector supplied the commit, tree and 49 changed blobs instead; all 49 blob IDs, 245 tree IDs and the exact commit SHA were independently reconstructed and checked before `git merge --ff-only`. No credential was installed and no remote mutation occurred during acquisition.
- Published `AGENTS.md` blob `41be2229d24bfa657edca5216a465f29be9dfdad` is unchanged. Published `src/skills/service.ts` blob `7f534e0ca0b1609a71e98484fb35717e653ef6cc` is also unchanged from the approved plan. Both planned defects therefore remain in that baseline: import outside the revision guard, and swallowed restoration failure followed by unconditional backup removal.
- Source review included the actual Skills facade/schema, shared service composition, proposal decisions/coordinator, Learning state lock and changed callers. No outer same-name writer guard was added in B13–B16. Existing Learning-state → Skill acquisition order remains authoritative.
- Product code changes only `src/skills/service.ts`. Documentation updates this report, `docs/CODEBASE.md` and original216 entry #18; `.changeset/20261015-batch17-skill-writer-recovery.md` is one patch intent. B15 close-completion and B16 exact-task verification source remain unchanged. No separate project was edited.

## Implemented behavior

### Existing same-owner writer guard

`import` keeps source validation, scanning, provenance and proposal-approval checks before lock acquisition. After the validated name is known, it uses the existing `withRevisionLock` already held by `promoteRevision` and `rollbackRevision`. Destination inspection, duplicate/collision decisions, staging publication and owned staging cleanup all occur inside that callback.

Consequently, a waiting same-name import inspects settled destination state after the earlier participating writer finishes; it retains the existing identical-content duplicate and different-content collision behavior. Different names remain independent. No new lock, catalog-wide gate, queue, store or reentrant wrapper was introduced. Internal `activateRevision` remains lock-assuming, so existing proposal build and promotion paths do not acquire the same guard twice.

### Activation recovery and truthful cleanup failure

1. Candidate preparation and active-to-backup rename precede publication. Candidate preparation is now inside the operation's candidate-cleanup `finally`, including partial preparation failures.
2. Failed publication attempts one restore. If `lstat` observes an occupied active path, that occupant is preserved and restoration is reported failed. The check/rename sequence is not an atomic no-replace operation against out-of-band writers.
3. Successful restoration returns the old active tree and rethrows the original publication error. It does not report successful promotion or rollback.
4. Failed restoration throws `SKILL_REVISION_RESTORE_FAILED`, exposes bounded publication/restoration codes and the project-relative `runtime/skills/.staging/active-backup-...` recovery location, retains both original errors internally, and leaves the original backup in place. Final cleanup does not remove that backup or the staged/history source. An observed occupant is never deleted to force restoration.
5. After publication succeeds, backup/source/history cleanup is a separate phase. A failure reports `SKILL_REVISION_ACTIVATED_CLEANUP_FAILED` with its phase and bounded cause; no restoration is attempted. The candidate is already active: inspect its current digest and remaining cleanup state before deciding whether anything should be retried. No automatic retry is implemented.

The final cleanup removes only this operation's activation staging directory. Exact digest, prior baseline, source lineage, proposal approval and explicit promote/rollback confirmations are preserved.

## Donor boundary

Original216 #18 [Acontext at 259d73bf](https://github.com/memodb-io/Acontext/tree/259d73bfdebeed35ec2d4211ddc060a2d4126bc6) provides the narrow shared-target writer-exclusion principle, specifically `src/server/core/acontext_core/service/skill_learner.py:124–189`. Its Apache-2.0 source was reviewed during preparation. No donor source was copied and no Redis lease, database, message queue, model service, adapter, runtime or dependency was installed. The backup-restoration repair is native source-grounded work, not an algorithm proved by the donor. Historical registry IDs, dispositions and #134's B16 annotation are preserved; #18 receives a separate B17 implementation annotation.

## Actual verification

- One official `npm run build` completed exit **0** on Node **v24.19.0**, TypeScript **7.0.2**: path policy **383 authored files / 0 documented exceptions**, Memory subproject compilation and Core compilation. No test suite, benchmark or live concurrency/recovery case ran.
- Built `dist/skills/service.js`: 64501 bytes, emitted **2026-10-15T23:02:04.795977Z**, SHA-256 `eab5869d3fd1fda6d3d119f396add581007be10d7ed966610af686add08b6c1e`. Source SHA-256: `3c85013bc9cdc29d1858866929f578433a26d4c90a9563b57b81cbdc2c1af1a1`.
- Existing `scripts/release/release-compat.mjs --manifest-only --output SubProject/Agent-Core-Batch17-MCP-Schema-20261015.json` completed exit **0**, `available=true`, `stale=false`, reviewed 76-tool cohort within its budget. Expanded compiled descriptor: **79 tools / 130453 bytes**, SHA-256 `4b050d499617218c17ccd013fa0ecb1733e800e8c18eab9ac309de670f08ca2a`. The snapshot was moved out of the product tree into retained task evidence after generation.
- No public descriptor/schema producer changed relative to `bbbd75c7`; tool names and schema source remain unchanged. The Linux serialized descriptor is **not** byte-identical to the reported Windows B16 descriptor (130773 bytes). Platform-generated descriptions exist; a full cross-platform node comparison was not performed, so this report does not claim exact byte equivalence. No public change requiring a plugin ZIP was introduced by B17.
- `npm run release:check-intent` completed exit **0**, `ok=true`, using the existing `refs/agent-core/current-line-baseline` (`06ffb7155cf59c3a0bb88bc970cb2b694805ddd8`), with the B17 patch intent present. That local baseline predates several published batches; it was not reset to a remote ref or advanced to hide differences. No release apply, product-version change or tag was made.
- Scoped diff whitespace check exited **0**. Registry readback found **216 entries / 216 unique IDs**, with only the new #18 annotation added; every historical field, disposition, count and other entry remains unchanged. Compilation and source identity do not establish observed concurrency correctness or measured benefit.

## Continuity, deployment and retained limits

- This Linux checkout has no canonical `runtime/memory`. No replacement Memory store, fabricated host task or foreign Windows binding was created. B17 canonical Memory/Learning finalization is unavailable here and is not substituted by repository documentation or supplemental Cortex notes.
- Windows was not called or restarted, and no Windows resident load of B17 is claimed. A later authorized Windows integration must preserve current local work, build on that host, assess the actual compiled/installed contract and resident chronology, and use the existing supported activation path only when required.
- B16 remains independently bounded: its seven historical temp children were reported moved recoverably, with 129/129 hashes and no permanent deletion; two empty opaque producers remain unknown, final post-publication hidden-inclusive temp readback was unavailable to this review, and separate B16 Learning host binding remains unresolved. No foreign CME episode was rotated. B17 does not certify B16 fully closed.
- The guard covers participating writers on one SkillService instance. It does not provide cross-process/second-instance exclusion, crash atomicity, an out-of-band edit fence, recovery automation, a persistent fail-closed catalog gate or atomic source scan/copy. After failed restoration, retained backup alone does not prevent later independent writes once the guard is released.
- No dependency installation, donor execution, plugin upload, production restart, release, deployment, permanent deletion or remote push occurred during this implementation/review stage. Local build outputs and retained source/schema/build evidence are the material side effects.
- Hidden-inclusive local temp readback at **2026-10-15T23:04:31.112762Z** found project `temp` absent and `runtime/tmp` present with zero entries. This Linux observation does not certify Windows temp state. No retained recovery backup or unrelated cache was deleted.
