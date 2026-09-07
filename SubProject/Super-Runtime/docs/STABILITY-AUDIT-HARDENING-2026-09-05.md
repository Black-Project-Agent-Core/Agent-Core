# Super-Runtime Hardening Stability Audit — 2026-09-05

Status: **PASS — Hardened Milestone-1 Stable Core**

Baseline version: `0.1.0`

Hardening scope: post-v0.1.0 safety and verification hardening; this document does not rewrite the historical `docs/STABILITY-AUDIT-MILESTONE-1.md` evidence.

Pinned llama.cpp/GGML revision: `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38`

## Verdict

The 2026-09-05 code-review findings that weakened memory accounting, residency lifetime, input bounds, provenance enforcement, failure recovery, and Windows verification have been closed for the Milestone-1 scope.

The stable claim remains intentionally scoped: Super-Runtime is a hardened CPU-first native core with Linux file-backed residency and cross-platform planner/accounting verification. It is not a production-GA universal inference runtime and this hardening does not claim a Windows file-residency backend, GPU execution policy, arbitrary-model certification, or broad production service guarantees.

## Closed findings

| Review finding | Hardening | Result |
| --- | --- | --- |
| GGML runtime allocations were not reconciled against admitted host buckets | Added deterministic `RuntimeWorkspaceRequirements`, measured GGML metadata/compute requirements, admission checks, telemetry, and runtime size reconciliation | PASS |
| `FileResidencyLease` could outlive its owner through a stale raw owner pointer | Added owner-lifetime state and invalidation; surviving leases become inactive and expose no data | PASS |
| Public `FileResidency::data()` bypassed the residency governor | Removed public raw mapping access; mapped data is exposed only through an active lease / dense active lease | PASS |
| MoE strided selector reads lacked a backing-buffer bound | Added `StridedExpertIds::data_bytes` and checked the last reachable `int32_t` before reading | PASS |
| Pinned llama.cpp accepted dirty tracked source when HEAD still matched | Added exact HEAD plus staged/unstaged tracked-diff verification and a dirty-source contract test | PASS |
| Dense completion failure could strand active state | Completion now clears active lease/state before reclaim, allowing `stop()` cleanup retry | PASS |
| Dense two-slot lookahead always wrapped last layer to layer zero | Added explicit finite/cyclic traversal; RuntimeEntry uses finite traversal | PASS |
| Windows tests exposed POSIX-only fixtures and MinGW runtime DLL discovery failed | Gated Linux-only tests/helpers and set CTest runtime PATH for MinGW dependencies | PASS |
| Mapped bytes were cast to `float *` without an explicit alignment contract | Runtime validates `alignof(float)` before conversion | PASS |

## Fresh verification evidence

### Windows Release build and CTest

Toolchain:

- Windows 11 Pro
- CMake 4.4.3
- Ninja 1.13.2
- WinLibs GCC/G++ 16.1.0 UCRT

Fresh clean Release build completed successfully. Registered Windows tests:

```text
super-runtime-pinned-source-cleanliness   PASS
super-runtime-memory-ledger               PASS
super-runtime-file-residency-contract     PASS
super-runtime-moe-residency               PASS
super-runtime-dense-residency             PASS
super-runtime-runtime-budget              PASS
super-runtime-runtime-workspace           PASS

7 / 7 CTest PASS
```

The MinGW runtime DLL path is provided to CTest by the native CMake test configuration, so the earlier `libgcc_s_seh-1.dll`, `libstdc++-6.dll`, and `libwinpthread-1.dll` launch failures no longer occur.

### Linux Release build and CTest

Fresh verification ran in Alpine Linux 3.24, kernel `6.18.35-0-virt`, x86_64, using a QEMU VM. The pinned llama.cpp checkout was fetched at the exact configured SHA and verified clean before configuration.

```text
super-runtime-pinned-source-cleanliness   PASS
super-runtime-memory-ledger               PASS
super-runtime-file-residency-contract     PASS
super-runtime-moe-residency               PASS
super-runtime-dense-residency             PASS
super-runtime-runtime-budget              PASS
super-runtime-runtime-workspace           PASS
super-runtime-runtime-entry               PASS
super-runtime-file-residency              PASS

9 / 9 CTest PASS
```

Production-source grep also confirmed that no `FileResidency::data()` / residency raw-mapping bypass remains.

### ASan + UBSan

A separate Debug build used:

```text
-fsanitize=address,undefined -fno-omit-frame-pointer
```

The hardened execution/residency paths passed:

```text
super-runtime-moe-residency       PASS
super-runtime-dense-residency     PASS
super-runtime-runtime-workspace   PASS
super-runtime-runtime-entry       PASS
super-runtime-file-residency      PASS

5 / 5 sanitizer CTest PASS
```

No sanitizer failure was reported.

### Hard memory ceiling

The Linux VM mounted cgroup v2 and enabled the memory controller. The memory-ceiling self-test passed all of its supported-host, fail-closed unsupported-host, runtime-failure, parity-failure, and deliberate OOM checks:

```text
memory-ceiling self-test: PASS
```

The hardened Release `super-runtime-test-runtime-entry` was then executed under a real delegated cgroup-v2 ceiling with output-parity verification:

```text
enforcement_backend = cgroup-v2-delegated
memory.max           = 134217728 bytes (128 MiB)
memory.swap.max      = 0
classification       = success
process_exit_code    = 0
oom_kill_delta       = 0
peak_cgroup_bytes    = 1040384
peak_rss_bytes       = 1245184
output_parity        = PASS
stdout_sha256        = 7756943c47db309dfe853368a6861b14972b5f1cac81b70aa4d123dfb6c08b3d
```

This keeps the hard memory-ceiling claim grounded at the OS boundary rather than treating the accounting ledger as an allocator-level enforcement mechanism.

### Pinned-source provenance

The pinned substrate was verified at:

```text
daef7b6874397a5a7c3d7e38b55e2ee0adf7da38
```

with no staged or unstaged tracked diff. The new CMake contract independently creates a temporary Git source, proves the clean source is accepted, then changes a tracked file without moving HEAD and proves configuration rejects it.

### Static analysis and source integrity

Cppcheck ran over all seven Super-Runtime production `.cpp` files with warning/performance/portability checks enabled and returned exit code `0` with no actionable diagnostic.

`git diff --check` also passed before integration.

## Stable scope after hardening

The Stable label covers the same Milestone-1 boundary, with stronger invariants:

- CPU-first GGML execution substrate at the exact pinned revision;
- deterministic global budget planning and MemoryLedger accounting;
- measured GGML metadata/compute workspace admission;
- Linux stable-address file-backed residency;
- lease-only mapped data access and safe owner-lifetime invalidation;
- READY-before-dereference and reclaim protection;
- finite dense RuntimeEntry traversal plus explicit cyclic planner support;
- bounded generic MoE selector/range planning;
- deterministic runtime lifecycle, cancellation, cleanup, and telemetry;
- clean pinned-source provenance enforcement;
- Windows platform-neutral planner/accounting tests;
- Linux Release, sanitizer, and hard cgroup-v2 verification.

## Explicitly outside this stability declaration

The following remain outside the hardened Milestone-1 claim:

- Windows file-backed residency execution;
- GPU staging/offload/runtime policy;
- arbitrary production GGUF/model compatibility certification;
- production MoE scheduler-hook integration for arbitrary model graphs;
- asynchronous I/O/compute overlap;
- HTTP/provider APIs;
- large-model throughput/latency guarantees;
- production-GA operational support guarantees.

Any later milestone that changes one of the frozen invariants above requires its own executable verification evidence before receiving a Stable label.

## Final integration gate — requested target

The hardened files were integrated into the requested working tree:

```text
F:\Projects\Agent-Core\SubProject\Super-Runtime
```

Before the final platform runs, all 22 changed/new hardening files were SHA-256 compared between the isolated hardening worktree and the requested target with zero mismatches. The integrated target archive used for the final Linux run had SHA-256:

```text
f295367fdb79b191c9c54021168b573cde98d317242d402c0092344ff756dde2
```

Final verification on the integrated target:

- Windows Release, MinGW GCC/G++ 16.1.0 using the `MinGW Makefiles` generator: configure PASS, build PASS, **7/7 CTest PASS**.
- Linux Alpine 3.24 / kernel 6.18.35-0-virt using the exact integrated target archive: Release configure/build PASS, **9/9 CTest PASS**.
- Linux integrated-target ASan+UBSan build: **5/5 selected residency/runtime tests PASS**, no sanitizer failure.
- Linux integrated-target production-source raw-residency-bypass search: PASS (no `FileResidency` raw mapping access found).
- Linux integrated-target cgroup-v2 memory-ceiling self-test: PASS.
- Linux integrated-target `super-runtime-test-runtime-entry` under `memory.max=134217728` and `memory.swap.max=0`: success, exit 0, no OOM kill, output parity PASS, `peak_cgroup_bytes=1040384`, `peak_rss_bytes=1466368`.
- Integrated target Cppcheck warning/performance/portability scan across all seven production `.cpp` files: exit 0, no actionable diagnostics.
- Integrated target `git diff --check`: PASS.

A cross-ownership checkout issue discovered during the target build was also hardened: the pinned-source verifier now passes the exact configured source directory to Git as an explicit per-command `safe.directory`, so the provenance gate remains effective without weakening Git safety globally for arbitrary paths.

The final Windows gate deliberately used MinGW Makefiles after the host's Ninja 1.13.2 intermittently encountered a Windows file-lock error while compacting `.ninja_deps` in newly created build directories. This was isolated to the host Ninja build-cache operation; it did not reproduce as a compiler, linker, CTest, Linux, sanitizer, Cppcheck, or runtime failure.

**Final verdict: PASS — Hardened Milestone-1 Stable Core.**