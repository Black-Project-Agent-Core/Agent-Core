# Market Signal Lab — RC Final Release Sign-off

**Checkpoint:** 2026-08-26 (Asia/Jakarta)
**Branch:** `hardening/rc-stability-20260823`
**Branch head before this documentation checkpoint:** `0c305390641baf3dd22ebca2e918cf2bdb6fb690`
**Verified product-source HEAD:** `498fedb0c11ee6c955306aca2199390af22cc0b8`
**Wave 1 checkpoint:** `docs/checkpoints/2026-08-23-MSL-RC-HARDENING-WAVE1.md`
**Wave 1 QA:** `docs/qa/rc-stability-hardening-wave1-qa.md`
**Release sign-off:** PASS / GO
**Release publication/tag:** NOT PERFORMED BY THIS CHECKPOINT

## Decision

```text
RC Stability Hardening Wave 1               COMPLETE / VERIFIED
Exact elevated Setup install+verify+uninstall COMPLETE / VERIFIED
Release sign-off                             PASS / GO
Formal release publication/tag               NOT PERFORMED
C3.3 calibrated production intelligence      BLOCKED BY EMPIRICAL DATA / NOT AUTHORIZED
```

The binding OS-level release gate is now closed. This checkpoint approves the exact Wave 1 candidate for formal release publication, but does not claim that a Git tag, GitHub release, merge to `main`, or external artifact publication has already occurred.

## Exact candidate identity

```text
version                  = 0.3.0-alpha.6.5.3-preview.1
sourceHead               = 498fedb0c11ee6c955306aca2199390af22cc0b8
installerSha256          = CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17
candidateAppSha256       = 79A6671A6016AC01DABC01FAB9BD368BC629B689539BC6FDF169072075C91358
packagedRustWorkerSha256 = D7D5AD35EF9D286F1B06BF486590C5C750C535876B3DA535EB8C588D800CF63F
```
## Elevated verifier execution

The non-elevated Remote Desktop Commander parent token was `DESKTOP-SO3G9NF\Ikbal` with `PROCESS_ELEVATED_ADMIN=False`. The verifier was then launched in a child Windows PowerShell using normal interactive UAC via `Start-Process -Verb RunAs`; no UAC bypass, scheduled-task elevation, COM auto-elevation, or equivalent workaround was used.

The elevated wrapper recorded `elevatedAdmin=true` and completed at `2026-08-26T11:55:06.8662085+07:00`.

Observed verifier results:

```text
applicationHost.status=healthy
productionAnalytics.status=healthy
productionAnalytics.engine=rust-production
productionAnalytics.protocol=msl-analytics/2
installedVersion=0.3.0-alpha.6.5.3-preview.1
installedSourceHead=498fedb0c11ee6c955306aca2199390af22cc0b8
installerSha256=CC4267431D2111D7F2B5F358987C0B411FAC2138084B2C67E893C2CAD63CAC17
installedAppSha256=79A6671A6016AC01DABC01FAB9BD368BC629B689539BC6FDF169072075C91358
installedRustWorkerSha256=D7D5AD35EF9D286F1B06BF486590C5C750C535876B3DA535EB8C588D800CF63F
uiLocaleSmoke=pass
uninstallCleanup=pass
```

Ignored machine evidence is under `dist/rc-hardening-wave1/elevated-release-gate.log` and `dist/rc-hardening-wave1/elevated-release-gate-result.json`.
## Independent post-cleanup check

A separate non-elevated post-run check after verifier completion observed:

```text
INSTALL_DIR_EXISTS=False
PORT_62830_LISTENERS=0
MSL_PROCESS_RESIDUE=0
```

This independently confirms Program Files cleanup, port release, and no Market Signal Lab / Rust-worker process residue after uninstall.

## Remaining project work

C3.0, C3.1, and C3.2 remain completed on their approved separate branches. C3.3 remains blocked until historical C3 evidence is joined with later-observed real outcomes, a `REAL_OUTCOME_LABELLED` dataset plus untouched holdout is formed, and an approved real `msl-calibration-artifact/1` is produced. There is no approved C3.4 roadmap item.

## Next exact action

```text
release sign-off = PASS / GO
-> formal release publication/tag may now proceed when explicitly requested
-> do not merge to main implicitly
-> keep C3.3 blocked until empirical calibration data and approved artifact exist
```

Extended multi-hour soak remains optional deeper hardening and is not retroactively claimed by this sign-off.