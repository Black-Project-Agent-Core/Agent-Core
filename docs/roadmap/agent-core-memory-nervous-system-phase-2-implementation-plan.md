# Memory Nervous System Phase 2 — Private Memory Remote Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` and `superpowers:test-driven-development`. Phase 2 begins only from a certified schema-v3 Phase 1 SHA and publishes each green checkpoint to the feature branch.

**Goal:** Make the logical DMF/continuity state survive permanent Codespace deletion through a separate encrypted Private Memory Remote, verified write-through synchronization, and deterministic fresh-workspace hydration.

**Architecture:** Local SQLite remains the fast, authoritative working materialization for an active Codespace. A narrow `MemoryRemoteTransport` adapter over existing Native GitHub Fabric stores immutable encrypted logical envelopes and generation manifests in a dedicated private repository separate from Agent Core source. Remote durability is confirmed only after non-force push plus readback/hash verification. Hydration builds a fresh SQLite materialization from a verified remote checkpoint/tail and compares a deterministic logical-state hash before memory-authoritative work may trust it.

**Tech Stack:** TypeScript 7, Node.js >=24.15, Node `crypto` AES-256-GCM, existing Native GitHub Fabric Git service, existing worker-backed SQLite DMF, Vitest, local bare-Git fixtures for deterministic transport tests.

**Spec:** `docs/roadmap/agent-core-cross-session-memory-nervous-system-design.md`

## Global Constraints

- Private Memory Remote repository is separate from `Black-Project-Agent-Core/Agent-Core` source `main`.
- No live SQLite database file is stored as the primary Git remote object.
- Remote semantic/continuity payloads are encrypted at the application layer before writing to the private repository.
- Encryption key is independent of GitHub/OAuth/API credentials and never committed or printed.
- Remote Git pushes are never force pushes.
- `REMOTE_SYNCED` requires remote readback verification of the expected generation/object hash.
- A failed or unreachable remote does not become `REMOTE_EMPTY_CONFIRMED`.
- A fresh Codespace with configured prior remote state fails closed for memory-authoritative mutation until hydration succeeds.
- Already-hydrated local work may continue under policy during an outage, but new durable mutations remain `REMOTE_PENDING`.
- Remote transport is durability infrastructure, never a second semantic conflict resolver.
- No external AI/model/API dependency.

---

## File Structure

### New production files

- `src/memory/remote-types.ts` — remote format, envelope, generation, transport, and error contracts.
- `src/memory/remote-crypto.ts` — key loading/validation and authenticated encryption/decryption.
- `src/memory/logical-state-hash.ts` — deterministic logical DMF/continuity snapshot projection and SHA-256 hash.
- `src/memory/remote-journal.ts` — canonical encrypted remote object generation and replayable records.
- `src/memory/remote-transport.ts` — narrow Git transport adapter interface and Native GitHub Fabric implementation.
- `src/memory/remote-sync.ts` — optimistic non-force push/readback protocol.
- `src/memory/remote-hydrator.ts` — fresh-workspace restore/replay/materialization verification.

### Modified production files

- `src/config.ts` — bounded Memory Remote configuration and dedicated key path.
- `src/runtime/services.ts` — construct GitHub service before memory service and inject only the narrow remote transport dependency.
- `src/memory/service.ts` — compose optional synchronizer/hydrator and expose truthful remote status.
- `src/memory/cognition-ledger.ts` — store local durability/hydration generation state from Phase 1.
- `src/memory/store.ts` — expose deterministic logical replay primitives through bounded typed methods rather than raw SQL from the network layer.
- `scripts/codespace/bootstrap.sh` / `scripts/codespace/ensure-running.sh` — later in this phase, hydrate configured remote before memory-authoritative readiness; source checkout logic remains separate.

### Tests

- `tests/memory-remote-config.test.ts`
- `tests/memory-remote-crypto.test.ts`
- `tests/memory-logical-state-hash.test.ts`
- `tests/memory-remote-journal.test.ts`
- `tests/memory-remote-sync.test.ts`
- `tests/memory-remote-hydration.test.ts`
- `tests/memory-remote-concurrency.test.ts`
- `tests/memory-remote-deletion-recovery.acceptance.test.ts`
- relevant existing `tests/memory-recovery.test.ts`, `tests/continuity-resume.acceptance.test.ts`, `tests/codespace-fresh-machine.test.ts`.

