# Phase C2 Semantic Correction — QA Evidence

**Date:** 2026-08-23 (Asia/Jakarta)
**Status recorded here:** derived only from observed automated/native evidence below.
**Formal release status:** NOT RELEASED

## Source commit and branch

```text
sourceCommit=82abd6a227140fdc61dd01799069e524ca6ad39a
branch=task/c2-semantic-correction-20260822
```

`82abd6a227140fdc61dd01799069e524ca6ad39a` is the final C2 **product-source evidence commit**. Later commits on this branch are documentation-only evidence/checkpoint updates, so `git log -1` may correctly report a newer docs commit while all automated/native product evidence remains pinned to `82abd6a`. This supersedes the earlier `48b50f05ed952fb008be1349e46091a553d3d281` evidence, which was invalidated by the final UI-terminology fix committed as `82abd6a` (`fix: complete C2 insight terminology rollout`).

## Semantic contract version

```text
msl-semantic-contract/2
```

Confirmed both in automated focused-suite evidence (`internal/semantics` projection tests) and in native candidate evidence (`native.json.semanticApiIdentity.semanticContractVersion`).

## Projection identity test result

`internal/semantics` package tests (`ranking_v2_test.go`, `structural_v2_test.go`, `persistence_test.go`) — **PASS**, re-run against `82abd6a`:

```text
go test ./internal/semantics ./internal/ranking ./internal/web ./internal/storage -count=1
ok  marketsignallab/internal/semantics   ...
ok  marketsignallab/internal/ranking     ...
ok  marketsignallab/internal/web         ...
ok  marketsignallab/internal/storage     ...
```

(`automated.json.focusedC2Suite`, `final-regate-task8-report.md`.) Native candidate evidence corroborates numeric identity end to end: `catalogInsightScore (64.2) == snapshot.opportunityScore (64.2)`; `productInsightScore (85.2) == snapshot.opportunityScore (85.2)` (`native.json.semanticApiIdentity`).

## Legacy API compatibility result

PASS. Legacy `snapshot` JSON fields remain present and unchanged alongside the additive `semantics` object; covered by `internal/web` package tests (part of the focused suite above and the full `go test ./... -count=1` run) and confirmed live on the native candidate (`GET /api/ranking/catalogs`, `GET /api/ranking/products`).

## minOpportunity compatibility result

PASS. `internal/web/explorer_handlers_test.go` exercises `GET /api/explorer/products?...&minOpportunity=1` (1 match) and `...&minOpportunity=101` (0 matches) against the legacy compatibility query parameter, which is not renamed. Covered by the same focused `internal/web` run above.

## C1 canonical fixture fingerprints

Unchanged, re-confirmed at `82abd6a` (`dist/c2-semantic-acceptance/automated.json`, Task 8 re-gate):

```text
internal/ranking/testdata/c1/product_v01_cases.json      = 0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4
internal/ranking/testdata/c1/catalog_v01_cases.json      = 95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3
internal/indexing/testdata/c1/structural_index_v01_cases.json = bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea
```

## Rust source/wire diff gate result

From `automated.json.rustNumericDiffGate`, re-confirmed at `82abd6a`:

```text
git diff --exit-code bc5e49381df18516c4d296cbf164314ec5a35375 -- engines/rust internal/analyticsengine internal/ranking/rust_input_v01.go internal/ranking/rust_output_v01.go internal/indexing
exitCode=0, diff=none
```

Rust/numeric production source is unchanged from the approved C2 design baseline commit.

## Full cargo test result

PASS, exit code 0 — `cargo test --manifest-path .\engines\rust\Cargo.toml`, re-confirmed at `82abd6a` (`final-regate-task8-report.md`).

## Release Rust worker build

PASS. SHA-256 `29D15D03B6AF076DEE3A28FF8C409B2212ED00439BCBD8E4AE586790EFEF41B1` (`dist/c2-semantic-acceptance/rust-target/release/msl-analytics-rust.exe`, `automated.json.releaseWorkerSha256`) — this is the release build used to run the Go test suite for this re-gate. It is a **distinct artifact** from the packaged installer worker recorded below, and its hash by itself is **not** a numeric-freeze proof (packaged-worker hashes are not reproducible across build passes/timestamps, purely a build-path property). Numeric freeze is established by the Rust/numeric source diff gate above plus the unchanged C1 fixture fingerprints, never by binary hash equality.

