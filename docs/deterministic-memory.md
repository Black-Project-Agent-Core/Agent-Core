# Agent Core File-Native Memory Fabric

The Memory Fabric is an in-process Agent Core subsystem. It runs inside the existing Agent Core Node.js process; there is no separate memory server, model, embedding service, or vector database.

Normal lifecycle mode is `enforce`. Preflight verifies the vault, Graphify runtime and projection freshness, and Supabase connectivity before issuing actionable memory context. Workspace reads used for analysis require this context too. An explicit diagnostic mode may relax these gates, but does not meet the [stability contract](stability.md). Health and recovery controls remain available while substantive work is blocked.

Memory has three layers and one authority order:

```text
Obsidian-compatible Markdown vault    canonical local durable memory
        │
        ├── Graphify                  derived graph / relation index, rebuildable
        │
        ├── Supabase direct memory    searchable scoped projection; required in enforce mode
        └── Supabase Second Memory    encrypted secondary durability / recovery mirror
```

The vault is the canonical write authority. Graphify is a projection of it and may be rebuilt or degraded without data loss. Supabase Second Memory mirrors the vault for recovery. The optional [direct Supabase path](supabase-direct-memory.md) also contributes remote recall and reads while preserving local record precedence; it has separate credentials and a searchable SQL projection.

Memory is enabled by default. Structured hard-guardrail enforcement remains disabled by default and is controlled separately by `AGENT_CORE_MEMORY_ENFORCE_HARD_GUARDRAILS`.

## Runtime locations

Canonical vault root:

```text
<Agent-Core-root>\runtime\memory\vault
```

Override it with `AGENT_CORE_MEMORY_VAULT_ROOT`. Auxiliary durable state — immutable revision history, provenance events, lifecycle and continuity records, and the local sync ledger — lives under `.agent-core` inside the vault root, in the same file-native form.

Backups are kept under:

```text
<Agent-Core-root>\runtime\memory\backups\
```

Each backup call returns the directory it created, its creation time, and its reason; the runtime keeps no separate index of them.

The private toolchain (ripgrep, CPython, uv, Graphify) resolves beneath `.tools/` in the project root, so a relocated project folder keeps working without machine-global installs. `AGENT_CORE_MEMORY_RG_PATH`, `AGENT_CORE_MEMORY_PYTHON_PATH`, and `AGENT_CORE_MEMORY_GRAPHIFY_PATH` override discovery when a host needs it.

## Vault format and Obsidian compatibility

Every memory item is a Markdown file with deterministic front matter and a deterministic body encoding. The same logical state always produces the same bytes, so a vault can be diffed, hashed, and version-controlled.

Obsidian can open, read, and inspect the vault directly. Obsidian is an observer, not a second authority: any metadata its plugins add is ignored by Agent Core, and Agent Core never depends on another application's index to serve memory.

## Writes and crash safety

Canonical writes go through a transaction journal and atomic rename:

```text
write temp file
flush
atomic rename into place
read back and validate
```

Startup recovers any pending journal entry before serving memory, isolates malformed Markdown files instead of failing the whole vault, and reports graph-only degradation separately from canonical-memory health.

## Health and diagnostics

Use `agent_core_status` or `memory_status` from the MCP surface. The HTTP health endpoint also reports memory diagnostics:

```text
GET http://127.0.0.1:8765/health
```

Important states:

- `healthy`: the vault opened, integrity validation succeeded, and memory is available.
- `degraded`: memory failed closed. Agent Core OAuth/MCP can remain available, but memory recall returns no invented evidence.
- `disabled`: memory was explicitly disabled.
- `closed`: Agent Core has closed the memory subsystem.

A degraded graph layer is reported separately from a degraded vault. When Graphify is unavailable, lexical recall over the vault remains available and canonical writes still succeed.

## Clean shutdown on Windows

Windows `Stop-Process` does not deliver Node.js `SIGTERM`/`SIGINT` handlers, so Agent Core does not rely on those signals for a normal restart or exit.

