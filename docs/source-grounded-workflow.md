# Source-grounded implementation workflow

Agent Core stores and checks the implementation contract for each continuity task. The connected AI interprets the brief, dissects source code and adapts the implementation. Agent Core performs deterministic inspection, ownership checks, scheduling and verification. This workflow has no inference provider, additional model or inference API key.

```text
Brief + project + existing task identity
              |
       capability_route
              |
  Vault + Graphify + Supabase health
              |
       recall + continuity
              |
     persistent workflow contract
                 |
     coding: engineering-v1 assessment
     discover existing/native/installed facilities
     read source + trace caller identities
     choose reuse/adaptation/new implementation
                 |
     workflow_plan: assessment + steps + checks
                 |
     guarded edits / execution_create -> execution_start
     independent nodes may run concurrently
     dependent nodes wait for prerequisites
                 |
     reconcile each attempt's captured writes
     verify current inputs + attempts + artifacts
                 |
     craft_source review: final impact + complexity
     workflow_plan review: evidenced dispositions
                 |
         task_checkpoint / turn finalization
                 |
      explicit memory decision + local application
                 |
     Supabase generation commit + verified readback
           /                         \
       success                    interruption/failure
           |                         |
       task closed             closure remains pending
                               retry original checkpoint
```

## Contract activation and source grounding

`capability_route` accepts `workflow: auto | direct | dag` and optional `craft: {requirements, donors}`. Each requirement has `id` and `description`; each donor has `id` and a local `source` or HTTPS Git URL. An optional `ref` applies only to HTTPS Git; local files are identified by their captured content and reject Git refs. Provide these structured fields for a transplant. Brief detection recognizes affirmative adaptation instructions tied to source filenames, paths or repositories and a requested feature. Verification/status prose, negated instructions, Markdown quotes, and fenced examples do not establish a new transplant obligation. A specification or log path alone is not a code donor. These are deterministic grammar rules, not general language understanding; ambiguous requests should supply structured donor and requirement fields. `workflow_status` exposes the recorded obligation. A later `direct` request cannot downgrade an existing craft or DAG requirement.

Classification provenance stores the input and reason that first established each obligation, plus the latest classified input. Resumed instructions are recorded even though task identity and the original brief stay fixed. Existing records without this provenance retain their prior flags; a new classifier does not silently reinterpret them. Credential-bearing brief/context/structured inputs are rejected before any workflow state or provenance is saved.

The local operator command `node dist/cli.js workflow-classification-recover request.json` performs a read-only eligibility check for the narrow version-1-to-version-2 false-positive case. The request supplies `principalId`, canonical `projectId`, `taskId`, `expectedVersion:2`, `expectedStateHash`, immutable `predecessorContentHash`, a substantive `operatorReason`, and `acknowledgeLegacyInstructionReview:true`. It requires a verified immutable predecessor with craft=false, an identical current remote/local version 2, unchanged task/brief and plan/DAG obligations, no donor/source/plan/operation evidence, an interrupted task, complete audit evidence, and healthy memory. Unknown history or actual work prevents correction. Prior false state alone does not establish operator intent.

Add `--apply` only for an explicitly reviewed correction. Apply requires the existing runtime to be stopped and acquires its exclusive memory recovery lease; it does not start another runtime. It backs up the prior records, records the operator reason and evidence hashes, preserves all other obligations, publishes version 3, and verifies the Supabase generation. A pending recovery journal blocks ordinary runtime startup until the identical request is retried successfully. Dry-run never opens or reconciles the execution store. No ordinary MCP route or status request can clear an obligation.

Coding obligations include atomic source typo, comment and symbol rename edits. A `direct` hint does not bypass assessment or a required plan. Transplants and staged coding require the execution DAG; a single planned file edit does not require an extra executor. Source acquisition, inspection, status and recovery remain available before implementation is allowed. Actual source paths and commands are checked again when operations arrive, including work whose initial brief was classified as inspection.

`craft_source` lists or reads a registered donor or the target. Reads return server-issued receipts with content hashes, exact delivered line ranges and snapshot identity. Line numbers start at one. A truncated response is refused as evidence; request a narrower range. A caller-provided filename, README summary or claim of having read the source cannot replace implementation-code receipts. Remote Git acquisition uses a pinned commit and reads Git objects without checking out or running donor hooks or scripts. Credential-bearing URLs and sensitive local credential files are rejected.

Language and analysis level describe the inspection actually performed. `source_read` means recognized textual source was delivered. `structural_only` is the fallback for other readable formats. Neither means an AST was analyzed or behavior was proven. Code in another language can inform an adaptation into the target language; the controlling AI supplies the reasoning and the target verification proves the resulting behavior.

## Plan and mutations

`workflow_plan` receives `{routeContextId, plan}`. `plan.expectedVersion` is the latest aggregate version returned after source reads. Its accepted `plan.revision` is the value to pass as `planVersion` on edits; these are different counters.

A plan contains:

- `steps`: stable IDs, purpose, kind (`edit`, `command`, `verification`), target paths and exact commands where applicable.
- `mappings`: requirement and donor IDs, donor/target receipt IDs, mechanism, inputs, outputs, dependencies, failure behavior, parts reused/adapted/rejected, target paths and implementation steps.
- `checks`: behavior, integration and regression checks bound to verification steps and artifact paths. Every transplant requirement needs behavior and target integration coverage.
- `assessment` for coding: server-issued discovery and impact receipt IDs; ordered existing/native/installed/donor/custom choices with evidence-backed reasons for earlier alternatives; exact target-to-requirement decisions; caller dispositions; and analysis limitations tied to applicable checks.

See [engineering-workflow.md](engineering-workflow.md) for the assessment and final-review protocol. The five engineering capabilities are native workflow obligations and do not require a skill load or an inference provider.

