# Memory02–05: permanent integration evidence (2026-10-11)

**Latest recorded status (2026-10-11 WIB):** The Windows report records resident beta.1 activation and 51/51 installed hash matches; cleanup remains NOT performed. This is dated beta.1 evidence, not beta.2 acceptance. Earlier staging-only sections below are chronological checkpoints superseded by the activation addendum and resident readback.

## Source and root authority
- Permanent source root: `E:/Projects/Agent-Core`, local working HEAD `639cdf77fd7288a722131862e22eecaff4a90f07` on `codex/cumulative-learning-workflow` (unchanged).
- Remote source reference: `feat/memory-02-05-20261010` at `eec8dab4aad4b93d8bb3ff8895eeabb38dae4232`, compared to upstream base `b3fe1063d11a198acb225f7698a6bad65d29bf1f`.
- Upstream 75 changed paths: 68 safely reconciled without clobbering local edits (22 baseline files updated and 46 added, including 8 missing documentation files). Product version/AGENTS policy manually integrated; README, CHANGELOG, CODEBASE and Workflows plan extended without replacing existing content. `.changeset/pre.json` intentionally excluded; no release.
- Upstream beta.1 changes are adapted on top of local Workflows and Memory01. The resulting working source is not identical to the upstream commit.
- Three dirty Workflows acceptance launcher paths (`AgentCoreRuntime.cs`, `Program.cs`, `RootLocator.cs`) are test-only fixture changes. They are not integrated. Production preserves ports 8765/8787, standard mutex, auto-start, tunnel and root validation.

## Permanent artifact map
- Non-active build: `runtime/build/memory02-05-permanent-20261011/memory-dist`, `core-dist`, `ui-dist`, `launcher`.
- Canonical live Memory remains `runtime/memory`; production `dist`, launcher executable, dependencies, state, credentials, database and journals were not overwritten.
- Historical source staging at `C:/ProgramData/AgentCoreBuilds/memory-02-05-eec8dab-20261010` was not located; do not infer loss of every artifact or create another clone.

## Targeted verification
- Memory TypeScript compile: PASS. Core TypeScript no-emit and staged compile: PASS. UI typecheck and isolated Vite build: PASS. Windows x64 single-file launcher publish to staging: PASS.
- Scoped test results: 25 Core Memory tests / 3 files PASS; 24 standalone Memory tests / 2 files PASS; 6 Windows launcher/root tests PASS. Total 55/55. No full regression or 72-run Plan05 comparison repeated.

- Staged beta.1 launcher SHA-256: `f4768fa402e5d2c835a5da5db736a4468d8f992f113d21df4491834ec98ece64`.
- Installed beta.0 launcher SHA-256: `58b73e8256dd8706e6e7064f1771ddda54880b0df48c842f08ed63db6ed34f7a`.
- Graph observer reports the root workspace current, but an indexed graph for upstream target `eec8dab` is absent. No new graph indexing was requested; source and targeted tests remain the primary evidence.

## Live and activation boundary
- Resident launcher/Core/tunnel remain beta.0 at permanent project root. No active process, scheduled task or service references the three audited temp checkout names. No cutover, shutdown, embedding, migration or new provider requests occurred.
- Plan04 semantic-document v2/index v3 may cause re-embedding at startup. Explicit current corpus/field/provider/volume/cost ceiling consent plus a separately verified independent cutover and recovery path are required before activation. Do not infer beta.1 runtime health from staged builds.
- Historical external-client schema may be stale; Memory03 requires explicit `scope.taskId` after authenticated episode registration.

## Temporary workspace closure (NO DELETE YET)
- `runtime/tmp/workflows-acceptance-f22e6e4-20261010`: fixture-only launcher changes reconciled. Isolated evidence and existing ZIP need final retention/disposition check; no production process uses this checkout.
- `runtime/tmp/acceptance-plan01-independent-20261009T175128Z-fd4253f4`: baseline/candidate/evidence and verified peer dependencies kept as restore/readback authority until approved cleanup.
- `runtime/tmp/acceptance-plan01-20261009T171608Z-e910178f`: baseline/candidate historical checkout; `baseline/node_modules` was already hash-matched to the independent peer in a prior audit. Proposed permanent deletion still requires exact path approval and revalidation. Approximate exFAT reclaim 2.49 GiB is not guaranteed.
- No existing temp/workspace item has been deleted. Source Git recovery protects only explicitly selected files, not canonical Memory, credentials, ignored files, or every local untracked artifact.
- Branch and remote commit verification for the reviewed source are recorded in the final sanitized delivery report.

