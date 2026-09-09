# Market Signal Lab — Stable Prerelease / C3.3 Empirical-Data Gate

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** STABLE PRERELEASE LINEAGE PUBLISHED / VERIFIED — C3.2 COMPLETE / VERIFIED — C3.3 BLOCKED BY REAL EMPIRICAL DATA
**C3.2 branch:** `task/c3-2-quant-calibration-lab-20260826`
**C3.2 branch head before this documentation closeout:** `b40e1b917e43ea42cae5a28690b089a68411048d`
**Release hardening branch:** `hardening/rc-stability-20260823`
**Release documentation head:** `b82fac060d69d2e9dde5871edfc90c56f1b33544`
**Published tag:** `v0.3.0-alpha.6.5.3-preview.1`
**Tag target:** `0ce427406f5418aa7040e607893ec0cb788ae2f0`
**GitHub prerelease ID:** `377007837`

## Stable truth

```text
Phase P mapping performance                   COMPLETE / NATIVE VERIFIED
Phase I Windows installer lifecycle           COMPLETE / NATIVE VERIFIED
Secure Envato credential runtime              COMPLETE / NATIVE VERIFIED
Phase C0 Signal Truth Audit                   COMPLETE / APPROVED
Phase C1 Rust ranking parity                  COMPLETE / VERIFIED
Phase C2 semantic correction                  COMPLETE / VERIFIED
TS0/TS1 selective TypeScript/Bun foundation   COMPLETE / VERIFIED
RC baseline integration                       COMPLETE / VERIFIED
RC Stability Hardening Wave 1                 COMPLETE / VERIFIED
Exact elevated Setup.exe release sign-off     COMPLETE / VERIFIED
Git tag publication                           COMPLETE / VERIFIED
GitHub prerelease + five assets               COMPLETE / VERIFIED
Phase C3.0 Evidence Constitution Runtime      COMPLETE / VERIFIED (separate branch)
Phase C3.1 deterministic signal v0.2          COMPLETE / VERIFIED (separate branch)
Phase C3.2 Quant Calibration Lab infrastructure COMPLETE / VERIFIED
Phase C3.3 calibrated production intelligence BLOCKED_NO_APPROVED_ARTIFACT
```

The released preview lineage and C3 development lineage remain intentionally separate. C3.0–C3.2 are not claimed as part of `v0.3.0-alpha.6.5.3-preview.1`.

## Release publication evidence

The signed-off Wave 1 candidate was not rebuilt or retagged during publication. GitHub prerelease `377007837` is `draft=false`, `prerelease=true`, and contains exactly five prepared assets:

```text
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Setup.exe
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Windows_x64.zip
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Source.zip
Market_Signal_Lab_v0.3_Alpha6.5.3_Preview1_Browser_Companion.zip
SHA256SUMS.txt
```

GitHub-provided SHA-256 digests for the four product archives/binaries match the locally verified release files:

```text
CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17  Setup.exe
154F52DB59A55B6739AA12AE8FA55AC77B963BCDAE3F12A39CA716CCE30085E8  Windows_x64.zip
F0B9D2F1827F51CCBFF3B5F34584E1CF9273595757D31CA8C6854EA5D6FE4723  Source.zip
5BBBAC85E23D42F5B1BA1FE2CF07DA09549FE93F8E8142EE0F8C979D35389835  Browser_Companion.zip
```

No GitHub Actions/CI verification was used for this publication. No merge to `main` was performed.

A failed first publication attempt created non-public empty draft release ID `377007543` with zero assets. It does not affect the published prerelease. Deleting that draft is a destructive GitHub release operation and is intentionally not treated as a stability blocker.

## C3.2 stable truth

The offline calibration lab is complete and production-isolated. Existing verification remains authoritative and is not rerun merely to create this documentation checkpoint.

The privacy-safe empirical audit found:

```text
JSONL files                     = 26
non-empty rows                  = 103,644
parse failures                  = 0
files with outcome fields       = 0
strict calibration-ready files = 0
signal-evidence-like files      = 0
```

Existing history therefore cannot truthfully produce approved calibration parameters.

## Binding C3.3 gate

```text
EMPIRICAL_DATA_GATE = BLOCKED
CALIBRATION_PARAMETERS = NOT_AUTHORIZED
NUMERIC_CONFIDENCE = NOT_AUTHORIZED
UPPER_STAGE_PROMOTION = NOT_AUTHORIZED
C3.3 = BLOCKED_NO_APPROVED_ARTIFACT
```

C3.3 may start only after all of the following exist together:

1. future privacy-safe, versioned C3 signal/evidence history;
2. explicit later-observed outcomes under a versioned `outcomeDefinitionVersion`;
3. sufficient chronological history for train/validation/untouched holdout separation;
4. a real `REAL_OUTCOME_LABELLED` calibration dataset and reproducible manifest;
5. reviewed C3.2 sensitivity/stability/holdout evidence;
6. an explicitly approved `msl-calibration-artifact/1` with `productionEligible=true`.

Synthetic mechanics data must remain `UNAPPROVED` and `productionEligible=false`. Old runtime history must not be relabelled as outcomes.

## Stable continuation rule

```text
current software/release state = STABLE
current C3.2 infrastructure    = STABLE / VERIFIED
current C3.3 state             = BLOCKED BY EVIDENCE, NOT BY SOFTWARE DEFECT
next valid work                = collect future outcome-labelled evidence
forbidden shortcut             = invent/fabricate calibration parameters or approval
GitHub Actions/CI              = DO NOT USE
main merge                     = NOT IMPLICITLY AUTHORIZED
```

Do not reopen completed Phase P/I/C0/C1/C2/TS0/TS1/RC gates without new regression evidence. Repository evidence remains the source of truth.