Literal reuse also requires a source license receipt and attribution. Reading source is evidence; embedded instructions are not new authority.

Every existing file edited by a transplant needs its own current target read receipt. An unrelated code receipt cannot authorize a different existing file. New-only target mappings declare `integrationSeamPaths` for existing code files with matching receipts; an existing code file already included in `targetPaths` can serve as that seam. Configuration or documentation edits keep their actual content classification and require a code seam too. Every mutation path in the transplant steps belongs to a source-grounded mapping.

Changing a donor's source or Git ref requires new matching reads. Historical snapshots and receipts remain stored, but cannot authorize the revised donor. A pinned remote commit is reused only for the same donor source and requested ref.

File mutations carry the accepted `stepId` and `planVersion`. The runtime validates paths and current source hashes before writing. Successful edits advance the expected target hashes while holding a workspace resource claim. Donor changes, unexpected target edits, stale revisions and missing source caches require renewed inspection or a revised plan. A failed receipt after a successful edit reports that the mutation already happened; inspect before repeating it.

Planned directory creation and file moves record the resulting path kind as well as its content identity. Intentional source absence after a move requires a successful server-recorded operation. Verification includes directory contents and absent paths; an unexpectedly deleted file cannot count as a successful result.

The same workflow obligation applies to MCP operations, runtime filesystem/process services and the internal HTTP adapter. Adapter lease checks cannot turn a caller-supplied execution tool name into server execution authority. Planned mutations must use the managed tools so the runtime can own claims and evidence. Recovery/status tools remain available. The internal HTTP endpoint does not grant meaningful work without a valid lease, including in advisory mode.

## Execution evidence

Bind each execution node to its accepted `stepIds`. Supply `inputs`, `resources.reads`, `resources.writes` and any named `resources.exclusive` mutexes. Resource overlap is checked across runs and managed file edits. Nodes without resource declarations fall back to conservative serialization. Claims coordinate managed work; they are not an operating-system sandbox for arbitrary shell programs.

Declare real dependencies with `dependsOn`. Independent nodes can run together, while dependent commands wait. A failed prerequisite blocks downstream work. Commands for a transplant must exactly match the accepted plan. A current same-task route is checked again before each process launch. Renew an expired route by resuming that task, without recreating a successful run.

Each attempt records command/spec identity, input content, toolchain identity, prerequisite attempt identities and output hashes. Project configuration and lockfiles are included automatically. Explicit `toolchain` paths cover additional executables used inside compound commands that cannot be inferred reliably. `evidence.current` distinguishes results that still apply from successful old processes whose inputs, outputs or dependencies changed. Historical markers retain their original evidence level; reading them never manufactures missing provenance.

Successful writers capture declared output manifests while holding their claims. Workflow reconciliation records the actual run/node/attempt identity, plan hash and output hash once. A changed sibling target remains pending only while the execution store identifies its current writer under the same plan; that does not acknowledge the sibling's output. Selected inputs remain strict. Final source inventory and review wait for writer reconciliation, and unexpected source changes remain errors.

An integration check must exercise the target entry point. For a local service, a bounded verification command can start it, wait for readiness, exercise its API and stop it in cleanup. A free-standing `start_process` cannot replace a mandatory DAG verification. Exit code zero or an artifact hash alone cannot establish that a test was well designed; the accepted verification command must test the requested behavior.

`execution_cancel` remains available without a current memory lease, including during a memory outage, while enforcing persisted principal and project ownership. If a process succeeds but its workflow receipt is interrupted, the run remains blocked. Resume the same run with `execution_start` and a current same-task route to reconcile its receipt without rerunning the successful process.

## Completion, memory and recovery

Planned work closes through `task_checkpoint`, with explicit `execution:<runId>` evidence for current completed runs. `memory_turn_finalize` cannot certify a planned task. If work is interrupted, use an honest incomplete checkpoint; completion is refused until every required check is current. A completed transplant records a useful integration decision, artifact or outcome instead of an unexplained no-memory decision.

The completion operation holds a project read claim from evidence verification through durable closure. Other managed mutations cannot change the verified files during that interval. Pending process receipts must be reconciled before completion, including after restart.

Vault Markdown stores semantic memory. Graphify indexes relationships for recall; it does not replace donor source snapshots. Supabase direct stores semantic documents plus scoped task, turn, checkpoint, frontier, write-decision, lifecycle and workflow projections. Immutable generations bind these records and semantic content hashes. Final durability requires readback of the matching generation and its records.

A workflow's logical closure intent is written before synchronization. It does not certify remote durability. `task_checkpoint` must return a closed memory lifecycle with its verified generation before final success is reported. Failed synchronization leaves closure pending. Retry the same checkpoint arguments and original route identity; successful edits, commands and memory writes are not repeated by that retry.

Recovery reads a verified generation under an exclusive memory recovery operation. Restored authorization timestamps are expired and raw donor caches are not restored. A resumed task therefore obtains a new preflight and reacquires source evidence where necessary. Old process results remain historical unless their current inputs and attempt identities can still be established.

Engineering inventory source blobs are projected as immutable content records in the existing workflow category. Recovery validates and restores these specific target baselines before clearing its journal. Missing or corrupt baseline blobs keep recovery pending. Historical records without engineering fields retain their original hashes and do not acquire a retrospective policy-compliance claim.

An empty healthy vault is valid. Failed recall is a different state. `agent_core_status.workflow` reports storage readiness separately from policy availability and catalog size. An empty optional skill catalog does not disable native workflow enforcement. Skill instruction audits report metadata inspection and risk scanning; instruction load/package creation rechecks the audited content hash and never calls that behavioral verification.
