# Agent Core codebase map

This is the maintained source-owner map for **`0.15.0-beta.3`**, based on source `fe2268cc48ee867c4f2efdac21ae281c8a830fc8` plus Memory Plans12–21. Exact source and verified receipts take precedence over prose. Published beta.0 remains at `23fdca411e152c42fe1a5b81f526b18d6d57bd3b`; the new source candidate is not a Windows activation or release publication.

[Documentation index](README.md) · [Candidate notes](releases/0.15.0-beta.3.md) · [Historical codebase record](archive/CODEBASE-2026-10-09.md)

## Browser pointer and viewport capture — 2026-10-11

<!-- browser-control-20261011:start -->
**Status: SOURCE IMPLEMENTED, SCOPED QUALIFIED AND OFFICIALLY BUILT; WINDOWS ACTIVATION AND LIVE MEMORY SYNCHRONIZATION OPEN.** This record covers the browser-control source delta above reconciled baseline `8250441b7ce195a40390c772b03c5130bf3a391f`. It does not establish the state of the Windows installation.

- **Scope and owner:** the existing `browser_control` tool and `BrowserControlService` own the extension-selected tab and the explicit managed-Chromium alternative. Pointer and viewport-capture helpers remain subordinate to that owner. No second browser engine, MCP server, Memory owner, OS mouse fallback, automatic focus theft or automatic transport switch was added.
- **Input contract:** existing observed action IDs remain supported. `act.pointer` adds `POINTER_MOVE`, `HOVER`, `CLICK`, `DRAG` and two-axis `SCROLL`, using observed element IDs or explicit capture-bound CSS viewport coordinates. Coordinate input verifies session/observation, capture ID, target ID, document ID and geometry version, rejecting stale/out-of-bounds input and unsupported pinch-zoom geometry. Capture lifetime defaults to 30 seconds, configurable through `maxAgeMs` from 1 to 120,000 ms. This replaces the draft 5-second capture default to accommodate ordinary external vision-model/tool round trips. Each capture permits one mutation; identity/geometry are rechecked and callers can shorten its lifetime. Animation can still move content within a valid capture.
- **Capture and privacy:** `observe.screenshot` produces a viewport JPEG, optional explicit CSS crop and geometry metadata. Binary image data is capped at 128 KiB, metadata at 16 KiB, and the result envelope at 240 KiB; extension polling enforces an envelope strictly below 240 KiB under the retained 256 KiB global ceiling. Oversized, malformed or duplicate image payloads fail before generic disk spill. Dense observations explicitly report metadata omissions and remove omitted action IDs from the executable action map. Screenshots stay transient; routine tool history retains metadata only, with no pixels in Memory, provider requests, checkpoints or spill artifacts.
- **Controller boundary:** the external MCP screenshot result contains one compact metadata text block and one typed JPEG image block, with no duplicate pixels in structured content. Native tool results can retain image blocks transiently, but the current text-only provider adapter receives metadata plus `NATIVE_PROVIDER_IMAGE_INPUT_UNSUPPORTED`; the notice states that pixels were not sent to the model or viewed by the controller. Native status reports image-input support as false; external MCP status reports client-dependent support. DOM/action-ID operation remains available, and no provider or model was switched.
- **Lifecycle boundary:** existing mutation grants and selected-tab ownership remain enforced. Pause/takeover cancels queued work and invalidates observations; resume requires fresh observation and does not replay or reattach automatically. Navigation/resize, detach and close invalidate pending input; cleanup targets only the owned session and releases held input best-effort. The 120-point/5-second drag limit bounds the requested gesture schedule, not a guaranteed physical button-release deadline under stalled transport. Existing send timeouts remain 10 seconds host / 8 seconds debugger. Lost acknowledgements produce uncertain outcomes and are never retried as successful effects.
- **Verification:** final focused source review passed 171/171 tests across 19 files. The manifest contract now reflects 75 tools, including upstream `image_inspect`, with a 128 KiB manifest budget: actual 130,342 bytes versus the reconciled upstream baseline of 127,091 bytes. The final official `npm run build` passed with exit 0: path policy covered 359 files, the standalone Memory build dependency compiled, and root TypeScript compiled. Building that dependency does not activate or initialize live Memory. Generated pointer/capture modules are in the canonical `dist/rdc/browser-control/` output; no parallel build tree is required. These are source/contract results, not Windows Brave, installed-extension, stationary Windows mouse or resident-runtime acceptance. No whole-repository regression or Native vision acceptance is claimed.
- **Memory and documentation:** the same bounded record is maintained in `MEMORY.md` and `docs/CODEBASE.md`; the approved plan is `docs/Agent-Core-Browser-Control-Plan-20261011.md`. `MEMORY.md` is a repository continuity projection, not the live canonical Memory store. Both `runtime/memory` and `runtime/memory-v2` are absent in this checkout, and no replacement Memory runtime/database was initialized. Canonical live Memory synchronization, its readback and Learning finalization remain OPEN through the existing authorized host/runtime. The authorized desktop task route was still unavailable when rechecked at 16:20 UTC on 2026-10-11; operator-transport connectivity alone does not prove Agent Core activation or Memory synchronization.