`Agent Code Native.exe` writes a local shutdown request under `runtime\` for the Agent Core process it owns. Agent Core watches that file in-process, closes the HTTP listener, completes or rolls back any open canonical transaction, consumes the request, and exits. Agent Code waits for that clean exit before using process termination as a bounded fallback.

Because every canonical write is journalled and atomically renamed, an abrupt termination leaves the vault recoverable rather than partially written.

## Export memory safely

`memory_export` is a bounded, read-only diagnostic/backup view for the authenticated principal and current project. It exports memory items, revisions, safe redacted event provenance, and conflicts. It does not export raw captured source text.

For a diagnostic capture, call `memory_export` with a bounded `limit` and save the returned JSON to an operator-controlled file if needed. The model-facing tool does not write an export file automatically.

Use `memory_explain` when the goal is to understand why one memory matched: it reports revision history, anchors, graph edges, provenance, and optional query-score evidence.

## Forget memory

`memory_forget` is intentionally soft. It tombstones the selected memory so it is excluded from active recall while preserving revisions and audit evidence.

Physical purge is **not** exposed through the model-facing MCP tool. A relevance score can never physically delete evidence. Any future physical purge policy must remain an explicit operator action and must take a backup first.

## Backup behavior

A backup is a point-in-time copy of the canonical vault tree plus its auxiliary durable state, taken before a destructive maintenance operation and through the operator backup primitive that recovery tests exercise.

A backup directory name includes a UTC timestamp and a reason, for example:

```text
runtime\memory\backups\vault.2026-09-08T02-00-00-000Z.pre-maintenance
```

A backup is a plain recursive copy of the vault tree. It is not hashed or manifested, and it refuses to overwrite an existing backup directory. The verified, hash-checked recovery path is Second Memory, below.

## Recovery and restore

### Local restore

There is no local restore primitive: a backup directory is restored by copying it back over the vault root by hand.

1. Exit Agent Core through Agent Code (`Exit Agent Core`) so no canonical transaction is open.
2. List `runtime\memory\backups\` and pick the `vault.<timestamp>.<reason>` directory you want.
3. Move the current vault root aside - do not delete it until the restore is verified - and copy the chosen backup into its place.
4. Restart Agent Core from `SubProject\Agent-Code\Agent Code Native.exe`.
5. Verify `/health`, `agent_core_status`, or `memory_status` reports `healthy` and `integrity: ok`.

Nothing verifies a local backup for you, so step 3 is the only safeguard. Prefer Second Memory recovery when it is configured: it checks every file against a manifest and revalidates the logical root hash. Never copy files over a live vault while Agent Core is running.

### Recovery from Supabase Second Memory

Second Memory holds an AES-256-GCM encrypted copy of every durable vault file plus an encrypted authoritative vault manifest. Recovery on a fresh machine is:

```text
fresh local runtime
  -> hydrate the full file-native vault/state from Supabase Second Memory
  -> validate the logical root hash against the manifest
  -> rebuild the Graphify projection
  -> serve memory
