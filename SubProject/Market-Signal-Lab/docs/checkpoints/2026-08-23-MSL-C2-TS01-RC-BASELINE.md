# Market Signal Lab — C2 + TS0/TS1 Integrated RC Baseline

**Checkpoint:** 2026-08-23 (Asia/Jakarta)
**Branch:** `integration/c2-ts01-rc-baseline-20260823`
**Status:** INTEGRATED BASELINE COMPLETE / VERIFIED — RC SIGN-OFF PENDING
**Formal release:** NOT RELEASED
**Canonical QA:** `docs/qa/c2-ts01-rc-baseline-integration-qa.md`

## Current truth

```text
Phase C1 Rust ranking parity                 COMPLETE / VERIFIED
Phase C2 semantic correction                COMPLETE / VERIFIED
TS0/TS1 TypeScript/Bun foundation           COMPLETE / VERIFIED
C2 + TS0/TS1 integrated RC baseline         COMPLETE / VERIFIED (STAGED-RUNTIME)
Elevated integrated Setup.exe sign-off      PENDING
RC soak / failure hardening                 PENDING
Phase C3 evidence-calibrated model v0.2     DESIGN NEXT / NOT IMPLEMENTED
Formal release                              NOT RELEASED
```

This checkpoint supersedes C2-only or TS0/TS1-only installer identities for **current RC work**. Those older hashes remain valid historical evidence for their own branches.

## Integration lineage

```text
C2 published branch head   cfedc8c8fc8cf246bba679dae337e7a16a11f541
TS0/TS1 published head     848bb0ce54fb5442b97a5ffc7559c1f73ef5b25c
common ancestor            48b50f05ed952fb008be1349e46091a553d3d281
integration merge          92a4c13201df899e7251d912681d85e4dcb80e82
product-source evidence    a68f969bb2e9f34116c5aefb1ddf75b0b84314b2
RC verifier tooling        01addd982e7ff25fc8b64ae467a554b9dbc15804
```
`a68f969` is deliberately the candidate's embedded product `sourceHead`. Later verifier/documentation commits do not alter the already-built candidate bytes and must not be reported as its source identity.

## Current integrated candidate

```text
version                  0.3.0-alpha.6.5.3-preview.1
sourceHead               a68f969bb2e9f34116c5aefb1ddf75b0b84314b2
installerSha256          5618EFA175742D0B32EBD2995A6C3F428E5637F284505A859B2EC96CECE14A10
candidateAppSha256       B538BBC207980B552BDED6D572F9F530BBE1153C1BFF4C3900445BB33F071E6F
packagedRustWorkerSha256 4A8F3DD423BC10A29F2BA75BB89288DD068918955CCE4616F303E8D31C59873A
```

The candidate is built from the combined C2 + TS0/TS1 product tree. Bun is not packaged and is not a runtime dependency.

## Verified evidence

Automated integration gates passed: Bun frozen install, TypeScript typecheck/tests/generated-drift, full Go with real Rust worker, full Rust, C1/C2 numeric freeze, C1 fixture fingerprints, secret hygiene, and clean tracked tree.

Staged native candidate passed:
- `healthy / rust-production / msl-analytics/2`;
- Go host → one observed Rust-worker descendant;
- zero Bun runtime descendants and no packaged Bun/node_modules;
- Envato Credential Manager `connected`, fingerprint `807E-3CE1` only;
- real Quick `4ae718b9fbe38cece492d580aee39985` completed;
- 467 products, 28 requests, 21/21 work units, 0 warnings, 0 errors;
- 73 catalog / 467 product ranking rows;
- `msl-semantic-contract/2` projection identity passed;
- final EN/ID C2 labels and TS-generated diagnostics asset passed.

The exact evidence is in `docs/qa/c2-ts01-rc-baseline-integration-qa.md`.
## Binding RC sign-off boundary

The integrated Setup.exe itself has **not** yet been installed in a newly pre-elevated Administrator session. Therefore this checkpoint is not an RC/final product sign-off.

Before sign-off, use the strengthened `scripts/verify-windows-installer.ps1` from a normal pre-elevated Administrator PowerShell, without `-KeepInstalled`, and provide all four expected identity values above. The verifier now enforces Setup SHA256, embedded sourceHead, installed app/worker hashes, layout, Rust v2 health, final C2 UI + EN/ID locale copy, TS-generated diagnostics asset, port cleanup, uninstall success, and install-directory removal.

No UAC bypass, scheduled-task elevation, COM auto-elevation, or equivalent workaround is allowed. Staged-runtime evidence cannot substitute for this gate.

## RC hardening item discovered during acceptance

A harness diagnostic run `922f16aaa490ab1024a417108c3c569c` was interrupted when its owned host was terminated after a harness polling error. Its persisted market-map state remained `running` after restart. It is not part of accepted ranking evidence and used a separate data root, but it exposed a product-hardening question that must not be forgotten.

RC hardening must explicitly test host termination during a live map, restart behavior, and stale-running-run reconciliation/recovery. A permanent zombie `running` record or misleading history state is not acceptable for stable sign-off.

## Exact continuation order

```text
preserve C1 numerics + C2 semantic aliases + TS0/TS1 ownership
-> run the exact integrated elevated Setup.exe install/uninstall verifier
-> run RC soak and failure testing, including stale-run recovery
-> resolve any Important/Critical RC findings
-> freeze an internal-stable baseline
-> only then begin C3 design/calibration execution
```

Do not start TS2/TS3/TS4/TS5 from this checkpoint. Each still requires a separate reviewed design gate. Do not merge to `main` implicitly.

## Final integration review status

Whole-branch review of `cfedc8c..5954667` returned **SPEC PASS / QUALITY PASS / 0 Critical / 0 Important** and judged this integration branch ready for publication. Five fail-closed Minor hardening items are retained in `docs/qa/c2-ts01-rc-baseline-integration-qa.md`, including generated-JS EOL reproducibility and bounded port-release robustness. They are RC-hardening work, not permission to weaken the current identity or release gates.