Browser implementation owners: `src/rdc/browser-control/{service,pointer-actions,viewport-capture,extension-bridge}.ts`, `extensions/agent-core-browser-bridge/`, browser schemas/handler, `src/http/browser-bridge.ts`, `src/mcp/result-budget.ts`, `src/agent-tool-session.ts`, `src/agent-controller.ts` and `src/agent-provider.ts`. `src/memory/host-runtime.ts` is the existing canonical Memory-selection reference; this task did not modify it. Approved-plan requirements remain acceptance targets wherever live evidence is still absent.
<!-- browser-control-20261011:end -->

## Source and acceptance status

| Scope | Established state | Remaining boundary |
| --- | --- | --- |
| Shared Core, Native chat, Learning, Skills and tool owners | Existing source and scoped historical acceptance retained | Instance-specific configuration/grants |
| Image inspection | Earlier external-controller acceptance | No paid-model accuracy claim |
| Memory01 + Workflows | [Directed Windows functional acceptance closed](verification/memory01-windows-functional-2026-10-10.md) | Historical scoped results, not acceptance of later source |
| Memory02–04; Memory05 | Plans02–05 independently reviewed; scoped offline gates passed | Windows integration and acceptance; Plan04 provider/data/cost gate |
| Memory06–11 | Source implementations; [functional ledger](verification/memory06-11-source-functional-2026-10-10.md) | Performance deferred; Windows/live-provider acceptance separate |
| Memory12–21 | Source implementations; [functional ledger](verification/memory12-21-source-functional-2026-10-11.md) | Windows/live-controller acceptance separate;19 experiment-only,20/21 scripted diagnostics |
| Adaptive parallel execution | Proposed only | Implementation not started |
| Windows portable beta.0 | Published exact-tag runtime; packaged Core smoke verified | Full fresh-machine/second-GUI acceptance not claimed |

Published source, packaged binary, installed process and model/provider quality remain separate facts. The full dated history remains in the archive.

### Repository consolidation — 2026-10-10

The active tree combines the Memory02–05 line `eec8dab4aad4b93d8bb3ff8895eeabb38dae4232` with the bounded Windows listener lookup from `a90de218d782cf73d9f02a26cae6f178a9103657`. `src/launcher/WindowsTcpListener.cs` reads the Windows IPv4/IPv6 listening-owner table; `AgentCoreRuntime` still verifies process command-line identity before stopping an owned port process. Its Windows-specific tests are retained, not claimed runnable on Linux. The [original integration report](Memory02-05-Permanent-Integration-Execution-20261011.md) records staged-only beta.1 verification, not activation.

All original branch histories are retained by the consolidation merge. Unique historical vault, observatory, crafting, design and routing code is explicitly [preserved as inert source patches](history-agent-core/branch-consolidation-20261010/README.md), not restored into the current runtime. The manifest identifies every branch/head and reconciliation. The sparse Windows recovery branch does not delete absent repository files; newer release governance and canonical documentation remain authoritative. Historical patch payloads are outside compilation/test discovery and explicitly excluded by `scripts/release/packaging-policy.mjs`.

Version assessment: keep the existing `0.15.0-beta.1` candidate identity and pending release intents; add a patch intent for the bounded listener-source integration and archive-packaging exclusion. No release application, tag, deployment, process restart, Windows operation or provider call is performed by consolidation.

## Memory reference-adoption owners (12–21)

The existing experience engine remains the only Memory owner. `controller-session.ts` projects continuity and opt-in prospective intentions over `episodes.ts` snapshots; ingestion metadata/cursors use the same scoped operation receipts and canonical transactions. `prospective-intentions.ts` encodes explicit conditions in ordinary obligation text, with bounded pure evaluation and no scheduling or automatic completion.

Knowledge-time history belongs to existing revision/store owners, separately from valid-time assertions. Host publication metadata is never inferred from a user-supplied timestamp. Legacy history without publication proof remains unproven; new persisted metadata must not be silently stripped for an old binary. Synthesis is a bounded evidence envelope admitted through existing promotion; dependencies, source revision drift and nested cycles determine recall eligibility.

Learning candidate purpose, curation deltas and compaction checks preserve existing review, evidence, proposal and capsule owners. A target-referenced correction/counterexample does not silently rewrite canonical knowledge; unsupported atomic target mutation remains an inspectable pending proposal.

`src/learning/reconsolidation-{experiment,report}.ts` and `scripts/verify/memory-reconsolidation-experiment.mjs` are offline-only original-fixture tools. Exact feedback source/target revisions are required; proposals contain at most eight `related` edges and never reach production mutation facades. Retrieval arithmetic is recomputed by the existing independent verifier; even a positive scripted result is only `further-study`, with `benefitProven=false`.

`outcome-diagnostics.ts` and `outcome-diagnostics-verifier.ts` extend the existing Plan05 runner/packager with an opt-in versioned sidecar. LongMemEval-inspired recall families and MemProbe-inspired integrity families use original bounded fixtures and shared validation. Preservation, retrieval, declared use and outcome remain distinct; integrity failures cannot be averaged away. Exact results and unresolved boundaries are in the [functional ledger](verification/memory12-21-source-functional-2026-10-11.md).