---

### Task 1: Add Explicit Memory Remote Configuration With Safe Disabled Default

**Files:**
- Modify: `src/config.ts`
- Create: `tests/memory-remote-config.test.ts`

**Interfaces:**

```ts
export interface MemoryRemoteConfig {
  enabled: boolean;
  owner: string | null;
  repo: string | null;
  branch: string;
  keyFile: string | null;
  workRoot: string;
  syncTimeoutMs: number;
  maxRetryAttempts: number;
}
```

`MemoryConfig` gains `remote: MemoryRemoteConfig`.

Environment contract:

```text
AGENT_CORE_MEMORY_REMOTE_ENABLED
AGENT_CORE_MEMORY_REMOTE_OWNER
AGENT_CORE_MEMORY_REMOTE_REPO
AGENT_CORE_MEMORY_REMOTE_BRANCH
AGENT_CORE_MEMORY_REMOTE_KEY_FILE
AGENT_CORE_MEMORY_REMOTE_WORK_ROOT
AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS
AGENT_CORE_MEMORY_REMOTE_MAX_RETRIES
```

- [ ] Write RED tests proving disabled default requires no network/key, enabled config requires owner/repo/keyFile, repository identifiers reject path/control characters, key file resolves locally, and branch is bounded.
- [ ] Run `npx vitest run tests/memory-remote-config.test.ts` and observe expected failure.
- [ ] Implement config parsing with remote disabled by default outside an explicitly configured profile.
- [ ] Run config tests + `npm run build` + `git diff --check`.
- [ ] Commit `feat: add private memory remote configuration`, push feature branch, fetch/readback exact SHA.

---

### Task 2: Implement Dedicated Authenticated Encryption

**Files:**
- Create: `src/memory/remote-crypto.ts`
- Create: `tests/memory-remote-crypto.test.ts`

**Interfaces:**

```ts
export interface EncryptedMemoryPayload {
  format: 'agent-core-memory-aes256gcm-v1';
  nonce: string;
  ciphertext: string;
  authTag: string;
  plaintextHash: string;
}

export class MemoryRemoteCrypto {
  static fromKeyFile(path: string): Promise<MemoryRemoteCrypto>;
  encrypt(plaintext: Uint8Array, aad: string): EncryptedMemoryPayload;
  decrypt(payload: EncryptedMemoryPayload, aad: string): Uint8Array;
}
```

Key file contract: exactly 32 raw bytes or 64 hexadecimal characters after a single trailing newline trim. The code never accepts GitHub tokens as encryption keys.

- [ ] RED tests: round trip, deterministic plaintext hash but randomized nonce/ciphertext, tamper rejection, wrong AAD rejection, wrong key rejection, malformed key rejection, no plaintext occurrence in serialized encrypted payload.
- [ ] Run RED.
- [ ] Implement AES-256-GCM using `node:crypto` only; no new dependency.
- [ ] Run GREEN/build/diff.
- [ ] Commit/push/readback.

---

### Task 3: Define Canonical Logical State Projection and Hash

**Files:**
- Create: `src/memory/logical-state-hash.ts`
- Create: `tests/memory-logical-state-hash.test.ts`
- Modify: `src/memory/service.ts` or add a narrow store accessor only as needed.

**Interfaces:**

```ts
export interface MemoryLogicalStateProjection {
  formatVersion: 1;
  scope: { principalId: string; projectId: string };
  items: unknown[];
  revisions: unknown[];
  anchors: unknown[];
  edges: unknown[];
  conflicts: unknown[];
  nodeMetadata: unknown[];
  writeDecisions: unknown[];
  edgeEvents: unknown[];
  continuityTasks: unknown[];
  continuityDependencies: unknown[];
  continuityCheckpoints: unknown[];
  continuityFrontier: unknown[];
}

export function hashMemoryLogicalState(projection: MemoryLogicalStateProjection): string;
```

Exclude volatile/transient fields that do not define durable logical truth:

```text
memory_access_log
memory_contexts
last_accessed_at
access_count
local DB file metadata
local remote sync status itself
```

Keep current semantic/revision/graph/conflict/provenance/terminal continuity state needed for deterministic rebuild.

