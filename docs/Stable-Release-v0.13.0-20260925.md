# Agent Core Stable Release v0.13.0 — 2026-09-25

> **Status:** COMPLETE — STABLE PACKAGE CREATED / INTEGRITY VERIFIED / POST-RELEASE BASELINE CLEAN.
> **Source/package version:** 0.13.0.
> **Live runtime at packaging closure:** 0.12.0; runtime activation was not part of this task.
> **Release apply:** already complete before final package verification; 14 intents archived under `.changeset/applied/0.13.0-1790331390160/`.
> **Package:** `release/v0.13.0/Agent-Core-v0.13.0.zip`.

## Package verification

The immutable v0.13.0 release directory contains the ZIP, release notes, release manifest, integrity manifest, and SHA-256 checksum file.

Independent package readback:

- ZIP bytes: **213,308,810**.
- ZIP SHA-256: `742002161f09fc604c044a772bffe520ffd4a5097b7b1ac9838d7cbdaf40143e`.
- `SHA256SUMS.txt` matches the independently recomputed ZIP hash.
- Native launcher inside the ZIP: FileVersion **0.13.0.0**, ProductVersion **0.13.0**, SHA-256 `61a2872cde52cf12c206e0a707cd992183d361edcbdc453fe767cdcf5316f3c4`.
- Archive `package.json` reports **0.13.0**.
- Outer and inner `RELEASE-NOTES.md`, `RELEASE-MANIFEST.json`, and `INTEGRITY-MANIFEST.json` are byte-identical.
- Integrity verification streamed all **19,399 / 19,399** declared files directly from the ZIP: **0 missing, 0 byte mismatches, 0 SHA-256 mismatches**.
- Integrity manifest declares **649,195,899** total immutable bytes.
- No prohibited archive entries were found for `.env`, `secrets/`, `runtime/bridge-auth/`, `runtime/tracker/`, `runtime/backups/`, Git metadata, or protected reference repositories.
- The only packaged Memory path is the fresh product bootstrap `runtime/memory/00-agent-core-memory.md`; user canonical notes were not copied.

## Release semantics

`release:plan` reports current **0.13.0**, bump **none**, pending **0**. `release:compat` reports **62 -> 62** tools, no added/removed tools, no breaking evidence, no verification issues, and MCP manifest budget within limits.

After version synchronization, the synthetic current-line baseline was refreshed to:

`refs/agent-core/current-line-baseline = 639cdf77fd7288a722131862e22eecaff4a90f07`

with **289** release-baseline files. Post-refresh `release:check-intent` is clean: no release-relevant drift and no pending intents.

## v0.12.0 history boundary

`CHANGELOG.md` preserves the v0.12.0 release entry dated 2026-09-20. The directory `release/v0.12.0/` still exists, but it contains **0 files**, and no `Agent-Core-v0.12.0.zip` was found anywhere under the current project.

No historical v0.12 package was reconstructed from v0.13 source because that would create false provenance. v0.12 therefore remains historical through changelog/docs/canonical memory rather than through a recoverable ZIP artifact.

## Activation boundary

This task creates/closes the **stable v0.13.0 package** only. The currently running Node Core still reports **0.12.0**. No runtime restart, launcher replacement, deploy, publish, commit, tag, push, or legacy-remote mutation occurred as part of this packaging closure.

Machine-readable verification: `runtime/tmp/stable-release-v0.13.0-20260925/verification.json`.