## Composition and lifecycle

1. [`src/index.ts`](../src/index.ts) loads configuration, prepares project-local portability state, initializes the host-selected Memory service, and creates the existing capability owners.
2. [`src/http/app.ts`](../src/http/app.ts) owns HTTP route composition. [`src/mcp/handler.ts`](../src/mcp/handler.ts) owns authenticated MCP request handling; [`src/mcp/server.ts`](../src/mcp/server.ts) registers the available facades.
3. External controllers use MCP. [`src/agent-controller.ts`](../src/agent-controller.ts), [`src/agent-runtime.ts`](../src/agent-runtime.ts), and [`src/agent-chat-service.ts`](../src/agent-chat-service.ts) provide the native controller/chat path over shared owners.
4. The Windows launcher hosts the React UI and manages Core/tunnel lifecycle. Workflows and chat use the existing authenticated native UI bridge.
5. Service shutdown disposes owned work, including Workflows polling. Durable stores and task evidence have their own persistence owners.

[`src/config.ts`](../src/config.ts) defines configuration and defaults. Native provider use defaults off; source presence alone does not establish provider readiness or permission to execute.

## Source owners

| Area | Primary source | Responsibility |
| --- | --- | --- |
| Service composition | [`src/index.ts`](../src/index.ts), [`src/config.ts`](../src/config.ts) | Startup, configuration, service lifecycle |
| HTTP and MCP | [`src/http`](../src/http), [`src/mcp`](../src/mcp) | Routes, transport, registration, request boundaries |
| Authentication | [`src/auth`](../src/auth), [`src/oauth`](../src/oauth) | API keys, OAuth, credential-scoped grants |
| Machine and browser control | [`src/rdc`](../src/rdc) | Files, document tools, search, terminal/process and browser operations |
| Memory host | [`src/memory/host-runtime.ts`](../src/memory/host-runtime.ts) | Engine selection and single-writer boundary |
| Legacy-compatible Memory | [`src/memory`](../src/memory) | Legacy implementation and integration contracts |
| Experience-v2 engine | [`SubProject/agent-core-memory`](../SubProject/agent-core-memory) | Canonical experience store, index, controller sessions, retrieval |
| Learning | [`src/learning`](../src/learning) | Episodes, checkpoints/reviews, evidence, reuse, procedures, outcomes |
| Skills and awareness | [`src/skills`](../src/skills), [`src/capability-awareness.ts`](../src/capability-awareness.ts) | Catalog, revision-bound proposals/decisions, actual-use notices |
| Native controller and chat | [`src/agent-controller.ts`](../src/agent-controller.ts), [`src/agent-runtime.ts`](../src/agent-runtime.ts), [`src/agent-chat-service.ts`](../src/agent-chat-service.ts), [`src/agent-chat-store.ts`](../src/agent-chat-store.ts) | Scoped tool use, durable turns/conversations, finalization |
| Provider scheduling | [`src/agent-provider-scheduler.ts`](../src/agent-provider-scheduler.ts) | Persistent provider scheduling and availability state |
| Code intelligence | [`src/code-intelligence`](../src/code-intelligence) | Project-local Grafel bridge and structural queries |
| Semantic IDE | [`src/semantic-ide`](../src/semantic-ide) | Language-server inspection and scoped refactoring |
| Web research | [`src/web-research`](../src/web-research) | Configured bounded search/read providers |
| Phone and Game Mode | [`src/phone`](../src/phone) | Android transport, observation, actions, guarded game sessions |
| Workflows | [`src/workflows`](../src/workflows) | Static source analysis, refresh/cache lifecycle, offline rendering |
| Desktop | [`src/launcher`](../src/launcher), [`src/ui`](../src/ui) | Windows/WebView2 host and React UI |
| Activity and portability | [`src/tracker`](../src/tracker), [`src/portability`](../src/portability) | Activity evidence and project-root relocation |
| Release tooling | [`scripts/release`](../scripts/release), [`scripts/windows/Recover-Agent-Core.ps1`](../scripts/windows/Recover-Agent-Core.ps1) | Version intent, packaging, integrity, recovery |

Other SubProjects keep their own entry points and scope. Inclusion in this repository does not make their runtime or external service part of Core acceptance.

## Controller and security boundaries

The external controller and Native AI Agent share Memory, Learning, Skills, evidence, and execution owners. Do not add parallel knowledge or execution stacks merely to expose a capability through another controller.

- MCP registration is conditional on initialized services and grants. [`src/auth/tool-grant.ts`](../src/auth/tool-grant.ts) owns tool-grant enforcement. A fresh `tools/list` and invocation check establish a particular instance's exposed surface.
- The source-default listener is `127.0.0.1:8765`. MCP requires an API key or OAuth token; [`src/http/security-policy.ts`](../src/http/security-policy.ts) owns HTTP security policy.
- Native UI routes retain loopback and UI-token checks. Launcher messages must originate from the trusted app document and match bounded request/correlation rules.
- Availability, discoverability, permission, actual use, and verified benefit are separate states. A retrieved memory or advertised Skill is not evidence of improved outcomes.
- The Hermes `partner` bridge is retired. Internal `src/rdc` remains Agent Core-owned machine-control code; the external Remote Desktop Commander product is separate.