- [ ] RED tests prove hash is stable across row insertion/query order and access-log/recency mutations, but changes on semantic revision, edge, conflict, or terminal continuity change.
- [ ] Implement canonical key ordering and stable JSON encoding.
- [ ] GREEN/build/diff.
- [ ] Commit/push/readback.

---

### Task 4: Define Immutable Remote Envelope and Generation Format

**Files:**
- Create: `src/memory/remote-types.ts`
- Create: `src/memory/remote-journal.ts`
- Create: `tests/memory-remote-journal.test.ts`

**Interfaces:**

```ts
export type MemoryRemoteObjectKind = 'event-batch' | 'recovery-checkpoint';

export interface MemoryRemoteEnvelope {
  formatVersion: 1;
  objectId: string;
  scopeId: string;
  kind: MemoryRemoteObjectKind;
  previousGeneration: string | null;
  logicalStateHash: string;
  payloadHash: string;
  createdAt: number;
  encryptedPayload: EncryptedMemoryPayload;
}

export interface MemoryRemoteManifest {
  formatVersion: 1;
  generationId: string;
  scopeId: string;
  previousGeneration: string | null;
  objectIds: string[];
  logicalStateHash: string;
  createdAt: number;
}
```

Opaque scope ID:

```text
sha256("agent-core-memory-scope-v1\0" + principalId + "\0" + projectId)
```

Repository layout:

```text
format.json
scopes/<opaque-scope-id>/objects/<object-id>.json
scopes/<opaque-scope-id>/manifests/<generation-id>.json
scopes/<opaque-scope-id>/HEAD
```

The envelope file contains metadata plus encrypted payload, never plaintext semantic content.

- [ ] RED tests prove canonical object IDs/hashes, opaque scope naming, immutable path selection, previous-generation linkage, deterministic manifest hash, malformed format rejection, and no project/user text leakage in paths.
- [ ] Implement journal encoding/decoding/validation.
- [ ] GREEN/build/diff.
- [ ] Commit/push/readback.

---

### Task 5: Create Narrow Remote Git Transport Over Native GitHub Fabric

**Files:**
- Create: `src/memory/remote-transport.ts`
- Create: `tests/memory-remote-sync.test.ts` initial transport contract cases.
- Modify: `src/runtime/services.ts`

**Interfaces:**

```ts
export interface MemoryRemoteTransport {
  ensureCheckout(): Promise<{ cwd: string }>;
  fetch(): Promise<void>;
  currentRemoteHead(): Promise<string | null>;
  readFile(relativePath: string): Promise<Uint8Array | null>;
  writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void>;
  commit(message: string): Promise<string>;
  pushNonForce(): Promise<void>;
  resetToRemoteHead(): Promise<void>;
}
```

`GitHubMemoryRemoteTransport` receives existing `GitHubGitService`, `WorkspacePolicy`, `MemoryRemoteConfig`, and a bounded process/file adapter. It must never invoke `push({ force: true })`.

Runtime composition change:

```ts
const github = new GitHubService(...);
const memoryRemoteTransport = config.memory.remote.enabled
  ? new GitHubMemoryRemoteTransport(github.git, workspace, config.memory.remote)
  : undefined;
const memory = new MemoryService(config.memory, metrics, { remoteTransport: memoryRemoteTransport });
```

- [ ] RED tests use a fake/narrow transport and inspect GitHub adapter calls to prove force is never requested and credentials are never embedded in URLs/files.
- [ ] Implement adapter and runtime dependency order.
- [ ] GREEN existing GitHub + memory/runtime tests.
- [ ] Commit/push/readback.

---

### Task 6: Implement Write-Through Synchronization and Readback Truth

**Files:**
- Create: `src/memory/remote-sync.ts`
- Expand: `tests/memory-remote-sync.test.ts`
- Modify: `src/memory/service.ts`
- Modify: `src/memory/cognition-ledger.ts`

**Interfaces:**

```ts
export class MemoryRemoteSynchronizer {
  sync(input: {
    scope: MemoryScope;
    object: MemoryRemoteEnvelope;
    manifest: MemoryRemoteManifest;
  }): Promise<{
    state: 'REMOTE_SYNCED';
    generationId: string;
    remoteHead: string;
    logicalStateHash: string;
  }>;
}
```

Failure throws a typed error and the local ledger remains `REMOTE_PENDING`, `REMOTE_CONFLICT`, or `REMOTE_UNAVAILABLE`; it never returns synced.

