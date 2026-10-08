# Agent-OS (smartcomputer-ai) - Steal / Use Integration Plan

> **Status:** COMPLETE FOR APPROVED ADOPTION - AOS-P1/P2 RESIDENT VERIFIED - CONSUMER REFERENCE
> **Grounded:** 2026-09-29
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/agent-os`
> **Revision:** `ec63cb775306f0728a65a4045b6b0457a025af36`, branch `main`, clean working tree.
> **Origin:** `https://github.com/smartcomputer-ai/agent-os.git`
> **Identity:** Rust workspace version 0.1.0; this is not the similarly named Builder Methods project.
> **License:** executable code Apache-2.0; NOTICE attributes Smart Computer Co and contributors. `LICENSE-SPEC` separately applies CC BY 4.0 to AIR specifications; do not conflate the two.

## 1. Selection and boundaries

Two independent choices survive comparison with current native consumers: **AOS-P1 verified overflow-artifact retrieval**, and **AOS-P2 optional credential-bound tool grants**. Both were explicitly approved and are implemented natively; section 7 records qualification and section 8 records the confirmed restart plus the remaining restricted-credential HTTP verification. P2 remains a separate opt-in authorization contract, not an automatic restriction on existing keys.

No AIR/WASM kernel, second agent loop, CAS database, policy router, global execution DAG, daemon, model provider, governance engine or fabric cluster is required for either native adaptation. Existing Memory, Code Intelligence, process management and mutation safety remain their current owners. No current API key or authorization state is changed in this task.

## 2. Source grounding

The audit hashed **816 available non-Git files / 7,672,951 bytes**; one `.env.example` was deliberately excluded. Eight Python files were AST-parsed with zero parse errors; Rust/TypeScript declaration indexes are lexical, not compiler validation. Source bodies/tests were read selectively across output materialization, persistence, registry/selection, receipt and shadow paths. No cargo/Python build, test, service or package import was run.

Git records `third_party/smolvm` at `f83a1bbdbb7abdde79c481dfe32df43934b59427`, but its checkout directory is empty. Its runtime implementation was not inspected or fetched; this audit cannot qualify that sandbox. The incomplete optional subtree is not mistaken for a proven working dependency or a reason to delete the parent reference.

Native Grafel was current before source/impact review. `applyResultBudget` resolves to `src/mcp/result-budget.ts`; its impact reaches the MCP wrapper and result-budget tests. Actual source confirms the read_file consumer and credential propagation; graph evidence never establishes authorization or integrity by itself.

## 3. AOS-P1 - integrity-bound large-result retrieval

**APPROVED AND IMPLEMENTED - AOS-P1.** Consumer: a controller receiving an oversized tool result already gets an artifact path and is instructed to read it with `read_file`. The proposed improvement binds that later read to the original redacted serialized bytes, rather than trusting a mutable pathname alone. This is a source-level integrity gap, not a claim that corruption has already occurred.

### 3.1 Donor and native evidence

`crates/aos-effect-adapters/src/adapters/host/output.rs:1-154` switches between small inline output and a blob record carrying content hash, byte length and preview. Its defaults are 16 KiB inline / 512-byte preview, which are donor choices, not proposed replacements for native budgets. `crates/aos-node/src/infra/blobstore/fs_cas.rs:87-106` recomputes the stored blob hash on get and refuses a mismatch. Host integration tests at `adapters_host_integration.rs:111-182` inspect the large-output blob/length/preview path; `aos-node/tests/blobstore.rs:12-82` covers reopen/round-trip/missing data. Tests were read, not run; those tests do not prove hostile-filesystem security.

Native `src/mcp/result-budget.ts:101-206` already redacts and spills large eligible results, returns `_meta.resultBudget.artifact`, and preserves selected non-text content. It reports original serialized size, but does not return a digest of the actual pretty-printed persisted bytes. `tests/mcp-result-budget.test.ts:22-51` confirms intended redaction/spill/non-persistable semantics, not tamper-bound readback.

