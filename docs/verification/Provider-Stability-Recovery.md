# Native provider recovery — 2026-10-29

## Scope and evidence

The user requested repair of Native provider stalls, at most two functional test invocations, TDD/SDD where useful, no benchmarks or unrelated work, and a scoped commit with architecture/release notes updated. Existing provider/model choice, authentication, quotas, explicit Continue after restart and stopped tasks remain controlling.

Read-only resident evidence and Raka's independent source review found Anthropic and Gonka in `HALF_OPEN` with `half_open_probe_count=1` and `retry_at_ms=NULL`. Individual credentials remained eligible while routing reported `provider-open`. No credentials were disclosed or provider request submitted. This establishes a local recovery defect; it does not establish an upstream service outage or safety refusal.

The state owner claims one half-open probe without a lease/release. The pool can leave that claim through cancellation, a checkpoint callback exception, qualification/context skips, request-scoped internal errors, or process shutdown. The next selection then stays blocked indefinitely, including across restart.

## Bounded acceptance and design

1. A half-open claim has a persisted finite deadline and revision identity, reused through the existing provider state/scheduler owners.
2. All post-selection exits release an abandoned claim in `finally`, without clearing outage history or recording success.
3. Active claims continue to exclude competing probes. Expired and old deadline-less claims become eligible through the owner; no manual production SQLite edit or constructor-wide reset is used.
4. Late outcomes/releases cannot close or release a newer probe. Ordinary requests started before the outage cannot overwrite a current probe either.
5. The claim deadline bounds qualification/completion through cancellation; callbacks returning after expiry cannot dispatch a new request.
6. Read-only diagnosis/health deadline reporting agrees with selection. Credential quota/auth/error handling and explicit model pinning remain in place.

Use real temporary SQLite state and the existing mocked provider protocol fixture. Invocation 1 targets only the new reproduction cases. Invocation 2 includes the relevant existing scheduler, pool, error/readiness and provider-wait tests. No live provider demonstration, benchmark, dependency installation, or repeated test after a clean run.

## Implementation and verification

The existing state owner now gives half-open selections a finite deadline and revision. Legacy NULL-deadline claims use their stored update time plus a bounded default lease. The pool bounds qualification/completion with that deadline and checks ownership before transport work. A `finally` covers callbacks, readiness, skips, completion, errors and cancellation. Release preserves HALF_OPEN and outage history; only an owned successful outcome closes it. Late probe and ordinary outcomes cannot change a current HALF_OPEN claim. Health remains a store-readability signal; its retry deadline projection and read-only route diagnosis agree with selection.

TDD invocation 1 reproduced four targeted failures in deadline/legacy recovery and cancel/checkpoint cleanup. Its fifth fixture initially expected a malformed provider response to be an internal request error; the observed classifier correctly treats it as a provider failure. That fixture was corrected to require retained OPEN/backoff state, rather than weakening real failure handling. Additional final cases cover invalid timer budgets and an expired callback that must dispatch no completion.

Invocation 2 passed **208 tests in six files**, 18.02 seconds. Native scheduler, pool, readiness, protocol, Anthropic and provider-wait cases ran; the requested nonexistent `agent-provider-errors.test.ts` pattern matched no file and is not counted as coverage. Logs: `runtime/launcher/provider-stability-red-20261029.log` and `provider-stability-green-20261029.log`. Root TypeScript compilation passed. No third test invocation was made. The user cap replaces the workflow's broad-suite/repeated-run examples.

`agent-skills:debugging-and-error-recovery` localized the actual resident state and missing lifecycle cleanup; `agent-skills:test-driven-development` supplied the failing reproduction and final regression run. Raka reviewed cancellation, stale ownership and deadline safety independently without editing or running tests. `mind-control` kept local recovery evidence separate from claims about upstream uptime. Comparative workflow benefit is unmeasured.

## Resident activation and limits

The six exact provider JS/map artifacts were backed up and installed while the old Core was stopped, using the existing cutover helper and one official restart worker invocation. The native executable and UI bundle were unchanged. Activation completed at `2026-10-29T09:24:11Z`; launcher PID17188 and Core PID6300, readiness `siap`, cold-start readiness 101 seconds, health `ok`, `dist` not stale. All six installed artifact hashes match their compiled candidates. [Activation evidence](Provider-Stability-Activation.json).

The new owner's read-only diagnosis reports the expired Anthropic claim as `available`, with three eligible persisted credential descriptors. Its stored historical failure remains `TRANSPORT_TRANSIENT`; the legacy row and failure history were not manually reset. Gonka's historical `PROVIDER_TRANSIENT` claim is likewise eligible under the same logic; its eighteen persisted descriptors are not a claim about current configured credentials or provider entitlement. These are local eligibility observations, not successful live model responses.

No Native instruction or Continue request was submitted for activation. Resident chat health reports zero running turns and one resumable turn. User control over continuation is preserved. No dependencies, grants, hooks or model selection were changed, and no benchmark or third functional test ran. External network/service availability, quota, account entitlement and a live model response remain outside the verified result. The release remains 1.6.0; this correction has an explicit pending patch intent and Unreleased changelog entry rather than inventing a published release.
