# Residency Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove a reusable Super-Runtime residency seam on top of the approved llama.cpp/GGML substrate without implementing streaming separately for every model family.

**Architecture:** Keep llama.cpp/GGML responsible for model graphs and kernels. Add a Super-Runtime-owned residency layer that observes operation/tensor access requirements, enforces a deterministic host-memory ledger, and stages or releases backing ranges while preserving graph correctness. Start with CPU and synthetic/small fixtures; optional GPU staging follows only after CPU residency semantics are proven.

**Tech Stack:** C/C++, llama.cpp/GGML, CMake, native Linux virtual-memory APIs for the first residency prototype, Python only for benchmark/fixture analysis.

**Spec:** `docs/architecture/SUPER-RUNTIME-FOUNDATION.md`

## Global Constraints

- Super-Runtime runtime core is the only active implementation target; downstream AI-tool repositories are out of scope until a later integration phase.
- llama.cpp/GGML is the approved production compute/model substrate.
- CPU execution is mandatory; GPU acceleration is optional.
- No model-family-specific streaming architecture unless the generic substrate cannot express a required semantic.
- A memory budget must be validated by measured process/device memory, not only planned arena sizes.
- Core correctness tests must run without multi-hundred-gigabyte or terabyte checkpoints.
- Python must not enter the per-token inference hot path.

---

### Task 1: Establish a vendored/forked native substrate boundary

**Files:**
- Create: `runtime/native/README.md`
- Create: `tests/contracts/native-substrate.sh`
- Modify: top-level build configuration created with the native runtime scaffold

**Interfaces:**
- Consumes: pinned llama.cpp research revision from `research/references/llama.cpp`
- Produces: one documented native-substrate revision and a build/test entry point that later residency work can target

- [x] **Step 1: Write the failing contract test**

Create `tests/contracts/native-substrate.sh` that exits non-zero unless the production native-substrate location exists, reports a pinned upstream revision, and exposes a build target capable of compiling a CPU-only GGML/llama smoke binary.

- [x] **Step 2: Run the contract test and verify RED**

Run: `bash tests/contracts/native-substrate.sh`
Expected: FAIL because the production native substrate has not been established.

- [x] **Step 3: Establish the minimal production substrate boundary**

Create `runtime/native/README.md` documenting the exact upstream baseline, local patch policy, license/provenance obligations, and the command used to build the CPU smoke target. Do not yet add residency behavior.

- [x] **Step 4: Build and run the smoke target**

Run the documented CPU-only configure/build command and `bash tests/contracts/native-substrate.sh`.
Expected: PASS with the pinned substrate revision reported.

- [x] **Step 5: Commit**

Commit message: `build: establish native runtime substrate`

### Task 2: Add deterministic memory-ledger contracts

**Files:**
- Create: `runtime/native/super_runtime/memory_ledger.h`
- Create: `runtime/native/super_runtime/memory_ledger.cpp`
- Create: `runtime/native/tests/test_memory_ledger.cpp`

**Interfaces:**
- Produces: `MemoryLedger`, with explicit categories for resident weights, context state, compute scratch, staging, accelerator memory, and runtime overhead

- [x] **Step 1: Write failing ledger tests**

Tests must cover reservation success, reservation refusal above a hard limit, release, category totals, integer-overflow rejection, and invariant `owned <= budget` after every accepted mutation.

- [x] **Step 2: Run the focused test and verify RED**

Expected: compilation/test failure because `MemoryLedger` does not exist.

- [x] **Step 3: Implement the smallest thread-safe ledger satisfying the tests**

No cache policy or OS memory calls belong in this task.

- [x] **Step 4: Run focused and native baseline tests**

Expected: ledger tests PASS and the unmodified substrate smoke tests remain PASS.

- [x] **Step 5: Commit**

Commit message: `feat: add runtime memory ledger`

### Task 3: Build a stable-address file-backed residency fixture

**Files:**
- Create: `runtime/native/super_runtime/file_residency.h`
- Create: `runtime/native/super_runtime/file_residency.cpp`
- Create: `runtime/native/tests/test_file_residency.cpp`

**Interfaces:**
- Consumes: `MemoryLedger`
- Produces: a file-backed range object whose virtual address remains stable while resident-page policy can request prefetch/release for aligned byte ranges

- [ ] **Step 1: Write failing tests**

Use a temporary file with deterministic bytes. Verify that the mapped base address remains unchanged across prefetch/release cycles, bytes are correct after refault, invalid ranges fail, and ledger ownership cannot exceed its configured budget.

- [ ] **Step 2: Run tests and verify RED**

Expected: failure because the residency object does not exist.

- [ ] **Step 3: Implement Linux prototype semantics**

Use file-backed mapping and page-aligned advisory residency operations. Do not use `munmap` for reusable eviction ranges. Keep platform-specific calls behind the residency abstraction.

- [ ] **Step 4: Run tests and capture RSS evidence**

Run the unit test plus a bounded fixture that touches/releases pages and records `/proc/self/status` or equivalent RSS evidence. Treat RSS drops as observational evidence; functional correctness must not depend on exact kernel reclaim timing.

- [ ] **Step 5: Commit**

Commit message: `feat: add file-backed residency primitive`

### Task 4: Prove generic MoE expert-ID residency interception

**Files:**
- Create: `runtime/native/super_runtime/moe_residency.h`
- Create: `runtime/native/super_runtime/moe_residency.cpp`
- Create: `runtime/native/tests/test_moe_residency.cpp`

**Interfaces:**
- Consumes: GGML `MUL_MAT_ID` semantics, `MemoryLedger`, file residency primitive
- Produces: a planner that converts selected expert IDs and tensor strides into required byte ranges without model-family-specific routing code

- [ ] **Step 1: Write adversarial failing tests**

