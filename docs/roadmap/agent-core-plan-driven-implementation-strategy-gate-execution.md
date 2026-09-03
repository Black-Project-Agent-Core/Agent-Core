# Agent Core Plan-Driven Implementation Strategy Gate — Execution Evidence

**Status:** IMPLEMENTED AND VERIFIED ON ISOLATED FEATURE BRANCH
**Branch:** `feature/implementation-strategy-gate`
**Base:** `6b674c1f95a677dea5cb57263bb5b8b863faff5b`
**Live rollout:** `AGENT_CORE_IMPLEMENTATION_STRATEGY_MODE=disabled` remains the default

## Execution Strategy

This work was executed under `FEATURE_GRAFT`, not greenfield implementation.
The approved donor repositories were cloned under the main checkout's `referensi/` directory and pinned before target mutation.

- Graft commit: `65c29667bd59d7137caba8f6f5b5790e2d1f9404`
- Graft tree: `fbfcd728b6ebe587678996b20053c81bfd4da3ad`
- CBM commit: `4d8ac9e1cea0d645a02f876f47536c54a5bfa406`
- CBM tree: `afccfb0e1d82ffb0690e01b19c9f7fd4ec446ad2`

Both donor tracked trees remained clean after analysis and verification.
## Task Checkpoints

1. Task 1 — deterministic strategy resolver: `116c1d6`
2. Task 2 — route-context strategy projection and freshness: `bafbb6c`
3. Task 3 — provider-neutral code-intelligence contract: `5416b4e`
4. Task 4 — deterministic transplant manifest planner: `60e4856`
5. Task 5 — protected authority conflict registry: `75ac071`
6. Task 6 — scoped implementation strategy lease and mutation guard: `606eab7`
7. Task 7 — verification, provenance, blast-radius and continuity projection: `7b45472`
8. Task 8 — real working-tree freshness graft canary: `8c6a261`

## Real Canary Transplant

The canary transplanted working-tree freshness/fingerprint behavior rather than rebuilding it from first principles.

- `ADAPT`: Graft working-tree freshness semantics and SHA-256 content identity.
- `ADAPT`: CBM full-content SHA-256 verification/fail-closed identity principle.
- `REPLACE`: donor direct Git process ownership with existing `GitHubGitService`.
- `DROP`: donor graph rebuild, telemetry, hooks, UI, and unrelated indexing behavior.

The target implementation exposes Git-visible working-tree enumeration through existing Git authority, produces deterministic working-tree fingerprints, and keeps native blast-radius evidence explicitly `partial` rather than fabricating graph completeness.
## Verification Evidence

Fresh build gate:

- `npm run build` — PASS

Strategy Gate integration suite:

- 12 test files — PASS
- 86 tests — PASS
- includes strategy resolver, route context, authority conflicts, manifest planner, provider contract, lease guard, Git host boundary, Memory hard-lifecycle adjacency, and MCP route enforcement

Real donor canary soak:

- run 1 — PASS
- run 2 — PASS
- run 3 — PASS
- each run used the pinned donor clones and exercised advisory plus isolated enforce behavior

No-side-effect proof after canary:

- production port `8765` remained free
- production tunnel port `8787` remained free
- production memory DB length remained `11563008`
- production memory DB SHA-256 remained `B717EC92E7E9159A56196340612F2510D0646E6D9AD19E610421DA40BA2E72F6`
- production memory DB mtime remained `2026-09-02T20:01:36.7864427Z`
## Build Toolchain Installed During Verification

The real donor parity suite required native Node addon compilation. The following development dependency was installed without changing Agent Core runtime authority:

- Visual Studio Build Tools 2022 `17.14.39`
- C++ workload / MSVC `14.44.35207`
- Windows SDK `10.0.26100.0`
- primary Build Tools install path: `E:\DevTools\VSBuildTools`

Some Microsoft shared installer/SDK components remain system-managed on the Windows system drive, while the primary Visual Studio Build Tools payload is on `E:`.
## Donor Parity Evidence

The focused upstream Graft `test/graph-refresh.test.ts` was executed against the pinned donor after installing the required native C++ build toolchain.

- upstream tests discovered: 20
- PASS: 16
- FAIL: 0
- Windows-specific SKIP: 4
- duration: about 5.4 seconds

The first attempt correctly exposed an environment dependency: `tree-sitter-kotlin` required `node-gyp` and MSVC. Visual Studio 2022 Build Tools with the C++ workload and Windows SDK were then installed, donor dependencies were rebuilt with `CI=1` and `DO_NOT_TRACK=1`, and the focused donor suite passed. The donor tracked tree remained clean after the build/test.

Target-side ported/differential tests additionally verify the transplanted invariants under Agent Core authorities: working-tree edits alter the fingerprint, adding/removing Git-visible state alters identity, ignored files do not affect identity, unusual Git path whitespace is preserved, native blast evidence remains explicitly partial, and Git process ownership remains `GitHubGitService`.
## Baseline Repository Note

A full baseline `npm test` was run before Strategy Gate production code was introduced. The baseline was already red on this Windows worktree for multiple unrelated Codespace/bash-path and long-running execution fixtures. Those failures were not treated as Strategy Gate regressions.

Completion gates therefore use focused and adjacent suites whose baseline behavior is valid on this host, plus repeated real-donor canaries. No existing passing adjacent test was allowed to regress.

## Attribution

`THIRD_PARTY_NOTICES.md` records the exact donor lineage and MIT notices used by this graft. Raw donor source bodies and credentials are not stored in Agent Core memory/audit projections by the Strategy Gate.
