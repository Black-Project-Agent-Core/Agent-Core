# Stable release workflow

## Current release state

The current source line is **Agent Core 1.6.0 for Windows x64**. Read [1.6.0 release notes](1.6.0.md) for its scope, limits and source-verification evidence; [0.15.0](0.15.0.md) is the previous accepted stable release. Accepted distribution identities and package receipts belong to the [versioned GitHub Release](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/tag/v0.15.0). Verify the source commit, package manifest and installed runtime separately.

The [latest accepted stable release](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/latest) is the download baseline. A source push, tag or successful build does not prove that a Windows package was accepted or activated. Publication is a separate, explicitly authorized action.

## Prepare the exact source

Use a reviewed checkout at a known commit. Preserve unrelated changes and existing installations. Follow [AGENTS.md](../../AGENTS.md), including the external-controller contract and canonical Memory inspection when operating through Agent Core. Native and external development are active; runtime grants, path validation and verified task scope remain authoritative.

Every completed change receives a version assessment. Changes to user-visible behavior, compatibility, security, persistent state or release semantics require a factual changeset with an appropriate impact. Documentation-only or test-only work may record no product bump with its reason. Do not increment versions arbitrarily.

1. Inspect `npm run release:plan` and `npm run release:compat`, the reviewed diff and all version surfaces. Planning is read-only.
2. Run the affected tests, Native/path checks and the required Windows acceptance. Record passes, failures and skips separately. A scoped pass must not be described as a globally green suite.
3. When stable promotion is authorized, close the active prerelease state with `npm run release:pre-exit`. For an explicitly authorized source-only prerelease with no channel state, use `npm run release:pre-exit -- --from-source`. That receipt binds the exact source version; it does not invent an artifact sequence.
4. Apply the reviewed stable plan with `npm run release:apply`. Inspect the synchronized version surfaces, changelog and retained intent archives. `release:sync-version` alone does not consume intents or authorize publication.
5. Update the release documents with actual evidence, then commit the complete reviewed package inputs. Record that exact commit. Packaging refuses relevant dirty or untracked source inputs and changes to HEAD during the operation.

If source is already at the intended stable version, verify its applied plan and archives instead of repeating a version transition. Follow the tooling's state checks; do not manufacture a missing receipt.

## Build an immutable stable ZIP

The stable path uses `npm run release:package`. `release:pre-package` is for an active prerelease artifact channel and is not the stable packaging command.

The build machine needs the project-local Windows Node/npm runtime, .NET 8 SDK, installed Core/UI dependencies and approved tunnel/provider binaries. Browser transport requires a Go toolchain or the exact hash-bound reusable binary and manifest for the current source, builder and target. Do not copy a private runtime root or substitute an older release binary for a missing input.

`release:package` rebuilds Core and UI, publishes a self-contained win-x64 launcher, stages approved runtime and source inputs, and produces an immutable `release/v<version>/` archive directory. It records `sourceCommit`, launcher identity and per-file SHA-256 integrity. A failed or stale package is not repaired by overwriting an existing release directory; follow the tooling's refusal and resolve the cause deliberately.

## Accept the package in isolation

Acceptance must use the ZIP that will be published, extracted to a fresh folder separate from the checkout and installed runtime. Do not import a user's `.env`, credentials or Memory to make acceptance pass.

1. Match the ZIP SHA-256 to `SHA256SUMS.txt`. Inspect every archive entry before extraction: one expected package root, no absolute/traversal paths, links, private credentials, user Memory or activation markers, logs, browser profiles or host-local tooling links.
2. Verify the manifest's version and exact source commit, the launcher's FileVersion/ProductVersion, bundled Node, compiled Core/UI, static guides, licenses and exact browser-helper/source hashes. Verify the complete immutable integrity manifest. The active Skills catalog and canonical Memory are mutable boundaries, not repair targets.
3. Check the complete restart chain exists: root `Restart-Agent-Core.cmd`, `scripts/windows/Invoke-Agent-Core-Restart.ps1`, `scripts/windows/Restart-Agent-Core.ps1`, launcher and compiled Core. This is a file/integrity check. Do not invoke the restart command or install a Scheduled Task as part of isolated package acceptance.
4. For a new installation only, with no existing Memory roots and all writers stopped, run the bundled Node against `scripts/memory/activate-canonical.mjs --fresh`. Existing stores require explicit migration or recovery; never replace them with starter content.
5. Start the packaged Core on an unused loopback port with package-local Memory, auth and runtime paths. Confirm the actual bound port, health/version, canonical Memory and execution availability, authentication rejection without credentials, and graceful close. Keep receipts tied to the ZIP hash, extraction path and source commit.
6. Qualify launcher/WebView2, MCP client access, optional providers/devices and browser/extension setup separately for any claims made about them. A Node-service smoke check does not establish GUI or provider acceptance. Avoid foreground takeover and production restarts during isolated checks.

The package contains generic `MEMORY-BOOTSTRAP.md` text outside the canonical store. It does not ship a pre-created writable Memory store. Credentials, activation records, private runtime state and user browser profiles remain excluded. Preserve the extracted fixture and sanitized acceptance receipt when evidence is needed; do not clean up an installed runtime.

## Publish and read back

After all required evidence is accepted and publication is authorized, publish the exact verified immutable ZIP, `SHA256SUMS.txt`, release notes and manifests at the reviewed source commit. Confirm the remote tag/commit and asset identity. When GitHub supplies an asset SHA-256 digest, match it to the local verified ZIP; otherwise download the published asset and hash it. Record the readback method and result. Record package publication independently from source push and installed-runtime activation.

The root npm package is private; GitHub access does not establish npm registry permission or a publishable registry artifact. There is no automatic publish workflow. Build, packaging and source synchronization do not themselves authorize installation, restart, deployment or publication.

See [release intent details](../../.changeset/README.md), [security policy](../../SECURITY.md), and [recovery guidance](../CODEBASE.md).
