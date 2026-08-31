# K3 State and Execution Transactions

Status: Phase 0 source-derived research

Canonical reference:

- repository: `https://github.com/FareedKhan-dev/kimi-k3-in-c`
- pinned revision: `117e9d29bde14db9742f54fb66a191fd0bf03903`

Purpose: extract the state-ownership and execution-commit rules that matter for a persistent AI-agent runtime.

## State in K3 is not one object

The runner carries several categories with different lifetimes:

```text
model weights
- persistent for model/worker lifetime or streamed

expert/trunk residency
- performance state; reconstructable from storage

KDA + ShortConv state
- semantic sequence state; updated in place

MLA KV + rope rows
- semantic positional sequence state

AttnRes block buffer
- forward scratch; rebuilt, not persisted

prompt/token sequence
- semantic history / persistence metadata
```

K3's state-file comment explicitly says AttnRes block memory is not serialized because `forward()` rebuilds it. This is a useful distinction for Super-Runtime: not every live buffer belongs in a session checkpoint.

## `forward()` has a fail-closed output contract

The runner documents that `forward()` returns `-1` on failure and intentionally leaves `logits_last` untouched. The caller must check the status before argmax.

The reason is concrete: argmaxing an untouched output buffer can turn uninitialized memory into an apparently legitimate token.

The forward loop also aborts if a routed expert fails to load. It compares the global expert-drop counter before and after each layer and refuses to continue with partial MoE output.

This establishes a general rule:

```text
partial compute != valid inference result
```

For Super-Runtime, token/result publication must occur only after every semantic dependency for that step has committed successfully.

## Exact forward state is mutated in place

Incremental KDA/ShortConv state and KV state are updated during forward execution, not after a separate commit stage.

This is efficient but has an implication for a long-lived server: if a forward fails after mutating some layers, the session state may be partially advanced.

K3 handles ordinary forward failure by aborting the run rather than attempting to continue the same session. This is acceptable for a CLI process but is insufficient as a general persistent-agent service contract.

### Super-Runtime extraction

A persistent worker needs a semantic transaction boundary such as:

```text
SESSION_STATE_COMMITTED(N)
          |
          v
begin inference transaction
          |
          +-- mutable working state / COW / snapshot
          |
          v
all graph + residency operations succeed
          |
          v
COMMIT state N+k + publish tokens
```

Failure before COMMIT must leave the prior committed state recoverable.

The implementation may use snapshots, copy-on-write pages, architecture-specific rollback, or recomputation. The semantic rule should be universal even if the mechanism is not.

## Speculative decode demonstrates the transaction explicitly

K3's speculative path is especially instructive because it intentionally feeds tokens that may later be rejected.

Before verification it snapshots recurrent state:

```text
spec_snap <- exact KDA/ShortConv state
```

It then runs the exact model over the pending position plus drafted positions in one batch.

If every draft is accepted, the resulting state is already authoritative.

If a draft is rejected, source comments state that recurrent state has absorbed rejected tokens. K3 therefore:

```text
restore recurrent snapshot
reset cached position
replay accepted prefix only
```

The replay also rewrites the corresponding KV rows, preventing stale rejected-token state from surviving.

This is a textbook state transaction:

```text
SPECULATE
   |
   v
VERIFY
   |
   +-- all accepted --> COMMIT
   |
   +-- partial ------> ROLLBACK + REPLAY accepted prefix --> COMMIT
```

### Super-Runtime extraction

Speculative execution, draft models, tool-planning previews, or future parallel decoding may use approximate/untrusted computation, but only verified state may cross the session commit boundary.

This is analogous to database MVCC more than to a stateless tensor call.

## Draft state is intentionally non-authoritative

K3's hybrid draft model can use cache-only routing: it restricts routing to already resident experts and renormalizes over them, reading no new expert bytes.

The comments explicitly call this an approximation. It is legal because the draft only proposes tokens; the exact model verifies every emitted token.

This suggests a broader Super-Runtime design principle:

```text
approximate execution is safe when authority is explicit
```

Possible future examples:

- low-cost draft model;
- lower-precision speculative path;
- cache-biased proposal path;
- accelerator-specific approximation.

None may mutate authoritative session state irreversibly before verification.

## Resume handling exposes a subtle continuation invariant

On an incremental resumed session, generation step zero must feed **everything not yet consumed**, not merely the number of tokens in the new prompt argument.

K3's current source comment records a prior bug: using the wrong count dropped the last new token from a resumed batch, so the first generated token came from a context one token short.

Again the failure was:

```text
fluent
plausible
wrong
```

The corrected path computes:

```text
base = cached positions
nT0  = total sequence length - base
forward(seq + base, nT0)
```

### Super-Runtime extraction

Session continuation needs explicit sequence-position semantics. A provider API must distinguish:

- committed positions;
- pending/unconsumed input tokens;
- newly appended messages/tool results;
- generated-but-not-yet-committed speculative positions.

A single vague `context_length` integer is not sufficient as the internal state model.

## K3 session files have useful compatibility checks

`K3StateHdr` includes:

- magic/version;
- a 12-int config fingerprint;
- bound-layer count;
- MLA-layer count;
- cached positions and sequence length;
- state/KV/rope geometry.

Before payload load, K3 checks:

```text
magic
state version
config fingerprint
bound-layer / MLA-layer counts
saved cached positions <= destination KV capacity
```

A differently sized destination KV allocation is allowed because only occupied position-major slices are stored.

These are good fail-closed practices.

## But the K3 fingerprint is not a sufficient universal model identity

The exact `k3_state_fp()` covers only:

```text
hidden
n_layers
vocab
kda_heads
kda_head_dim
conv_k
n_heads
qk_nope
qk_rope
v_head
n_experts
topk
```