`src/rdc/handlers/filesystem-handlers.ts:77-129` accepts an options record but currently only forwards projection plus normal read controls. `src/rdc/tools/filesystem.ts:446-613` validates paths/regular files and then selects a reader; `ReadOptions` has no expected digest. A new metadata field alone would therefore not be an adopted integrity mechanism: the read consumer must verify it.

### 3.2 Proposed contract and implementation

1. In the existing spill writer, serialize the redacted artifact once to exact UTF-8 bytes. Persist atomically using the existing owned-file primitive, then read back with bounded identity checks. Add `artifactIntegrity: { version: 1, algorithm: 'sha256', digest, storedBytes }` to result-budget metadata only when write/readback agrees. Keep `originalBytes` distinct from persisted pretty-JSON byte length. Do not hash raw secret-bearing output or confuse successful tool execution with successful artifact persistence.
2. Extend existing `read_file` via optional `options.expectedIntegrity: { digest, storedBytes }`, with strict SHA-256/size validation. Initially support only local UTF-8 JSON result artifacts beneath the dynamically resolved owned `runtime/tool-results` directory. Reject URL, directory, binary/document-projection and out-of-root requests in this mode. Regular reads without the option keep their existing contract.
3. Update actual forwarding in `filesystem-handlers.ts`, `utils/files/base.ts`, and BOTH `readFile`/`readFileFromDisk` in `tools/filesystem.ts`. Do not leave the field silently dropped by destructuring. A neutral helper such as `src/security/verified-result-artifact.ts` can own opened-descriptor validation and byte verification without importing the MCP server back into the filesystem layer.
4. Validate lexical/real containment, regular-file/reparse/symlink restrictions and opened file identity; reuse existing security/regular-file primitives. Read from the same descriptor into a capped byte snapshot, verify full length/hash, then paginate only that snapshot. Never validate one file and reopen the pathname for returned content. Same-size tampering and concurrent replacement must fail before any text is exposed as verified.
5. Proposed hard cap: 128 MiB for one verifiable artifact, aligned with the existing total spill budget; streamed admission/read limits must prevent growth beyond the cap. Bound returned page text to the existing MCP result budget. Negative/large offsets must not bypass input/output limits. Exceeding the cap reports an explicit unavailable/truncated artifact outcome, not a misleading valid digest or silent unbounded allocation.
6. Retain current redaction/non-persistable policy, 24-hour retention and count/total-size limits. Expired/missing/corrupt artifacts are reported explicitly; never re-execute the originating tool to recreate them. Spill failure stays fail-soft to the tool result and preserves its original isError meaning. This proposal does not repair unrelated cleanup/race logic by assumption.
7. Include digest/size and the integrity-aware read invocation in the human-readable bounded header, because some clients do not expose `_meta`. Normal read_file pagination remains usable without a verification claim. An expected digest establishes equality to supplied bytes, NOT signer authentication, semantic correctness or authorization to access otherwise forbidden files.

### 3.3 Acceptance specification - execution recorded in section 7

Create `tests/agent-os-result-integrity-adoption.test.ts`; proposed scope after permission: `npx vitest run tests/agent-os-result-integrity-adoption.test.ts tests/mcp-result-budget.test.ts`. Include a real handler round-trip, Unicode/pretty-JSON byte count, same-length tamper, truncate/grow, missing/expired file, symlink/reparse/path substitution, wrong digest/size, pagination from the verified snapshot, input/output caps, no-persistable-tool regression, small-result compatibility and fail-soft spill errors. Isolated fixtures only; no live result-store corruption or deletion.

Build and structural review are implementation-stage steps after selection. Receipt/readback is a native source redesign inspired by donor blob references; no AOS CAS, new network endpoint, autonomous retry or tool-count increase is needed.

## 4. AOS-P2 - optional credential-bound tool grants