See [SECURITY.md](../SECURITY.md) and [AGENTS.md](../AGENTS.md).

## Memory, Learning, and Skills

### Host-selected Memory

[`initializeAgentCoreMemory`](../src/memory/host-runtime.ts) selects one writer:

- No activation marker: initialize legacy Memory at the configured root.
- A valid `runtime/memory-v2-activation.json` and matching backup digest: initialize experience-v2 at `runtime/memory-v2` without initializing the legacy writer.
- Invalid activation state: fail closed.

The engine lives under [`SubProject/agent-core-memory`](../SubProject/agent-core-memory/README.md). [`src/mcp/memory-experience-tools.ts`](../src/mcp/memory-experience-tools.ts) exposes controller-scoped adapters when supplied with the experience service. Source checkout, compilation, and package version changes do not perform migration or activation.

### Memory01–04 retrieval and host binding

[Memory01 Windows functional acceptance](verification/memory01-windows-functional-2026-10-10.md) is closed for its directed installation. Later source candidates do not inherit that acceptance automatically.

- **Plan01:** engine `index.ts` validates the full canonical corpus and returns vectors only for eligible unique records; `service.ts` checks canonical revision races before ranking and releases filesystem locks before embedding.
- **Plan02:** `MemoryService.controller(scope, policy)` defaults to `baseline-v1`; host-only `fusion-feedback-v1` uses existing fusion and eligible feedback with neighbor expansion zero. Backend rank returns results plus a policy/feedback/semantic revision. `controller-session.ts` binds pagination to that revision and ID/score ordering; mutable exposure counters are excluded. Candidate ranking is opt-in, not a default rollout or evidence of gain.
- **Plan03:** [`memory-scope.ts`](../src/mcp/memory-scope.ts) and the MCP/Learning adapters bind explicit task episodes to authenticated credential owner and registered workspace identity. External v2 envelopes require `scope: {taskId}`; task selectors are references, not permission. Native task/workspace remains host supplied. Missing, foreign, unbound, drifted or degraded bindings fail closed before the engine. Legacy Memory APIs remain separate. Memory-v2 task interleaving does not make Learning attribution concurrent: start/activate, calls/hooks and Learning finalization for a task must remain serialized in each Learning session namespace.
- **Plan04:** shared `semantic-document.ts` renders title, content and the existing narrow metadata allowlist with deterministic CRLF/trim handling. `SEMANTIC_DOCUMENT_VERSION=2` and derived index format3 bind title/document/experience inputs to cache fingerprints. Old format2 vectors are not reused; access counters do not invalidate embeddings. Provenance paths, evidence payloads and arbitrary metadata are not swept into provider text. Canonical data/schema is unchanged.

**Operational gate:** initialization can rebuild an old index automatically. A production upgrade to Plan04 therefore requires corpus-volume, provider, transmitted-data and cost approval before restart; a build/test/push does not satisfy that gate. All implementation fixtures use fake embedding and isolated synthetic stores. Old cursors may become stale and must be restarted explicitly; never force a previous cursor to resume against changed ranking state.

### Plan05 offline outcome evaluation

[`outcome-contract.ts`](../src/learning/outcome-contract.ts), [`outcome-evaluation.ts`](../src/learning/outcome-evaluation.ts) and [`outcome-verifier.ts`](../src/learning/outcome-verifier.ts) define the strict suite/observation contract, paired comparison and independently recomputed artifact oracle. [`memory-outcome-eval.mjs`](../scripts/verify/memory-outcome-eval.mjs) and its adapter exercise isolated synthetic experience-v2 stores, frozen baseline/candidate artifacts, explicit use receipts and evidence references. [`package-memory-outcome.mjs`](../scripts/verify/package-memory-outcome.mjs) supplies sanitized manifest-backed ZIP packaging and fresh-extraction checks.

The fixture has 4 development and 12 held-out cases; 3 conditions (`off`, `current`, `candidate`) across 2 trusted scope labels produce 72 scripted comparison runs. `native`/`external` labels exercise scope contracts, not real controller/model sessions. Scripted tool counters are harness/owner operations. No reasoning gain, provider quality or performance benefit is established; efficiency benchmarking is deferred. The final scoped gate passed 208/208 tests and independent review found no remaining blockers; Windows and live-model acceptance remain separate. The [live entry point](../scripts/verify/memory-outcome-live.mjs) remains fail-closed with zero inference requests until trusted controller integration and provider/data/cost/time authorization exist. The historical user-stopped evaluator is not resumed.

Engineering artifact checks in both Core and standalone Learning no longer execute JavaScript through `node:vm`. Mirrored, equality-tested `outcome-safe-engineering.ts` helpers interpret bounded numeric expressions and exact certified fixture templates; unsupported JavaScript fails closed. Workflow verifier revision `v2-declarative` requires older v1 reports to be reverified. This is a deliberate security compatibility reduction, not a general JavaScript sandbox.

