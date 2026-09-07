# Super-Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the code-review findings that weaken Super-Runtime's memory-governance, residency lifetime, provenance, failure-recovery, and Windows verification boundaries without regressing the frozen Milestone-1 behavior.

**Architecture:** Preserve the existing `MemoryLedger -> FileResidency -> DenseResidencyPolicy -> RuntimeEntry` layering. Strengthen invariants at boundaries: require bounded MoE views, expose mapped bytes only through active leases, make leases owner-lifetime-aware, distinguish finite versus cyclic dense traversal, reconcile GGML workspace requirements against admitted budget categories before execution, fail closed on dirty pinned substrate source, and make tests compile only where their platform contract is valid.

**Tech Stack:** C++17, CMake, GGML/llama.cpp pinned substrate, CTest, Bash contract tests, Windows MinGW/Ninja diagnostics, Cppcheck.

**Spec:** `docs/SUPER-RUNTIME-MASTER-CONTEXT.md` plus findings recorded by the 2026-09-05 code review.

## Global Constraints

- Systematic debugging: no production fix before root-cause evidence.
- TDD: observe a failing test before every production behavior change.
- Do not edit `research/references/*` source.
- No remote Git mutation.
- Preserve `v0.1.0` Milestone-1 semantics unless a test explicitly codifies a safer compatible contract.
- Linux remains the only file-residency execution backend in this hardening pass.
- Windows must build and run platform-neutral planner/accounting tests deterministically.
- Do not declare stable until build, tests, static analysis, provenance, and source-integrity checks pass.

---

### Task 1: Bounded MoE selector input

**Files:**
- Modify: `runtime/native/super_runtime/moe_residency.h`
- Modify: `runtime/native/super_runtime/moe_residency.cpp`
- Test: `runtime/native/tests/test_moe_residency.cpp`

**Interfaces:**
- `StridedExpertIds` gains `std::uint64_t data_bytes`.
- `plan_moe_residency()` returns `InvalidArgument` when any reachable selector element exceeds `data_bytes`.

- [ ] Add a test using valid pointer/stride/count metadata but `data_bytes` one byte shorter than the last reachable `int32_t`; expect `InvalidArgument` and empty ranges.
- [ ] Build/run the MoE test and confirm RED because current production code has no byte-bound field/check.
- [ ] Add `data_bytes` and validate `max_token_offset + max_slot_offset + sizeof(int32_t) <= data_bytes` with checked arithmetic before any selector read.
- [ ] Update all test initializers to provide the exact selector backing byte length.
- [ ] Run the focused MoE test and confirm GREEN.
- [ ] Commit locally: `fix(super-runtime): bound moe selector reads`.

### Task 2: Lease-safe mapped access and owner lifetime

**Files:**
- Modify: `runtime/native/super_runtime/file_residency.h`
- Modify: `runtime/native/super_runtime/file_residency.cpp`
- Modify: `runtime/native/super_runtime/dense_residency.h`
- Modify: `runtime/native/super_runtime/dense_residency.cpp`
- Test: `runtime/native/tests/test_file_residency.cpp`
- Test: `runtime/native/tests/test_dense_residency.cpp`

**Interfaces:**
- Remove public `FileResidency::data()`.
- `FileResidencyLease` exposes `const void * data() const noexcept` and `std::uint64_t size_bytes() const noexcept` only while its owner lifetime token is valid.
- Lease stores a weak/shared owner-lifetime sentinel rather than blindly dereferencing a stale raw owner pointer.
- `DenseResidencyPolicy` exposes `const void * active_data() const noexcept` only while an active layer lease exists.

- [ ] Add a file-residency test where a lease variable outlives the `FileResidency` scope; after owner destruction, `lease.active()` must be false, `lease.data()` must be null, and `lease.reset()` must be harmless.
- [ ] Confirm RED on current code (active remains true and reset can dereference dead owner).
- [ ] Add a test that runtime access comes from a lease rather than `FileResidency::data()`; update byte checks to use lease data.
- [ ] Implement an owner lifetime sentinel protected by a mutex; owner destructor invalidates the sentinel before tearing down mapping state, and lease reset/data check the sentinel before touching owner state.
- [ ] Remove public raw `FileResidency::data()` and route dense active data through the active lease.
- [ ] Update dense/file tests and production RuntimeEntry call sites to use the lease/policy access path.
- [ ] Run focused file/dense tests on Linux when available; on Windows compile platform-neutral portions after Task 6.
- [ ] Commit locally: `fix(super-runtime): make residency access lease-bound`.

