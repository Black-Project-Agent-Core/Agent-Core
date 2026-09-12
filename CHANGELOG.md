# Changelog

Notable Agent Core changes are recorded here. Release tags and package artifacts follow semantic versioning; prereleases do not imply stable certification.

## Unreleased

- Default `engineering-v1` coding assessment discovers existing/native/installed facilities, traces scoped TS/JS callers using the pinned local compiler, requires evidence-backed reuse and scope decisions, and checks final complexity findings before closure.
- Concurrent command reconciliation records captured output manifests per actual attempt. Pending sibling changes remain unacknowledged until their own receipts arrive; unexpected source/dependency changes block acceptance.
- Target baseline source blobs join the existing Vault/Supabase workflow projection and recovery path. Historical workflow hashes remain compatible, and active historical coding tasks explicitly require new assessment before further mutation.
- Expanded `craft_source` and `workflow_plan` operations expose discovery, impact and final review through the existing MCP tools. Publication and ChatGPT Web schema verification remain separate deployment gates.

## [0.7.0] - 2026-09-10 — Prerelease

This version is prepared for the GitHub prerelease channel and the GitHub Packages `next` dist-tag. It does not replace v0.6.0 as the stable release. Publication, downloadable asset parity, and registry readback must be verified separately from the functional task results below.

### Added

- Source-grounded workflow tools `craft_source`, `workflow_plan`, and `workflow_status` bind a continuity task to current source receipts, an accepted plan revision/hash, managed execution, and evidence-backed completion. Explicit donor-feature requests require donor grounding; verification of an existing implementation preserves its applicable plan/DAG obligations without inventing a donor task.
- Current-attempt execution provenance binds input manifests, source bytes, artifacts, and plan identity. Stale inputs or outputs prevent old results from being accepted as current proof.
- An Obsidian-compatible Markdown vault provides canonical semantic memory, immutable revision history, transaction recovery, scoped recall, and a deterministic Graphify projection. Direct Supabase access provides searchable second memory through the scoped Data API/RPC contract.
- Scoped Supabase workflow generations persist continuity, workflow contracts, write decisions, and referenced memory revisions. Verified recovery validates generation hashes and staged local bytes before restoration.
- Durable task checkpoints record decisions, artifacts, outcomes, blockers, and next candidates. `memory_remember_more` supports bounded expansion when the first recall is insufficient.

### Changed

- Memory lifecycle defaults to `enforce`. Substantive operations require valid scoped preflight; unhealthy required components, expired authority, or pending postflight prevent new work. Diagnostics and recovery remain available. An empty successful recall is distinct from a failed recall.
- Finalization and task checkpoints share the postflight contract. Failed required synchronization leaves closure pending; retry resumes persistence without repeating successful execution. A completed workflow requires current verified evidence and durable closure.
- The host AI performs interpretation and code adaptation. Agent Core supplies deterministic routing, source validation, planning, execution, and memory persistence without another inference provider or model API key.
- Runtime identity is centralized in `src/version.ts`; package, MCP, health, and GitHub User-Agent identity use the same version.
- Release preparation includes active source, tests, scripts, plugin code, and SubProject source. The full project source ZIP is separate from runtime/plugin distributions; independently maintained native subprojects retain their own verification boundaries.

### Fixed

- Routes now expose managed execution controls when the persisted workflow requires a DAG, including inspection/resume routes. Normal read-only routes retain their restrictions, and principal, preflight, expiry, accepted-plan, and command-binding checks still apply.
- File-native state validation rejects malformed or missing scoped lifecycle/continuity records. Parsed vault caches are bound to bytes actually read, and revision/history reads preserve corruption and filesystem-link checks.
- Execution state transactions preserve durable journal ordering, serialize conflicting targets, and report per-attempt process truth. Lease recovery and portability diagnostics name Windows ownership/permission failures.
- The native Windows controller owns service/tunnel supervision, cooperative shutdown, restart, autostart, and OAuth recovery. Shell selection, failed-start diagnostics, and identity-checked process ownership are handled explicitly.
- Runtime startup resolves the project-local `.env` before services are created. Direct Supabase credentials remain server-side; release artifacts exclude operator environment files and live state.

### Security