### Plan06 query-focused evidence excerpts

[`evidence-excerpt.ts`](../SubProject/agent-core-memory/src/memory/evidence-excerpt.ts) selects one deterministic, bounded range from canonical `content` after existing ranking. The legacy query tokenizer and case-insensitive matches on the original string preserve UTF-16-to-Unicode-codepoint offsets; CRLF, emoji and combining marks are not normalized. Distinct-token coverage wins, then the earliest start; no match produces an explicitly labeled head fallback. `verifyMemoryExcerpt` checks the exact slice, Memory identity and existing semantic revision, without treating the selection label as authority.

`projectMemoryHit` adds optional `excerpt` only to abstract views; `abstract` remains its exact text alias. Map views and the legacy search projection remain unchanged. `controller-session.ts` supplies the recall query after existing eligibility and disclosure-safety checks, includes every excerpt field in whole-envelope budgeting, and binds recall cursors to `evidence-excerpt/v1` alongside the existing query, revision and ranking snapshot. Hits that cannot fit are omitted whole and are not recorded as exposed. Expansion pagination offsets still address sanitized JSON, not canonical content spans.

This is an additive source change with no canonical schema/index migration, provider call, activation or trust promotion. Exact provenance proves which text was quoted; current applicability and the truth of a claim remain separate. Synthetic functional tests cover Unicode, small budgets, retained and missing revisions, visibility changes, stale evidence, poison/credential-shaped data and selector-version cursor rejection. The [combined source ledger](verification/memory06-11-source-functional-2026-10-10.md) records functional/build gates, original timeout failures, targeted recovery and sanitized report integrity; latency/performance benchmarks and live-provider/Windows acceptance are not claimed.

### Plan07 opt-in passage retrieval

Host-only `indexGranularity:'passage'` uses deterministic 600-code-point windows with 80-point overlap and a 128-child cap. Children stay private derived data under canonical parents; format4 binds passage version1, semantic document version2 and exact parent revisions. Queries use maximum valid child cosine per parent; nearest/diversity use normalized child means. Missing or oversized inputs, cap overflow and bounded retry admission remain explicit degraded/partial semantic coverage with lexical fallback. Metadata inputs over 1,600 UTF-16 units are unavailable without hidden chunking.

The existing 512-job retry owner reserves admission before dispatch, preserves failed jobs through incomplete scans and never evicts them into fresh retries. Default record mode preserves compatible format3 reuse without re-embedding. Parent edits replace that parent's children; repairs alter semantic snapshot/cursor identity. Raw canonical records survive host workspace-alias filtering so passage revision checks are not compared against a display-normalized copy. Offline synthetic acceptance does not activate passage mode or authorize resident re-embedding/provider cost.

### Plan08 opt-in query-vector cache

Query-vector caching is host-local and opt-in through `MemoryServiceOptions.queryCache` and `StandaloneMemoryOptions.queryCache`; copied limits create a private per-index owner. Exact query/identity SHA-256 tuples include query representation v1 and semantic document v2. Bounded absolute-TTL LRU/payload storage and singleflight preserve per-waiter local cancellation, generation invalidation and terminal disposal. `semanticContext` still reloads and validates the canonical corpus and eligible vectors before reuse, then recomputes passage scores and revision. `MemoryService.dispose` reaches the index; the existing graceful host close disposes the optional experience owner through fail-soft cleanup. Dense validation rejects sparse arrays; shared-scale passage means and independently scaled cosine avoid finite-input overflow and underflow. This does not claim provider network cancellation, cached authorization, live savings or resident activation.

### Bounded subquestion retrieval (Plan09)

`src/learning/subquestion-retrieval.ts` implements an opt-in pure controller helper for strict versioned 0-or-2–4-question plans, six total recalls/two expansions, one serial reservation, 32,768-byte total and 4,096-byte per-call response disclosure limits, 512-byte minimum and 15,000-ms monotonic dispatch deadline. It performs no model, I/O, dispatch, ACL or host mutation. Complete dispatcher-envelope byte metering rejects oversize responses whole; retry classification and late-call settlement remain controller responsibilities.

The reducer merges exact `(memory, id, revision)` tuples in per-question round-robin order, retaining every question/call/attempt reference and original query-local score/trust metadata without cross-query score aggregation. Verification/freshness/applicability stay conservative. Different revisions remain explicit conflicts and cannot silently become current or evidence-reviewed. Root and every subquestion retain visible unsearched/retrieved/evidence-reviewed/gap/blocked coverage; inspected evidence is not truth, actual use or benefit proof.

`docs/Memory-Subquestion-Retrieval-Protocol.md` and the narrow opt-in `AGENTS.md` guidance preserve mandatory Memory-first, Learning and existing scope/grant owners. Actual examples use host `memory_v2_read` actions with top-level `scope.taskId`, and a labelled legacy fallback. Four `memory-subquestion` suites test the helper, provenance, synthetic experience-v2 replay through the existing MemoryService/controller/host dispatcher and actual registered schemas. The explicit Memory/root/five-suite gate passed with 30 tests on 2026-10-10. ChatGPT and Claude live compliance/decomposition/benefit are separately NOT RUN/unproven; performance benchmarks are deferred. No production MCP wrapper, planner model, provider, dependency, scheduler, migration or activation was introduced.