### Task 3: Transactional dense completion and finite traversal

**Files:**
- Modify: `runtime/native/super_runtime/dense_residency.h`
- Modify: `runtime/native/super_runtime/dense_residency.cpp`
- Test: `runtime/native/tests/test_dense_residency.cpp`
- Modify: `runtime/native/super_runtime/runtime_entry.cpp`

**Interfaces:**
- Add `enum class DenseTraversal { Finite, Cyclic }`.
- `plan_dense_residency(..., DenseTraversal traversal = DenseTraversal::Cyclic, ...)` records traversal in the plan.
- `RuntimeEntry` uses `DenseTraversal::Finite`.
- Failed `complete()` releases the active lease and clears active ownership so `stop()` can retry cleanup rather than remaining permanently `Busy`.

- [ ] Add a two-slot finite traversal test with no pinned prefix; on the final layer, assert no wraparound prefetch of layer 0 and only the final layer's page is resident.
- [ ] Confirm RED because current code computes `(layer + 1) % layer_count` unconditionally.
- [ ] Add an adversarial completion test: acquire a second overlapping external lease after `prepare()`, call `complete()` and expect a residency error, release the external lease, then expect `stop()` to succeed instead of returning `Busy`.
- [ ] Confirm RED because current failure leaves `active_layer_` set.
- [ ] Implement traversal-aware lookahead and cursor behavior.
- [ ] Make completion clear active state before returning a release error, preserving resident bookkeeping for `stop()` retry.
- [ ] Switch RuntimeEntry plan construction to `Finite`.
- [ ] Run focused dense tests and confirm GREEN.
- [ ] Commit locally: `fix(super-runtime): harden dense traversal cleanup`.

### Task 4: Reconcile GGML workspace with admitted memory buckets

**Files:**
- Create: `runtime/native/super_runtime/runtime_workspace.h`
- Create: `runtime/native/super_runtime/runtime_workspace.cpp`
- Modify: `runtime/native/super_runtime/runtime_entry.cpp`
- Modify: `runtime/native/super_runtime/runtime_entry.h`
- Modify: `runtime/native/CMakeLists.txt`
- Create/Test: `runtime/native/tests/test_runtime_workspace.cpp`
- Test: `runtime/native/tests/test_runtime_entry.cpp`

**Interfaces:**
- `RuntimeWorkspaceRequirements { metadata_bytes, compute_buffer_bytes }`.
- `plan_cpu_dense_workspace(std::uint64_t width, RuntimeWorkspaceRequirements & out)` builds the same no-allocation GGML graph and calls `ggml_backend_alloc_ctx_tensors_from_buft_size()` before any compute-buffer allocation.
- Runtime admission requires `request.runtime_overhead_bytes >= metadata_bytes` and `request.compute_scratch_bytes >= compute_buffer_bytes`.
- `RuntimeTelemetry` records the two measured workspace requirements.

- [ ] Add a platform-neutral workspace test requiring nonzero metadata/compute requirements for width 32 and deterministic repeatability.
- [ ] Confirm RED because the workspace planner does not exist.
- [ ] Add Linux RuntimeEntry tests that under-provision runtime-overhead and compute-scratch separately and expect `BudgetRejected` before `Admitted` state publication.
- [ ] Confirm RED because current admission accepts arbitrary positive bucket estimates.
- [ ] Implement the workspace planner using the exact graph shape used by `run_dense_layer`; metadata reservation equals the arena size passed to `ggml_init`, compute requirement comes from `ggml_backend_alloc_ctx_tensors_from_buft_size()`.
- [ ] During `admit()`, calculate requirements and reject under-provisioned component buckets before creating persistent runtime resources.
- [ ] During `run_dense_layer()`, use the planned metadata arena size and verify the predicted compute-buffer size before allocation.
- [ ] Replace manual raw GGML cleanup with local RAII deleters so all failure exits free buffers/context.
- [ ] Update telemetry and fixture budgets to expose/cover real workspace requirements.
- [ ] Run workspace and RuntimeEntry focused tests; confirm GREEN.
- [ ] Commit locally: `fix(super-runtime): reconcile ggml workspace budget`.

### Task 5: Fail closed on dirty pinned llama.cpp source

**Files:**
- Create: `cmake/SuperRuntimePinnedGitSource.cmake`
- Modify: `CMakeLists.txt`
- Create/Test: `tests/contracts/pinned-source-cleanliness.cmake`

**Interfaces:**
- `super_runtime_verify_pinned_git_source(SOURCE_DIR EXPECTED_REVISION)` checks exact HEAD plus unstaged and staged tracked diffs.
- Untracked generated/build artifacts are not part of the pinned tracked-source identity gate.