## Full go test result

PASS, exit code 0 — `go test ./... -count=1` against the release Rust worker above, re-confirmed at `82abd6a` (`final-regate-task8-report.md`).

## Installer / candidate app / packaged Rust worker SHA-256

```text
installer.sha256          = 9BE61150EB71EA826041ED2A6E5C1909C8473EA65E898D187F918B895CB30CBF
candidateApp.sha256       = A8F759718A585BB34456C5DAEAC0EB524983F4435DB4211A92083917A6B10D26
packagedRustWorker.sha256 = 40AFDCF14458142E488E0A09268F46C263EC0001F0BB87EE3F8A2280529951E4
version                   = 0.3.0-alpha.6.5.3-preview.1
sourceHead                = 82abd6a227140fdc61dd01799069e524ca6ad39a
```

(`dist/c2-semantic-acceptance/native.json`, Task 9 native re-gate, same source commit.) The current candidate's staged-runtime tree was verified byte-identical, file-for-file, to the installer build's payload stage (`final-native-composition-review.md` §4).

## Native lifecycle acceptance basis — composition, not a literal replay of the current Setup.exe

Read before relying on the health/UI results below:

- The current `Setup.exe` (SHA-256 `9BE61150...`) was **not** literally installed in this task. Doing so requires an elevated (Administrator/UAC) session that was not available; no UAC bypass was used or attempted.
- The genuine elevated Setup.exe install/layout/health verification exists at an earlier source commit, `48b50f05ed952fb008be1349e46091a553d3d281`, run with `verify-windows-installer.ps1 -KeepInstalled`. **Uninstall was not exercised at that commit or at any other C2 commit.** Nothing in this document should be read as claiming the old uninstall passed, or that the current `82abd6a` Setup.exe was literally installed.
- `installer/`, `scripts/`, `cmd/`, `internal/app/`, `internal/analyticsengine`, `internal/indexing`, and `engines` are byte-identical (git tree hash) between `48b50f0` and `82abd6a`; the only production delta between those two commits is two `go:embed` UI assets (`internal/web/templates/index.html`, `internal/web/assets/js/app.js`).
- The current `82abd6a` candidate was exercised as a **staged runtime** that is hash-identical, file-for-file, to the installer's payload stage — not launched via `Setup.exe`. That staged runtime produced the health, credential, Quick-run, semantic-identity, and UI/locale results below.
- An independent final native-evidence reviewer examined this composition and returned **ACCEPT_FOR_C2_CLOSURE** (`final-native-composition-review.md`): sufficient for C2 code/semantics closure, explicitly **not** sufficient for RC/final product sign-off. See "Deferred gate" below.

## Native candidate health (staged runtime, `82abd6a`)

```text
applicationHost.status=healthy
productionAnalytics.status=healthy
productionAnalytics.engine=rust-production
productionAnalytics.protocol=msl-analytics/2
processTree=Market Signal Lab.exe -> msl-analytics-rust.exe
sourceHead=82abd6a227140fdc61dd01799069e524ca6ad39a
```

(`native.json.candidateSmoke`)

## Native Quick run ID/status

```text
runId=b712a94b02218e8a6b5068bd3dd7cf7e
status=completed
productsDiscovered=490
requestsCompleted=28
plannedWorkUnits=21
completedWorkUnits=21
warningCount=0
errorCount=0
elapsedMs=39726
```

(`native.json.quickRun`)

## Native catalog/product semantic identity result

```text
catalogRowCount=70, productRowCount=490
catalogSample: catalogInsightScore=64.2 == opportunityScore=64.2 (equal=true)
productSample: productInsightScore=85.2 == opportunityScore=85.2 (equal=true)
```

(`native.json.semanticApiIdentity`)

## Native locale/UI smoke result

```text
jsContainsSemanticContractV2=true
catalogInsightLabelKeyCount=4              (data-i18n="semantic.catalog_insight_score" occurrences)
productInsightLabelKeyCount=3              (data-i18n="semantic.product_insight_score" occurrences)
compatibilityOpportunitySortValueCount=2   (value="opportunity" preserved)
semanticLocaleValuesEnChecked=14
semanticLocaleValuesIdChecked=14
```