### Plan10 opt-in relevance abstention

Controller relevance abstention is a host-local opt-in through MemoryServiceOptions.controllerRelevancePolicy and initializeStandaloneMemory. The policy is validated and copied immutably before store I/O; absent configuration preserves baseline behavior. Admission uses content-only phrase/coverage evidence from the active lexicalRetrievalTokens helper, or semantic similarity only when the exact rank snapshot reports available. It retains existing ranking weights, scope/temporal eligibility and canonical parent identity; metadata, recency, pins, source or feedback alone cannot bypass admission. Accepted IDs and the policy digest extend the existing ranking/cursor snapshot before paging; RecallPage carries budgeted supported/insufficient-relevant-evidence/empty-corpus metadata with independent semantic health, while rejected text/IDs are not disclosed or recorded as exposure. There is no forced expand, retry or provider fallback. Frozen development and family-separated heldout correctness fixtures use fake vectors and a sealed .75 lexical/.85 semantic policy; latency, live-provider and live-benefit evaluation remain NOT RUN.

### Plan11 identifier-aware lexical retrieval

[`identifier-tokenizer.ts`](../SubProject/agent-core-memory/src/memory/identifier-tokenizer.ts) performs a bounded original-codepoint scan with NFC normalization and separate whole-identifier/subword occurrences. Camel/acronym, snake/hyphen, path/dot and letter/digit boundaries retain exact normalized identifiers. Limits are 131,072 input code points, 4,096 emitted occurrences and 256 code points per token; partial identifiers are never manufactured. Queries exceeding bounds fail closed, while oversized documents use the legacy tokenizer with an explicit degraded lexical component.

`retrieval.ts` and `bm25.ts` share this lexical representation and preserve raw case until boundary extraction. Compound query expansion intentionally changes meaningful-token counts and existing BM25 weight selection (for example, `ControllerSession` now counts three tokens and uses 0.45 instead of 0.9). No scoring coefficients, RRF rules, canonical schema, semantic document bytes/version or intelligence/consolidation tokenization change. Existing full-identifier eligibility remains the authority for non-pinned fusion; legacy/BM25/pinned exemptions are not advertised as exact-identifier guarantees.

The existing controller ranking revision includes `code-identifiers/v1`, so old-version continuation is stale after restart. A sealed ten-case functional corpus uses actual baseline source replay, disjoint development/heldout symbol families and exact canonical ID/revision labels. Token bounds and correctness are tested; latency, real-provider performance and controller benefit remain unmeasured. Exact combined gate results and report integrity are recorded in the [source ledger](verification/memory06-11-source-functional-2026-10-10.md).

### Learning and Skills

[`src/learning/external-controller.ts`](../src/learning/external-controller.ts) and [`src/learning/service.ts`](../src/learning/service.ts) own external task episodes and checkpoint/review workflows. Evidence-backed use and outcome records distinguish retrieval from application and benefit. Native execution retains its own finalization lifecycle over the shared owners.

Skill proposals and decisions are revision-bound. Qualification is a proposal state; activation requires the appropriate explicit user decision. See [cumulative workflow](Cumulative-Workflow-Implementation-20261006.md) and [self-improvement implementation](Agent-Core-Self-Improvement-Execution-20261007.md) for dated evidence and residuals. Native experience-v2 automatic episode capture is not claimed by the external Memory acceptance record.


## External image inspection

[`src/rdc/tools/image-inspect.ts`](../src/rdc/tools/image-inspect.ts) owns read-only `image_inspect` overview and crop requests. It returns bounded image blocks and metadata, validates source identity, and maps displayed pixel-edge rectangles back to the EXIF-oriented source. Supported inputs are local 8-bit PNG/JPEG/WebP; SVG, PDF, URLs, and animation are outside this tool's contract.

Metadata-only views are scoped and expire. Grants are rechecked on invocation; images do not spill into generic result artifacts. The tool is excluded from Native registration. Linux descriptor checks and Windows's trusted-local-workspace assumption differ; the design does not claim complete adversarial ancestor-replacement protection on Windows. See the [full contract and source-check record](MCP-Image-Inspection-Design.md).

## Unified Workflows

- [`analyzer.ts`](../src/workflows/analyzer.ts) reads allowlisted Core/Memory source, extracts TypeScript imports/re-exports, and records relative-path/line evidence. Content hashes drive freshness; runtime data, secrets, generated files, and symlinks are excluded.
- [`service.ts`](../src/workflows/service.ts) owns initial generation, serialized three-second source checks, debounce, cache, and shutdown. Failed rebuilds retain a visibly stale last-good map. A packaged `source/` snapshot is used only when root source is absent and is labeled accordingly.
- [`renderer.ts`](../src/workflows/renderer.ts) supplies bounded diagram metadata to a pinned offline Archify renderer with a stripped environment and restricted filesystem access. [Vendor provenance and modifications](../vendor/archify/README.agent-core.md) describe the narrow integration.
- `GET /agent/workflows` returns cached state through the existing loopback/UI-token route. [`WorkflowsPage.tsx`](../src/ui/src/WorkflowsPage.tsx) polls while mounted and displays a single System + Memory canvas in an `allow-scripts`-only sandbox with network-blocking CSP.

