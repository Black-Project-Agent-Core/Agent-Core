# Market Signal Lab — Phase C3.0 COMPLETE / C3.1 Next

**Finalized:** 2026-08-26 (Asia/Jakarta)
**Branch:** `task/c3-evidence-calibrated-model-v02-20260824`
**Active worktree:** `E:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260826-repaired`
**Executor:** Agent Core
**C3.0 final product-source commit:** `c15a57da6becdf5072e1a75eb42a6bd4427ede58`
**Status:** C3.0 COMPLETE / VERIFIED
**C3.1 status:** DESIGN/PLAN NEXT / NOT IMPLEMENTED
**Formal release status:** NOT RELEASED

## Completion statement

Phase C3.0 Evidence Constitution Runtime is complete and verified from observed automated, source-freeze, and staged-native evidence.

C3.0 adds a sibling evidence qualification contract around approved existing MSL signals without changing C1 numerical behavior or C2 semantic identity.

Canonical contracts:

```text
msl-evidence-contract/1
msl-evidence-requirements/1
msl-evidence-stage/c3.0-1
msl-evidence-confidence/uncalibrated-1
```

C2 remains:

```text
msl-semantic-contract/2
```

## What C3.0 now guarantees

- exact five-signal production evidence registry;
- explicit per-signal deterministic requirements;
- `TO_BE_CALIBRATED` thresholds remain non-executable until approved calibration exists;
- factual scope-comparability truth table;
- EvidenceStage independent from SignalEligibility;
- production stage ceiling at `MOVEMENT_INDICATION`;
- no C3.0 promotion to preliminary/established/seasonality stages;
- deterministic suppression with null evidence-qualified value when prerequisites fail;
- one-member PRR suppressed rather than treated as defensible legacy `50`;
- uncalibrated confidence (`score=null`, `band=UNCALIBRATED`);
- exact frozen-value adapters with no C1 recomputation;
- append-only `history/signal_evidence_assessments.jsonl` persistence;
- deterministic assessment IDs and idempotent app orchestration;
- additive versioned evidence API;
- evidence qualification UI with suppression-first narrative gating;
- English/Indonesian evidence locale parity;
- C1/Rust numeric freeze and C2 semantic isolation preserved.

## Automated acceptance

Ignored artifact:

```text
dist/c3-0-acceptance/automated.json
```

Observed PASS gates include:
- focused evidence/storage/app/web/i18n suites;
- exact three C1 fixture SHA-256 fingerprints;
- Rust/numeric source diff freeze;
- C2 semantics source diff freeze and identity tests;
- full Cargo tests;
- release Rust worker build;
- full Go regression using the fresh release worker;
- git diff hygiene;
- tracked credential-pattern scan with zero matches;
- no generated acceptance `dist`/`.superpowers` artifact tracked.

## Staged native acceptance

Ignored artifact:

```text
dist/c3-0-acceptance/native.json
```

Candidate identity:

```text
version          = 0.3.0-alpha.6.5.3-preview.1
sourceHead       = 681bafb20676ebcc6cf625b0df6dd25cddd2a7af
installerSha256  = 058497EF7445B274CA389EB20B6A41FCAD63CB70355F5A6625005ABCDD6DA583
appSha256        = D20722759FF5D0AF3D859EE04D40DA5164BAB1725EED9BAB67A90CF283555B32
rustWorkerSha256 = 05C3720BCFA8D1F7C6032D13EEE648EEE5C943EE5523AD269100A3F2A30B875B
```

Observed staged health:

```text
applicationHost.status       = healthy
productionAnalytics.status   = healthy
productionAnalytics.engine   = rust-production
productionAnalytics.protocol = msl-analytics/2
```

The staged candidate returned the exact five evidence signal IDs and shipped the `#evidenceQualification` UI.

## Final review

Whole-branch review result:

```text
SPEC PASS
QUALITY PASS
Critical findings = 0
Important findings = 0
```

Review included gofmt, go vet, focused regressions, Rust/C2 source freezes, C3 boundary checks, no legacy DirectionStage authorization, no representative recomputation path, no legacy Coverage/Confidence relabeling, append-only ledger presence, evidence API isolation, suppression-first UI gating, no TODO/FIXME/HACK markers in the C3 source boundary, diff hygiene, and secret scan.

Full QA record:

`docs/qa/phase-c3-0-evidence-constitution-qa.md`

## Drive migration / executor truth

The project moved from F: to:

```text
E:\Market-Signal-Lab
```

Canonical active C3 worktree:

```text
E:\Market-Signal-Lab\dist\.worktrees\c3-evidence-calibrated-model-20260826-repaired
```

Agent Core is the active executor. The old copied `...20260824` C3 folder contains a stale F:-based `.git` pointer and is not the canonical worktree.

## Binding RC/final-product limitation

C3.0 staged-native closure does not claim literal installation of the current Setup.exe.

```text
currentSetupLiterallyInstalled = false
currentSetupUninstallVerified  = false
```

Before RC/final-product sign-off, replay the exact current Setup.exe from an Administrator session elevated normally through interactive Windows UAC, verify installed layout/health, then verify uninstall cleanup. Never bypass UAC.

## C3.1 gate

Do **not** start C3.1 automatically.

C3.1 requires a separate explicit design/implementation gate for deterministic signal v0.2 work such as:
- Competition Acceleration v0.2;
- Observed Directional Momentum Index (ODMI);
- Momentum Magnitude;
- PRR evidence envelope over an approved peer score;
- Author Concentration Change;
- Movement Index / Signed Movement Divergence.

C3.1 must not introduce statistically calibrated thresholds. C3.2 remains the offline calibration/research phase; C3.3 alone may activate approved calibrated production thresholds/confidence models.

## Exact next action

Stop C3.0 implementation here. Preserve this branch and evidence. If the user explicitly chooses to continue, begin with a separate C3.1 design/plan review from this verified C3.0 baseline. Do not merge `main` implicitly.