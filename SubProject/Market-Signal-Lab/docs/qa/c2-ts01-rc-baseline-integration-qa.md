# C2 + TS0/TS1 RC Baseline Integration — QA Evidence

**Date:** 2026-08-23 (Asia/Jakarta)
**Integration branch:** `integration/c2-ts01-rc-baseline-20260823`
**Status:** INTEGRATED BASELINE VERIFIED / RC SIGN-OFF PENDING
**Formal release:** NOT RELEASED

## Lineage and ownership

```text
C2 published head        cfedc8c8fc8cf246bba679dae337e7a16a11f541
TS0/TS1 published head   848bb0ce54fb5442b97a5ffc7559c1f73ef5b25c
common ancestor          48b50f05ed952fb008be1349e46091a553d3d281
integration merge        92a4c13201df899e7251d912681d85e4dcb80e82
product-source evidence  a68f969bb2e9f34116c5aefb1ddf75b0b84314b2
RC verifier tooling      01addd982e7ff25fc8b64ae467a554b9dbc15804
```

`a68f969` is the exact product-source commit embedded in the integrated native candidate. Later commits may update only verification/documentation and must not be confused with the candidate's embedded `sourceHead`.

Architecture remains: Go owns host/API/storage/security/credentials; Rust owns mandatory production analytics; TypeScript owns only the approved analytics-engine UI pilot; Bun is dev/build/test-only; Python remains future offline Quant Research; C++ remains profiling-gated.

## Task 2 automated integration gate

- Bun 1.4.0 frozen install: PASS.
- TypeScript 5.9.3 typecheck: PASS.
- Frontend tests: 2 passed / 0 failed.
- Generated-JS drift gate: PASS.
- Rust/numeric freeze gate vs `bc5e493`: no diff.
- Full Go suite with real release Rust worker: PASS.
- Targeted Rust restart test: 10/10 PASS; no flake observed.
- Full Rust suite: PASS.
- C1 normalized-LF fixture hashes remain exact:
  - product `0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4`
  - catalog `95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3`
  - structural `bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea`
- Secret scan: no credential/token match.
- Tracked worktree clean after verification.

Task-2 release-worker SHA256 was `d705fd91d70c2c9c7f4b5f85068b5ccb92ab0d24a837a2f3e0c24cca9d635cd4`. This is automated regression evidence, not the packaged RC worker identity below.

## Integrated native candidate identity

```text
version                  0.3.0-alpha.6.5.3-preview.1
sourceHead               a68f969bb2e9f34116c5aefb1ddf75b0b84314b2
installerSha256          5618EFA175742D0B32EBD2995A6C3F428E5637F284505A859B2EC96CECE14A10
candidateAppSha256       B538BBC207980B552BDED6D572F9F530BBE1153C1BFF4C3900445BB33F071E6F
packagedRustWorkerSha256 4A8F3DD423BC10A29F2BA75BB89288DD068918955CCE4616F303E8D31C59873A
```

Build used repository-local Go 1.26.4, Rust 1.97.1 GNU, and Inno Setup 6.7.3. The build script's stage/hash/capture-helper assertions passed.

## Staged-runtime native smoke

The current Desktop Commander token was not elevated, so the integrated Setup.exe was not launched and UAC was not bypassed. Instead, the exact hash-matched installer-stage payload was exercised.

- application host: `healthy`
- production analytics: `healthy / rust-production / msl-analytics/2`
- owned Go host had one `msl-analytics-rust.exe` descendant at assertion time
- Bun runtime descendants: 0
- packaged Bun / bun.exe / node_modules: absent
Credential evidence used only safe app APIs:

```text
configured             true
status                 connected
effectiveSource        credential_manager
credentialFingerprint  807E-3CE1
```

The raw Envato token was never read, printed, exported, or written to QA evidence.

## Real Quick acceptance

A fresh acceptance data directory contained zero market-map runs before the accepted scan.

```text
runId               4ae718b9fbe38cece492d580aee39985
status              completed
productsDiscovered  467
requestsCompleted   28
workUnits           21 / 21
warningCount        0
errorCount          0
elapsedMs           38886
catalogRows         73
productRows         467
```

Observed sites: `3docean.net`, `audiojungle.net`, `codecanyon.net`, `graphicriver.net`, `photodune.net`, `themeforest.net`, `videohive.net`.

Semantic contract: `msl-semantic-contract/2`. Sample projection identity remained exact: Catalog Insight Score `67.4 == 67.4` legacy score; Product Insight Score `85.2 == 85.2` legacy score. Final Product/Catalog Insight Score HTML, EN/ID locales, `SEMANTIC_CONTRACT_V2`, and the TS-generated `analytics_engine.js` marker all passed.

## RC hardening finding retained from harness diagnostics