Construct selected-ID sets with duplicates, unsorted IDs, adjacent experts, sparse experts, and out-of-range IDs. Require deduplicated/coalesced byte ranges and hard rejection of invalid IDs.

- [ ] **Step 2: Run and verify RED**

Expected: failure because the expert residency planner does not exist.

- [ ] **Step 3: Implement ID-to-range planning independent of Kimi/Qwen/DeepSeek**

The planner may use tensor shape/stride metadata only; it must not inspect a model-family enum to decide which expert slices to fetch.

- [ ] **Step 4: Run tests and a GGML `MUL_MAT_ID` parity fixture**

Compare output from fully resident expert weights with the residency-driven fixture. Expected: identical output within the substrate's declared numeric contract.

- [ ] **Step 5: Commit**

Commit message: `feat: plan moe expert residency from ggml ids`

### Task 5: Prove fixed-order dense layer residency

**Files:**
- Create: `runtime/native/super_runtime/dense_residency.h`
- Create: `runtime/native/super_runtime/dense_residency.cpp`
- Create: `runtime/native/tests/test_dense_residency.cpp`

**Interfaces:**
- Consumes: ordered tensor/layer access trace and the file residency primitive
- Produces: deterministic pinned-prefix plus bounded-ring policy for cyclic fixed-order walks

- [ ] **Step 1: Write failing policy tests**

Use a synthetic ordered layer trace. Require deterministic pin count, no budget overshoot, one-slot synchronous safety, two-slot look-ahead eligibility, and a predictable hit ratio for the pinned prefix.

- [ ] **Step 2: Run and verify RED**

Expected: failure because the dense policy does not exist.

- [ ] **Step 3: Implement the minimal policy**

Do not introduce ordinary LRU for the fixed cyclic layer walk.

- [ ] **Step 4: Run parity and budget tests**

Verify the same synthetic computation with resident and residency-managed layer weights, plus memory-ledger invariants.

- [ ] **Step 5: Commit**

Commit message: `feat: add fixed-order dense residency policy`

### Task 6: Add a global runtime budget planner

**Files:**
- Create: `runtime/native/super_runtime/runtime_budget.h`
- Create: `runtime/native/super_runtime/runtime_budget.cpp`
- Create: `runtime/native/tests/test_runtime_budget.cpp`

**Interfaces:**
- Consumes: model memory breakdown, context-memory estimate, compute/scratch estimate, device inventory, configured memory ceiling
- Produces: an explicit allocation plan for fixed costs, context/state, dense residency, MoE residency, staging, and safety reserve

- [ ] **Step 1: Write failing tests for feasible and infeasible plans**

Include a case where weights fit but context state makes the request infeasible. The planner must refuse rather than silently exceed budget.

- [ ] **Step 2: Run and verify RED**

Expected: failure because the planner does not exist.

- [ ] **Step 3: Implement deterministic planning**

Prioritize mandatory state/fixed costs before discretionary weight caches. Keep dense-vs-MoE allocation policy explicit and inspectable.

- [ ] **Step 4: Run all native tests**

Expected: all prior tests plus budget planner PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add global runtime budget planner`

### Task 7: Add external memory-ceiling acceptance harness

**Files:**
- Create: `benchmarks/memory-ceiling.sh`
- Create: `benchmarks/README.md`

**Interfaces:**
- Consumes: a runtime smoke/inference command and requested memory ceiling
- Produces: machine provenance, exit classification, measured peak RSS, and output-parity evidence across ceilings

- [ ] **Step 1: Write harness self-checks that fail without real enforcement**

On Linux, require working cgroup-v2/systemd or an explicitly implemented alternative. A missing enforcement mechanism must abort the benchmark instead of running unconstrained.

- [ ] **Step 2: Verify RED in the current Codespace environment**

Current research predicts `systemd-run --user` will fail because the user session bus is unavailable; the harness must report this as unsupported rather than fabricate a memory-ceiling result.

- [ ] **Step 3: Implement the supported-host execution path**

Use a real memory ceiling with swap disabled, classify OOM separately from runtime failure, and capture machine/runtime provenance.

- [ ] **Step 4: Run harness self-tests**

Verify unsupported hosts fail closed and a suitable Linux host produces bounded evidence.

- [ ] **Step 5: Commit**

Commit message: `bench: add hard memory ceiling harness`

### Task 8: Add a minimal native runtime smoke entrypoint

**Files:**
- Create: `runtime/native/super_runtime/runtime_entry.h`
- Create: `runtime/native/super_runtime/runtime_entry.cpp`
- Create: `runtime/native/tests/test_runtime_entry.cpp`

**Interfaces:**
- Consumes: native model lifecycle, budget planner, residency engine, and inference boundary
- Produces: one minimal test/CLI-callable runtime entrypoint that exercises load -> admit -> execute -> report -> unload without any downstream AI-tool dependency

- [ ] **Step 1: Write a failing end-to-end native smoke test**

Use a small deterministic fixture and require lifecycle transitions, budget admission, inference execution, telemetry retrieval, cancellation-safe cleanup, and unload. No HTTP/provider/tool-call protocol belongs in this task.

- [ ] **Step 2: Run and verify RED**

Expected: compilation/test failure because the unified native entrypoint does not exist.

- [ ] **Step 3: Implement the minimum runtime entrypoint**

Keep tensor execution, memory policy, and residency in the native worker. The entrypoint must expose only coarse lifecycle/request/telemetry operations and must not bypass the memory ledger.

- [ ] **Step 4: Run the complete native runtime suite**

Verify the smoke fixture plus memory-ledger, file-residency, MoE, dense, budget, and substrate tests. Downstream consumer integrations remain explicitly deferred.

- [ ] **Step 5: Commit**

Commit message: `feat: add native runtime smoke entrypoint`
