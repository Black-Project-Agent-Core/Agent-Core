# Release preparation and publication

## Current identities

- Canonical source prerelease: **0.15.0-beta.0**
- Target stable product: **0.15.0**
- Previous stable source baseline: **0.14.0**
- Latest published stable GitHub release observed on 2026-10-09: [v0.12.0](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/tag/v0.12.0)
- Historical private npm plugin: `@black-project-agent-core/agent-core-plugin@0.7.0`, a separate artifact whose current publishable payload is not in this source line

Recheck remote releases and packages before every publication. Installed runtime identity requires readback from that machine.

## Version decisions

Every completed change receives a version assessment. User-visible behavior, compatibility, security, persistent state or release semantics need a factual changeset with an impact-appropriate bump. Documentation-only or test-only work can record **no product bump**, with its reason. Do not increment versions arbitrarily after every edit, and do not assume every compatibility change is a patch. See [Semantic Versioning](https://semver.org/).

`npm run release:plan` is read-only. `npm run release:sync-version -- --version <version>` changes all six product-version surfaces; it does not publish. Stable-only archive tooling rejects prerelease source versions. During a prerelease, retained intents target that prerelease's stable core. A new intent requiring a higher stable target fails the plan until an explicit new target is chosen.

For a future prerelease train, enter it while source still has its prior stable identity, then synchronize the planned prerelease version:

```text
npm run release:plan
npm run release:pre-enter -- --tag beta
npm run release:sync-version -- --version <planned-version>-beta.0
```

The current beta train is already entered. Do not run `pre-enter` again. Successful prerelease packaging advances only the artifact sequence; synchronize the next explicit source prerelease (for example `0.15.0-beta.1`) before packaging that next sequence. The stable baseline remains 0.14.0 throughout this train.

## Source-only GitHub prerelease

1. Review the exact diff, changeset, version surfaces and test/build outcomes. Exclude generated output, private state and credentials.
2. Commit/push only the authorized source scope. Verify the remote commit matches the intended source.
3. Create the explicitly authorized prerelease tag at that exact commit; mark the GitHub release **prerelease**. Use [the current release notes](0.15.0-beta.0.md).
4. Label generated source downloads as source. Do not claim them as Windows installers or portable runtime archives. Record publication separately from Windows acceptance.

There is no automatic release/publish workflow. Historical local-direct publication policy is retained; this refresh adds no GitHub Actions file and does not enable Actions.

## Windows package and acceptance handoff

Use an authorized clean checkout or staging directory at the exact source commit. Preserve unrelated local edits and the installed runtime. First read its `AGENTS.md`, inspect its active Memory root when operating through Agent Core, and verify the machine's current paths and runtime state.

1. Ensure the expected Windows Node/npm runtime, .NET SDK, UI/root dependencies and approved tunnel/provider binaries are available. Do not substitute older release binaries for missing inputs or copy private runtime roots.
2. Run the affected tests on Windows, including `tests/release-prerelease-identity.test.ts`, `tests/release-tooling-second-wave.test.ts` and `tests/release-recovery-repair.test.ts`. Inspect real Windows/UI/MCP acceptance separately.
3. `npm run release:pre-package` rebuilds Core and Memory, rebuilds UI, publishes a fresh win-x64 launcher and verifies its product/file identity before staging. It creates an immutable archive under `release/prereleases/<artifact-version>/`, preserving pending intents and prior stable archives.
4. Inspect ZIP contents, the manifest and SHA-256 checksum. Confirm Memory engine, offline Archify, source snapshot, licenses and expected binaries; reject `.env`, secrets, activation markers, canonical user Memory, logs, browser profiles and links outside the staging boundary.
5. Perform approved isolated Windows runtime acceptance. Publication of the verified Windows ZIP is a separate explicit action, with the exact source commit and known limitations recorded.

When stable acceptance is actually complete and a stable release is authorized, `release:pre-exit` permits `release:apply` to consume reviewed intents into the stable version and changelog. Then build the required immutable `release:package` archive before stable publication. None of these commands implies permission to restart, install, deploy or publish.

Every later Linux-to-Windows handoff must be freshly generated from the completed task's actual final commit, changed paths, verification, blockers and next authorized steps. Do not reuse a stale handoff ZIP or imply a source push activated Windows.

## GitHub Packages blocker

The root package is intentionally `private: true` and is not the old plugin package. The historical plugin payload and an authorized registry publishing connection are required before its version can change. Repository push access alone does not prove npm registry publishing access. No replacement package is manufactured here. See [GitHub's npm registry requirements](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).