Protocol under test:

```text
fetch
→ read remote HEAD/generation
→ verify expected predecessor
→ write immutable object + manifest + logical HEAD file
→ commit
→ non-force push
→ fetch
→ read back HEAD file + manifest + object
→ verify object/payload/logical hashes
→ mark REMOTE_SYNCED
```

- [ ] RED tests: successful readback, push failure, remote advanced before push, readback mismatch, object missing after push, network unavailable. In every failure case assert `REMOTE_SYNCED` is absent.
- [ ] Implement synchronizer with bounded retries only for non-fast-forward transport races.
- [ ] GREEN/build/diff.
- [ ] Commit/push/readback.

---

### Task 7: Implement Deterministic Fresh-Workspace Hydration

**Files:**
- Create: `src/memory/remote-hydrator.ts`
- Create: `tests/memory-remote-hydration.test.ts`
- Modify: `src/memory/store.ts` with bounded replay/materialization APIs.
- Modify: `src/memory/service.ts`.

**Interfaces:**

```ts
export class MemoryRemoteHydrator {
  hydrate(scope: MemoryScope, destinationDbPath: string): Promise<
    | { state: 'REMOTE_EMPTY_CONFIRMED'; remoteHead: string | null }
    | { state: 'REMOTE_HYDRATED'; generationId: string; logicalStateHash: string; remoteHead: string }
  >;
}
```

Hydration algorithm:

```text
fetch/verify remote format
→ resolve logical remote HEAD for opaque scope
→ if absent and repository access succeeded: REMOTE_EMPTY_CONFIRMED
→ load manifest/object chain
→ decrypt and validate hashes
→ materialize into a temporary fresh SQLite DB
→ PRAGMA integrity_check
→ recompute logical-state hash
→ exact equality to manifest hash
→ atomically install destination DB
→ REMOTE_HYDRATED
```

Failures map to explicit hydration states/codes and leave the original destination untouched.

- [ ] RED tests: empty-confirmed, successful hydrate, auth/unavailable distinction, decrypt failure, payload hash failure, logical hash failure, replay failure, destination rollback preservation.
- [ ] Implement bounded replay with temp DB + atomic replacement.
- [ ] GREEN memory recovery tests/build/diff.
- [ ] Commit/push/readback.

---

### Task 8: Prove Permanent Codespace Deletion Recovery

**Files:**
- Create: `tests/memory-remote-deletion-recovery.acceptance.test.ts`
- Create/modify fixtures under `tests/fixtures/memory-remote/` only if static fixture bytes are useful.

**Scenario:**

1. Create Codespace-A-like temporary workspace.
2. Materialize A1 root, A2 branch, A3 failure, A4 solution, A5 validation, revision history, typed edges, a terminal continuity checkpoint, and a conflict record.
3. Compute logical state hash.
4. Sync and read back remote generation.
5. Close service and recursively delete all local runtime/memory state.
6. Create unrelated empty Codespace-B-like workspace.
7. Hydrate from the same Memory Remote fixture.
8. Compare current memories, revisions, graph relations, continuity checkpoint/frontier, conflicts, provenance/decision ledgers, and logical state hash.

Required assertion:

```ts
expect(restored.logicalStateHash).toBe(original.logicalStateHash);
expect(restoredProjection).toEqual(originalProjection);
```

Also scan remote working-tree files and assert the known semantic plaintext values do not occur.

- [ ] Run RED before hydration is complete.
- [ ] Make only the minimum implementation corrections necessary for exact equality.
- [ ] Run GREEN repeatedly from fresh temp directories.
- [ ] Commit/push/readback.

---

### Task 9: Prove Concurrent Writer Reconciliation Without Force

**Files:**
- Create: `tests/memory-remote-concurrency.test.ts`
- Modify: `src/memory/remote-sync.ts` only if RED demonstrates a reconciliation gap.

**Scenario:** two independent local clones start at the same remote generation. Writer A adds immutable event A and pushes. Writer B adds event B and initially gets a non-fast-forward. Writer B fetches, verifies immutable objects, constructs a new generation containing both remote truth plus B's object, pushes non-force, and readback-verifies.

Assertions:

```text
force push calls                         0
A object preserved                       true
B object preserved                       true
remote generation chain valid            true
transport conflict silently discarded    false
```

