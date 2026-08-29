# MSL RC Stability Hardening Wave 1 Design

**Status:** APPROVED BY CONTINUATION AUTHORITY
**Date:** 2026-08-23
**Base:** `integration/c2-ts01-rc-baseline-20260823@64fc693ade90bfafbbd4b3f6799b835d2e402e9a`
**Branch:** `hardening/rc-stability-20260823`

## Purpose

Harden the combined C2 + TS0/TS1 RC baseline against process interruption and reproducibility failures without changing C1 numerical semantics, the C2 semantic contract, or the approved TypeScript ownership boundary.

This wave does not declare a formal release. The elevation-bound Setup.exe install/uninstall replay and extended soak remain release gates after this wave.

## Frozen ownership

- Go remains host, API, storage, security, credentials, and lifecycle owner.
- Rust remains mandatory production analytics under `msl-analytics/2`.
- TypeScript remains limited to the approved analytics-engine UI pilot.
- Bun remains development/build/test tooling only and is never packaged.
- Python Quant Lab and C++ accelerator remain future phases.

## Interrupted-run semantics

A persisted `MarketMapRun` with status `running` cannot be resumed safely after the owning application process has exited. External requests may already have completed while in-memory telemetry, worker state, and stage ownership are gone.

On a new owned runtime:

1. read the latest persisted market-map runs;
2. for every stale `running` run, append a new version of the same run ID;
3. set status to `failed`;
4. set `completedAt` to recovery time;
5. append the stable error text `market map interrupted by previous application exit` exactly once;
6. preserve all request/target/observation/product/author counts and all collected observation ledgers;
7. do not synthesize direction, confidence, ranking success, or missing work;
8. do not delete partial observations.

A failed recovered run remains excluded from completed/partial comparison eligibility by the existing ranking/history rules.

## Recovery ownership boundary

Recovery is an application lifecycle action, not a storage migration. `storage.Open` must not mutate `running` runs because a second process can open the same data root before it has proven runtime ownership.

The Go CLI may invoke recovery only after it has established ownership for the operation:

- `serve`: after the TCP listener is successfully acquired and before serving HTTP;
- `market-map`: immediately before the explicit headless run, after refusing the normal same-port live-instance conflict.

Service construction itself stays side-effect free with respect to run status.

Recovery must be idempotent. Calling it twice after the first successful reconciliation performs no additional append for the already-terminal run.

## Frontend byte reproducibility

`frontend/src/analytics_engine.ts` remains the only manual source of the approved pilot and `internal/web/assets/js/analytics_engine.js` remains generated output.

Create `.gitattributes` and pin only the generated pilot asset to LF:

```text
internal/web/assets/js/analytics_engine.js text eol=lf
```

Do not normalize unrelated JS files in this wave. A fresh TypeScript emit and the checked-out generated asset must be byte-identical after the pin.

## Installer verifier robustness

The RC verifier remains fail-closed, but cleanup timing must not create false product failures.

- add bounded `Wait-PortReleased` polling to shared Windows installer helpers;
- use it after stopping the owned MSL process and after uninstall cleanup;
- keep `Wait-PathRemoved` bounded polling;
- preserve the primary verification error if cleanup also fails;
- remove unreachable post-`Wait-PathRemoved` binary-removal checks from the lifecycle verifier;
- keep exact Setup/app/worker hashes, `sourceHead`, health, C2 UI/locale, TS-generated asset, and uninstall cleanup assertions.

No elevation bypass is introduced.

## Native hardening acceptance

After product/tooling changes, build a new candidate and assign new hashes. Previous integrated candidate hashes become historical evidence.

Required non-elevated hardening evidence:

- process-interruption test: start Quick, observe real progress, terminate only the owned host, restart on the same data root, and prove the interrupted run becomes `failed` with the recovery reason;
- start a new Quick on the recovered data root and require terminal `completed`;
- run five additional sequential Quick maps and require all to complete with zero product errors;
- require Rust production runtime on every restart;
- require no Bun runtime/package tree;
- rerun the 10x Rust hard-failure restart regression;
- record resource/process counts and scan durations without raw market payloads.

## Still pending after Wave 1

Wave 1 completion is not stable-release sign-off. The following remain binding:

1. exact new Setup.exe install + health + UI/locale + uninstall replay from a pre-elevated Administrator PowerShell session, with no `-KeepInstalled` and no UAC bypass;
2. upgrade/reinstall preservation against the prior accepted installer where applicable;
3. extended resource soak beyond the bounded repeated-scan lane;
4. any Critical/Important finding from final review.

C3 and TS2+ remain unstarted until the RC baseline is signed off.

## Anti-duplication and evidence rules

- no second run-recovery engine in TypeScript, Rust, or Python;
- no new analytics computation in Go during recovery;
- no raw Envato token or raw market payload in QA evidence;
- no destructive migration of historical observations;
- no weakening C1 fixtures, Rust wire/protocol, C2 semantic aliases, `minOpportunity`, or `value="opportunity"` compatibility;
- any packaged-byte change requires new installer/app/worker hashes and affected native acceptance to be repeated.
