# Agent Core

Local-first, Windows-first agent body with authenticated MCP access, durable Memory and Learning, a native model/controller runtime, interactive chat, and shared machine, browser, code, research, and phone capabilities.

**Source version: 0.14.0.** This repository contains the current Agent Core source line. The documentation refresh is grounded in `main` at `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3`. Source availability does not establish what is installed or running on another machine, or which release assets are published.

## Product direction

Agent Core is a cumulative-learning agent: external MCP controllers and the Native AI Agent use the same local capability owners and persistent knowledge. The goal is verified learning that is used in later decisions and actions, not a larger tool count. Native runtime, provider scheduling, interactive chat, and capability grants are implemented; their presence alone does not prove improved task outcomes.

See [Product Direction](docs/Agent-Core-Product-Direction.md) for intent and evidence limits, [CODEBASE](docs/CODEBASE.md) for the source map and dated acceptance records, and [AGENTS.md](AGENTS.md) for the operating contract. [Target-Feture](docs/Target-Feture.md) preserves the original conversation evidence.

## Implemented capability owners

| Capability | Source owner / entry point | Scope |
| --- | --- | --- |
| Machine and browser control | `src/rdc`, `src/mcp/server.ts` | Files, documents, search, processes, checkpoints, and browser control |
| Memory | `src/memory/host-runtime.ts`, `src/memory`, `SubProject/agent-core-memory` | Legacy-compatible memory facade; guarded experience-v2 activation and controller-scoped read/write facades |
| Learning and cumulative workflow | `src/learning`, `controller_learning`, `learning` | Task episodes, evidence-backed review, reuse attribution, procedures, and outcome records |
| Native runtime and chat | `src/agent-runtime.ts`, `src/agent-controller.ts`, `src/agent-chat-*` | OpenAI-compatible providers, persistent scheduling, conversations, durable turns, scoped tools, and finalization |
| Skills and capability awareness | `src/skills`, `src/capability-awareness.ts` | Artifact catalog, revision-bound proposals/decisions, capability discovery, and actual-use disclosure |
| Code Intelligence | `src/code-intelligence`, seven structural `code_*` tools | Project-local Grafel orientation, graph, surface, analysis, patterns, workspace, and repair |
| Semantic IDE | `src/semantic-ide`, `code_symbol`, `code_refactor` | Language-server-backed inspection and scoped refactoring |
| Web research | `src/web-research`, `web_search`, `web_open` | Configurable search/read providers with bounded results |
| Phone and Game Mode | `src/phone`, `src/mcp/phone-*` | Android observation/actions and guarded game profiles, sessions, and assessment |

The actual MCP tool list depends on initialized services, enabled features, controller context, and credential grants. `src/mcp/server.ts` plus the registered facade modules define the source surface; a fresh `tools/list` establishes the exposed surface of a particular running instance. Older 55/62/70-tool counts are dated snapshots.

The Hermes `partner` bridge is retired. Internal `src/rdc` is Agent Core-owned machine-control code; the external Remote Desktop Commander product is a separate operator tool.

## Architecture

```text
External MCP controller             Native AI / interactive chat
          |                                      |
          +------ Agent Core capability owners --+
                             |
             Memory / Learning / Skills / evidence
             machine / browser / code / web / phone
                             |
                  local machine and services
```

`src/index.ts` initializes the services, Node HTTP/MCP server, native controller, and chat service. The Windows launcher hosts the React UI in WebView2 and manages the local Core/tunnel lifecycle. Authentication and scoped grants remain enforced; subsystem availability does not grant additional authority.

Memory activation is explicit. Without `runtime/memory-v2-activation.json`, the host initializes the legacy Memory service at its configured root, defaulting to `runtime/memory`. A valid activation marker and matching backup digest select the experience-v2 service at `runtime/memory-v2`; the legacy writer is not initialized in that branch. A source checkout does not include or create that production activation state.

The native provider runtime defaults to disabled in `src/config.ts` and needs appropriate local configuration. Provider credentials, live Memory, chat history, and machine-specific runtime state are not supplied by cloning the repository.

## Build from source

Requirements:

- Windows for the native desktop launcher and Windows integration
- Node.js **>= 24.15.0** and npm
- .NET SDK when rebuilding the launcher
- Separately configured optional providers/transports for the capabilities you use

From the project root:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run build
npm start
```

The root build runs the path policy, builds `SubProject/agent-core-memory`, and compiles the Core. Build the React UI separately:

```powershell
Set-Location src\ui
npm ci
npm run build
```

Keep credentials local. Review [Maintenance](Maintenance.md), [Contributing](CONTRIBUTING.md), and the relevant subsystem documentation before configuring or activating optional runtimes.

## MCP and authentication

The source-default listener is `127.0.0.1:8765`; `/mcp` requires an Agent Core API key or OAuth access token. Remote access uses the authenticated tunnel path. The native chat HTTP routes and local UI bridge are implemented separately from public MCP discovery.

See [SECURITY.md](SECURITY.md) for authentication, credential handling, and the security boundary.

## Releases and recovery

Source version, packaged version, published assets, and resident runtime are separate facts. [CODEBASE release documentation](docs/CODEBASE.md#09-release-intent-and-product-version-integrity) records packaging policy; older release and activation reports remain historical evidence.

`Recover-Agent-Core.ps1` supports an explicit trusted `-SourceZip` with `-ChecksumFile` or `-ExpectedZipSha256`. Bootstrap requires an empty destination; repair targets a packaged installation and the same product version. Read-only `npm run recovery:audit` checks its integrity manifest.

**Known implementation limitation:** the recovery script still rejects `Black-Project-Agent-Core/Agent-Core` with `LEGACY_REFERENCE_ONLY`, although that repository now contains the current source line. Its `Repository` default is empty and network recovery also requires `-AllowNetworkRecovery`. This documentation refresh does not change those guards or establish trusted release assets. Use a separately verified current-line ZIP/checksum for recovery; do not assume a source sync makes the network recovery path usable.

## Repository and private-state boundary

[Black-Project-Agent-Core/Agent-Core](https://github.com/Black-Project-Agent-Core/Agent-Core) is the current source repository, replacing the earlier legacy/reference-only designation. Remote names and tracking branches are checkout-specific; inspect them before Git operations. Repository access is not permission to reset local work, push, publish, release, or deploy.

The tracked tree excludes live `.env`, secrets, private runtime state, user Memory, browser profiles, protected reference trees, generated builds, and local release archives through `.gitignore`. The package metadata field `legacyRepository` is a retained implementation name, not the current repository policy. Do not publish private state or restore it from unrelated release/source snapshots.

## Documentation and verification

- [Documentation index](docs/README.md)
- [Documentation audit and limitations](docs/DOCUMENTATION-AUDIT-20261008.md)
- [Architecture and evidence map](docs/CODEBASE.md)
- [Product direction](docs/Agent-Core-Product-Direction.md)
- [Operating contract](AGENTS.md)
- [Security policy](SECURITY.md)
- [Maintenance](Maintenance.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)

Available commands include `npm run build`, `npm test`, `npm run release:plan`, and `npm run release:compat`. Run them within the authorized task scope. This documentation refresh used static source inspection only; it did not build, test, install, activate, release, or publish the product.

## License

No root open-source license is declared in this source baseline. Do not infer redistribution rights from repository visibility; retain applicable third-party notices.
