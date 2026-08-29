# MSL Phase I — Phase-P Windows Installer Promotion Design

**Date:** 2026-08-18  
**Repository:** `rendevouz999/Market-Signal-Lab`  
**Phase:** I — Installed Baseline Promotion  
**Working branch:** `feature/phase-p-windows-installer-promotion-20260818`  
**Parent branch:** `feature/market-mapping-performance-phase-p-20260818`  
**Parent head at branch creation:** `4e7125969b67a646ea79bf7963ba4cf946171ee8`  
**Approved approach:** A — Phase P is the runtime base; transplant only the bounded installer layer from the historical installer candidate.

## 1. Purpose

Phase I turns the fully verified Phase P runtime into a reproducible Windows-installed baseline before Phase C1 resumes.

The goal is not to redesign MSL, change market formulas, change Rust analytics, or publish a release. The goal is to prove that the optimized runtime can be packaged, installed, upgraded, uninstalled, reinstalled, and launched as normal Windows software while preserving researcher data and the already-verified secure Envato credential boundary.

Phase I ends with one auditable Windows candidate whose installed runtime identity, data preservation, credential preservation, and real Quick Market Autopilot behavior are verified on the native Windows machine.

## 2. Why Phase I exists

Phase P established a fast and repository-green runtime baseline. The previous Windows installer candidate predates the Phase P promotion and therefore cannot be treated as the canonical installed baseline.

Phase I creates a clean separation:

```text
verified runtime evolution
    Phase P
      ↓
installer promotion only
    Phase I
      ↓
stable installed baseline
      ↓
future analytical evolution
    Phase C1
```

This prevents future Rust ranking migration work from becoming entangled with unresolved packaging or lifecycle uncertainty.

## 3. Locked architecture and ownership boundaries

The existing MSL architecture remains unchanged:

```text
Go
= Windows application/control plane
= sole credential/security boundary
= HTTP/UI/storage/provenance ownership

Rust
= mandatory production analytics implementation for migrated kernels
= secret-blind

JSONL / LocalAppData
= canonical researcher history/data

Windows Credential Manager
= authoritative Envato credential store

Inno Setup + PowerShell
= packaging/install verification only
```

Phase I MUST NOT:

- move credential ownership into the installer;
- read, print, export, migrate, duplicate, or delete the raw Envato token;
- store mutable researcher history under Program Files;
- change market formulas, ranking semantics, thresholds, confidence rules, or signal names;
- change the production Rust protocol from `msl-analytics/2`;
- add a Go analytics fallback;
- add GPU work;
- merge to `main`;
- resume Phase C1 implicitly.

## 4. Branch and PR topology

### 4.1 Canonical Phase I branch

Phase I is developed on:

```text
feature/phase-p-windows-installer-promotion-20260818
```

The branch is created from the current Phase P branch, not from the historical installer branch.

### 4.2 Installer source transplant

Only the bounded installer layer from historical Draft PR #14 is eligible for transplant:

```text
.github/workflows/windows-installer-candidate.yml
installer/MarketSignalLab.iss
scripts/build-windows-installer.ps1
scripts/verify-windows-installer.ps1
scripts/tests/build-windows-installer.Tests.ps1
scripts/tests/verify-windows-installer.Tests.ps1
```

No broad merge from `feature/windows-installer-lifecycle-20260818` is allowed. This preserves Phase P ancestry and avoids importing unrelated or stale branch history.

### 4.3 PR direction

The Phase I Draft PR must target:

```text
feature/phase-p-windows-installer-promotion-20260818
    ↓
feature/market-mapping-performance-phase-p-20260818
```

It must not target `main`.

### 4.4 Historical PR cleanup

After the new Phase I Draft PR exists and the transplanted installer layer is verified to be represented there:

- PR #13, which targets `main`, must be closed as superseded / wrong integration target.
- Draft PR #14 must be closed as superseded by Phase I.
- Draft PR #15 remains the Phase P integration record and remains Draft unless a later explicit integration decision changes it.

Closing historical PRs is metadata cleanup only; their commits remain available for audit.

## 5. Reused installer identity and layout

The existing installer identity is retained exactly:

```text
AppId GUID: {3A8A0C2E-6F29-4D62-B6E7-3177732B55DD}
AppName: Market Signal Lab
Default install: {autopf}\Market Signal Lab
Start Menu group: Market Signal Lab
```

Changing the AppId is forbidden in Phase I because it would convert the candidate into a separate Windows product rather than an upgrade-compatible continuation.

Installed application files remain under Program Files:

```text
Market Signal Lab.exe
engines\rust\msl-analytics-rust.exe
browser-companion\...
version.json
```

