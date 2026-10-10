# Agent Core

A local-first agent system for Windows. External MCP controllers and a native AI chat share machine tools, persistent Memory, Learning, Skills, and evidence.

Agent Core keeps the model separate from the local capability owners. Connect an external controller or configure the native OpenAI-compatible runtime, then use the same authenticated body for files, processes, browser work, code intelligence, research, and Android control.

[Architecture](docs/CODEBASE.md) · [Documentation](docs/README.md) · [Candidate release notes](docs/releases/0.15.0-beta.2.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Current status

**Source candidate: `0.15.0-beta.2`.** Memory Plans06–11 extend the consolidated Plans01–05 source. Scoped offline functional verification and final integration are recorded separately from Windows beta.1 acceptance. The published [Windows portable beta.0](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/tag/v0.15.0-beta.0) remains pinned to `23fdca411e152c42fe1a5b81f526b18d6d57bd3b`.

| Area | Status |
| --- | --- |
| Image inspection | Implemented; earlier external-controller acceptance |
| Memory01 and Workflows | [Scoped production functional acceptance closed](docs/verification/memory01-windows-functional-2026-10-10.md); daily installation preserves local changes |
| Memory02 | Host-owned ranking policy and revision-bound pagination; baseline remains default |
| Memory03 | Explicit host-validated v2 task/workspace binding; external clients must send `scope.taskId` |
| Memory04 | Contextual retrieval document v2 and derived index v3; startup may require full re-embedding |
| Memory05 | Isolated deterministic outcome-evaluation tooling; no claim of measured AI improvement |
| Memory06–11 | Exact excerpts/identifiers, bounded subquestion helpers and host-opt-in passage/cache/relevance capabilities; [functional source ledger](docs/verification/memory06-11-source-functional-2026-10-10.md) |
| Adaptive parallel execution | Proposed, not implemented |
| New candidate Windows rollout | Not performed by source implementation; requires scoped integration and acceptance |

**Upgrade cautions:** Memory03 intentionally rejects older v2 calls without the host-bound task selector. Memory04 may send the whole allowed canonical retrieval representation to the configured embedding provider during initialization; review corpus/provider/data/cost approval before restarting a production instance. Building or pushing source does not authorize or perform that rollout.

See [plan status](docs/plans/README.md), [candidate notes](docs/releases/0.15.0-beta.2.md), and the original [beta.0 notes](docs/releases/0.15.0-beta.0.md), whose initial publication status is historical.

## Capabilities

- **Machine and browser tools:** bounded file/document operations, search, processes, checkpoints, browser control, and external MCP image inspection.
- **Persistent knowledge:** host-selected Memory, task-scoped Learning, evidence-backed reuse records, and revision-bound Skill proposals and decisions.
- **Native AI chat:** persistent conversations, provider scheduling, durable turns, and task-scoped tools over the shared owners.
- **Code and research:** Grafel-backed structural intelligence, language-server inspection/refactoring, and configurable web search/read providers.
- **Phone and Game Mode:** Android observation/actions with guarded profiles and sessions.
- **Workflows:** one interactive System + Memory source map, refreshed from supported source changes without a model. It shows dependency evidence, not live execution telemetry.

Availability depends on initialized services, configuration, and grants. A fresh MCP `tools/list` establishes the tool surface of a running instance; historical tool counts are not a current manifest.

## Architecture

```text
External MCP controller                 Native AI chat
          |                                   |
          +----- Shared Agent Core owners ----+
                              |
          Memory · Learning · Skills · evidence
          machine · browser · code · web · phone
                              |
                   local machine and services
```

[`src/index.ts`](src/index.ts) composes the services and HTTP/MCP server. The Windows launcher hosts the React UI in WebView2 and manages the Core/tunnel lifecycle. Authentication and capability grants remain enforced across these surfaces.

Memory v2 uses the existing host selection boundary. With no activation marker, the host uses legacy Memory. A validated marker selects the experience-v2 engine without starting a second writer; a present invalid marker fails closed. Cloning or building the source does not activate or migrate production Memory.

The native provider runtime defaults to disabled. Provider credentials, browser profiles, chat history, live Memory, and machine-specific state must remain local. See the [codebase map](docs/CODEBASE.md) and [product direction](docs/Agent-Core-Product-Direction.md).

## Build and verify

Requirements: Node.js **>= 24.15.0**, npm, and Windows with the **.NET 8 SDK** for the native launcher. Optional providers and transports need their own configuration.

From the repository root:

```powershell
npm ci
npm run build
npm test
```

The root build checks path policy, builds the Memory subproject, then compiles the Core. The root test suite excludes the standalone Memory, React UI, and launcher suites; verify those separately for changes in their scope.

```powershell
npm --prefix src/ui ci
npm --prefix src/ui run typecheck
npm --prefix src/ui test
npm --prefix src/ui run build
```

For a configured local source runtime, copy `.env.example` to `.env` only if no local configuration exists, review it, and run `npm start`. Do not copy production credentials or runtime state into source packages. Source startup and build commands are not an installation or upgrade procedure for an existing Windows instance.

See [verification entry points](docs/CODEBASE.md#build-and-verification) and [Contributing](CONTRIBUTING.md). The root package is private; an older plugin package is not a full Agent Core installer.

## Security and operation

- The default listener is `127.0.0.1:8765`; `/mcp` requires an Agent Core API key or OAuth access token.
- Native desktop routes use the existing loopback/UI-token boundary. Workflows HTML runs in a display-only sandbox.
- Live `.env`, secrets, private runtime data, browser profiles, and user Memory do not belong in the repository or release artifacts.
- Agent Core-owned `src/rdc` is internal machine-control code. The separate Remote Desktop Commander product is not an Agent Core dependency. The Hermes `partner` bridge is retired.

Read [SECURITY.md](SECURITY.md) and [AGENTS.md](AGENTS.md) before operating the system.

## Releases, recovery, and history

The [changelog](CHANGELOG.md) records applied source releases; [current source notes](docs/releases/0.15.0-beta.2.md) distinguish prerelease metadata, published assets, and installation state. Pending intents are preserved under [`.changeset`](.changeset/README.md).

Recovery accepts a separately trusted ZIP and checksum. The existing Windows recovery script still rejects this repository through its historical `LEGACY_REFERENCE_ONLY` guard; current source publication does not make network recovery usable. See [release and recovery boundaries](docs/CODEBASE.md#release-and-recovery).

Previous architecture snapshots, donor research, acceptance reports, and conversations remain accessible through the [archive index](docs/archive/README.md). Historical dates, versions, counts, and pending instructions retain their original scope.

## License

No root open-source license is declared in this source baseline. Repository visibility does not grant redistribution rights. Preserve [third-party notices](THIRD_PARTY_NOTICES.md) and bundled component licenses.
