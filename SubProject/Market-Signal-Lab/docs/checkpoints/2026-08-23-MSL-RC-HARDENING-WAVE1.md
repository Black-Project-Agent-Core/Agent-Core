# Market Signal Lab — RC Stability Hardening Wave 1 Complete

> **Historical checkpoint:** the status, pending actions, machine paths, branch names and verification below belong to the dated revision. For the imported monorepo source and continuation boundary, use [CONTINUE_MSL.md](CONTINUE_MSL.md). This record is preserved as evidence and does not authorize resuming old work or certify the current checkout.

**Checkpoint:** 2026-08-26 (Asia/Jakarta)
**Branch:** `hardening/rc-stability-20260823`
**Verified product-source HEAD:** `498fedb0c11ee6c955306aca2199390af22cc0b8`
**QA:** `docs/qa/rc-stability-hardening-wave1-qa.md`
**Plan:** `docs/superpowers/plans/2026-08-23-msl-rc-stability-hardening-wave1.md`
**Formal release:** NOT RELEASED

## Current truth

```text
Task 1 interrupted-run recovery        COMPLETE / REVIEWED
Task 2 generated-byte determinism      COMPLETE / REVIEWED
Task 3 verifier cleanup robustness     COMPLETE / REVIEWED
Task 4 automated + native hardening    COMPLETE / VERIFIED
Task 5 QA / native repeated lane       COMPLETE / VERIFIED
RC Stability Hardening Wave 1          COMPLETE / VERIFIED
Exact elevated Setup install+uninstall PENDING / EXTERNAL OS GATE
Formal release                          NOT RELEASED
```

## Final Wave 1 candidate

```text
version                  = 0.3.0-alpha.6.5.3-preview.1
sourceHead               = 498fedb0c11ee6c955306aca2199390af22cc0b8
installerSha256          = CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17
candidateAppSha256       = 79A6671A6016AC01DABC01FAB9BD368BC629B689539BC6FDF169072075C91358
packagedRustWorkerSha256 = D7D5AD35EF9D286F1B06BF486590C5C750C535876B3DA535EB8C588D800CF63F
```

The candidate bytes are generated/ignored under `dist/rc-hardening-wave1/`. Later documentation-only commits do not change the embedded `sourceHead` above and must not be substituted for it.

## Acceptance highlights

- frontend typecheck/tests/generated drift PASS;
- two consecutive generated frontend builds byte-identical;
- C1/C2 Rust/numeric freeze PASS;
- all three C1 fixture hashes exact;
- release Rust worker PASS;
- full Go PASS against real Rust worker;
- hard-failure worker restart test x10 PASS;
- full Rust release suite PASS;
- Windows installer build PASS;
- staged-runtime ownership PASS: healthy / rust-production / msl-analytics/2, Rust descendant=1, Bun/Node=0;
- credential source/fingerprint safe and stable;
- live interruption at 1/21 reconciled to failed with exact stable reason and unchanged counters;
- recovery Quick PASS 21/21, 0 warnings/errors;
- five additional Quick runs on same host/data root PASS 21/21, 0 warnings/errors;
- no zombie `running` state and port cleanup PASS.

Exact run IDs and resource observations are recorded in the QA file. Ignored machine evidence remains under `dist/rc-hardening-wave1/`.

## Remaining binding release gate

The current execution token is not Administrator. The exact candidate Setup.exe has **not** been literally installed/uninstalled by this Wave 1 session.

Before RC/final product sign-off, run `scripts/verify-windows-installer.ps1` from a normal pre-elevated Administrator PowerShell obtained through interactive Windows UAC, using the exact candidate identity above, without `-KeepInstalled`. No UAC bypass, scheduled-task elevation, COM auto-elevation, or equivalent workaround is allowed.

## Other project lanes

C3 work progressed separately and is not merged into this hardening branch:

```text
C3.1 final branch = task/c3-1-deterministic-signal-v02-20260826
C3.1 final remote = 8f8f89698ec10f60b190eb4f9683e5518c3f6c2b
C3.2 final branch = task/c3-2-quant-calibration-lab-20260826
C3.2 final remote = b40e1b917e43ea42cae5a28690b089a68411048d
C3.3              = BLOCKED BY EMPIRICAL DATA / NOT AUTHORIZED
```

Do not merge or rebase these lanes implicitly. C3.3 may not instantiate calibrated production thresholds/confidence/stage promotion until a real outcome-labelled approved `msl-calibration-artifact/1` exists.

## Next exact action

```text
Wave 1 stops here: COMPLETE / VERIFIED
-> publish hardening branch after final whole-branch regression
-> exact elevated Setup.exe install/uninstall verifier remains the only immediate release-signoff OS gate
-> if that gate passes, record the result in a new release-signoff checkpoint before any formal release claim
-> extended multi-hour soak remains optional deeper hardening; do not retroactively call this short lane leak-free
-> do not merge main implicitly
```
