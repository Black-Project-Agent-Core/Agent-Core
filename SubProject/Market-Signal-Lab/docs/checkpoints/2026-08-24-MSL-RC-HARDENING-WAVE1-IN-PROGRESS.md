# Market Signal Lab — RC Stability Hardening Wave 1 — In Progress

**Checkpoint:** 2026-08-24 (Asia/Jakarta)
**Branch:** `hardening/rc-stability-20260823`
**Base integrated RC:** `64fc693ade90bfafbbd4b3f6799b835d2e402e9a`
**Current hardening HEAD:** `807a9f02eadc448f75b0ecb1ed594a69f2e12f62`
**Plan:** `docs/superpowers/plans/2026-08-23-msl-rc-stability-hardening-wave1.md`
**Design:** `docs/superpowers/specs/2026-08-23-msl-rc-stability-hardening-wave1-design.md`
**Execution device:** Desktop Commander Instance 02 / `4a096b78-6829-47be-8ee6-1de326c455e1`
**Formal release:** NOT RELEASED

## Why this checkpoint exists

This is the rolling, tracked continuation state for RC hardening. Update it after every reviewed hardening task so another session can resume from repository evidence rather than chat memory.

The integrated RC baseline remains historically verified. Wave 1 is allowed to change product bytes, so its final installer/app/worker hashes must be rebuilt and re-accepted; do not reuse the pre-hardening RC hashes as the final Wave 1 candidate identity.

## Current task state

```text
Task 1 interrupted-run recovery       COMPLETE / REVIEWED
Task 2 generated-byte determinism     COMPLETE / REVIEWED
Task 3 verifier cleanup robustness    COMPLETE / REVIEWED
Task 4 automated + native hardening   NOT STARTED
Task 5 QA / whole-branch / publish    NOT STARTED
Elevated Setup install+uninstall      STILL PENDING / NO UAC BYPASS
C3 / TS2+                             NOT STARTED / NOT AUTHORIZED
```

### Task 1 — complete

Implementation: `87b9d50d540cfc4b5eeb7d8ac21236c6e4cf4e26`.
Coverage was narrowed and strengthened through `383a751`, with running-version diagnostic pinned at `802ff23`.
Independent reviewer Important coverage gap is ADDRESSED; scoped rereview found 0 new Critical / 0 new Important.

Persisted `running` Market Autopilot runs from a previous application exit are reconciled to `failed` with stable reason `market map interrupted by previous application exit`, without inventing analytics or modifying existing counters/observations. Serve-side recovery occurs only after listener ownership succeeds; headless `market-map` refuses a confirmed live same-port MSL instance before reconciliation.

### Task 2 — complete / reviewed

Implementation commit: `263e11f627bb228955262050b20063420ea0def5`.

Root cause was checkout representation, not TypeScript emit: `tsc` already emits LF, but `core.autocrlf=true` materialized the generated `analytics_engine.js` as CRLF without a path-specific rule. The fix adds only:

```text
internal/web/assets/js/analytics_engine.js text eol=lf
```

in `.gitattributes`, plus a Go build-contract test. The tracked generated-JS blob did not change. Post-normalization repeated build hashes are byte-identical and Bun/typecheck/frontend tests/generated-drift gates passed. Independent review found one Important missing `newLine=lf` contract. Review fix `024e80d739bc6cd10e6d7d7ac9ea1b96c58f947e` pins `compilerOptions.newLine == "lf"` and requires `.gitattributes` to contain exactly the single active generated-asset rule. Mutation RED + GREEN gates passed; scoped rereview: IMPORTANT ADDRESSED, 0 new Critical / Important / Minor.

Retained Wave 1 sign-off item: ensure automation/CI actually executes the Go frontend build-contract test when `.gitattributes` or the contract test changes; current frontend CI runs Bun-only gates.

### Task 3 — complete / reviewed

Initial implementation: `afbfec9f398ae8c126f7d36b62211868f0e645d0`. Review fix: `9db52d0b662bdd943d48b9141aaa988e7d476e38`. Final contract guard: `807a9f02eadc448f75b0ecb1ed594a69f2e12f62`.

`Wait-PortReleased` now provides bounded port-release polling. Lifecycle cleanup preserves the primary verification error when cleanup also fails, while cleanup-only failure remains fail-closed. RC contracts pin both post-stop and post-uninstall port-release waits, and the helper's early-return plus warn-without-rethrow behavior are mutation-guarded. Scoped rereview: prior Important findings ADDRESSED, 0 new Critical / 0 new Important. All three installer contract suites pass.

## Next exact action

```text
Task 4 full automated regression + rebuilt hardening native candidate
-> interruption/restart recovery acceptance + repeated real Quick scans
-> update checkpoint
-> Task 5 QA + whole-branch review + final verification + publish hardening branch
-> exact elevated Setup.exe install/uninstall replay remains a separate OS gate
```