```

Content is encrypted before transport. Client authentication uses a project-local Ed25519 signing key; Supabase stores only the public key. The public RPC verifies timestamp, replay nonce, and detached signature before touching private tables, and the private schema exposes no table grants to anonymous, authenticated, or public roles.

## Disable memory for an operator diagnostic

Memory can be disabled without touching the vault. Exit Agent Code first, then start Agent Core from a diagnostic shell with memory disabled:

```powershell
$env:AGENT_CORE_MEMORY_ENABLED = 'false'
node dist\index.js
```

`capability_route` and existing operational tools continue to work; memory status is reported as disabled and no memory evidence is fabricated.

To return to normal operation, stop that diagnostic process, clear the temporary override, and start Agent Code:

```powershell
Remove-Item Env:AGENT_CORE_MEMORY_ENABLED -ErrorAction SilentlyContinue
& ".\SubProject\Agent-Code\Agent Code Native.exe"
```

## Secret handling

Memory redacts secret-like keys and text before indexing/persistence used by recall. Memory search/export must not echo plaintext API keys, authorization values, passwords, access/refresh tokens, or similar known secret patterns.

The raw Agent Core API key itself is not required by memory. Authentication/key storage remains a separate Agent Core subsystem. Graphify subprocesses run with a minimal credential-free environment rather than inheriting the ambient process environment.

## Deterministic behavior

For identical vault state, scope, query, configuration, and recency scoring day, recall ordering and snapshot hash are deterministic. Retrieval combines bundled project-local ripgrep lexical recall, exact structured anchors, bounded graph traversal over the Graphify projection, state/importance/recency scoring, and explicit provenance. Graph expansion starts only when lexical candidates exist. No hidden AI performs extraction, embeddings, reranking, contradiction resolution, or cleanup.

Relations are written explicitly by the memory layer as part of the canonical file-native state and then projected into Graphify. Relation policy, semantic profiling, and normalization are pure logic over that state; none of them opens a database.

When memory consumes execution-derived evidence, the execution truth hierarchy remains authoritative:

```text
PROCESS TRUTH
>
VERIFIED ARTIFACT TRUTH
>
PARSED STRUCTURED INTERPRETATION
>
ARTIFACT/CACHE SUGGESTION
>
WORKFLOW ADVICE
```

Memory may persist selected redacted process failures, verified artifact metadata, and bounded parsed facts for later recall, but it must not promote raw stdout/stderr wholesale or allow a derived/cache/advice layer to rewrite higher-authority process or artifact truth. A workflow-advisor suggestion is context, not durable proof of completion. A reusable-artifact match is advisory only and cannot justify skipping a current command.

## Turn memory lifecycle

`capability_route` performs memory preflight before substantive work. The default lifecycle mode is `enforce`. Before its final answer, the client closes through `memory_turn_finalize` or a successful `task_checkpoint` that records its memory decision and returns a synchronized `CLOSED` lifecycle. A new decision must not be submitted to an already closed lifecycle. Failed closure remains pending and the same closing request can be retried after restart. `NO_DURABLE_MEMORY` requires an explicit persisted reason. Agent Core cannot intercept conversation output or unrelated tools outside its own interfaces. See the [current stability contract](stability.md) for readiness, ownership, recovery, and verification requirements.

Existing relevant files are preferred before new memory files are created. Successor files use explicit same-context continuity chains, while cross-context relationships stay semantic graph edges rather than continuation links.

## Autonomous memory adoption in routing

`capability_route` does not treat relevant memory as sideband metadata only. After the normal deterministic preflight, Agent Core builds a bounded routing projection from recalled decisions, prior failures, and other non-guardrail memory and passes that projection into `CapabilityRouter` together with the user's original context.

The projection is deterministic, bounded to a small item/character budget, and reported through `memoryInjection` (`applied`, memory IDs, character count, omitted count). It does not expand permissions, project scope, tool availability, or user intent. Active hard guardrails are deliberately excluded from capability-ranking text because their authority is enforced separately by the route context; they are not keyword hints.

Relevant memory state can therefore change capability ranking automatically without requiring the model to issue a duplicate `memory_search`. `memorySummary`, `memoryDirective`, `blockingGuardrails`, `priorFailures`, and `relatedDecisions` remain available for factual inspection and explanation.

## Continuity Ledger

The Local Agent Continuity Ledger is part of the same file-native memory state. Continuity does not create a separate store or network service; task/turn/checkpoint/frontier records share the memory principal/project isolation, backup, integrity, and recovery boundary described above.

The ledger stores observable task state only: routed turns, task objective/criteria/constraints/status, explicit task dependencies, structured evidence checkpoints, deferred work, and bounded next-work frontier. It does not store private chain-of-thought.

A process exit or execution terminal state is not equivalent to semantic task completion. The semantic task closes only through a successful terminal `task_checkpoint`. An unfinished turn remains open/interrupted and can be surfaced to a later authenticated route.

Continuity snapshots are bounded and deterministically ordered. Current active/deferred/blocked/frontier state is queried separately from semantic chatter so old or unrelated conversation cannot displace factual project continuation merely because it is recent.

See `docs/local-agent-continuity.md` for the route/checkpoint/resume contract and `docs/deterministic-execution-fabric.md` for the separate high-frequency execution state.

## Recall quality gate

Memory quality is a repo-owned deterministic certification surface rather than a set of hand-picked scenarios. The corpus in `tests/fixtures/quality/memory-corpus.json` runs against the real memory service and the production vault/lexical/graph/revision pipeline. No embedding API, cloud reranker, AI judge, or external model participates in scoring.

The gate asserts recall, ranking, and isolation properties together:

```text
Recall@K
MRR
hard-guardrail recall
current-revision correctness
prior-failure recall
graph-target recall
conflict visibility
artifact/procedure recall
noise displacement rate
cross-project contamination
cross-principal contamination
character-budget correctness
deterministic replay equality
```

`npm run quality:gate` runs inside `npm run verify:release`; a release cannot pass while a certified routing/memory threshold fails. A scale gate additionally measures end-to-end preflight/recall latency against a `< 150 ms` p95 target on a large corpus.
