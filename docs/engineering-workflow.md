# Default engineering workflow

`engineering-v1` is enforced by `WorkflowService` for coding tasks. It uses the existing plan store, source cache, execution scheduler and memory lifecycle. The controlling AI supplies design decisions; the server collects source facts and checks ownership, completeness, references, scope and freshness. No second model, model API key or skill invocation is involved.

## Before changing code

1. Open a project-scoped `capability_route` and inspect health, recall, task identity and obligations.
2. Call `craft_source` with `operation:"discover"`, `role:"target"` and a specific source query. The receipt includes inventory/hash, actual matches, exclusions, gaps, truncation and native/installed facilities. A successful empty search is distinct from failed or incomplete coverage. Repeat targeted queries when the first query does not describe the needed mechanism.
3. Read chosen implementation files using `craft_source` `read`. Each existing target needs its own current receipt; a new file needs an existing integration seam where the project already has code.
4. Call `craft_source` `impact` with actual `targetPaths`. Use the returned caller IDs and limitation IDs, not names invented by the client. Review imported aliases, re-exports and actual caller groups.
5. Submit `workflow_plan` with the current aggregate `expectedVersion`, steps/checks and `assessment`. Every mutation target maps to requirement indexes and evidence. Each decision chooses `existing`, `native`, `installed`, `donor` or `custom`, explains earlier rejected options in order, and references server receipts. Native choices name a listed facility, such as `node:fs`; installed choices name a dependency with a captured installed manifest. Donor choices still require normal craft mappings and source/license evidence.

`callerDispositions` records `unchanged` or `planned_change` per observed caller. Planned caller changes must be inside step targets. Analysis limitations require a reason, inspected evidence and IDs of applicable verification checks. Neither `alreadyChecked:true` nor a filename alone can satisfy assessment.

An explicit absolute `projectRoot` selects that directory, including a nested project inside an allowed workspace. The server validates its real directory before reserving a route or opening memory preflight. The containing workspace remains the outer access limit; it does not replace the selected project. Target reads, writes, discovery and execution inputs stay within the selected directory. Automatic execution manifest discovery stops at that project root. Omitting `projectRoot` retains configured-root inference and rejects ambiguous evidence.

Nested projects have their own continuity and memory scope. Existing tasks keep their persisted project identity; correcting a route scope requires a new task in the correct project, rather than rebinding an earlier parent-scoped task. Checkpoint/finalize recovery uses the original route and project after expiry or restart, without granting new execution authority.

The parser is the pinned local TypeScript 7.0.2 async API, accessed through a closed snapshot filesystem. It reads captured source/config, never project plugins, build scripts or executable dependencies. Semantic TS/JS identities are distinguished from lexical leads for other languages. Dynamic dispatch, runtime module loading and external consumers remain explicit limitations. “All callers” means the callers established inside that captured scope; the server does not claim universal completeness.

## Execution and review

Use the accepted plan revision/hash and exact step IDs. Direct planned edits and DAG commands share workflow authority. Independent resource claims permit concurrent nodes; overlapping reads/writes remain coordinated by the existing scheduler. General shell commands are not an OS sandbox. Before/after inventories detect source changes outside acknowledged planned paths.

Every managed shell command requires assessment, including a command labeled `verification`: that label cannot prove that the process leaves source unchanged. Ordinary status, health and discovery tools remain available while implementation is blocked.

The optional execution `toolchain` array contains file paths to hash, resolved relative to the node's working directory and checked against its routed project. It does not accept executable names or module identifiers such as `node` or `node:path`. Omit it when there are no additional project toolchain files to declare; executable identity is captured separately from the command through PATH/PATHEXT resolution. An invalid declared file can stop an attempt before process creation.

Reconciliation uses captured output manifests and the current run/node/attempt identity. A sibling writer may defer its own target while active, but cannot justify changed inputs needed by the selected node. Repeating acknowledgement for the same attempt does not produce a second operation receipt. Failed acknowledgement remains recoverable without rerunning successful implementation.

After writer reconciliation and correctness checks, call `craft_source` with `operation:"review"`. The server reads current source, recomputes caller impact and issues a review bound to the final inventory and accepted plan. It checks structural duplication, direct forwarding wrappers, limited-use abstractions, new configuration/dependencies and scope. These are review candidates, not automatic deletion instructions or a claim that the shortest design is best.

Submit `workflow_plan` with `operation:"review"` and `review:{expectedVersion,reviewReceiptId,dispositions,limitations}`. Every present finding needs `retained` with reason, current review evidence and relevant check IDs. To repair a finding, make a guarded planned edit (revise the plan when scope changes), rerun affected correctness checks and collect a fresh review. A disappeared earlier finding is recorded as `fixed` with current review evidence. A finding still present cannot be marked fixed. Final analysis limitations reference the fresh impact receipt and applicable checks.

Changing content after review invalidates acceptance of that review. Tests, security, recovery, validation and accessibility must not be removed merely to suppress a complexity candidate. Existing unrelated issues are follow-up work unless the user requested a whole-project audit.

## Status, durability and client schema

`workflow_status` returns engineering obligations, evidence inventories, accepted assessment, outputs, review decisions and actionable observed blockers. `agent_core_status.workflow` exposes `engineeringPolicy` and `engineeringRequiredForCoding`; those flags alone do not prove a particular task passed the policy.

Closure still requires current verification evidence, an explicit memory decision and durable synchronization. Assessment and review live in versioned workflow records. Referenced source blobs use the existing content cache and workflow projection category; there is no new database/table. Record size, coverage and parser bounds fail explicitly. Closed historical records remain readable with their original hashes. Active older tasks obtain an assessment before their next coding mutation; reconciliation may preserve already-successful historical work without inventing earlier assessment.

The callable tool names are unchanged, but `craft_source` and `workflow_plan` have expanded input schemas. Verify schema availability on the actual ChatGPT Web custom-plugin connection. If that connection retains old schemas, update its registration using the existing tunnel and then verify the callable operations. A local build or fixture result alone does not prove that the Web connection used this protocol.
