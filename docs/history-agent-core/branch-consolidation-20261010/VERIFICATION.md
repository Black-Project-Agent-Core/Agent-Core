# Consolidation verification

Scope: repository-only Linux consolidation. No Windows operation, live Memory access, provider request, activation, release, tag, or deployment.

## Established

- 28 remote branch heads inventoried and pinned; the source manifest preserves each exact head. Main began at `b3fe1063d11a198acb225f7698a6bad65d29bf1f`.
- Imported missing commit, tree and blob objects were checked against their original Git SHA-1 IDs. Local Git object integrity has no missing links. Unreferenced comparison objects are harmless and are not published as branches.
- All 13 inert source patches pass `git apply --cached --check` against their recorded base in an isolated temporary index. Applying produces the exact recorded head tree; the sparse Windows overlay produces exact head contents for its listed paths while retaining the rest of the full repository. SHA-256 digests are recorded in the manifest.
- `npm run build` passes: path policy (349 authored files, zero documented exceptions), standalone Memory TypeScript, and Core TypeScript.
- Focused Core Memory scope/binding/reconnect/host/outcome and release suites: 98 unique cases pass; one Windows-only packaging case is blocked by this environment.
- Standalone Memory contextual-document/index, ranking/pagination/policy, semantic-subset and temporal-order suites: 107 unique cases pass.
- Total selected unique passing cases: **205**. This is targeted verification, not a full repository regression pass.
- Archive packaging-denial assertions pass. Historical patches are not executable source or test files. Current runtime graphs and old subsystem absence are preserved.
- `git diff --check` passes. Independent source review checked the sparse overlay reconciliation, exact archive hashes and bases, branch coverage, current policy retention, package exclusion, and bounded launcher integration.

## Failed attempts and limitations

The initial parallel Core run had 97 passes and two failures: an outcome-lifecycle timeout at 15 seconds, and `spawn powershell.exe ENOENT` for the existing development-artifact packaging test. An isolated rerun of the lifecycle file with one worker and a 60-second test/hook budget passed all seven cases. Assertions and production code were not weakened to achieve the rerun.

The initial parallel standalone run had 103 passes and four temporal test timeouts at five seconds, including cleanup racing unfinished asynchronous work. An isolated rerun of the temporal file with one worker and a 60-second test/hook budget passed all 47 cases. Initial failures are retained as failed attempts, not rewritten as successful executions.

The existing PowerShell packaging case remains **environment-blocked**, not PASS. This Linux environment has no `powershell.exe` or .NET Windows toolchain. The Windows TCP listener tests are retained from the exact reviewed Windows source but **NOT RUN** here. Source/build validity does not establish Windows runtime acceptance. The historical staged Windows report retains its own date and scope; it is not new evidence from consolidation.

## Reproduction

Run `npm run build` with existing project dependencies.

Core focused files: `memory-scope-mcp`, `memory-task-binding`, `memory-task-reconnect`, `memory-v2-host-integration`, `memory-outcome-contract`, `memory-outcome-evaluation`, `memory-outcome-lifecycle`, `memory-outcome-safe-engineering`, `release-prerelease-identity`, and `release-tooling-second-wave` under `tests/*.test.ts`. Run via Vitest with `--maxWorkers=1 --testTimeout=60000 --hookTimeout=60000`; packaging requires Windows PowerShell.

Standalone files under `SubProject/agent-core-memory/tests`: `memory-contextual-document`, `memory-contextual-index-version`, `memory-controller-ranking-pagination`, `memory-controller-ranking-policy`, `memory-semantic-subset`, and `memory-temporal-order`. Run from that subproject with the same bounded timeout/worker flags.

This ledger covers candidate source verification. Remote main compare-and-swap and post-publication branch cleanup verification are separate publication checks; do not infer that they happened merely from this file.