- Direct Supabase searchable content is redacted and scoped; it is not end-to-end encrypted. The optional encrypted full-vault mirror is a separate recovery transport with a separate contract.
- Graphify runs with a minimal credential-free environment. Filesystem roots, route ownership, OAuth resources, local diagnostics, and artifact evidence remain guarded.
- No additional inference service, cloud embedding/reranking provider, or model API key is required.

### Verification scope

- Publication checkout verification: 1,092 functional tests passed and 11 were skipped across the 184-file suite after missing private-tool prerequisites were provisioned and failed cases were rerun selectively. The routing corpus (40 cases) and memory corpus (12 cases) passed the unchanged quality gate. No speed benchmark or full stable certification was run.
- The deployed workflow task completed after a real ChatGPT Web managed DAG: **60 behavior tests and 35 integration tests passed**, with both attempts and report hashes still current after a cooperative restart.
- Independent compilation matched **318 deployed compiler files**. Nine memories from the preceding checkpoint were read after restart; the subsequent completed checkpoint recorded synchronized durable closure and **39 active memories** with no pending Supabase items at readback.
- The completed checkpoint was created after that restart and was not subjected to a second restart. Supabase fault tests used isolated fixtures; production synchronization was evidenced separately by actual checkpoint operations.
- Whole-project stable certification is not claimed. Earlier performance gate failures remain recorded and further benchmarks are deferred. The operator's original checkout also retains a separately reported Git-object recovery limitation; preparing a release from a verified isolated source snapshot does not repair that history.

## [0.6.0] - 2026-08-31 — Stable

### Added

- Wave A-F hardening is consolidated into the stable control plane: repaired trust boundaries, dual-era MCP support, deterministic execution policy/recovery, tamper-evident observability, deterministic routing/memory quality gates, adaptive local resource governance, bounded evidence-based diagnosis, and optional safe local maintenance.
- Wave G adds a repository-owned 18-area core certification contract plus `npm run certify:core:prepublish` and post-publication `npm run certify:core` gates so architecture-level stability claims require the same repeatable local evidence.
- Core certification now binds normal regression, Wave E routing/memory quality, 100k deterministic-memory performance, deterministic execution performance, stable-release parity, release metadata, and no-external-AI/model/API policy checks.

### Changed

- Agent Core server/runtime identity and Native GitHub Fabric User-Agent advance from 0.5.4 to 0.6.0.
- Core certification has an explicit release lifecycle: prepublication proves the source before a tag exists; postpublication additionally requires the exact version-matched GitHub stable release assets and tag parity.
- Adaptive resource governance may only reduce new execution dispatch within the operator hard maximum; it never terminates already-running work or alters factual execution-result semantics.

### Fixed

- Stable release parity verification invokes Git tag/source checks through `git` instead of accidentally routing them through the GitHub CLI.
- Stable release packaging no longer requires the removed self-fork diagram directory; `dist` is declared as the sole generated runtime input and release tests now require every other runtime package input to have tracked source.
- Routing least-privilege classification, capability ranking noise, deterministic memory chatter displacement, audit-journal test synchronization, and Wave A trust-boundary defects are covered by permanent regression/certification gates.

### Security

- No OpenAI, Anthropic, Gemini, cloud embedding/reranking, external AI judge, hidden model-worker, or model API dependency is added by the A-G evolution.
- Detailed HTTP metrics remain loopback-only, MCP browser Origin is validated, OAuth tokens remain resource-bound, principal/project isolation remains fail-closed, and release artifacts remain allowlist-built without secrets/runtime evidence.
- Scheduled maintenance remains disabled by default and has no destructive retention-apply, restore, credential-revocation, or file-deletion call path.

### Stability evidence

- Pre-version Wave G certification established the complete 18/18 core matrix, 137 test files / 668 tests passing with 38 intentional skips, 100k memory p95 well below the 150 ms gate, execution DAG/dispatch/wake p95 below 50/100/250 ms gates, 55 tools in both MCP protocol eras, and zero external model/API dependency/source violations.
- Final v0.6.0 publication evidence is recorded in `docs/stability.md` and the Wave G roadmap after tag/release publication, stable parity, production source-sync, public trust-boundary canary, and live audit verification complete.