**APPROVED AND IMPLEMENTED - AOS-P2, independently selected security-contract change.** Consumer: an explicitly scoped local verifier or integration client that needs only named Agent Core tools, rather than every registered capability. The completed temporary-browser-verifier workflow is a concrete example. No credential is minted or altered by this proposal.

### 4.1 What is actually taken from donor source

`crates/aos-agent/src/tools/registry.rs` validates registry key/name uniqueness and selectable bundles; its embedded tests include unknown-tool profile rejection. `helpers/workflow/tool_batch.rs:146-237` consults `selected_tool_ids` before planning execution and excludes calls outside that selected set. This is actual selection at execution planning, not only a model prompt suggestion.

**Important distinction:** donor selection is per workflow turn, not a server-authenticated API-key scope. Moving the explicit set-membership principle to a native credential boundary is the proposed Agent Core design extension. No claim is made that donor supports browser-only bearer tokens, localhost-only tokens, path-scoped authority, or authenticated signed receipts.

Native `src/auth/key-types.ts:1-33` has expiry/revocation metadata but no allowed tool set; `key-store.ts:58-153` issues/verifies/imports/rotates those keys. `src/http/auth.ts:14-23` authenticates them. `src/mcp/server.ts:159-212` uses key identity for mutation correlation, while all available tool families are registered without per-key restriction. `src/oauth/service.ts:88-96` resolves current key metadata for OAuth access tokens; it must carry any future restriction too, not become a widening bypass.

### 4.2 Proposed native contract

Add optional versioned grant metadata to newly provisioned keys, for example `toolGrant: { version: 1, allowedTools: string[] }`. Absent grant preserves legacy full-surface semantics. Present empty list means **no callable tools**, never full access. Malformed grants are invalid, not ignored. Use exact canonical tool names only, no wildcard/prefix/regex or group expansion. Bound to 128 unique names of maximum 64 characters; unknown names grant no capability and should be diagnosed at issuance against the available registry.

Attach the trusted grant to VerifiedKey using existing authentication; callers cannot override it in MCP params or request metadata. Restrict both tools/list exposure and tools/call dispatch with the same predicate, covering ALL registered families, not just the 28 machine-control wrappers. Direct calls to an omitted/forbidden name must fail before handler execution or side effects. Use the existing MCP registration/dispatch boundary; do not create a separate policy router, planner or per-task engine.

Preserve grants across key-store reads, usage updates, rotation and import of an existing secret. A token derived through OAuth must inherit current backing-key constraints; expiry/revocation and resource checks remain active. Grant widening requires a separate explicit operator-side provisioning action and must not be available to the restricted credential itself. Never rewrite all existing keys to default scopes during migration.

A grant for `browser_control` covers that tool's supported actions; it is **not** read-only, per-action, per-session, local-page-only or OS sandboxing. Similarly, allowing `start_process` is broad command execution, not a confined helper capability. This proposal does not enforce localhost-only transport; a loopback backend behind a tunnel cannot be assumed to identify a direct local caller. Those finer restrictions need their own threat model and explicit proposal, not an unproven boolean flag.

The feature is opt-in for newly scoped clients; normal approved full-access sessions retain the existing surface. Reduced tools/list counts for restricted credentials are expected and must be described to clients, not treated as missing installation. No existing key is revoked or silently restricted in the implementation plan.

### 4.3 Implementation and acceptance after explicit selection