Mutable researcher data remains outside Program Files under the existing application data root, currently `%LOCALAPPDATA%\MarketSignalLab`.

Credential Manager state remains outside installer ownership.

## 6. Build and provenance contract

The Phase I packaging pipeline reuses the existing deterministic build model:

1. resolve the current Go, Cargo/Rust, Git, and Inno Setup tooling;
2. build the Rust production worker in release mode;
3. build the Go Windows GUI host from the Phase I source tree;
4. stage the browser companion at the path expected by `capture-helper-path`;
5. write `version.json` with the exact source head and SHA-256 values for Go/Rust binaries;
6. compile one Inno Setup installer;
7. write non-secret installer build evidence.

`version.json` remains provenance data, not a secret container.

The source version may remain `0.3.0-alpha.6.5.3-preview.1` during Phase I. A version bump is not required merely to distinguish candidates; the exact `sourceHead` and binary hashes provide the candidate identity. Version changes are out of scope unless a build constraint proves one is necessary.

## 7. Phase I lifecycle verification model

Clean-install smoke alone is insufficient. Phase I must prove the complete default lifecycle on the real Windows environment.

### 7.1 Clean install

The clean-install gate must prove:

- installer succeeds to a test installation path or Program Files as appropriate;
- installed Go host exists;
- installed Rust worker exists at the locked relative path;
- browser companion exists;
- `version.json` exists and identifies the Phase I source head;
- no history/cache/log/export/credential files are staged under Program Files;
- application host health is healthy;
- production analytics health is healthy;
- production analytics identity is `rust-production`;
- production analytics protocol is `msl-analytics/2`.

### 7.2 Upgrade preservation

Upgrade verification must use the same stable AppId and must prove an actual installer-over-installer upgrade, not a manual file replacement.

Before upgrade, record only non-secret state:

- installed candidate source head / binary hashes;
- credential configured state;
- credential fingerprint if exposed by the existing non-secret status API;
- known history/run identifiers or equivalent non-secret history sentinel;
- data-root identity and selected history presence.

After upgrade to the Phase I candidate, require:

- one Windows product installation, not side-by-side duplication;
- Phase I application/worker hashes and source head are installed;
- existing LocalAppData history remains readable;
- credential remains configured without token re-entry;
- credential fingerprint remains unchanged where available;
- Rust V2 production health remains healthy.

The verifier must never query or print the raw token.

### 7.3 Real installed Quick Market Autopilot

From the installed Phase I application, execute one real Quick Market Autopilot using the saved credential.

Require factual terminal evidence:

- run accepted;
- real source requests occur through the normal Envato connector;
- run reaches a terminal status;
- no credential re-entry is required;
- warning/error counts are recorded factually;
- resulting history remains visible from the installed application;
- production analytics remains `rust-production / msl-analytics/2`.

Phase I does not need to reproduce the exact 5m55s Phase P benchmark. Performance regression evidence is required only if the installed Quick run shows a material return of the former post-network stall or another clear regression signature. No new speedup claim is created from installer acceptance.

### 7.4 Default uninstall preservation

Default uninstall must remove installed application files but preserve researcher-owned state:

- `%LOCALAPPDATA%\MarketSignalLab` history/data remains;
- Credential Manager credential remains;
- no broad user-data cleanup occurs;
- no credential deletion occurs.

The verifier may inspect only non-secret preservation indicators.

### 7.5 Reinstall preservation

Reinstall on the same Windows user must prove:

- application installs normally;
- existing history is rediscovered automatically;
- credential is rediscovered automatically;
- no API key re-entry is required;
- credential fingerprint remains consistent where available;
- installed runtime health remains Go healthy + Rust V2 healthy.

### 7.6 Restart and Start Menu acceptance

The final installed-baseline gate must also prove normal researcher usage:

- Start Menu shortcut launches MSL without developer PowerShell arguments;
- dashboard is available on the normal local address;
- after a full application stop/restart, saved credential and history remain available;
- desktop shortcut remains optional/default-off unless explicitly selected during install.

A full OS reboot is useful evidence if convenient, but application restart plus Windows-user lifecycle proof is the minimum Phase I requirement unless a defect specifically depends on reboot behavior.

## 8. Test strategy

Phase I uses layered evidence.

### Layer 1 — static PowerShell/installer contracts

Test the packaging scripts and `.iss` source for:

- stable AppId;
- Program Files layout;
- required staged files;
- no developer-specific absolute paths;
- no token/environment persistence;
- no Credential Manager ownership;
- no LocalAppData deletion;
- only test-owned process cleanup;
- workflow trigger points at the Phase I integration topology.

### Layer 2 — repository regression

Before native installer acceptance:

```text
go test ./... -count=1
go build ./internal/app ./cmd/market-signal-lab
cargo test --manifest-path engines/rust/Cargo.toml
```

The Phase I branch must not degrade the repository-green Phase P baseline.

### Layer 3 — Windows package build

On native Windows:

- stage binaries/assets;
- validate hashes/provenance;
- compile Inno Setup installer;
- validate generated installer evidence;
- keep generated outputs untracked.

### Layer 4 — native installed lifecycle

Run clean install, upgrade, installed Quick scan, uninstall preservation, reinstall preservation, and Start Menu/restart acceptance.

Native Windows evidence is the source of truth for lifecycle completion. GitHub Actions is supplementary only and must not be the sole evidence because hosted-runner availability/billing is not guaranteed.

## 9. Workflow policy

The historical installer workflow hard-codes the old installer branch/base. In Phase I it must be adapted so it does not imply that the historical installer branch is canonical.

The preferred workflow behavior is:

- push trigger on `feature/phase-p-windows-installer-promotion-20260818` while Phase I is active;
- pull-request trigger targeting `feature/market-mapping-performance-phase-p-20260818`;
- manual `workflow_dispatch` retained;
- workflow artifacts remain temporary diagnostics/candidates only;
- no artifact is committed into Git history.

Hosted CI failure caused solely by account billing/runner availability does not invalidate native evidence, but actual test/build failures do.

## 10. Error handling and safety

Installer verification must fail closed and report actionable non-secret evidence.

Forbidden behavior includes:

- killing processes by broad product-name wildcard;
- deleting a user data root to make a test pass;
- deleting Credential Manager entries during cleanup;
- printing Authorization headers or token values;
- using production data mutation merely as a disposable fixture;
- silently continuing after an installer, runtime-health, or lifecycle preservation failure.

Where an isolated test installation or data root can be used without invalidating credential/lifecycle semantics, prefer isolation. Where the real Windows user profile is required to prove credential preservation, preserve the actual researcher state and compare only non-secret markers.

## 11. Documentation and evidence outputs

Phase I completion must produce/update:

```text
docs/qa/windows-installer-lifecycle-qa.md
docs/checkpoints/CURRENT_MSL_CHECKPOINT.md
docs/checkpoints/CONTINUE_MSL.md
```

QA must distinguish:

- repository verification;
- package build verification;
- clean-install evidence;
- upgrade preservation evidence;
- installed Quick run evidence;
- uninstall preservation evidence;
- reinstall preservation evidence;
- Start Menu/restart evidence;
- any remaining release-only blockers.

No generated EXE, installer, Rust target directory, token, browser session, or local researcher history belongs in Git.

## 12. Completion criteria

Phase I is COMPLETE only when all of the following are true:

1. Phase I branch descends from Phase P and contains only the intended installer/promotion changes beyond Phase P.
2. Historical installer functionality is represented through bounded transplant, not a broad historical merge.
3. Static installer/build safety contracts pass.
4. Repository-wide Go tests pass.
5. Production Go build passes.
6. Rust suite passes.
7. Native Windows package staging and Inno Setup compilation pass.
8. Installed runtime identifies the exact Phase I source head and expected binary hashes.
9. Clean-install runtime health passes with `rust-production / msl-analytics/2`.
10. Upgrade preserves LocalAppData history and Credential Manager state.
11. Installed Quick Market Autopilot completes using the saved credential without re-entry.
12. Default uninstall preserves researcher data and credential.
13. Reinstall rediscovers history and credential automatically.
14. Start Menu / normal application restart behavior is accepted on native Windows.
15. QA/checkpoint/handoff documents record the evidence accurately.
16. Phase C remains frozen until an explicit later resume decision.
17. `main` remains untouched.

Only after these criteria pass may the Phase I candidate be described as the stable installed baseline for the next development phase.

## 13. Explicit non-goals

Phase I does not:

- merge PR #15 to its base automatically;
- merge anything to `main`;
- publish a formal release;
- sign the installer with a production code-signing certificate;
- implement automatic updates;
- change analytics formulas or migrate ranking logic to Rust;
- resume Phase C1;
- perform Phase C2/C3 semantic work;
- introduce GPU acceleration;
- redesign the MSL UI;
- implement destructive researcher-data cleanup in the uninstaller.

## 14. Historical relationship

The existing `docs/superpowers/plans/2026-08-18-msl-windows-installer-lifecycle-plan.md` remains useful implementation history and contains detailed installer conventions. Phase I supersedes its branch topology and completion sequence where they conflict with this design.

Draft PR #14 is treated as the bounded source for installer-layer transplant. PR #13 is treated as an obsolete direct-to-main integration route and must not be used for Phase I integration.