All 14 canonical `semantic.*` locale keys were verified with their exact values in both English and Indonesian (`native.json.uiLocaleSmoke.semanticLocaleValuesEn` / `...Id`). The separate Market Opportunity subsystem (Opportunity Board, Historical Opportunity, `static.market_opportunity`, `static.opportunity_board`) remains preserved and untouched — the 2 residual `static.opportunity` labels trace to those tables and are confirmed intentional preservation, not a missed relabel (`final-native-composition-review.md` §4).

## Credential source/fingerprint only

```text
provider=envato
configured=true
effectiveSource=credential_manager
credentialFingerprint=807E-3CE1
status=connected
```

Raw token was never read, printed, or exported by any task in this phase (`native.json.credential`).

## Deferred gate — required before RC/final product sign-off (not required for C2 closure)

From a pre-elevated Administrator PowerShell session (elevation obtained interactively through the normal Windows UAC prompt only; no bypass, no scheduled-task/COM/auto-elevate workaround), run `scripts/verify-windows-installer.ps1` against the current Setup.exe (`9BE61150EB71EA826041ED2A6E5C1909C8473EA65E898D187F918B895CB30CBF`, `sourceHead=82abd6a227140fdc61dd01799069e524ca6ad39a`) **without** `-KeepInstalled`, and record, in a new native evidence file:

1. installer exit code 0 and `Assert-InstallLayout` PASS against the extracted tree;
2. extracted-tree SHA-256 for `Market Signal Lab.exe` == `A8F759718A585BB34456C5DAEAC0EB524983F4435DB4211A92083917A6B10D26` and `engines/rust/msl-analytics-rust.exe` == `40AFDCF14458142E488E0A09268F46C263EC0001F0BB87EE3F8A2280529951E4`;
3. installed `version.json` sourceHead == `82abd6a227140fdc61dd01799069e524ca6ad39a` and version == `0.3.0-alpha.6.5.3-preview.1`;
4. `applicationHost=healthy` and `productionAnalytics=healthy / rust-production / msl-analytics/2` from the **installed** app;
5. from the installed app: literal EN and ID values for all 14 `semantic.*` locale keys, and the five relabeled UI sites present in the served `index.html` / `app.js`;
6. uninstall exit code 0, install directory removed, no orphaned process or port owner;
7. credential evidence limited to `effectiveSource` plus the non-secret fingerprint, as today.

If any step fails, this composition-based native acceptance is void and Task 9 / C2 native evidence must be re-gated in full (`final-native-composition-review.md` §7).

## Known limitations / residual notes

- Dead locale key: `static.sort_opportunity` (`en.json` / `id.json`) has no production consumer after `82abd6a` repointed the explorer sort options to the canonical `semantic.*` keys; only a negative test assertion still references it. Non-blocking; candidate for deletion in C3.
- The bilingual locale-value regression test's `14`-key count is checked against the test's own literal map rather than the loaded dictionary length, so it would not catch a stray 15th unreviewed `semantic.*` key shipping in only one locale. Both locale files are independently confirmed correct today (28/28 values checked). Non-blocking test-coverage hardening item, not a product defect.
- Task 9 native runs required environment-only workarounds that did not weaken any assertion, all independently reviewed as non-weakening: `GOFLAGS=-buildvcs=false` for a Go/linked-worktree VCS-root detection issue, and PowerShell `Invoke-RestMethod` array/JSON-nesting handling.
- Segment Explorer renders true zero composition as `0%`. This is accepted, correct behavior — the underlying fields are non-nullable `float64` and always present in the payload, so `0%` cannot mask a missing value — not a defect, and it needs no remediation.
- Uninstall of the current `82abd6a` Setup.exe has not been exercised (see "Deferred gate" above); this is a lifecycle-packaging property required before RC/final sign-off, not a C2 semantic-correctness gap.

None of these items touch numeric identity, persistence, or the `msl-semantic-contract/2` contract itself; none gate C2 completion.

## Formal release status

```text
NOT RELEASED
```

C2 completion recorded in this document is a code/verification status only; it does not authorize a product release.
