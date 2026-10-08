# Documentation refresh — 2026-10-08 UTC

## Scope and authority

Documentation-only review of current source baseline `8a80251` on `main`, following the creator's confirmation that the current local source was pushed to [Black-Project-Agent-Core/Agent-Core](https://github.com/Black-Project-Agent-Core/Agent-Core). The checkout's `origin` points there. This is the current source repository, not a legacy-only code reference. The commit subject and some original-host records use 2026-10-09; their recorded dates are preserved rather than reinterpreted as fresh runtime observations.

`package.json` declares Agent Core `0.14.0` and Node `>=24.15.0`. Its version is not proof that every source change has been packaged or that a GitHub release asset matches this commit. No release was applied by this review.

## Inventory and disposition

The baseline contains **423 tracked Markdown files**:

| Area | Count | Treatment |
| --- | ---: | --- |
| Root documentation | 12 | Refresh active entrypoints; clearly identify continuity, maintenance and adoption archives |
| GitHub Markdown issue/PR templates | 2 | Review; retain relevant contribution/security guidance |
| Release-intent guide | 1 | Explain pending versus applied release state |
| Pending release intents | 24 | Preserve release metadata; do not consume or rewrite implementation history |
| Applied release intents | 57 | Preserve immutable historical release descriptions |
| `docs/` | 186 | Classify active guides versus dated plans, evidence and conversation archives; correct current entrypoints and add navigation |
| `SubProject/` | 139 | Review owned-project integration/current guides separately from historical and vendored documentation |
| `src/ui/` and `extensions/` | 2 | Check against actual UI/extension source |

The `docs/` index classifies its 186 baseline Markdown files as 3 maintained guides, 10 domain-continuity documents, 55 dated root reports, 13 donor references, 5 root conversations, 29 numbered conversations and 71 archived plans. Across `SubProject/`, UI and extension documentation (141 files), classification is 33 active/planned documents, 90 historical records and 18 upstream-derived Memory documents. Twelve current operational specs in that group were retained unchanged; historical notices identify their provenance rather than erase original content.

Non-Markdown evidence and illustrations under `docs/` (9 PNG, 8 JSON, 3 SVG, 1 TXT and 1 CSV) are retained as artifacts, not rewritten into new evidence. Historical plans, conversations, source revisions, acceptance totals, PIDs, host paths and prior release statements remain dated records. Supersession/navigation explains where to find current state. Third-party license text remains unchanged. Protected reference folders, `.env`, credentials, secrets and private runtime state are excluded from content inspection.

## Source evidence used

- `package.json`: version, Node engine, dependencies and declared build/test/release scripts.
- `src/index.ts`: shared initialization of Memory, Learning, Skills, external-controller learning, Native runtime/controller and chat.
- `src/agent-runtime.ts`, `src/agent-controller.ts`, `src/agent-chat-service.ts`, `src/agent-provider.ts`: implemented Native controller and provider/chat/task ownership. Their existence does not prove configured providers or present resident health.
- `src/memory/host-runtime.ts`: marker-gated standalone Memory integration, validated backup manifest, `runtime/memory-v2` ownership and legacy fallback. No marker means legacy initialization; v2 and legacy must not co-write a canonical root.
- `SubProject/agent-core-memory/`, its build wiring and release packaging: standalone Memory is a tracked source dependency, not just a future extraction plan.
- MCP registration, capability/grant, launcher/UI, recovery and subproject build sources: bounded cross-checks for active-reader claims.
- Git index and remote metadata: zero tracked mode-160000 gitlinks at baseline, despite 27 declarations remaining in `.gitmodules`.

## Non-documentation discrepancies left unchanged

- `package.json` retains `legacyRepository` rather than current-repository metadata.
- `scripts/windows/Recover-Agent-Core.ps1` retains its explicit `LEGACY_REFERENCE_ONLY` guard for this repository. Correcting documentation does not bypass that implementation guard or enable remote recovery.
- `.gitmodules` retains 27 declarations without actual gitlinks. Do not assume `git submodule update --init` recreates absent reference trees.
- Super-Runtime is not self-contained for a fresh native build in this snapshot. Under `SubProject/Super-Runtime`, missing build/contract inputs and documented research references are `research/references/llama.cpp`, `research/references/kimi-k3-in-c`, `cmake/SuperRuntimePinnedGitSource.cmake`, `tests/contracts/pinned-source-cleanliness.cmake`, `runtime/native/super_runtime/runtime_workspace.cpp`, `runtime/native/tests/test_runtime_workspace.cpp`, and `runtime/native/tests/test_file_residency_contract.cpp`. Its README documents source-restoration prerequisites without fabricating a successful build.

These need separate source/configuration work; this refresh changes no product code, package metadata, dependency lockfile, build configuration or runtime state.

## Changed areas

The refresh edits 157 existing Markdown files and adds four navigation/audit documents. Existing-file coverage is 9 root documents, the release-intent guide, 32 `docs/` files, 114 SubProject documents and the UI README. Most historical-file edits are provenance/supersession notices; active changes cover repository identity, current Native/chat/grant ownership, conditional Memory activation, source/build prerequisites and subsystem navigation.

## Validation and limits

Validation is static: documentation diff/whitespace review, local Markdown link checks, declared script/path checks and source cross-checks. The consolidated relative-inline-link scan reports no newly broken target; existing unresolved targets are limited to the archival images listed below. `git diff --check` reports no whitespace errors, and the change list contains Markdown only. Historical references to private evidence, absent original-host artifacts and protected reference trees are not claimed to resolve in a clean source checkout. No dependency install, build, test suite, Windows launcher run, provider call, runtime activation, Git commit/push, PR, release or deployment was performed.

Coverage means every tracked Markdown path was inventoried and classified and every tracked Markdown file was scanned in full for stale repository, native-runtime, version/tool-count, path-authority and pending-status wording. Candidate claims received targeted contextual/source review; this is not a claim that every line was manually re-proven. It does not mean every historical statement was independently re-proven, every vendored manual was rewritten, or all implementation behavior was exhaustively audited. See [documentation index](README.md), [project README](../README.md) and [CODEBASE](CODEBASE.md) for the maintained reading path.

### Retained archival link gaps

The baseline had 28 missing relative inline Markdown link targets. Current-reader README/UI links and four moved plan links were repaired. The remaining 21 are original image references in transcript files `docs/agent-core/Agent-Core-{1,2,3,7,8,10,11,15,16,19,21,22}.md`, all under their absent `images/` directory. These image files were not supplied by the baseline. Original sandbox attachment links in that archive are also conversation-bound and are not portable repository assets. Their absence is documented in the archive index; evidence was not invented or silently replaced.