The map shows static dependency evidence, not complete call flow or live execution. C# dependency semantics and unresolved/dynamic imports remain explicit limitations. Dense layouts may have crossing edges. The [2026-10-09 isolated report](verification/workflows-windows-functional-2026-10-09.md) preserves its original candidate, test-only launcher wrapper and limitations. The later [2026-10-10 directed Windows report](verification/memory01-windows-functional-2026-10-10.md) establishes the production current System + Memory canvas after cutover and closes scoped Memory01/Workflows functional acceptance. Earlier production-pending wording is historical. This does not establish later Plans02–05 acceptance, pointer-drag pan, all HTTP security/subscription checks, or full fresh-machine GUI acceptance. See the [implementation and acceptance plan](plans/2026-10-09-unified-workflows.md).

## Build and verification

| Scope | Entry point | Boundary |
| --- | --- | --- |
| Core build | Root `npm run build` | Path policy → Memory build → root TypeScript |
| Core tests | Root `npm test` | Root Vitest configuration excludes SubProjects, UI, runtime, and generated output |
| Memory | `npm --prefix SubProject/agent-core-memory run verify` | Independent engine build/test suite; dependencies must be installed for that subproject |
| React UI | `npm --prefix src/ui run typecheck`, `test`, and `run build` | Independent UI checks/build |
| Windows launcher | [`AgentCore.Launcher.csproj`](../src/launcher/AgentCore.Launcher.csproj), [`src/launcher.tests`](../src/launcher.tests) | .NET 8 Windows target; platform acceptance remains separate |
| MCP and Skills | [`scripts/verify`](../scripts/verify) | Scope-specific routing/effectiveness/acceptance harnesses |
| Source version/release intent | Root `npm run release:plan`, `npm run release:compat` | Inspection is separate from release application and publication |

Focused current-source checks include [image inspection](../tests/image-inspect.test.ts), [Memory subset retrieval](../SubProject/agent-core-memory/tests/memory-semantic-subset.test.ts), [controller subset retrieval](../SubProject/agent-core-memory/tests/memory-controller-semantic-subset.test.ts), [Workflows integration](../tests/workflows-integration.test.ts), and [Workflows UI](../src/ui/src/WorkflowsPage.test.tsx). Record the command, exact source, platform, result, and untested scope when reporting verification. Do not resume user-stopped provider probes or evaluation cohorts merely because a historical document contains commands.

## Release and recovery

<a id="09-release-intent-and-product-version-integrity"></a>

Root [`package.json`](../package.json), [`src/version.ts`](../src/version.ts), UI package metadata, and launcher display metadata define source/product version. Numeric Windows assembly/file versions follow their platform format. [Candidate notes](releases/0.15.0-beta.2.md) distinguish `0.15.0-beta.2` source metadata from the immutable published beta.0 artifacts and installed runtime.

[Pending release intents](../.changeset/README.md) describe unapplied changes; [CHANGELOG.md](../CHANGELOG.md) preserves release history. `release:apply`, packaging, tagging, publishing, deployment, and resident acceptance are distinct operations. This documentation refresh performs none of them.

The Windows recovery script accepts an explicit trusted ZIP plus checksum, requires an empty bootstrap destination, and restricts repair to a packaged installation of the same version. Its historical `LEGACY_REFERENCE_ONLY` rejection of this repository remains in source, with an empty repository default and explicit network opt-in. Do not assume a repository sync enables network recovery.

## Repository boundaries and maintenance