1. Re-ground `src/auth/key-types.ts`, `key-store.ts`, `src/http/auth.ts`, `src/oauth/service.ts`, `src/mcp/handler.ts`, and all registration paths in `server.ts`. Define the grant parser/predicate in a small native module such as `src/auth/tool-grant.ts`; no external policy library is necessary.
2. Extend the existing programmatic CreateKeyOptions/metadata contract for explicit grants, with backward-compatible loading and preservation through rotate/import. No new public tool for self-provisioning credentials. An operator-facing issuance UI/CLI, if desired, is a separately reviewed consumer, not an assumed existing `src/cli.ts` file (that path is absent).
3. Wire trusted metadata through both bearer and OAuth request paths and central MCP registration/dispatch. Check unknown name, restricted discovery, raw forbidden tools/call, aliases, optional-family registration, and in-flight mutation admission ordering. Auth rejection must not invoke the tool and must not be interpreted as an execution failure deserving automatic retry.
4. Add isolated `tests/agent-os-tool-grant-adoption.test.ts` with temporary key store and fake handlers. Proposed cases: legacy compatibility; allow-one/deny-others; empty-deny-all; malformed/duplicate/unknown names; cannot override grant via request metadata; all tool families covered; rotate/import preservation; expiry/revocation; OAuth cannot widen; no forbidden-handler effects. Add targeted existing auth/MCP tests only with user approval.
5. Any real credential mint/revoke or live restricted-client test needs an explicit scoped verification authorization. Use no current user keys as fixtures, preserve unrelated auth state, avoid printing secrets, and verify revocation with actual rejection. No new credential is needed to finish this planning task.

P1 and P2 can be accepted independently. If selected for implementation, update affected CODEBASE sections, this plan, attribution and canonical Memory with actual behavior and test evidence. Create material changeset metadata then. P2's per-caller discovery changes require structural/schema/compatibility review; a full-access manifest alone does not verify a restricted credential.

## 5. Residual census

| Family / executable evidence | Disposition |
|---|---|
| host output materializers; filesystem CAS reads; blob integration tests | **AOS-P1.** Adopt byte-reference integrity and actual read verification, not another CAS runtime. Donor put returns early on existing path and get reads whole bytes; absence of native limits/race defenses is not copied as a guarantee. |
| Tool registry/builders and selected-tool batch planner | **AOS-P2.** Reuse explicit membership and registry validation principles, with native credential binding as an explicit extension. Invalid donor schema JSON falls back to an empty schema; native input validation must remain strict. |
| `aos-effects/src/receipt.rs`; `aos-kernel/src/receipts.rs`, `journal.rs` | **Partly covered / conditional AOS-C1.** Typed intent/receipt and replay records need the donor execution model. Native invocation journal already binds caller/tool/args and refuses replay of uncertain mutation. No second journal or exactly-once claim is justified. |
| `aos-effect-adapters/src/adapters/http.rs:45-88,175-252` | **Not a verified-signature/security import.** Receipt signatures are zero-byte arrays with TODO signing, and response-body size is checked after full collection. Hash references are not authenticated receipts; no HTTP adapter replacement is proposed. |
| `aos-kernel/src/shadow/runner.rs:24-155` | **Conditional AOS-C1.** Patch hash binding and effect preview are useful only with a real declarative workflow consumer. External effects receive synthetic Ok/empty receipts in shadow execution; shadow completion is not live success. Native source/refactor preview is not replaced. |
| AIR types/SDK/WASM ABI, kernel world/snapshot/index/governance modules | **Indexed architecture family / conditional AOS-C1.** Requires a chosen deterministic workflow runtime. Existing Grafel/Memory/Reflexion/process tools are not consumers of AIR events by default. No kernel/DAG/governance execution gate is added. |
| Agent workflow state, tool mappers/batches, retry-owner/failure code helpers | **Partly covered / conditional AOS-C2.** Native typed failures, observed actions and no-blind-replay remain owners. Donor resource-key batching and adapter/workflow retry ownership do not authorize parallel or retried machine mutations. |
| Host exec/fs/patch/path/session adapters | **Covered or conditional.** Existing native process ownership, regular-file guards, transactional edits and checkpoints already serve the machine. Replacing them wholesale adds a second authority; individual defects would require new source-backed evidence. |
| Agent-eval harness, casefiles, LLM providers, Python harness, shell/UI | **Conditional AOS-C2.** Useful only for a chosen model/evaluation consumer. Recorded cases, prompts, or provider retries are not independently verified claims about current Agent Core effectiveness. |
| aos-node worker/supervisor/control/blob infrastructure; fabric/controller/store/ingress | **Conditional AOS-C3.** A distributed-workflow/worker deployment needs an explicit workload, tenancy, auth and recovery design. No cluster or new listener is installed for the two native proposals. |
| `third_party/smolvm` | **Unavailable source at pinned gitlink.** Empty directory, no sandbox implementation qualification. Retain reference metadata; future full-stack adoption must inspect/fetch the missing revision explicitly. |
| Specs/schemas/docs, worlds/examples, package/CI files/assets | **Support/indexed only.** Separate LICENSE-SPEC obligations from source license. They are not proof that unavailable dependencies, every branch or deployment works. `.env.example` was excluded, not inferred. |