- [ ] Write a CMake contract test that creates a tiny temporary git repository, commits one file, calls the helper with its HEAD and expects success, then modifies the tracked file and expects the helper subprocess to fail.
- [ ] Confirm RED because the helper module/function does not exist.
- [ ] Implement the helper with `git rev-parse HEAD`, `git diff --quiet`, and `git diff --cached --quiet` using explicit result checks.
- [ ] Replace the root inline HEAD-only logic with the helper.
- [ ] Run the contract test and a normal Super-Runtime configure against the clean pinned llama checkout; confirm GREEN.
- [ ] Commit locally: `build(super-runtime): verify pinned source cleanliness`.

### Task 6: Windows-safe native verification surface

**Files:**
- Modify: `runtime/native/CMakeLists.txt`
- Modify: `runtime/native/tests/test_moe_residency.cpp`
- Modify: `runtime/native/tests/test_dense_residency.cpp`
- Test/build: Windows CMake/Ninja full configured target set.

**Interfaces:**
- Planner-only portions of MoE and dense tests compile/run on all platforms.
- POSIX temp-file/GGML residency parity helpers are entirely under `#if defined(__linux__)`.
- `super-runtime-test-file-residency` and `super-runtime-test-runtime-entry` are registered only on Linux because production `FileResidency` is Linux-only.

- [ ] Use the current Windows full build as RED evidence (`fsync` undeclared in MoE/dense tests; RuntimeEntry test is Linux-only in behavior but registered globally).
- [ ] Move POSIX includes/helpers/parity-only functions under Linux guards while keeping generic planner assertions cross-platform.
- [ ] Gate file-residency and runtime-entry executables/tests under Linux in CMake.
- [ ] Configure with the installed MinGW toolchain and explicit `CMAKE_AR=gcc-ar.exe` / `CMAKE_RANLIB=gcc-ranlib.exe`, build all registered Super-Runtime test targets, and run CTest.
- [ ] Confirm Windows GREEN for platform-neutral targets.
- [ ] Commit locally: `test(super-runtime): make windows verification platform-safe`.

### Task 7: Pointer-alignment/static-analysis cleanup

**Files:**
- Modify: `runtime/native/super_runtime/runtime_entry.cpp`
- Test: Cppcheck command over `runtime/native/super_runtime/*.cpp`

**Interfaces:**
- Runtime consumes `DenseResidencyPolicy::active_data()` as `const void *`, validates alignment to `alignof(float)`, then converts from `const void *` to `const float *` without byte-pointer reinterpretation.

- [ ] Run Cppcheck and capture the current `invalidPointerCast` at the mapped byte-to-float conversion as RED evidence.
- [ ] Route pointer acquisition through active lease data, check `reinterpret_cast<std::uintptr_t>(ptr) % alignof(float) == 0`, then `static_cast<const float *>(ptr)`.
- [ ] Run Cppcheck again; require no warning/error from Super-Runtime production files.
- [ ] Commit locally: `fix(super-runtime): validate mapped weight alignment`.

### Task 8: Final stable verification and documentation

**Files:**
- Modify: `docs/STABILITY-AUDIT-MILESTONE-1.md` only if wording must clarify that hardening is post-v0.1.0 evidence rather than rewriting historical audit facts.
- Create: `docs/STABILITY-AUDIT-HARDENING-2026-09-05.md`

**Interfaces:**
- New audit document records exact commands/evidence and the scope of the stable hardening declaration.

- [ ] Run clean source-status checks for the worktree and both pinned research submodules.
- [ ] Run Windows CMake configure/build/CTest for all registered Windows targets.
- [ ] Run Cppcheck with warning/performance/portability/error checks enabled.
- [ ] On a Linux-capable environment if available, run the six Milestone-1 native CTests plus `benchmarks/test-memory-ceiling.sh`; if no Linux environment exists, do not fabricate that evidence and keep the Stable declaration scoped to freshly verified Windows/static checks plus the unchanged historical Linux audit.
- [ ] Run `git diff --check`.
- [ ] Review the complete branch diff for accidental changes outside `SubProject/Super-Runtime`.
- [ ] Write `docs/STABILITY-AUDIT-HARDENING-2026-09-05.md` with root causes, fixes, exact verification results, and explicit unsupported/deferred scope.
- [ ] Commit locally: `docs(super-runtime): record hardening stability audit`.
- [ ] Only after all required gates are green, declare the hardening branch stable for the verified scope.