- [`Black-Project-Agent-Core/Agent-Core`](https://github.com/Black-Project-Agent-Core/Agent-Core) is the current source repository. Historical legacy-only repository prose is retained as provenance, not current policy.
- Authored source, generated `dist`, packaged source snapshots, and installed runtime must not be treated as interchangeable.
- Private `.env`, secrets, browser profiles, chat history, and production Memory/runtime state stay outside documentation, fixtures, and source/release publication.
- Version assessment and a complete integration/test handoff are required by the [operating contract](../AGENTS.md), [contributing guide](../CONTRIBUTING.md), and [pull-request checklist](../.github/PULL_REQUEST_TEMPLATE.md). Report source changes, version impact, verification, activation/publication state, and unresolved acceptance separately.
- Keep this file focused on maintained ownership and contracts. Record changing implementation/acceptance status in the relevant plan or release note; preserve dated evidence through the [archive index](archive/README.md).
- Historical sections and their original anchors remain in the [complete pre-refresh CODEBASE](archive/CODEBASE-2026-10-09.md). Existing repository links to the old release-intent anchor remain supported above.

## Memory research proposals (not implemented)

The [Memory12–21 plan index](plans/README.md#memory-reference-adoption) and [shared adoption specification](plans/2026-10-11-memory-reference-adoption-spec.md) describe possible extensions over the existing episode/capsule, temporal/revision, promotion, Learning and Plan05 evaluation owners. They do not alter the implemented architecture described above. knownAt remains unimplemented in this baseline; controller compliance, synthesis invalidation and learning quality require separate evidence. Plan19 is offline-only research; Plan20/21 extend evaluation methodology. No provider/backend/runtime additions or product version changes were made by this documentation task.

## Batch 1 native public web evidence — source implementation 2026-10-12

<!-- batch-01-implementation:start -->
Batch 1 diimplementasikan pada source utama Agent Core di Linux: tiga mekanisme donor #133 web-fetch, #73 web-content-extractor dan #178 Qwen Code masuk ke owner existing tanpa runtime donor atau dependency baru. web_open default native memakai satu snapshot public URL yang diperiksa, proyeksi HTML/teks/PDF, charset, provenance dan digest bytes; external hanya dipilih eksplisit tanpa fallback otomatis. Main-content opt-in memakai batas traversal dan fallback full bila bukti di luar seleksi density akan hilang, termasuk DIV dan bare text. Output dibatasi 80.000 unit UTF-16 dengan notice dan flag truncation. HTTP MCP meneruskan service yang sama, cancellation SDK dan invocation/Learning metadata-only; grant tetap berlaku. Build standar lulus, 76 kasus terarah pada delapan file lulus; ini bukan benchmark atau bukti manfaat Memory. Tidak ada provider berbayar, instalasi donor, restart resident atau aktivasi Windows. Sesuai arahan pengguna, hasil diserahkan melalui repository untuk dipasang AI pengguna kemudian; custom plugin perlu diunggah ulang sesudah runtime tujuan memakai descriptor baru. Draft Batch 2 enam fase untuk #7/#17/#195 telah dibuat dan belum diimplementasikan atau disetujui.

Source owners: `src/net/public-url-read.ts` (reused unchanged), `src/rdc/document-projection/{public-url,html-main-content,service,types,markup-converters}.ts`, strict filesystem reader/handler, `src/web-research/service.ts`, and MCP handler/server/web schemas/tools. The approved plan records implementation details and installation handoff: [Batch 1](plans/2026-10-12-batch-01-native-web-evidence.md). [Batch 2](plans/2026-10-12-batch-02-revision-bound-skill-discovery.md) remains a draft.
<!-- batch-01-implementation:end -->


## Batch 2 — Revision-bound Skill discovery (2026-10-12)

Batch 2 sudah diimplementasikan pada source utama Agent Core: SkillService menyediakan discovery descriptor lokal dan pembacaan SKILL.md terikat active digest, memakai bytes snapshot yang sama. Mekanisme #195 SkillPort, #17 AutoSkill dan #7 Voyager diadaptasi secara independen tanpa runtime donor, dependency produksi baru, katalog paralel, atau folder penyimpanan baru. Default lexical tidak memanggil embedding; hybrid hanya melalui permintaan eksplisit dan izin berbagi query/descriptor positif bounded ke Cloudflare Workers AI existing, dengan cache sementara terikat model/revisi, batas batch, pembatalan dan deadline. Context dan synthesis memakai satu hasil discovery; hanya detail yang benar-benar tersampaikan mendapat atribusi, tanpa kredit penggunaan otomatis. Tool skills memperoleh action search/read dan controller_learning memperoleh skillSearchMode. Build Linux berhasil; belum ada panggilan provider live, aktivasi Windows, atau klaim manfaat semantic. Memory/Learning P0–P5 dan Batch 1 tetap pada owner existing. Hasil source disiapkan untuk diambil AI pengguna dari repository; setelah pemasangan runtime, custom plugin perlu diunggah ulang agar kontrak baru tersedia.

Implementation owners: `src/skills/service.ts`, `src/skills/discovery.ts`, `src/learning/external-controller.ts`, `src/agent-knowledge-synthesis.ts`, and existing MCP Skills/controller surfaces. Search returns bounded descriptors; selected read checks the active digest and returns a UTF-8 instruction fragment with an explicit continuation offset. Optional semantic candidates use the same configured host embedder. See [Batch 2 plan and handoff](plans/2026-10-12-batch-02-revision-bound-skill-discovery.md).


## Source adoption opportunity research — 2026-10-12

Research-only documentation: `docs/research/candidate-adoption-opportunities-20261012.md` and JSON companion map all 216 IDs (175 pinned implementation excerpts, 3 interfaces, 30 docs-only, 8 reserved). Mechanism-depth traces all 17 opportunity groups: 1 retain, 11 narrow, 5 defer. Existing native recall outcomes, positive/negative evaluation and Bridge source/media hashes narrow the needed adoption. Donor MCP/output, lifecycle, license and observation limits remain explicit. No new candidates, implemented capability, dependency, tool or storage owner. Before Batch 5/6, wait for actual Batch 3/4 integration and reconcile selected source/contracts. Invocate remains deferred.