## [0.5.4] - 2026-08-30 — Stable

### Added

- Autonomous execution memory pre-search now recalls bounded relevant failures, decisions, conflicts, and hard guardrails from execution objectives and node purposes before create/start/dynamic-add/retry paths, without indexing raw command text; degraded memory search fails open while enforced hard guardrails fail closed before process launch.
- Execution memory pre-search has a dedicated local performance gate requiring real p95 latency below 500 ms.
- Bounded runtime observability with `/health/metrics` and read-only `agent_core_health_metrics`, deterministic rolling p50/p95/p99/max summaries, and TTL/single-flight optional GitHub health probes.
- Deterministic structured execution-output parser v1 with persisted source hashes and bounded test/build/deployment/performance/warning/error/security evidence.
- Execution schema v4 verified-artifact index with hash/type/run lookup, startup reconciliation, advisory-only reuse discovery, and review-only purge suggestions.
- Read-only `execution_workflow_advice` with optional route-valid `proposedNext` guidance and principal/project isolation.
- Local improvisation performance gates for health metrics, bounded parsing, 1000-row artifact lookup, 128-node advisor analysis, and 100000 bounded metric observations.
- Presentation Bridge v0.2 with a shared one-screen Electron/hosted interface, real progress and cancellation, Google Slides workflows, local or remote Keynote worker support, encrypted desktop worker settings, recent jobs, setup dialogs, compatibility reporting, and restrictive CSP.
- Cross-platform stable release construction through Node.js, including a credential-free `presentation-bridge-v0.2.0-source.zip` alongside the Agent Core runtime/plugin ZIPs and npm package.

### Changed

- Stable release ownership targets `Black-Project-Agent-Core/Agent-Core` and `@black-project-agent-core/agent-core-plugin`.
- Stable publication now has an explicit remote parity gate: a package version cannot be declared complete while the GitHub Release ZIP assets remain on an older version.
- `capability_route` now injects a bounded deterministic projection of recalled non-guardrail memory into capability ranking and reports `memoryInjection` evidence, closing the gap between available memory infrastructure and autonomous routing adoption.
- Execution-derived intelligence now documents and enforces the authority order `PROCESS TRUTH > VERIFIED ARTIFACT TRUTH > PARSED STRUCTURED INTERPRETATION > ARTIFACT/CACHE SUGGESTION > WORKFLOW ADVICE`; cache awareness never skips current command execution.
- Windows owned-process stop now terminates the spawned process tree so a stopped background command cannot leave descendants holding the routed working directory.
- The repository README now documents the canonical clone path, Windows operation, Presentation Bridge, release assets, and authenticated GitHub Packages installation.
- Stable release packaging now includes canonical Windows cutover documentation, deterministic source ZIP paths, an expanded manifest, and SHA-256 coverage for every distributable asset.

### Fixed

- Root Agent Core brand and documentation-link verification now stop at independent `SubProject/` boundaries so legitimate subproject vocabulary or internal docs cannot block an Agent Core stable release.
- Lifecycle startup no longer treats local process health as sufficient: it verifies protocol availability, remote tunnel identity, registration freshness, and watchdog supervision before reporting ready.

### Documentation

- Recorded the Windows installation cutover procedure and the defects found while moving the authoritative installation to a fresh canonical clone: empty `runtime/data` authentication stores on a clone, deletion of an ignored-path secret file required by the tracked tunnel template and lifecycle tests, a machine-level root locator left pointing at the previous installation, and a stale cutover marker asserting a success that had rolled back.

### Security

- Release ZIP/TGZ construction remains allowlist-based and excludes secrets, runtime state, logs, local capabilities, raw execution evidence, Presentation Bridge jobs, generated corpus files, caches, and credential-bearing configuration.
- GitHub REST/Git and Packages credentials remain separate, file-backed, lazily read, redacted, and absent from command arguments and release artifacts.
- Presentation Bridge preserves truthful target availability; live Google OAuth and native macOS Keynote output remain external acceptance gates rather than simulated success.

### Stability evidence

