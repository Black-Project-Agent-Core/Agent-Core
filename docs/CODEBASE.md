# Agent Core codebase map

This is the maintained source-owner map for **`0.15.0-beta.0`**. The implementation review is grounded in [`f22e6e426d9c8937439763602f986b9fb3243f23`](https://github.com/Black-Project-Agent-Core/Agent-Core/commit/f22e6e426d9c8937439763602f986b9fb3243f23), followed by source-prerelease metadata and documentation changes. Published source tag `0.15.0-beta.0` identifies [`23fdca411e152c42fe1a5b81f526b18d6d57bd3b`](https://github.com/Black-Project-Agent-Core/Agent-Core/commit/23fdca411e152c42fe1a5b81f526b18d6d57bd3b); this later documentation update does not move that tag. Exact source takes precedence over prose.

[Documentation index](README.md) · [Source release notes](releases/0.15.0-beta.0.md) · [Historical codebase record](archive/CODEBASE-2026-10-09.md)

## Source and acceptance status

| Scope | Established state | Remaining boundary |
| --- | --- | --- |
| Shared Core, Native chat, Learning, Skills, machine/code/web/phone owners | Implemented in source; earlier scoped acceptance records retained | Configuration, grants, and live readiness are instance-specific |
| External MCP image inspection | Implemented; external-controller acceptance reported in preceding work | No Native multimodal or paid-model accuracy claim |
| Memory 01 filtered semantic retrieval | Source implemented; offline verification recorded | Further acceptance explicitly postponed by the user |
| Unified Workflows | Source implemented; [isolated Windows/WebView2 functional PASS](verification/workflows-windows-functional-2026-10-09.md) on `f22e6e4` plus a documented test-only launcher wrapper | Production activation, pointer-drag pan, security and exact subscription-count checks remain unverified |
| Memory 02–11; adaptive parallel execution | Proposed only | Implementation not started |
| Production Windows installation | Last reported `0.14.0`; untouched by the isolated test | `0.15.0-beta.0` production installation and acceptance not established |

This refresh performs source/documentation review, not new native runtime acceptance. Previous user/controller acceptance reports retain their original scope. Published releases, source version, packaged binaries, and the running process are separate facts. The full dated history is preserved in the [historical snapshot](archive/CODEBASE-2026-10-09.md).

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

### Memory 01: filtered semantic retrieval

The engine's [`index.ts`](../SubProject/agent-core-memory/src/memory/index.ts) validates the complete canonical corpus, then restricts semantic vectors to unique eligible IDs with matching fingerprints. Empty or invalid subsets do not embed a query. Existing full-corpus calls remain compatible.

[`service.ts`](../SubProject/agent-core-memory/src/memory/service.ts) re-snapshots candidates before controller ranking and fails stale revisions with `MEMORY_CURSOR_STALE`. Query embedding runs after releasing the filesystem lock. Existing ranking weights, thresholds, and index-format/provider contracts remain unchanged.

The [implementation plan](plans/2026-10-09-memory-01-filtered-semantic-retrieval.md) records offline checks, including 537 Memory tests and a root build. These are prior scoped results; the user explicitly postponed further Memory 01 acceptance. The Workflows test does not establish Memory retrieval quality or authorize migration/testing of the active Memory engine. [Plans 02–11](plans/README.md) are separate, unimplemented proposals.

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

The map shows static dependency evidence, not complete call flow or live execution. C# dependency semantics and unresolved/dynamic imports remain explicit limitations. Dense layouts may have crossing edges. The [Windows/WebView2 report](verification/workflows-windows-functional-2026-10-09.md) records functional PASS for an isolated `f22e6e4` test candidate: sidebar navigation, one System + Memory canvas, focus/search/zoom, scroll-based viewport movement, source refresh, stale/initial-error recovery, restoration, and graceful teardown. The launcher used three documented test-only isolation changes, so this is not acceptance of an unmodified production launcher or the later release commit. Pointer-drag pan, HTTP security, exact subscription counts, and production activation were not established. See the [implementation and acceptance plan](plans/2026-10-09-unified-workflows.md).

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

Root [`package.json`](../package.json), [`src/version.ts`](../src/version.ts), UI package metadata, and launcher display metadata define source/product version. Numeric Windows assembly/file versions follow their platform format. [Release notes](releases/0.15.0-beta.0.md) distinguish `0.15.0-beta.0` source metadata from published artifacts and installed runtime.

[Pending release intents](../.changeset/README.md) describe unapplied changes; [CHANGELOG.md](../CHANGELOG.md) preserves release history. `release:apply`, packaging, tagging, publishing, deployment, and resident acceptance are distinct operations. This documentation refresh performs none of them.

The Windows recovery script accepts an explicit trusted ZIP plus checksum, requires an empty bootstrap destination, and restricts repair to a packaged installation of the same version. Its historical `LEGACY_REFERENCE_ONLY` rejection of this repository remains in source, with an empty repository default and explicit network opt-in. Do not assume a repository sync enables network recovery.

## Repository boundaries and maintenance

- [`Black-Project-Agent-Core/Agent-Core`](https://github.com/Black-Project-Agent-Core/Agent-Core) is the current source repository. Historical legacy-only repository prose is retained as provenance, not current policy.
- Authored source, generated `dist`, packaged source snapshots, and installed runtime must not be treated as interchangeable.
- Private `.env`, secrets, browser profiles, chat history, and production Memory/runtime state stay outside documentation, fixtures, and source/release publication.
- Version assessment and a complete integration/test handoff are required by the [operating contract](../AGENTS.md), [contributing guide](../CONTRIBUTING.md), and [pull-request checklist](../.github/PULL_REQUEST_TEMPLATE.md). Report source changes, version impact, verification, activation/publication state, and unresolved acceptance separately.
- Keep this file focused on maintained ownership and contracts. Record changing implementation/acceptance status in the relevant plan or release note; preserve dated evidence through the [archive index](archive/README.md).
- Historical sections and their original anchors remain in the [complete pre-refresh CODEBASE](archive/CODEBASE-2026-10-09.md). Existing repository links to the old release-intent anchor remain supported above.
