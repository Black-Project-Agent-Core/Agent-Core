# Memory02–05: permanent integration evidence (2026-10-11)

**Status:** Source integrated and staged builds verified. Beta.1 runtime activation NOT performed; cleanup NOT performed.

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

Ten original filesystem items were moved by same-volume rename from the three scoped temporary trees into permanent `runtime/build` ownership. No backup copy, new checkout, duplicate project archive, forced process stop or permanent deletion was created. Sources are absent and destinations exist; the two existing acceptance ZIP files retained their recorded SHA-256 digests and all 52/48 members decompressed without error.

- Workflows isolated acceptance originals, including reports/fixture patch, redacted screenshots, WebView2 profile (Login Data/Cookies), SQLite databases/WAL, activity tracker, home/profile state and test configuration, are retained at `E:\Projects\Agent-Core\runtime\build\workflows-production-integration-20261010\retained-acceptance-state-20261010`. 400 files / 35,211,324 bytes (logical); contains pre-existing Workflows ZIP SHA-256 `e1faef75508cf6b2578a97113d021a3ab0d5c1d9bcd8efee9b8876197dd35b16`.
- Plan01 independent original evidence/scripts/logs and pre-existing 48-member report ZIP are retained at `E:\Projects\Agent-Core\runtime\build\memory01-windows-release-20261010\retained-plan01-evidence-20261009`. 39 files / 711,208 bytes (logical); ZIP SHA-256 `379b7239d9d305907fa29de90f4f0505cc05f2d97317d0adf1052582ee26b9e8`.
- The three independent candidate and two independent baseline untracked tests match the retained ZIP harness member hashes. The only Workflows tracked modifications are the three documented isolation-only launcher fixtures, and all three paths appear in the retained `test-only-launcher.patch`; they were NOT installed. Plan01 initial checkout has no tracked or untracked source change.
- Remote branch `feat/unified-workflows-archify-20261009` resolves to `f22e6e426d9c8937439763602f986b9fb3243f23`; `feat/memory-filtered-semantic-retrieval-20261009` resolves to `3774a44e83fc941accd299eaefc4fd65a8e5d958`; historical Plan01 baseline `bcdde08f40330f405173bb47a0a2eca06621c135` is an ancestor of the latter.
- Subsequent scan of the three residual temporary trees found 0 reparse points, 0 enumerator errors, and 0 protected fixture runtime/state files. Residual Workflows node.exe matches the permanent runtime/node/node.exe hash; its remaining RDC browser installation and node_modules are test-only generated dependencies. Neither source/history nor required state exists only in these temporary trees.

## TEMP CLEANUP READY: YES — three exact scoped paths only

1. `E:\Projects\Agent-Core\runtime\tmp\workflows-acceptance-f22e6e4-20261010`
2. `E:\Projects\Agent-Core\runtime\tmp\acceptance-plan01-independent-20261009T175128Z-fd4253f4`
3. `E:\Projects\Agent-Core\runtime\tmp\acceptance-plan01-20261009T171608Z-e910178f`

Readiness applies to the verified current filesystem state. It is NOT a request to clean `runtime/tmp` generally, nor permission for a wildcard delete, force delete, Recycle Bin emptying or touching `runtime/build`, `runtime/memory`, `runtime/backups`, root `.git` or live dependencies. No deletion is performed by this task. Before manually deleting, recheck exact path, no link/reparse, no new files and no active use; stop if it changed. Deletion irreversibly removes historical clones, generated dependencies and nonessential extracted duplicates, but the unique evidence and protected isolated state listed above remain in the permanent build tree.

Read-only live controls after relocation: launcher/Node/Grafel/tunnel execute under the permanent project root; localhost 8765 and 8787 have the normal owners; test ports 18765 and 18787 are not listening. No process command line, service, scheduled task or Windows autostart entry points to the three temporary trees. Production node_modules, Memory, dist and stage directories are not links. Core /health remains `ok`, product `0.15.0-beta.0`, Memory and index available. The successful targeted suite remains 55/55; this evidence move did not modify source or resident binaries.

At the last pre-delete scan: 106,392 remaining files / 2,210,787,350 logical bytes across the three temporary trees; exFAT 128-KiB cluster estimate is at least approximately 17,045,651,456 allocated bytes including a one-cluster-per-directory assumption. This is an allocation estimate, not a guarantee of reclaimed free space. Actual change must be measured after a separately approved manual deletion.

**SOURCE INTEGRATED: YES. BUILD VERIFIED: YES, staged only. RUNTIME VERIFIED: YES for permanent beta.0; NO for beta.1. TEMP CLEANUP READY: YES for the three paths above. CLEANUP COMPLETE: NO (no deletion authorized/performed here). Overall TASK COMPLETED: NO until beta.1 activation authorization and independent runtime verification, and the optional/manual cleanup ledger are separately closed.** Plan04 may re-embed canonical records and requires explicit current provider, transmitted data, corpus size, cost ceiling and independent activation/recovery approval.