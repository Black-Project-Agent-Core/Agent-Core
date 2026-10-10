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
