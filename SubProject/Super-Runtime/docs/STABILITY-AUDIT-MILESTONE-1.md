# Super-Runtime Milestone 1 Stability Audit

Status: **PASS — Milestone 1 Stable Core**

Stable version: `0.1.0`

Release tag: `super-runtime-v0.1.0`

Audit date: `2026-09-01`

Canonical repository: `Black-Project-Agent-Core/Agent-Core`

Audited implementation SHA: `e74ae68d785902003697eda910786e1b75a5c049`

Pinned llama.cpp/GGML revision: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

## Verdict

Milestone 1 is accepted as a stable **first runnable native core**.

The stability claim is intentionally scoped. It means the frozen Milestone-1 contracts are implemented, tested, audited, and canonicalized. It does **not** mean Super-Runtime is a production-GA universal inference product yet.

The stable core now has one executable lifecycle that composes:

```text
pinned llama.cpp/GGML CPU substrate
        ↓
global RuntimeBudgetPlan
        ↓
MemoryLedger hard admission
        ↓
Linux stable-address FileResidency
        ↓
RAII FileResidencyLease reclaim protection
        ↓
DenseResidencyPolicy / generic MoE range planning
        ↓
GGML CPU execution
        ↓
telemetry + independent correctness oracle
        ↓
cancellation-safe cleanup
        ↓
unload with zero runtime-owned bytes
```

## Definition-of-Done audit

| Gate | Evidence | Result |
| --- | --- | --- |
| Native Super-Runtime source exists | `runtime/native/super_runtime/*` | PASS |
| Controlled/pinned GGML CPU substrate builds | native substrate contract + revision check | PASS |
| Deterministic fixture loads through runtime path | `RuntimeEntry::load()` fixture lifecycle | PASS |
| Memory ledger active | `MemoryLedger` unit/concurrency tests | PASS |
| Infeasible reservations refused | ledger + context-heavy runtime budget tests | PASS |
| Stable file-backed residency active | `FileResidency` mapping/refault tests | PASS |
| Dense residency executes correctly | real GGML dense fixture, one/two-slot modes | PASS |
| MoE selected-range residency executes correctly | real `GGML_OP_MUL_MAT_ID` fixture | PASS |
| Required range READY before dereference | explicit `prepare()`/prefetch readiness gates | PASS |
| Leased ranges cannot be reclaimed early | RAII lease + external reclaim adversarial tests | PASS |
| Output matches correctness oracle | runtime-entry vs independent manual oracle | PASS |
| RSS/residency telemetry reported | FileResidency RSS + cgroup-v2 `memory.peak` evidence | PASS |
| Cleanup/unload releases runtime ownership | cancellation + unload ledger-zero assertions | PASS |
| Native tests pass | CTest 6/6 plus 100x repeated native paths | PASS |
| Sanitizer checks pass | ASan/UBSan on file, dense, MoE, budget, runtime entry | PASS |
| Agent-Core regression remains green | 137 test files / 668 tests | PASS |
| Agent-Core build remains green | `npm run build` | PASS |
| Implementation committed and canonical | `origin/main` contains audited implementation SHA | PASS |

## Fresh audit evidence

### Native release suite

```text
super-runtime-memory-ledger       PASS
super-runtime-moe-residency       PASS
super-runtime-dense-residency     PASS
super-runtime-runtime-budget      PASS
super-runtime-runtime-entry       PASS
super-runtime-file-residency      PASS

6 / 6 CTest PASS
```

Each non-smoke native behavioral target was also repeated 100 times during the final audit without failure.

### Correctness

Dense fixture:

```text
two-slot max_abs_diff = 0
one-slot max_abs_diff = 0
```

MoE fixture:

```text
GGML MUL_MAT_ID max_abs_diff = 0
```

Unified runtime fixture against an independent manual matrix-vector oracle:

```text
runtime-vs-oracle max_abs_diff = 2.91038e-11
acceptance threshold           = 1e-6
```

### Lease/reclaim hardening

The stability audit found one real pre-release gap: safe-point sequencing existed, but `FileResidency::release()` could still be called externally against an active range.

That gap was closed before the stable label:

```text
READY range
   ↓
acquire FileResidencyLease
   ↓
LEASED / active
   ↓
external release attempt -> InUse
   ↓
no MADV_DONTNEED
no ledger mutation
   ↓
compute safe point
   ↓
RAII lease reset/destruction
   ↓
release allowed
```

`DenseResidencyPolicy::prepare()` now acquires the current-range lease and `complete()` releases it only at the explicit safe point.

### Hard memory ceiling

The acceptance harness is backed by delegated Linux cgroup v2, not a virtual-address `ulimit` approximation.

Fresh runtime-entry evidence under a real ceiling:

```text
enforcement_backend = cgroup-v2-delegated
memory.max           = 134217728 bytes (128 MiB)
memory.swap.max      = 0
classification       = success
output_parity        = PASS
process_exit_code    = 0
```

The harness self-test also verifies fail-closed unsupported-host behavior, runtime-failure classification, parity-failure classification, and a deliberate cgroup OOM path.

### Sanitizers

Fresh ASan/UBSan executions passed for:

```text
FileResidency
DenseResidencyPolicy
MoE residency planner fixture
RuntimeBudgetPlan
RuntimeEntry
```

### Parent repository regression

Fresh Agent-Core verification after lease hardening:

```text
137 test files PASS
668 tests PASS
38 skipped
npm run build PASS
git diff --check PASS
```

## Stable scope

Version `0.1.0` is stable for this Milestone-1 contract:

- CPU-first native execution boundary;
- pinned llama.cpp/GGML substrate;
- deterministic runtime budget admission;
- runtime-owned memory accounting;
- Linux stable-address file residency;
- READY/prefetch semantics;
- RAII reclaim protection for active ranges;
- fixed-order dense residency policy;
- generic selected-expert MoE range planning and GGML parity proof;
- unified deterministic runtime lifecycle;
- cancellation-safe cleanup;
- telemetry and hard cgroup-v2 acceptance tooling.

## Explicitly outside the v0.1.0 stability claim

The following are **not** implied by the Stable label and remain future work unless a new task explicitly activates them:

- broad real-world GGUF/model compatibility certification;
- arbitrary Kimi K3 or other huge checkpoint acceptance;
- Windows file-residency backend;
- GPU staging/offload/runtime policy;
- asynchronous storage/computation overlap;
- production MoE scheduler-hook integration around arbitrary real model graphs;
- HTTP/OpenAI-compatible/provider APIs;
- OpenClaw, Hermes, Odysseus, or other AI-tool integrations;
- large-model latency/throughput claims;
- production-GA operational support guarantees.

## Release rule

Future work must not silently redefine what `Stable v0.1.0` proved. New capabilities belong to a later version/milestone and require their own executable evidence.

If a future change invalidates a v0.1.0 invariant, it must be treated as a regression and fixed before a newer stable release is declared.