Before the accepted scan, an acceptance-harness defect started diagnostic run `922f16aaa490ab1024a417108c3c569c`, polled `/api/autopilot/live` without the required `runId`, then terminated its owned host. The diagnostic run remained persisted as `running`. It used a separate data root and contributed no accepted ranking/semantic evidence.
This does **not** invalidate Task 3, but it creates a binding RC hardening test: terminate the host during a live run, restart, and verify stale `running` state is explicitly reconciled/recovered rather than remaining a permanent zombie or misleading history state. This finding must remain tracked until resolved or intentionally designed.

## Binding elevated RC sign-off gate

The verifier was finalized at tooling commit `01addd982e7ff25fc8b64ae467a554b9dbc15804` after adding exact identity/UI checks, bounded uninstall-directory polling, and primary-error preservation. From a **pre-elevated Administrator PowerShell** obtained through normal Windows UAC, run the current verifier against the exact integrated candidate, **without `-KeepInstalled`**:

```powershell
$env:LOCALAPPDATA = 'F:\Market-Signal-Lab\dist\.worktrees\c2-ts01-rc-integration-20260823\dist\rc-baseline-acceptance\elevated-localappdata'
$installer = 'F:\Market-Signal-Lab\dist\.worktrees\c2-ts01-rc-integration-20260823\dist\rc-baseline-acceptance\windows-installer\output\Market-Signal-Lab-Setup-0.3.0-alpha.6.5.3-preview.1.exe'
.\scripts\verify-windows-installer.ps1 `
  -InstallerPath $installer `
  -ExpectedVersion '0.3.0-alpha.6.5.3-preview.1' `
  -ExpectedSourceHead 'a68f969bb2e9f34116c5aefb1ddf75b0b84314b2' `
  -ExpectedInstallerSha256 '5618EFA175742D0B32EBD2995A6C3F428E5637F284505A859B2EC96CECE14A10' `
  -ExpectedAppSha256 'B538BBC207980B552BDED6D572F9F530BBE1153C1BFF4C3900445BB33F071E6F' `
  -ExpectedRustWorkerSha256 '4A8F3DD423BC10A29F2BA75BB89288DD068918955CCE4616F303E8D31C59873A' `
  -Port 17789
```

This gate must prove the exact Setup hash, installed app/worker hashes, embedded `sourceHead`, install layout, healthy Rust v2 runtime, final C2 UI + EN/ID locale copy, TS-generated diagnostics asset, owned-port cleanup, successful uninstall, and removal of the install directory. Do not bypass UAC, and do not substitute staged-runtime evidence for this RC/final sign-off gate.

## Remaining release work

RC sign-off is **not complete**. After the elevated gate, run the planned soak/failure lane: repeated scans, network/Envato timeout and rate-limit behavior, Rust-worker failure/restart, process interruption plus stale-running-run recovery, upgrade/reinstall/history persistence, and multi-hour resource stability. C3 remains unimplemented until these RC gates are complete.

## Final whole-branch review — retained RC-hardening backlog

Independent review of `cfedc8c..5954667` returned **SPEC PASS / QUALITY PASS / 0 Critical / 0 Important** and judged the integration branch publication-ready. Five fail-closed Minors are intentionally retained for RC hardening rather than mutating the already-accepted candidate bytes:

1. **Generated-JS EOL reproducibility:** repository `core.autocrlf=true` plus TypeScript `newLine=lf` can make a rebuild of embedded `analytics_engine.js` differ only by CRLF/LF and therefore change the Go-host SHA. Before internal-stable freeze, pin the generated asset's EOL explicitly (prefer `.gitattributes`) and rebuild/re-accept the candidate.
2. **Generated-asset drift coverage:** `verify:frontend-generated` currently protects the approved `analytics_engine.js` output only. If later TypeScript entries are authorized, generated-output verification must expand atomically rather than silently leaving new outputs unguarded. The current local gate is also worktree-vs-index based, so a developer could stage an already-drifted generated file before running it and hide that local diff; CI is not subject to that escape because `.github/workflows/frontend-contract-ci.yml` starts from a clean checkout. RC hardening should either compare regenerated output against `HEAD`/a clean index snapshot or otherwise make the local gate staging-resistant.
3. **Port-release robustness:** the exact RC verifier fails closed if the owned port is slow to release after process shutdown. Consider bounded port-release polling before stable sign-off to reduce false failures without weakening the zero-listener requirement.
4. **Lifecycle cleanup dead check:** after `Wait-PathRemoved` proves the entire install directory is gone, the old immediate app-binary `Test-Path` check in the lifecycle verifier is redundant cleanup code.
5. **Shared installed-identity helper:** exact sourceHead/app/worker validation exists in both clean verifier and lifecycle verifier. It is currently equivalent, but should eventually have one shared canonical helper to reduce future drift risk.

These items do not waive the binding elevated integrated-Setup gate or the stale-running-run recovery test above. Any fix that changes packaged product bytes must generate a new candidate identity and repeat the affected acceptance evidence rather than reusing the hashes in this QA document.