## Final nonduplicating acceptance-evidence relocation — 2026-10-11

Fourteen original filesystem items were moved by same-volume rename from the three scoped temporary trees into permanent `runtime/build` ownership. No backup copy, new checkout, duplicate project archive, forced process stop or permanent deletion was created. Sources are absent and destinations exist; the two existing acceptance ZIP files retained their recorded SHA-256 digests and all 52/48 members decompressed without error.

- Workflows isolated acceptance originals, including reports/fixture patch, redacted screenshots, WebView2 profile (Login Data/Cookies), SQLite databases/WAL, activity tracker, home/profile state and test configuration, are retained at `E:\Projects\Agent-Core\runtime\build\workflows-production-integration-20261010\retained-acceptance-state-20261010`. 403 files / 35,273,081 bytes (logical); contains pre-existing Workflows ZIP SHA-256 `e1faef75508cf6b2578a97113d021a3ab0d5c1d9bcd8efee9b8876197dd35b16`.
- Plan01 independent original evidence/scripts/logs and pre-existing 48-member report ZIP are retained at `E:\Projects\Agent-Core\runtime\build\memory01-windows-release-20261010\retained-plan01-evidence-20261009`. 39 files / 711,208 bytes (logical); ZIP SHA-256 `379b7239d9d305907fa29de90f4f0505cc05f2d97317d0adf1052582ee26b9e8`.
- The three independent candidate and two independent baseline untracked tests match the retained ZIP harness member hashes. The three historical Workflows launcher modifications were test-only and NOT installed. The retained `test-only-launcher.patch` lists all three paths but fails `git apply --reverse --check` with a corrupt-patch error at line 123. All three original modified `.cs` files were therefore moved intact to permanent `fixture-launcher-originals`; the remaining temporary worktree now reports three tracked deletions, not unexplained product changes. Plan01 initial checkout has no tracked or untracked source change.
- Remote branch `feat/unified-workflows-archify-20261009` resolves to `f22e6e426d9c8937439763602f986b9fb3243f23`; `feat/memory-filtered-semantic-retrieval-20261009` resolves to `3774a44e83fc941accd299eaefc4fd65a8e5d958`; historical Plan01 baseline `bcdde08f40330f405173bb47a0a2eca06621c135` is an ancestor of the latter.
- Subsequent scan of the three residual temporary trees found 0 reparse points, 0 enumerator errors, and 0 protected fixture runtime/state files. Residual Workflows node.exe matches the permanent runtime/node/node.exe hash; its remaining RDC browser installation and node_modules are test-only generated dependencies. Neither source/history nor required state exists only in these temporary trees.

## TEMP CLEANUP READY: YES — three exact scoped paths only

1. `E:\Projects\Agent-Core\runtime\tmp\workflows-acceptance-f22e6e4-20261010`
2. `E:\Projects\Agent-Core\runtime\tmp\acceptance-plan01-independent-20261009T175128Z-fd4253f4`
3. `E:\Projects\Agent-Core\runtime\tmp\acceptance-plan01-20261009T171608Z-e910178f`

Readiness applies to the verified current filesystem state. It is NOT a request to clean `runtime/tmp` generally, nor permission for a wildcard delete, force delete, Recycle Bin emptying or touching `runtime/build`, `runtime/memory`, `runtime/backups`, root `.git` or live dependencies. No deletion is performed by this task. Before manually deleting, recheck exact path, no link/reparse, no new files and no active use; stop if it changed. Deletion irreversibly removes historical clones, generated dependencies and nonessential extracted duplicates, but the unique evidence and protected isolated state listed above remain in the permanent build tree.

Read-only live controls after relocation: launcher/Node/Grafel/tunnel execute under the permanent project root; localhost 8765 and 8787 have the normal owners; test ports 18765 and 18787 are not listening. No process command line, service, scheduled task or Windows autostart entry points to the three temporary trees. Production node_modules, Memory, dist and stage directories are not links. Core /health remains `ok`, product `0.15.0-beta.0`, Memory and index available. The successful targeted suite remains 55/55; this evidence move did not modify source or resident binaries.

At the last pre-delete scan: 106,389 remaining files / 2,210,725,593 logical bytes across the three temporary trees; exFAT 128-KiB cluster estimate is at least approximately 17,045,258,240 allocated bytes including a one-cluster-per-directory assumption. This is an allocation estimate, not a guarantee of reclaimed free space. Actual change must be measured after a separately approved manual deletion.