## 6. Reference and confidence boundary

**CONSUMER ONLY - MOVED INTACT.** AOS-P1/P2 are adopted and resident-verified. The reference moved to `Consumer/agent-os` under the original user-authorized lifecycle rule. Remaining AOS-C1-C3 require future consumers. All 816 inventoried file hashes/sizes and clean HEAD match; `worlds/demiurge/.env.example` remains excluded from content inspection, and smolvm remains an unqualified empty subtree. See section 9.

The audit did not substantiate another immediately useful native adoption outside these two proposals. This is not universal exhaustion: indexed-only families and the missing smolvm implementation may yield further opportunities when a specific consumer is chosen. No unsupported feature was declared equivalent to existing native behavior merely because its name resembles it.

Evidence is under `runtime/tmp/a-evolve-agent0-agent-os-grounding-20260929/`: pinned identity, per-file hashes, declaration inventory, source-reading anchors, native comparison hashes, and closure readback. Three plan files are newly created; exact prior-plan search found none. The code-index is a structural second opinion, not proof of runtime tests.

**Historical grounding-only boundary:** the original pass performed planning and the Agent0 consumer move, without product or credential mutation. AOS-P1/P2 were subsequently approved and implemented; sections 7-9 record qualification, live verification and lifecycle closure. This historical boundary is not a pending task.

## 7. Approved native implementation and qualification - 2026-09-29

**AOS-P1/P2 IMPLEMENTED - TARGETED AND COMPILED VERIFIED - RESIDENT ACTIVATION PENDING.** Both independently selectable proposals were approved. No Rust/AIR runtime, CAS database, extra MCP tool, dependency or global execution-control layer was added.

AOS-P1 uses `src/security/verified-result-artifact.ts`, the existing `result-budget.ts`, and the existing filesystem handler/ReadOptions/disk-reader chain. The spill writer serializes the redacted pretty JSON once, stores exact-byte SHA-256/length metadata, performs a bounded readback, and includes a copyable expectedIntegrity hint in the response. Original compact serialized byte counts keep their old meaning. Existing sensitive-capable non-persistable policy, TTL, cleanup and fail-soft behavior remain intact.

`read_file` accepts `options.expectedIntegrity: {digest, storedBytes}` through its existing generic options field. The mode permits only local UTF-8 JSON under dynamic runtime/tool-results, rejects invalid options, other projections, URLs, directories and escaping/link paths, and verifies the complete bounded snapshot from one descriptor before pagination. It rechecks identity/size/timestamps, detects growth/tampering, never reopens the path to produce the page, caps Unicode-safe output, and never replays the source tool. Hash equality is not signer authentication or semantic proof.

AOS-P2 adds strict `toolGrant: {version: 1, allowedTools: [...]}` metadata and central `installCredentialToolGrant` registration enforcement before mutation admission. Absent grants retain legacy full-surface behavior; empty grants expose no callable tools. Unknown names authorize nothing. SDK-disabled registrations are hidden from tools/list and refused on raw calls; the callback also guards before its inner mutation wrapper. All tool families use the same registration hook. Request metadata cannot override trusted principal metadata, and grant sets are detached from caller mutation.

