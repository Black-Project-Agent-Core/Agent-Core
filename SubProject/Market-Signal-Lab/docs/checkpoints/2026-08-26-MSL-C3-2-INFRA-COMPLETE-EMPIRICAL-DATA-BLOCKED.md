# Market Signal Lab — C3.2 Infrastructure Complete / Empirical Data Blocked

**Date:** 2026-08-26 (Asia/Jakarta)
**Status:** C3.2 OFFLINE CALIBRATION LAB INFRASTRUCTURE COMPLETE / VERIFIED — C3.3 BLOCKED
**Published RC preview lineage:** `v0.3.0-alpha.6.5.3-preview.1` / GitHub prerelease `377007837` — COMPLETE / VERIFIED on separate hardening branch
**C3.2 branch release status:** DEVELOPMENT-ONLY / NOT INCLUDED IN THE PUBLISHED PREVIEW

## Canonical source

```text
branch = task/c3-2-quant-calibration-lab-20260826
worktree = E:\Market-Signal-Lab\dist\.worktrees\c3-2-quant-calibration-lab-20260826
baseline C3.1 = 8f8f89698ec10f60b190eb4f9683e5518c3f6c2b
lab source = 9490f38f8dcc1468d4e28718d00947d092e69d01
executor = Agent Core
```

QA: `docs/qa/phase-c3-2-quant-calibration-lab-qa.md`.

## What is complete

The offline stdlib-only Quant Calibration Lab is implemented and verified:
- canonical dataset/manifests;
- chronological split policies;
- explicit candidate threshold evaluation;
- sensitivity/stability analysis;
- peer-size and coverage/participation robustness hooks;
- confidence and seasonality evaluation hooks;
- deterministic candidate `msl-calibration-artifact/1` emission;
- CLI and privacy-safe suitability discovery;
- tests proving Python remains outside production runtime.

Synthetic golden mechanics are frozen and always UNAPPROVED / productionEligible=false.

## Real-data audit truth

Runtime root derived from source: `%LOCALAPPDATA%\MarketSignalLab`.

Observed audit, raw values not emitted:

```text
JSONL files                     = 26
non-empty rows                  = 103,644
parse failures                  = 0
outcome-field files             = 0
strict calibration-ready files = 0
signal-evidence-like files      = 0
```

Existing history does not contain `outcomeDefinitionVersion`, `outcomeAt`, and `outcomeLabel`, so it is not valid calibration evidence.

## C3.3 authorization state

```text
EMPIRICAL_DATA_GATE = BLOCKED
CALIBRATION_PARAMETERS = NOT_AUTHORIZED
NUMERIC_CONFIDENCE = NOT AUTHORIZED
UPPER-STAGE PROMOTION = NOT AUTHORIZED
C3.3 = BLOCKED_NO_APPROVED_ARTIFACT
```

Do not generate an APPROVED artifact from synthetic data or relabel old runtime history as outcomes.

## How to unblock C3.3

Collect future privacy-safe, versioned C3 signal/evidence records and define later-observed outcomes under an explicit `outcomeDefinitionVersion`. Once sufficient chronological history exists, create a real `REAL_OUTCOME_LABELLED` dataset with an untouched holdout, run the C3.2 lab, review all candidate/sensitivity/stability results, and explicitly approve a versioned artifact. Only then may C3.3 instantiate those exact approved parameters.

## RC release lineage and C3 development boundary

The published RC preview is now complete on the separate `hardening/rc-stability-20260823` lineage: Wave 1 hardening and the exact UAC-elevated Setup install → verify → uninstall gate passed, tag `v0.3.0-alpha.6.5.3-preview.1` points to `0ce427406f5418aa7040e607893ec0cb788ae2f0`, and GitHub prerelease `377007837` is published with five verified assets.

The latest C3.1 development Setup.exe remains only staged-native tested. That does not reopen the already published RC preview because C3.0–C3.2 are separate development branches and are not included in the preview. A future release containing C3 code must verify its own exact candidate through normal interactive UAC; never bypass elevation.

## Exact next action

```text
software/RC preview state is STABLE / PUBLISHED / VERIFIED
→ C3 implementation pauses at the empirical-data gate
→ do not implement C3.3 calibrated production values without approved real artifact
→ collect future outcome-labelled history for calibration
→ preserve append-only/versioned evidence
→ do not rebuild/retest/retag the stable published RC candidate without new regression evidence
→ do not use GitHub Actions/CI
→ no implicit main merge
```
