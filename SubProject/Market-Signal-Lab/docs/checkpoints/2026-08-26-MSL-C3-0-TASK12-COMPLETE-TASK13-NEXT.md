# Market Signal Lab — C3.0 Task 12 Complete / Task 13 Next

**Date:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Worktree:** `E:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260826-repaired`
**Executor:** Agent Core
**Native candidate source HEAD:** `681bafb20676ebcc6cf625b0df6dd25cddd2a7af`
**Status:** C3.0 Tasks 1–12 COMPLETE / VERIFIED — Task 13 NEXT
**Formal release status:** NOT RELEASED

## Task 12 completed

Built the exact C3.0 Windows candidate under ignored:

```text
dist/c3-0-acceptance/windows-installer
```

No Setup.exe install or uninstall was performed. No UAC bypass was attempted.

## Candidate identity

```text
version        = 0.3.0-alpha.6.5.3-preview.1
sourceHead     = 681bafb20676ebcc6cf625b0df6dd25cddd2a7af
installerSha256 = 058497EF7445B274CA389EB20B6A41FCAD63CB70355F5A6625005ABCDD6DA583
appSha256       = D20722759FF5D0AF3D859EE04D40DA5164BAB1725EED9BAB67A90CF283555B32
rustWorkerSha256 = 05C3720BCFA8D1F7C6032D13EEE648EEE5C943EE5523AD269100A3F2A30B875B
```

Installer artifact:

```text
dist/c3-0-acceptance/windows-installer/output/Market-Signal-Lab-Setup-0.3.0-alpha.6.5.3-preview.1.exe
```

The build script verified staged app/Rust hashes against `version.json` and compiled the installer successfully with Inno Setup 6.7.3.

## Non-elevated staged runtime smoke

The staged runtime was launched directly from:

```text
dist/c3-0-acceptance/windows-installer/stage
```

with:
- a dynamically allocated localhost port;
- a fresh ignored isolated `LOCALAPPDATA` root;
- no saved production credential copied into the test environment;
- process cleanup in `finally`.

The first verifier attempt reached the UI HTTP step but used PowerShell variable `$home`, which collides case-insensitively with read-only `$HOME`. The owned process/port were cleaned in `finally`. The verifier variable was renamed to `$html`; no product source or candidate artifact changed.

Successful staged smoke:

```text
applicationHost.status      = healthy
productionAnalytics.status  = healthy
productionAnalytics.engine  = rust-production
productionAnalytics.protocol = msl-analytics/2
```

## Evidence contract/API smoke

`GET /api/evidence/requirements` returned:

```text
contractVersion     = msl-evidence-contract/1
requirementsVersion = msl-evidence-requirements/1
```

Exact signal registry observed:

```text
catalog.competition_momentum.v0.1
catalog.directional_breadth.v0.1
catalog.peer_relative_rank.v0.1
product.peer_relative_rank.v0.1
structural.observed_segment_composition.v0.1
```

No extra or missing signal ID was accepted.

## Shipped UI smoke

`GET /` from the staged candidate contained:

```text
id="evidenceQualification"
data-i18n="evidence.qualification"
```

Therefore the candidate contains the Task 10 evidence qualification surface as well as the Task 9 API.

## Native evidence

Ignored evidence artifact:

```text
dist/c3-0-acceptance/native.json
```

Observed truth recorded in that file includes:

```json
{
  "currentSetupLiterallyInstalled": false,
  "currentSetupUninstallVerified": false,
  "formalReleaseStatus": "NOT RELEASED"
}
```

`git check-ignore` confirmed both native evidence and installer-build evidence are excluded by the repository `dist/` rule.

## Current limitations preserved

This Task 12 verification proves staged candidate health and shipped evidence API/UI only. It does **not** close the deferred elevated RC/final lifecycle gate. The exact current Setup.exe still requires a normal interactive elevated install/uninstall replay before RC/final-product sign-off.

## Next exact action

Execute Task 13 final QA/checkpoint/review from observed Task 11 + Task 12 evidence:
1. write `docs/qa/phase-c3-0-evidence-constitution-qa.md`;
2. update current continuation checkpoints and `CONTINUE_MSL.md`;
3. create the C3.0 COMPLETE / C3.1 NEXT handoff only if final gates remain green;
4. rerun final hygiene + focused regression;
5. perform whole-branch spec/quality review with no open Critical/Important findings;
6. push the working C3 branch only.

Do not merge `main`. Do not start C3.1 automatically. Formal release remains NOT RELEASED.