**SOURCE INTEGRATED: YES. BUILD VERIFIED: YES, staged only. RUNTIME VERIFIED: YES for permanent beta.0; NO for beta.1. TEMP CLEANUP READY: YES for the three paths above. CLEANUP COMPLETE: NO (no deletion authorized/performed here). Overall TASK COMPLETED: NO until beta.1 activation authorization and independent runtime verification, and the optional/manual cleanup ledger are separately closed.** Plan04 may re-embed canonical records and requires explicit current provider, transmitted data, corpus size, cost ceiling and independent activation/recovery approval.
### Exact fixture-original retention after patch integrity failure

The Workflows test-only launcher patch failed a read-only reverse-apply check (`corrupt patch at line 123`), so its presence was not accepted as sufficient recovery evidence. The three original modified source files were moved (not copied) from the isolated temporary checkout to `E:\Projects\Agent-Core\runtime\build\workflows-production-integration-20261010\retained-acceptance-state-20261010\fixture-launcher-originals`; source paths are now absent and destination byte hashes were verified:

- `AgentCoreRuntime.cs`: SHA-256 `9abf67e58bd8865ea183abf9688bf7cd9fa86c9f34f4707606325aec6bab7701`.
- `Program.cs`: SHA-256 `88b9605b2b4fd0891d64153b89f395ee3451a1f2595a8ea77f6c660eaf4cd155`.
- `RootLocator.cs`: SHA-256 `a38bbc13c6250d90738cc34772939345be1cc6de64ca0beb2f7da3a9e01a3526`.

Original protected evidence/state retention is now **403 Workflows files / 35,273,081 bytes** plus **39 independent Plan01 files / 711,208 bytes**, all outside temp. Source, runtime dependency and protected data closure remain intact; none of these fixture-only changes was imported into the production launcher. **TEMP CLEANUP READY remains YES only for the three exact directories above; no permanent deletion was executed.**

## Production activation addendum — 2026-10-11 (supersedes earlier staging-only status)

**SOURCE INTEGRATED: YES. BUILD VERIFIED: YES. RUNTIME VERIFIED: YES, 0.15.0-beta.1 at the canonical production root.** The preceding staging-only notes remain chronological history, not the current runtime state. Actual permanent deletion has NOT occurred: **TEMP CLEANUP READY: YES; CLEANUP COMPLETE: NO**, pending an explicit three-path deletion approval.

### Verified installation and resident process

- The independent external helper performed normal launcher closure, waited for owned Core/tunnel processes to stop, installed the exact existing manifest, relaunched `E:\Projects\Agent-Core\Agent Core.exe` and verified `/health`. No new backup, clone, git stash, provider/key rotation, release or global system change was made.
- Final helper receipt `runtime/build/memory02-05-permanent-20261011/activate-beta1-receipt.json`: `beta1-active-verified`, UTC `2026-10-10T19:46:11.658Z`. Installed **51/51** file SHA-256 checks match the candidate manifest. Destination owners are `dist/` (24), `SubProject/agent-core-memory/dist/` (26), and production `Agent Core.exe` (1).
- Installed launcher ProductVersion `0.15.0-beta.1`, SHA-256 `f4768fa402e5d2c835a5da5db736a4468d8f992f113d21df4491834ec98ece64`. Core PID `20524` runs from the permanent root; launcher PID `21116`; tunnel PID `388` on standard 8787 and Core loopback 8765 both healthy. The active processes and their executable/commandline paths do not reference staging or the three temporary acceptance workspaces.
- Real canonical Memory v2 owner: `runtime/memory-v2` as selected by the existing activation marker. The preserved `runtime/memory/index/index.json` is the **legacy** format-2 index and is not the live Plan04 target. Real index file `runtime/memory-v2/index/index.json` is format **3**, `semanticDocumentVersion=2`, Cloudflare Workers AI `@cf/google/embeddinggemma-300m`, 768 dimensions, **130 entries / 130 validated vectors**, and Memory health/index/embedding report available without issues.
- Final semantic-document volume (superseding the earlier cutover count with resident readback): 130 allowed documents, 570,779 characters and 572,155 UTF-8 bytes in the indexed semantic text (titles, contents, context, keywords, tags and category). No raw Memory bodies, credentials or embeddings are copied into this document. Model billing price and final provider charge remain unknown; do not assume the calls were free.