- Presentation Bridge verification passed its complete automated suite, doctor/isolation gates, Linux Electron smoke, restrictive-CSP contracts, rendered desktop/mobile interaction QA, and production dependency audit.
- `npm run verify:release`: 110 test files passed, 496 tests passed, 38 platform/performance tests skipped, release consistency passed, and 44 Markdown files with 17 relative links passed documentation validation. Presentation Bridge passed 45/45 tests, doctor/isolation, Linux Electron smoke, and a zero-vulnerability production audit.
- Stable publication remains local-direct with GitHub Actions/CI disabled; the exact source SHA, asset sizes, and SHA-256 digests are independently verified again after the merge and by remote read-back.

## [0.5.3] - 2026-08-27 — Stable

### Fixed

- Lifecycle recovery now fails closed instead of mutating source when the checkout has tracked local changes, is not on `main`, is ahead of `origin/main`, or has diverged history.
- Bootstrap re-executes itself from the synchronized checkout when source changes so stale shell code cannot continue after a fast-forward.
- A fresh or rebuilt distribution now forces the tmux supervisor to reload after a build, preventing a healthy old Node process from surviving behind new source/dist files.
- Local and public health gates now require the running Agent Core version to equal the synchronized package version before READY can be emitted.

### Added

- `/health` exposes the Agent Core server version for source/process freshness verification.
- Real temporary-Git integration coverage for clean fast-forward, dirty/ahead/diverged/non-main fail-closed behavior, untracked editor-state preservation, version mismatch rejection, and connection metadata provenance.

### Stability evidence

- The original stale-process scenario was reproduced by an integrated live attach repair: the version-aware health gate rejected the previously running process, performed one bounded controlled restart, then accepted READY only after source and process version agreed.
- Integrated live proof established `local HEAD == origin/main == connection.json.sourceCommit` and `package version == local/public /health.version == agent_core_status.version == connection.json.sourceVersion`.
- `.vscode` remained present and tracked working state remained clean throughout automatic recovery.
- `npm run verify:release`: 82 test files passed, 360 tests passed, 32 platform/performance tests skipped by the normal suite, with zero failures; release consistency and documentation link checks also passed.

## [0.5.2] - 2026-08-27 — Stable

### Added

- Project-scoped route identity now propagates deterministically through memory, continuity, and execution so multi-project work cannot silently fall back to the first workspace root.
- Execution evidence schema v2 with optional declared artifacts, workspace-bounded verification, required-evidence gating, factual file metadata, and SHA-256 verification.
- Coalesced `node.output_available` wake events and staged multi-command wake/re-wait behavior for concurrent execution without log polling or event flooding.
- Deterministic merged execution evidence views and restart acceptance proving declared-artifact contracts survive service close/reopen and remain verifiable.

### Changed

- Semantic task completion for execution-backed continuity tasks now requires explicit verified execution evidence; successful process exit alone cannot finalize the task.
- Execution-to-memory promotion now carries verified artifact manifests with exact attempt provenance while continuing to exclude raw stdout/stderr.
- Agent Core routing skill guidance now makes project resolution, deterministic memory/continuity inspection, multi-command execution, wake/re-wait, and evidence verification explicit operational contracts.
- Stable plugin package parity is checked byte-for-byte against the tracked router skill before release.

### Security

- Cross-project memory, continuity, and execution access is fail-closed under route-bound project identity.
- Required artifacts are verified from bounded filesystem evidence rather than inferred from command output.
- Raw execution logs remain local evidence and are not promoted automatically into long-term deterministic memory.
- Secrets, runtime databases, generated state, local credentials, and raw execution evidence remain excluded from release packages.

### Stability evidence

- Final stable hardening acceptance completed all 27 planned tasks and was integrated into `main` with no GitHub Actions/CI.
- Execution Fabric startup migrated Execution Fabric schema v1 to v2 with an automatic pre-migration backup and `integrity=ok`.
- Live schema-v2 declared-artifact run completed with `evidenceState=verified` and an independently matching SHA-256.
- `npm run verify:release`: 81 test files passed, 351 tests passed, 32 platform/performance tests skipped by the normal suite, with zero failures; release metadata and documentation link checks also passed.

## [0.5.1] - 2026-08-26 — Stable

### Added