Semantic contradictions inside A/B payloads are not auto-resolved by Git transport; they remain input to the memory conflict layer.

- [ ] RED concurrency fixture.
- [ ] Implement bounded deterministic retry/reconciliation.
- [ ] GREEN plus repeated run.
- [ ] Commit/push/readback.

---

### Task 10: Codespace Bootstrap Hydration Gate and Phase 2 Certification

**Files:**
- Modify: `scripts/codespace/bootstrap.sh`
- Modify: `scripts/codespace/ensure-running.sh`
- Modify/create a bounded memory hydration CLI entry in `src/cli.ts` if necessary.
- Modify: `tests/codespace-fresh-machine.test.ts`
- Create: `tests/codespace-memory-hydration.test.ts`
- Append factual evidence to roadmap docs after fresh verification.

**Bootstrap contract when Memory Remote is enabled:**

```text
source checkout/build
→ resolve durable memory configuration
→ inspect/hydrate memory remote before memory-authoritative runtime readiness
→ REMOTE_HYDRATED or REMOTE_EMPTY_CONFIRMED
→ continue runtime bootstrap
```

Failure states such as remote unavailable/auth/decrypt/integrity/replay failure must be surfaced explicitly and must not create a new authoritative empty memory DB for an existing configured remote scope.

- [ ] RED Codespace script tests using deterministic fake CLI outcomes.
- [ ] Implement hydration gate without altering source-sync safety guardrails.
- [ ] Run focused Phase 2 suite.
- [ ] Run all memory/continuity/execution-memory/Codespace regression tests.
- [ ] Run `npm run quality:gate`.
- [ ] Run `npm run benchmark:memory`; retain `<150 ms` preflight gate.
- [ ] Run `npm run verify:release`.
- [ ] Run remote plaintext scan and dependency/model guardrail scan.
- [ ] Record only fresh evidence, commit `docs: certify memory nervous system phase 2`, push/readback exact SHA.

**Phase 2 completion rule:** cross-Codespace durability is not certified until the deletion/recreation acceptance test, remote readback verification, concurrent-writer non-force test, and fresh full release gate all pass on the exact remote-visible SHA.

---

# Phase 2 Certification Evidence — 2026-09-01

The implementation tasks above were executed with RED -> GREEN -> regression/build -> GitHub push/readback checkpoints. Final implementation candidate:

```text
57c975eb8d89605c45b7390014401b30a17813e1
```

Remote-visible checkpoints:

```text
63bbb1e  remote configuration
f2de223  authenticated encryption
c65d48c  canonical logical-state hash
37abe5e  immutable remote journal format
2c8c498  Native GitHub Fabric remote transport
a00f116  write-through sync + readback truth
189994a  deterministic fresh-workspace hydration
62526bd  permanent local-deletion recovery acceptance
edaa5c1  bounded concurrent-writer reconciliation
57c975e  Codespace hydration startup gate
```

Fresh Phase 2 gates:

```text
focused test files                         65 PASS
focused tests                              281 PASS / 1 skip
quality gate                               PASS
100k memory preflight p95                  59.275 ms < 150 ms
verify:release terminal exit               0
full test files                            148 PASS / 2 skipped
full tests                                 724 PASS / 38 skipped
release consistency                        PASS
doc links                                  44 markdown / 17 relative links PASS
package dependency changes                 none
external AI/model/API integration          none
```

Durability acceptance:

```text
remote application encryption              PASS
known plaintext remote leakage             0
principal/project plaintext leakage        0
failed readback -> REMOTE_SYNCED            0
force push                                 0
concurrent A+B immutable preservation       PASS
different logical-state hash merge          rejected as conflict
local delete -> fresh hydrate projection    exact equality
local delete -> fresh hydrate hash          exact equality
remote unavailable -> empty authority       0
fresh startup unverified local DB trust     0
```

The Codespace bootstrap key contract uses a dedicated Memory Remote encryption secret, independent of GitHub and Agent Core/ChatGPT credentials. The remote remains disabled by default and requires explicit remote/scope configuration.

**Certification boundary:** Phase 2 certifies the remote durability primitives, synchronization/readback protocol, encrypted deletion recovery, concurrent transport behavior, and fresh-Codespace hydration gate. It does not yet claim universal automatic remote synchronization for every normal memory/continuity/execution mutation; that lifecycle adoption remains assigned to later program phases.