Programmatic issuance uses `CreateKeyOptions.toolGrant` plus `availableTools` from the issuing operator's current registry/discovery snapshot; nonempty scope without that catalogue or containing unknown names is rejected. Empty scope requires no catalogue. Rotation preserves the previous exact grant; verification/list/import retain it. Import cannot resurrect a known revoked scoped secret as an unscoped key. Malformed stored grants fail closed. Existing bearer and OAuth metadata propagation already carries the grant; no production change to src/http/auth.ts or src/oauth/service.ts was necessary.

Tool-name grants are NOT per-action, per-path, per-session or localhost-only restrictions. Granting browser_control permits its actions; granting a broad execution tool is still broad. No live key or credential policy was modified. All key creation/rotation/revocation tests used isolated disposable stores; the compiled protocol fixture also removed its isolated key store after revocation.

Targeted matrix: **61/61 PASS, 0 failures/skips** (19 curve, 23 integrity, 16 grants, 3 existing result-budget cases). Real SDK tests prove filtered discovery, explicit disabled-tool errors, no forbidden mutation admission, sibling-family coverage, malformed/empty grants, preservation, expiry/revocation and OAuth inheritance. The result test additionally covers mutation during descriptor reads. Eight independent checks using compiled dist modules passed through isolated SDK transport, including permitted/forbidden calls, spill/read/tamper rejection and fixture-key revocation.

Windows fixture correction is recorded rather than hidden: zero-epoch utime failed, and project-volume junction creation was unavailable. Core redirects TEMP/home onto that same volume. The final junction fixture was created only beneath the system-volume temporary directory resolved from SystemRoot, rejected by the real byte guard, then removed. No volume conversion or environment/global path change occurred. The final full targeted run has no skipped case.

Build PASS, path policy269/0. Compatibility70->70, manifest118082 bytes/~29521 tokens, breakingEvidence=false; browser optional additions shown versus release baseline predate this task. release:check-intent passed; read-only next release0.15.0/pending3. The new minor intent is `.changeset/20260929-a-evolve-agent-os-adoption.md`.

Post-change graph current/integrity accepted,9354 entities/49527 relationships,repo coverage1/1. Source/graph review confirms createAgentCoreMcpServer calls installCredentialToolGrant; exact source confirms placement before the mutation hook. Review was inline, not an independent second agent. No automatic Git/release/deployment action occurred.

Resident Node3164 started09:46:26Z; new dist artifacts were written11:36:00-02Z. Thus compiled isolated qualification is complete but live resident HTTP activation is not yet claimed. Retain agent-os at its original reference path until operator restart/readback and final lifecycle review. Evidence and hashes: `runtime/tmp/a-evolve-agent-os-implementation-20260929/`.

## 8. Resident activation and bounded live readback - 2026-09-29

**RESIDENT ACTIVATED; AOS-P1 LIVE VERIFIED; AOS-P2 RESTRICTED-CREDENTIAL HTTP VERIFICATION PENDING.** User restart replaced the old resident with Node PID 16632, started 2026-09-29T12:10:32.0466760Z after the latest qualified artifact at 11:36:02Z. All 12 selected source and 11 compiled hashes match result.json. Health is ok on 0.14.0; Grafel current/integrity accepted, 9,354 entities / 49,527 relationships, registered-repo coverage 1/1. No reindex/rebuild/restart was needed in this readback.

Five bounded live observations succeeded: the actual resident start_process wrapper spilled synthetic oversized output with expectedIntegrity; independent disk comparison matched its SHA-256 and 280,200 stored bytes (280,166 compact serialized bytes); resident read_file returned verified-byte-snapshot pagination; a small UTF-8 JSON fixture preserved Greek/Japanese/emoji text; and a same-length modified copy was refused with RESULT_ARTIFACT_INTEGRITY_MISMATCH before payload exposure. The mismatch is an expected negative control, not an unexplained production error. An initial cmd quoting mistake was corrected before the generator ran.

