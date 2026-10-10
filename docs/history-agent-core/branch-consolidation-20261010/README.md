# Branch consolidation record

This is historical source evidence, not an active feature directory or an installation package.

The active source baseline is Memory 02–05 commit `eec8dab4aad4b93d8bb3ff8895eeabb38dae4232`, descended from main `b3fe1063d11a198acb225f7698a6bad65d29bf1f`. The consolidation merge retains every original branch head as an ancestor. `manifest.json` records the exact branch names, heads, comparison bases, and resolution. Deleted branch names can be recreated from those reachable commits without recovering dangling objects.

## Deliberate resolutions

- Current Memory 02–05, image inspection, Workflows, release governance, and their documentation remain active source. Their latest descendant already includes the earlier branches.
- The old Agent-Code vault/rotation/intelligence, Memory Observatory sidecar, and Real Steel crafting implementations have unique code. They are preserved here as inert, full-index binary-capable patches and in reachable Git history. They are **not** represented as subsumed, discarded, installed, or runtime-verified. Reinstating an old subsystem would be a separate integration task. In particular, Agent-Code was removed by the authoritative current-source sync `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3`; consolidation does not undo that decision.
- Historical design, routing, shadow-mode, OAuth, and connector test branches retain their exact changes through the manifest and patches. Where a bounded current-source adaptation is made, the active CODEBASE record identifies it separately.
- The unrelated Windows recovery root `639cdf77fd7288a722131862e22eecaff4a90f07` is a sparse source snapshot, not a complete replacement repository. Absent paths do not delete current source. Memory 02–05 code matches the active line apart from line endings. The Windows TCP listener lookup and its tests are integrated; the latest execution report is retained with its original staged-only limitations.
- Sparse Windows metadata and release scripts predate newer main corrections. Current task binding, prerelease-safe release tooling, project description, current-repository policy, and prior functional acceptance records are retained. Dormant Hermes partner source is preserved in the overlay patch/history rather than silently wired back into runtime. Existing production launcher ports, mutex, startup and root checks remain unchanged.

## Reading and replaying evidence

Each historical patch is the exact `git diff --binary --full-index <base> <head>` from its manifest entry. The sparse Windows patch is restricted to paths present on that sparse head; it is intentionally not a whole-tree replacement. Replay only in an isolated checkout of the recorded base. Do not apply these patches to current main or use them as activation instructions. Individual source is also available with `git show <head>:<path>`.

Patch payloads are `.patch` data, outside source compilation and test discovery, and excluded from release packaging. They contain no dependencies, installed toolchains, live Memory, runtime state or user credentials. Credential-shaped strings in historical credential tests are synthetic test/canary fixtures; no real credentials are introduced by this archive.

Repository consolidation is not a release, deployment, Windows activation, migration, provider call, or proof that the resident runtime uses this source. Existing immutable releases and tags remain unchanged. Future release/activation requires its own authorized verification.
