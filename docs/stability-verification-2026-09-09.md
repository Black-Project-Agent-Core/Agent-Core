# Workflow verification — 9–10 September 2026

The source-grounded workflow and memory-durability implementation task completed through the custom Agent Core plugin in ChatGPT Web. This is a functional acceptance result. The prepared v0.7.0 release is a prerelease; these observations do not certify every repository component, performance target, or published asset. The behavior contract is documented in [stability.md](stability.md).

## Deployed implementation and managed execution

The verified deployment used source manifest SHA-256 `39f3b6bcdb5bb7afefb5499077cc4ce9961ad1d81050447cdbfc4e6a35ee56fe`. Independent compilation and installed runtime readback matched **318 compiler files**. This fingerprint identifies the tested implementation snapshot, not a future release commit.

The authenticated MCP connection exposed 72 tools, including `craft_source`, `workflow_plan`, and `workflow_status`. Discovery was followed by successful source grounding, plan acceptance, execution creation, and execution start through the same ChatGPT Web connection. The route respected the persisted DAG requirement when resuming an existing verification task; it did not turn an unrelated read-only route into command authority.

The accepted plan remained revision 2 with SHA-256 `69e75b5794cd95a69980859f713a7d42d0b543b64dff365dd74a0eca79069a28`. Managed run `359e36f6-818c-4531-bd47-bce6f8a3104b` contained two successful attempts:

| Step | Tests | Exit code | Final evidence |
| --- | --- | --- | --- |
| Behavior | 60 passed, 0 failed, 0 pending | 0 | Verified and current |
| Integration | 35 passed, 0 failed, 0 pending | 0 | Verified and current |

The behavior step covered workflow service, intent classification, and execution provenance. The integration step covered workflow MCP, HTTP memory-context leases, and Supabase workflow semantics. Both used one test worker; the run had `maxConcurrency:1`. These were functional tests, not a benchmark or proof of parallel throughput.

The input manifest remained source-bound and stable during both attempts. The final artifact SHA-256 values were:

```text
behavior:    b09e1655967c3933d1a301e425954a52ae3fb088936a85a25bea4e30f064f5c7
integration: 292919eb65a4eb1e686c0ccd5db63661dcd68b578908b7d8e5e8b0006169a7da
```

Temporary fixture directories were absent after execution, as required by the accepted plan. A temporary applicability change while another fixture existed resolved to `current` after cleanup. The successful run and reports were reused for final acceptance without another test run or plan revision.

## Restart, recall, and durable completion

A cooperative restart shut down the old runtime and let the existing native controller restart it. The controller and tunnel identities were preserved. The saved plan, managed run, and preceding interrupted checkpoint survived that restart.

All nine semantic memories promoted by the preceding checkpoint were read directly after restart. Seven also appeared in ranked search. Recall affected the host's decision to preserve the accepted plan and current run, avoid repeating completed work, and distinguish fixture results from production synchronization.

The subsequent completed checkpoint produced the following saved state:

| Layer | Verified result |
| --- | --- |
| Continuity task | `completed`, blockers empty |
| Workflow | Version 30, `CLOSED`, `completed:true` |
| Closure receipt | `synced` |
| Managed run | `completed`, evidence `verified`, `current:true` |
| Memory lifecycle | `CLOSED`, `DURABLY_CLOSED` |
| New checkpoint remote result | `REMOTE_SYNCED` |
| Memory health at readback | `file-native:ok`, 39 active, 0 pending Supabase items |

Three new decisions and two new outcomes were stored. Two existing artifact memories retained their report hashes and advanced to revision 2 with additional completed-checkpoint provenance. All seven promoted records and their applied write decisions were read back.

The completed checkpoint was created **after** the restart. It was not tested through a second restart. Its saved closure receipt is a persisted result of the completed operation; reading that receipt is not a new remote-network verification.

Two future-work candidates were also persisted. They appeared at positions 14 and 15 in the scoped frontier, below the default five-item snapshot. Their absence from that short response was a ranking/limit effect, not lost storage. `continuity_frontier` permits an explicit larger limit.

## Evidence boundaries

- **Supabase fixture versus production:** the managed Supabase suite used PGlite and isolated SupabaseDirect transport fixtures. Production durability was established separately through real checkpoint synchronization. Operator remote readback before final completion validated 110 workflow records and 34 then-current memories; the later completed checkpoint produced its own new remote generation.
- **Craft obligation:** this task verified an existing implementation, so `craftRequired:false` was appropriate while plan and DAG requirements remained active. Explicit donor-feature tasks still require current donor receipts. Earlier isolated real-component craft and memory acceptance each passed 5/5 on the earlier implementation snapshot; those results were not retroactively presented as the production managed run.
- **Earlier broad regression:** the earlier snapshot recorded 1,083 passing tests and 10 skips. An aggregate including separate opt-in checks recorded 1,096 passes, one dispatch timing failure, and one platform skip. Those historical results are distinct from the final 95-test managed run and are not a claim that a new full-suite run passed.
- **Performance:** prior 100k-memory and dispatch timing gates did not all pass. Benchmarks and further speed optimization are deferred by operator instruction. Existing failures remain recorded; functional recall success does not convert a failed performance gate into a pass.
- **Repository history:** the original operator checkout has 21 unavailable Git objects from the earlier recovery investigation. Preparing a separate clean publication snapshot does not repair those missing historical objects.
- **Publication:** a release needs its own source identity, packaging checks, asset hashes, registry readback, and channel verification. This document does not claim those operations have already happened, or that every independently maintained SubProject has been recertified.

Raw operational reports, credentials, and memory records are excluded from public distributions. This document summarizes the acceptance evidence without links to private report files.

## Source and regression entry points

- [Workflow classification](../src/workflow/classification.ts), [workflow service](../src/workflow/service.ts), and [workflow contract](source-grounded-workflow.md)
- [Route capability binding](../src/mcp/capability-tools.ts) and [workflow MCP regression](../tests/workflow-mcp.test.ts)
- [Execution provenance](../src/execution/provenance.ts) and [provenance regression](../tests/execution-provenance.test.ts)
- [Memory checkpoint](../src/memory/task-checkpoint.ts), [file-native backend](../src/memory/file-native/backend.ts), and [Supabase workflow projection](../src/memory/file-native/workflow-projection.ts)
- [Direct Supabase setup](supabase-direct-memory.md) and [workflow synchronization regression](../tests/memory-supabase-workflow.test.ts)