The actual `K3Cfg` contains additional semantics that are not included, for example:

```text
rms_eps
gate_lb
q_lora
kv_lora
mla_out_gate
n_shared
latent
moe_inter
routed_scale
moe_renorm
latent_norm
first_dense
dense_inter
attn_res_block
situ_b1
situ_b2
full_attn layer map
```

The state file also does not bind itself to a checkpoint content identity in this header.

Therefore two models/configurations can be shape-compatible under this fingerprint while differing semantically.

This is not a claim that such a pair exists in the released K3 deployment; it is a source-level limitation of using this mechanism as a universal state identity.

### Super-Runtime requirement

A session-state compatibility fingerprint should include at least:

```text
state-format version
runtime semantic version
model/container content identity
architecture ID + complete semantic config digest
adapter version
state representation / KV type
quantization or relevant weight identity
context parameters that alter state interpretation
```

A restored session must fail closed when any semantic identity component is incompatible.

## The K3 state file is directly written, not transactionally replaced

`k3_state_save()` opens the destination with `fopen(path, "wb")` and writes header/payload sequentially to the final path.

If writing fails, it reports the failure. A later load detects truncated reads.

However, the source shown here does not implement an atomic temporary-file + durable-rename commit, nor a payload checksum/content digest.

For a CLI checkpoint this is understandable; for a long-lived agent service, a partially written or silently corrupted session artifact should not replace the last known-good committed state.

### Super-Runtime requirement

Persistent session save should use a durable transaction pattern appropriate to the OS, conceptually:

```text
write new generation to temporary object
validate size/checksum
flush required data/metadata
atomically publish generation
retain prior committed generation until publication succeeds
```

The exact Windows/Linux mechanism can differ behind the storage abstraction.

## Persisted state should be generation-based

A useful universal model is:

```text
Session S
  generation 41: committed
  generation 42: building
  generation 43: nonexistent
```

Inference can then operate against a known committed generation and either publish a new generation or discard it.

This supports:

- crash recovery;
- speculative rollback;
- model-worker restart;
- inactive-session cold storage;
- agent retries without duplicating semantic history.

## Residency state and semantic state must not be coupled

Expert/trunk cache contents can be dropped and reconstructed without changing the sequence's meaning.

KDA/KV/session state cannot be arbitrarily discarded unless it is persisted or recomputable from an authoritative sequence/checkpoint.

Therefore the global memory manager should classify state by recoverability:

```text
RECONSTRUCTABLE_RESIDENCY
- weight pages
- expert cache
- prefetch buffers

PERSISTABLE_SEMANTIC_STATE
- KV/recurrent state
- sequence positions

EPHEMERAL_SEMANTIC_WORKING_STATE
- in-flight speculative generation

RECOMPUTABLE_SCRATCH
- activations
- AttnRes block buffers
```

Under memory pressure, reclaim order must respect these semantics rather than simply evict the largest allocation.

## Portable I/O layer shows how semantics can stay stable across OSes

K3's `k3_portable_io.h` abstracts platform differences without exposing them to the cache/trunk algorithm.

The canonical source maps the common intents:

```text
positioned read
cache-bypassing/direct read when available
aligned allocation/free
large-read chunking
optional page advice
```

onto Linux, Darwin, and Windows mechanisms.

For Windows specifically, the source uses Win32 file handles and `ReadFile` with an `OVERLAPPED` offset to provide positioned-read semantics, and `_aligned_malloc/_aligned_free` for aligned arenas.

The important Super-Runtime lesson is not to copy individual macros. It is to define portable **semantic capabilities**:

```text
POSITIONED_READ
DIRECT_OR_UNBUFFERED_READ
ASYNC_READ
ALIGNED_ARENA
PAGE_ADVICE
ATOMIC_STATE_PUBLISH
WORKING_SET_TELEMETRY
HARD_PROCESS_MEMORY_LIMIT
```

Each OS backend should report which capabilities are native, emulated, advisory, or unavailable.

## Language boundary implication

Session transaction logic belongs primarily in the native worker/runtime domain because it coordinates directly with graph execution, KV/recurrent buffers, and residency safe points.

The Rust control plane should orchestrate coarse state transitions:

```text
create session
run request
commit generation
checkpoint generation
restore generation
close session
```

but should not copy the full KV/recurrent state across the language boundary per token.

## Proposed Super-Runtime inference transaction

A stronger universal contract emerging from K3 is:

```text
REQUEST ADMISSION
- validate model/session identity
- reserve memory/state budget
- verify required storage/device capabilities

BEGIN GENERATION
- bind committed session generation
- create working semantic state transaction

FOR EACH GRAPH PHASE
- ensure required weight residency
- lease ranges
- execute
- release safe ranges
- abort on missing/corrupt dependency

SPECULATIVE PATH (optional)
- proposals remain non-authoritative
- exact/authoritative path verifies
- rollback rejected semantic state

COMMIT
- only after forward success
- publish tokens/tool-facing result
- advance session generation atomically

CHECKPOINT (optional)
- persist generation with compatibility identity + integrity digest
```

This is substantially stronger than a stateless `generate(prompt) -> text` abstraction and is more appropriate for agent workloads.

## Current conclusion

K3's state machinery demonstrates the same principle as its expert cache at a larger semantic scale:

> publication is a state transition that must happen only after the underlying work is known valid.

For weights, that means `INFLIGHT -> READY` only after successful I/O.

For speculative decode, that means proposal -> committed state only after exact verification.

For Super-Runtime agent sessions, the same pattern should become a universal transaction model covering inference results, context state, checkpoint persistence, and residency leases.
