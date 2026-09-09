# Agent Core

[![Latest release](https://img.shields.io/github/v/release/Black-Project-Agent-Core/Agent-Core?display_name=tag&sort=semver)](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/latest)
[![GitHub package](https://img.shields.io/badge/GitHub%20Packages-agent--core--plugin-24292f?logo=github)](https://github.com/orgs/Black-Project-Agent-Core/packages/npm/package/agent-core-plugin)

Agent Core is a **local-first, authenticated MCP control plane** that gives ChatGPT scoped execution tools with verifiable results. It combines durable memory, source-grounded implementation plans, cross-session continuity, dependency-aware execution, evidence-backed completion, GitHub operations, and native desktop lifecycle recovery.

The model remains responsible for interpretation and judgment. Agent Core supplies the deterministic substrate around it: identity, policy, local state, guarded tools, process truth, recovery, and auditable evidence.

## Core capabilities

| Layer | Responsibility |
|---|---|
| MCP gateway | Streamable HTTP MCP endpoint, OAuth, custom Agent Core API keys, and bounded tool discovery |
| Workspace guard | Allowed-root filesystem and process boundaries |
| Capability routing | Principal/project routing, deferred capability search, and audited skill loading |
| File-Native Memory Fabric | Obsidian-compatible Markdown vault with provenance, retrieval, revision, redaction, backup, and integrity checks |
| Source-grounded workflow | Current source receipts, accepted plan identity, required craft/DAG obligations, and verified completion |
| Second memory | Scoped direct Supabase recall, reads/writes, and durable workflow generations; Graphify supplies a derived local graph |
| Local Continuity | Durable task, checkpoint, blocker, decision, and next-frontier state across sessions |
| Execution Fabric | Persisted DAG execution, bounded concurrency, retries, cancellation, logs, restart recovery, and verified artifacts |
| Native GitHub Fabric | Route-aware repositories, Git, issues, pull requests, releases, REST calls, and GitHub Packages without interactive login |
| Lifecycle authority | `Agent Code Native.exe` Windows supervision and recovery |
| Presentation Bridge | Standalone PPTX conversion project with desktop and hosted interfaces |

**Authority order:** process truth > verified artifact truth > parsed structured interpretation > artifact/cache suggestion > workflow advice. Lower layers may help reasoning, but they do not override current execution evidence.

## Architecture

```text
ChatGPT / MCP client
        |
        v
+-------------------------------+
| Agent Core MCP + OAuth        |
| identity / route / policy     |
+---------------+---------------+
                |
   +------------+------------+------------+----------------+
   |                         |            |                |
   v                         v            v                v
Capability              Memory +      Execution      Native GitHub
routing                  Continuity      Fabric          Fabric
   |                         |         DAG + events   REST/Git/Packages
   +------------+------------+------------+----------------+
                |
                v
          Bounded actions
                |
        +-------+--------+
        |                |
        v                v
 files / processes   GitHub / evidence
```

## Clone the canonical repository

```bash
git clone https://github.com/Black-Project-Agent-Core/Agent-Core.git
cd Agent-Core
git switch main
```

Use `Black-Project-Agent-Core/Agent-Core` as the canonical source. Forks may be useful as temporary development remotes, but stable source, releases, and packages are published from the canonical repository.

## Windows quick start

Requirements:

- Windows 10 or 11
- Node.js 24+
- the complete Agent Core folder kept intact
- a configured Secure MCP Tunnel when remote ChatGPT access is required

For normal Windows operation, launch Agent Code:

```text
SubProject\Agent-Code\Agent Code Native.exe
```

Agent Code remains a separate desktop shell, but its Agent Core panel is now the native launcher/control surface. Starting Agent Code also starts or safely adopts the Agent Core MCP server and tunnel, preserves identity-checked lifecycle ownership, and supervises the bundle with its native watchdog.

Default local endpoints:

```text
MCP      http://127.0.0.1:8765/mcp
Health   http://127.0.0.1:8765/health
Metrics  http://127.0.0.1:8765/health/metrics
```

Agent Code controls:

```text
Restart:        Agent Code -> Agent Core -> Restart All
OAuth re-auth:  Agent Code -> Agent Core -> Reset OAuth / Re-auth
Autostart:      Agent Code -> Agent Core -> Start with Windows: On/Off
Exit:           Agent Code -> Agent Core -> Exit Agent Core
```

`Exit Agent Core` stops only identity-validated Agent Core and tunnel processes owned by the Agent Code lifecycle. Runtime data, logs, OAuth/key state, capabilities, and secrets remain preserved.

## Presentation Bridge

`SubProject/Presentation-Bridge` is an independently testable PPTX conversion project with one shared UI surface for Electron desktop and hosted browser use.

```bash
cd SubProject/Presentation-Bridge
npm ci
npm run verify
npm run smoke:desktop
```

The v0.2 interface provides one-screen file selection, Google Slides / Keynote / Both targets, progress and cancellation, result cards, compatibility reporting, recent jobs, and setup dialogs. Google Slides live OAuth verification and native Keynote `.key` generation remain environment-dependent acceptance gates; unavailable targets are reported rather than presented as false success.

Agent Core release assets include a credential-free Presentation Bridge source archive:

```text
presentation-bridge-v0.2.0-source.zip
```

The archive contains tracked source and documentation only. It excludes runtime jobs, secrets, generated corpus files, build output, release output, and `node_modules`.

## Tool surface

Agent Core groups its MCP tools by responsibility:

- **Source-grounded workflow** — `craft_source`, `workflow_plan` and `workflow_status` bind source evidence, implementation steps and verification to a continuity task. See [the workflow contract](docs/source-grounded-workflow.md).

- **Identity and status** — runtime identity, readiness, bounded health metrics, workspace roots, and capability stage.
- **Filesystem and search** — bounded read/write/edit/move/info plus recursive filename/content search.
- **Processes** — guarded command execution and owned background-process lifecycle tools.
- **Capability routing** — route, search, dependency inspection, audited skill loading, and registry coverage.
- **GitHub** — repositories, Git, issues, pull requests, releases, GitHub Packages/npm, and bounded REST operations.
- **Memory** — status, search, inspect, commit, revise, forget, explain, and export.
- **Continuity** — checkpoint, status, task inspection, blockers, and actionable frontier.
- **Execution** — create/start/status/wait/log/add/retry/cancel DAG runs, verified artifact lookup, and read-only workflow advice.

Route-bound mutations require a current principal/project routing context. High-risk system, storage, privilege, and escape-path operations are rejected before execution.

## Persistence and security

```text
runtime/data/       OAuth clients, key metadata, process lock
runtime/logs/       operational logs
runtime/memory/     Markdown memory vault, derived graph index, and backups
runtime/execution/  file-native execution state + per-attempt evidence
capabilities/       deferred/audited capability registry
secrets/            operator-managed secrets; never packaged
```

Security boundaries:

- MCP binds to `127.0.0.1` by default.
- Agent Core API keys are stored as salted hashes; raw material is shown only at creation or rotation.
- OAuth state and GitHub credentials remain outside source control.
- Filesystem/process tools are constrained to configured workspace roots.
- Raw execution stdout/stderr remains sensitive operator evidence and is not promoted wholesale into semantic memory.
- Recovery does not infer success from a missing process or PID; durable result evidence is authoritative.
- Deferred third-party capabilities cannot become executable skills until audit gates pass.
- REST/Git and GitHub Packages credentials are separate, read lazily, redacted, and excluded from release assets.

See [`SECURITY.md`](SECURITY.md) for the complete repository security model.

## Repository layout

```text
src/                            Agent Core runtime source
tests/                          behavioral, security, recovery, and performance tests
scripts/                        build, benchmark, release, and lifecycle tooling
plugin/agent-core/              native routing and GitHub skills
SubProject/Presentation-Bridge/ standalone PPTX conversion project
docs/                           canonical architecture and operator documentation
tunnel-client/                  safe tunnel configuration example
SubProject/Agent-Code/          Agent Code desktop shell + native Agent Core controller
```

## Development and verification

```bash
npm ci
npm run verify
```

Complete stable release gate and local packaging:

```bash
npm run verify:release
npm run package:release
```

GitHub Actions is intentionally disabled for this repository. Accepted local verification is authoritative; publication uses authenticated GitHub release tooling and GitHub Packages. A prerelease retains its declared verification limitations and does not imply that the stable release gates passed.

## Releases and packages

A release includes source, runtime, plugin, and package artifacts identified by its manifest. Stable and prerelease runtime ZIP names use the corresponding channel suffix:

```text
agent-core-project-vX.Y.Z-source.zip
agent-core-fresh-vX.Y.Z-<channel>.zip
agent-core-windows-vX.Y.Z-<channel>.zip
agent-core-plugin-vX.Y.Z-<channel>.zip
presentation-bridge-v0.2.0-source.zip
black-project-agent-core-agent-core-plugin-X.Y.Z.tgz
release-manifest.json
SHA256SUMS.txt
```

The ZIP and TGZ files are built from an exact clean source commit. `<channel>` is `stable` or `prerelease`. The full project source ZIP includes active SubProject source; independent native subprojects retain their own build prerequisites and acceptance scope. Upstream submodule references retain their recorded identities rather than being copied as an unreviewed vendor tree. Runtime state, credentials, secrets, local capability caches, generated jobs, and raw evidence are excluded. `SHA256SUMS.txt` provides independently verifiable hashes for every distributable asset and the manifest.

The npm-compatible plugin is published to GitHub Packages as:

```text
@black-project-agent-core/agent-core-plugin
```

Authenticated installation:

```bash
export NODE_AUTH_TOKEN="<GitHub token with read:packages>"
npm install @black-project-agent-core/agent-core-plugin --registry=https://npm.pkg.github.com
```

Do not commit `NODE_AUTH_TOKEN` or a generated `.npmrc`. Stable package publication uses the `stable` dist-tag. Prereleases use `next` and GitHub's prerelease flag, preserving the existing stable channel. To select a prerelease explicitly, install `@black-project-agent-core/agent-core-plugin@next` from the same registry. Neither package selection nor a healthy process replaces the verification scope in the release notes.

**Stable release parity rule:** package publication and GitHub Release assets are one atomic release contract. A version is not complete until the matching `agent-core-fresh-vX.Y.Z-stable.zip`, Windows ZIP, plugin ZIP/TGZ, manifest, and checksums are present on GitHub Release. After publication run `npm run verify:stable-parity`; this gate must pass before reporting the release complete. Never update only GitHub Packages/TGZ while leaving the Stable Release ZIP on an older version.

Release history and behavior changes are recorded in [`CHANGELOG.md`](CHANGELOG.md). Canonical operational documents begin at [`docs/README.md`](docs/README.md); GitHub credential and publication behavior is documented in [`docs/github.md`](docs/github.md).