- Native GitHub Fabric with direct GitHub REST API access, ephemeral authenticated HTTPS Git transport, dedicated GitHub Packages authentication, route-aware MCP tools, destructive-operation guards, canonical operator guidance, and opt-in read-only live acceptance without requiring interactive GitHub CLI login.

### Changed

- Stable runtime and plugin packaging now ship the tracked Native GitHub Fabric skill and canonical GitHub operator documentation while keeping local credentials and generated runtime state outside release artifacts.
- Release smoke coverage now matches the complete routed GitHub-enabled MCP tool surface.
- GitHub Actions/CI is permanently disabled for the Agent Core repository. Stable verification and publication are local-direct only; already accepted local stability evidence is not rerun on GitHub-hosted runners, and repository workflow files intentionally contain no executable workflow.

### Security

- GitHub credentials are read lazily from separate operator-managed files, redacted from GitHub errors, audit, and deterministic memory, and never embedded in Git command arguments, repository URLs, global npm configuration, source control, or release packages.
- Destructive GitHub operations remain gated by explicit Agent Core confirmation before side effects.

### Stability evidence

- `npm run verify:release`: 76/76 test files passed, 329 normal tests passed, 4 benchmark-only tests skipped in the normal suite, with release metadata and documentation link checks passing.
- Explicit release performance gates: 6/6 passed, including the 10k-task continuity snapshot, bounded dispatch, and persisted wake latency gates.
- Opt-in live read-only GitHub acceptance passed for authenticated identity/repository REST access, HTTPS `git ls-remote`, and GitHub Packages access without exposing credential values.

## [0.5.0] - 2026-08-26 — Stable

### Added

- File-Native Memory Fabric with provenance, deterministic retrieval, redaction, backup/recovery and integrity checks.
- Local Continuity Ledger for task state, checkpoints, blockers, deferred work and bounded next-work frontiers across routes/sessions.
- Deterministic Execution Fabric with persisted DAGs, hard dependencies, bounded concurrency, explicit retry/cancel, factual attempt logs and result markers.
- Persisted event journal and event-driven wake behavior with persist-before-signal semantics and no busy polling.
- Cross-route execution continuation and restart reconciliation that marks missing-result work interrupted rather than inventing success.
- Execution-to-memory bridge that promotes structured/redacted evidence while keeping raw stdout/stderr out of semantic memory.
- Automatic capability routing with principal-bound route contexts and audited native-ready skill loading.
- Windows lifecycle supervision with watchdog recovery, tunnel supervision, OAuth reset/re-auth and optional autostart.
- Portable root resolution so the complete Agent Core folder can be relocated without hard-coding a project drive/path.
- Stable release automation, reproducible plugin/runtime bundles, SHA-256 manifests and GitHub Packages publication under the `stable` channel.

### Changed

- Execution is enabled by default after staged acceptance, performance and recovery gates.
- Execution persistence uses explicit durable commit boundaries at graph, dynamic-graph and terminal-run transitions to keep shutdown/restart behavior bounded after real workloads.
- Documentation is consolidated around canonical architecture/operator guides; historical implementation scratch plans and per-task checkpoints are retained in Git history instead of the current tree.
- Repository presentation, plugin documentation and release metadata are normalized for a cleaner private-repository surface.

### Security

- Custom Agent Core API-key and OAuth behavior remain isolated from source/package artifacts.
- Capability/tool scope is constrained by authenticated principal/project routing and allowed workspace roots.
- Raw execution logs remain local sensitive evidence; only structured/redacted evidence may enter durable memory.
- Control-plane and runtime secrets are excluded from Git and release packages.

### Stability evidence

The stable runtime baseline passed:

- clean dependency install and TypeScript build;
- full regression: 68/68 test files, 267 normal tests passed, with 4 benchmark-only timing tests exercised separately;
- explicit execution performance gates: 6/6 passed;
- deterministic execution benchmark gates for 128-node DAG validation, bounded dispatch and persisted wake delivery;
- File-Native Memory Fabric 100k-item benchmark with end-to-end recall below the certified p95 target;
- acceptance/recovery/secret-isolation gates, including cross-route continuation and no-false-success restart recovery;
- live dependency/wake canaries and post-workload graceful restart proof.

See [`docs/stability.md`](docs/stability.md) for the maintained stability baseline and release-gate policy.