### Activation failure evidence, repair and required live smoke

- First and second independent helper attempts correctly rolled back 51 product files to verified beta.0 recovery artifacts because their `VerifyLive` condition incorrectly inspected `runtime/memory/index/index.json` (legacy version 2, 123 vectors). Both attempts had displayed healthy beta.1 and real Plan04 format-3 output in `runtime/memory-v2`, but could never pass the wrong-path predicate. The original cutover receipts recorded `BETA1_LIVE_HEALTH_OR_EMBEDDING_NOT_VERIFIED`; the rollback was automatically completed. These failures were **not** misrepresented as model/provider failures.
- Corrected only the existing independent helper's read-only verification path to `runtime/memory-v2/index/index.json`; did not change product runtime, legacy index, version metadata or weakening checks. A separate live comparison proved all existing health, vector, PID and tunnel predicates true. Third final cutover passed the identical strict criteria, with normal launch, no rollback.
- Memory02: actual experience-v2 recall returned three scored results with bounded retrieval evidence. Source default policy remains `baseline-v1`; `fusion-feedback-v1` is opt-in and was not silently activated.
- Memory03: after restart, a fresh `controller_learning` task episode was bound to the authenticated caller and registered `agent-core` workspace; real `memory_v2_read` with **top-level** `scope:{taskId:episode.id}` returned `writeMode=experience-v2` and three ranked recall hits. A pre-cutover episode reused across the restart was denied with `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE`; a new real host-bound episode resolved it. No legacy tool was used to mask v2 scope.
- Memory04: actual Cloudflare-configured embedder is active, format3/documentVersion2 index is complete with all 130 vectors; a live semantic query returned scored hits with retrieval evidence and health/embedding remained available. The provider's total billed charge was not retrieved. There was **no explicit manual memory_reindex call**; index creation followed the standard approved startup path during each cutover attempt. Failed attempts were rolled back, so do not claim that only one provider build occurred across the entire task.
- Memory05: already accepted independent offline evidence remains authoritative. No rerun of 72 synthetic comparisons, model benchmark, benefitProven claim or new provider inference benchmark was performed.
- Workflows: actual production Windows/WebView2 UI Automation invoked the `Workflows` sidebar button, observed one `System + Memory` canvas with `Current source map`, invoked Zoom In and Zoom Out, then selected the `Memory / Engine` node. The first UIA lookup during freshly loaded UI was transiently empty; a subsequent inspected UIA tree showed the controls and the targeted smoke passed. This is UI function smoke, not full browser security or visual regression qualification.

### Remaining boundary

No active product dependency points into `runtime/tmp` or `runtime/build/memory02-05-permanent-20261011`; the latter stays as an artifact/recovery authority, not a launch target. The three exact acceptance workspaces listed in the preceding TEMP CLEANUP READY section must **not** be deleted by the agent without explicit batch approval. The historical evidence and original fixtures previously moved out of temp remain protected. No deletion has been carried out. After approval, recheck all three exact roots and process/link/file identities immediately before permanent deletion, then measure reclaimed free space and live health. Until then, the **beta.1 update is active and verified; whole-task cleanup completion remains pending**.

## Superseding resident readback — 2026-10-11

The preceding stage-only and beta.0 statuses remain historical: a verified cutover receipt already reports beta.1 activation at 2026-10-10 19:45–19:46 UTC. Fresh direct readback confirms main root launcher/Core/tunnel on beta.1, 51/51 installed artifact hashes matching the 51-entry stage-to-live manifest, 6/6 unchanged UI files, canonical/embedding/index available, and v2 index format3 / documentVersion2 with 130 nonzero 768-dimensional vectors. One scoped live v2 recall returned 3 ranked results, missing/foreign scope IDs failed closed, and real Workflows navigation/System+Memory/node/zoom smoke PASS. The current source and existing rollback artifacts were preserved, and the installer was *not rerun* during this verification. Full sanitized evidence: `docs/verification/memory02-05-windows-resident-20261011.md`.

**SOURCE INTEGRATED: YES; BUILD VERIFIED: YES; RUNTIME VERIFIED beta.1: YES; TEMP CLEANUP READY: YES (exact 3 directories); CLEANUP COMPLETE: NO (not authorized/deleted).** Unknown Cloudflare billing unit price is not treated as free. New host enforcement supports top-level `scope.taskId`; the older client-advertised descriptor may require a connector refresh. No other temp directories are included.
