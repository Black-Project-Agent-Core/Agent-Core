# Agent Core

A local-first agent system for Windows. External MCP controllers and a native AI chat share machine tools, persistent Memory, Learning, Skills, and evidence.

Agent Core keeps the model separate from the local capability owners. Connect an external controller or configure the native OpenAI-compatible runtime, then use the same authenticated body for files, processes, browser work, code intelligence, research, and Android control.

[Architecture](docs/CODEBASE.md) · [Documentation](docs/README.md) · [Source release notes](docs/releases/0.15.0-beta.0.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Current status

**Source prerelease: `0.15.0-beta.0`.** The implementation baseline reviewed for this refresh is [`f22e6e4`](https://github.com/Black-Project-Agent-Core/Agent-Core/commit/f22e6e426d9c8937439763602f986b9fb3243f23); the prerelease metadata and documentation changes follow that baseline.

| Area | Status |
| --- | --- |
| Image inspection | Implemented; external-controller acceptance reported in preceding work |
| Memory 01: filtered semantic retrieval | Implemented and locally verified offline; external-controller acceptance pending |
| Unified System + Memory Workflows | Implemented with Linux checks/builds; real Windows/WebView2 acceptance pending |
| Memory plans 02–11 and adaptive parallel execution | Proposed; not implemented |
| Windows installation | Last reported as `0.14.0`; this prerelease has not been deployed or accepted there |

These are separate source, verification, and installation facts. A version change does not publish a release, update an installed process, or establish whole-product stability. Prior acceptance summaries above were not rerun by this documentation refresh. See the [plan status index](docs/plans/README.md) and [release notes](docs/releases/0.15.0-beta.0.md).

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

The [changelog](CHANGELOG.md) records applied source releases; [source release notes](docs/releases/0.15.0-beta.0.md) distinguish prerelease metadata, published assets, and installation state. Pending intents are preserved under [`.changeset`](.changeset/README.md).

Recovery accepts a separately trusted ZIP and checksum. The existing Windows recovery script still rejects this repository through its historical `LEGACY_REFERENCE_ONLY` guard; current source publication does not make network recovery usable. See [release and recovery boundaries](docs/CODEBASE.md#release-and-recovery).

Previous architecture snapshots, donor research, acceptance reports, and conversations remain accessible through the [archive index](docs/archive/README.md). Historical dates, versions, counts, and pending instructions retain their original scope.

## License

No root open-source license is declared in this source baseline. Repository visibility does not grant redistribution rights. Preserve [third-party notices](THIRD_PARTY_NOTICES.md) and bundled component licenses.