The synthetic spill and the two explicitly owned fixture files were removed after evidence capture; no source artifacts or other user files were manually cleaned. The earlier 61/61 targeted tests and 8/8 compiled isolated SDK checks are retained historical qualification with matching hashes, not newly rerun suites.

AOS-P2 registration is present in the restarted build, and the current session still calls its normal tools. This does NOT prove restricted-key discovery/denial through resident HTTP. No active key was read, provisioned, rotated, revoked or re-scoped; ordinary auth usage timestamps were not compared. Earlier permission for one temporary key in the SystemOne probe is not reused as standing credential-minting authority. A new narrowly scoped live credential probe needs explicit approval under section 4.3; no additional Core restart is required.

Reference locations remain unchanged: agent-os and a-evolve in their original reference paths; Agent0 in Consumer. Lifecycle closure is deferred until the remaining live grant-verification decision. No dependency, source, build, release intent/apply, version, Git-history or deployment change occurred. This section supersedes section 7's restart-pending status only. Evidence: runtime/tmp/a-evolve-agent-os-implementation-20260929/resident-readback-20260929.json.

## 9. Authorized scoped resident HTTP verification and reference closure - 2026-09-29

**COMPLETE FOR APPROVED ADOPTION - AOS-P1/P2 RESIDENT VERIFIED.** After the user explicitly authorized one read_file-only temporary key, the verifier reached the existing localhost MCP server. No second Core, new listener, browser, desktop input, source change, dependency, build or restart was introduced.

Fresh verification passed **11/11 checks, exit 0**: two checks compare all 12 selected source and 11 compiled hashes to the qualified build; nine cover issuance and resident behavior. Actual tools/list returned only `read_file`. The scoped key successfully read a synthetic UTF-8 JSON fixture using expectedIntegrity. Direct raw tools/call requests for write_file and sibling memory_status returned JSON-RPC -32602 / `Tool ... disabled`. A write_file call with a forged grant in request metadata was also refused. Neither negative-control output file was created, and fresh discovery still exposed only read_file. HTTP 200 carrying a JSON-RPC denial is not a successful tool execution.

The single key was created at 2026-09-29T12:33:34.223Z with expiry 12:43:34.177Z and revoked at 12:33:35.558Z. Native verification and an actual request using that same revoked key both rejected it; HTTP status was 401. The verifier kept the secret in process memory, never in arguments, script/evidence text or canonical Memory. Only its revoked hash/metadata audit record remains in the existing store. Other key metadata excluding lastUsedAt matched before/after. Client closed; owned fixture directory removed.

This closes scoped bearer HTTP acceptance, not a new live OAuth-token test or a claim of per-action/path/session/localhost isolation. Grant semantics remain exact tool-name restrictions. The verifier itself used only localhost. Earlier 61/61 targeted tests and 8/8 compiled isolated SDK checks remain historical qualification with matching hashes; they were not rerun.

Final reference classification: current-fit selections are adopted; remaining AOS-C1-C3 depend on future consumers. The checkout was moved intact to `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/agent-os`, not deleted. The 816 inventoried files retain identical sizes/hashes, HEAD ec63cb775306f0728a65a4045b6b0457a025af36, clean main branch and no extra inventoried files. The excluded `.env.example` was not read; the empty smolvm subtree remains unqualified. Source/script reference matches are attribution/formula labels, not donor-path execution; no matching donor process was found.

Health remained ok on 0.14.0; Grafel current/integrity accepted, 9,354 entities / 49,527 relationships. Existing release intents are unchanged. No release apply, version bump, commit/tag/push or deployment occurred. Sections 7-8 are historical qualification/readback; this section is authoritative for current acceptance and lifecycle.

Evidence: `runtime/tmp/a-evolve-agent-os-implementation-20260929/authorized-scoped-http-2026-09-29T12-33-34-042Z.json`, `reference-lifecycle-closure-20260929.json`, and `final-authorized-closure-20260929.json`. Plans, CODEBASE, MEMORY.md and canonical Memory are synchronized in this closure.
