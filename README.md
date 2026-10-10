# Agent Core: current product direction

**User-confirmed direction, 2026-09-30:** a cumulative-learning agent whose model can be supplied through an API or local endpoint, while local knowledge and reusable procedures persist across sessions and improve later decisions/actions. System mechanisms and Memory mechanisms are developed together; grounding and steal/use are means to this outcome, not a target tool count.

See [Agent Core Product Direction](docs/Agent-Core-Product-Direction.md) for the confirmed goal, adoption rationale, and proposed target-to-implementation grounding. [CODEBASE](docs/CODEBASE.md) remains the implemented-state map; [Target-Feture](docs/Target-Feture.md) is preserved conversation evidence. The current MCP body is a foundation, not by itself proof that the complete native model/learning loop exists or improves outcomes.

**Phase order confirmed by the user:** mature the body/system and local Memory/reuse mechanisms first; begin the native model/API-key runtime only after the later maturity review and user decision. The existing external MCP controller can exercise the body now. MRR-1/MRR-2/MRR-3 are resident verified. [MRR-3 Knowledge Use Receipt](docs/MRR-3-Knowledge-Use-Receipt-Plan.md) binds exact retrieval body identity to controller-submitted applied/adapted/rejected receipts and bounded outcome evidence while canonical Memory/ranking/Skills/execution remain unchanged. MRR-3.1 authority mapping confirmed local source/dist/generated manifest expose `learning(action="receipt")`, while the external ChatGPT connector descriptor remains stale; no local duplicate tool/shim is justified. MRR-4 then verified genuine cross-session procedural reuse, and MRR-4.1 observed a bounded advantage on a harder matched fixture: equal correctness with problem-solving calls reduced 11→9, while elapsed time did not improve. MRR-5 exposed the remaining capture-side gap: two ordinary fresh-controller verified repairs completed without any new Learning checkpoint/review/capture. The correction is now implemented and source/build/compiled qualified: meaningful-task Learning finalization is promoted to the top-level Agent Core controller contract, and bounded safe pending-review evidence persists in the existing Learning state until semantic review. Targeted/touched tests are 51/51 PASS, build/path policy PASS, compatibility remains 70→70/non-breaking. First-correction resident activation/readback is verified. A subsequent truly fresh ordinary controller naturally captured a verified operational-reflection Memory, but skipped mandatory Learning checkpoint/review because Reflexion still offered direct Memory promotion as an alternative path. A second correction unified that contract and added a non-gating finalization advisory to verified-recovery `memory_remember` responses; focused tests/build/compatibility/Grafel qualification and resident readback passed. The final fresh ordinary dependency-order repair still skipped Learning finalization and produced no new reusable Memory, so MRR-5 is closed as boundary evidence: external-controller compliance is not deterministic. Pre-runtime body/Memory scope is closed. Native Agent Runtime Phase 1 backend foundation is now implemented and resident-activated: OpenAI-compatible provider configuration, persistent task/session/finalization state, Memory-first context assembly, scoped reuse of the existing MCP tool surface, and a synthetic mandatory finalization function that prevents plain assistant text from completing a native task. Verified terminal outcomes require safe evidence references; terminal outcome is preserved separately from lifecycle status; and Learning-finalization failure cannot return the model completion as a successful user-facing result. Targeted/integration native-runtime verification is now **23/23 PASS across six files**, including a real loopback OpenAI-compatible HTTP protocol run through actual Memory/Learning services and an existing MCP tool before mandatory finalization. Build/path policy is **284/0**, compatibility remains **70→70/non-breaking**, Grafel is current/accepted at **10,139/55,161**, and after relocation to `F:\Projects\Agent-Core` resident PID **10712** started after the latest build while `/health` truthfully reports `agentRuntime.status=not-configured` because no real API/local model endpoint is configured. The provider protocol path is verified; real model/provider acceptance remains pending. See `docs/Pre-Runtime-Body-Memory-Learning-Closure-20260930.md` and `docs/Native-Agent-Runtime-Phase-1-Plan.md`. Task-scoped auto-trust still covers routine approved filesystem/engineering operations without bypassing authentication, evidence checks, unrelated destructive scope, or unavailable platform capabilities.

## Historical README snapshot — legacy/reference only

The material below retains an older v0.12.0/62-tool/Hermes snapshot and legacy GitHub recovery assumptions. It is not current runtime, installation, release or recovery authority. Current local source, the operating contract and dated CODEBASE corrections supersede it; do not restore or publish the current line from the legacy GitHub repository implicitly.

<p align="center">
  <img src="assets/agent-core.png" width="96" alt="Agent Core logo">
</p>

<h1 align="center">Agent Core</h1>

<p align="center">
  Local-first authenticated MCP control plane for Windows with machine control, durable semantic memory, code intelligence, Semantic IDE/LSP, learning, Game Mode, and Hermes partner workflows.
</p>

<p align="center">
  <strong>Stable: v0.12.0</strong> · <strong>62 MCP tools</strong> · <strong>Windows-first</strong> · <strong>Private recovery mirror</strong>
</p>

## What Agent Core is

Agent Core is the machine-side control layer for a connected AI/controller. It exposes a local authenticated MCP surface, keeps execution and memory local by default, and integrates optional sibling capabilities without turning them into execution gates.

The current line is intentionally source-first: the local project is authoritative, while this GitHub repository is maintained as a recovery mirror. Live credentials, private runtime state, browser profiles, forensic backups, and protected research/reference trees are excluded from Git.

## Current capability surface

| Capability | Public tools | Purpose |
| --- | ---: | --- |
| Machine control | 26 | Filesystem, process, terminal, search, edit, config, and local desktop-adjacent operations |
| Memory | 11 | Durable file-native memory, semantic retrieval, evolution preview, consolidation, provenance, and revisions |
| Game Mode | 14 | Android/phone control through Agent Core-managed transports |
| Code Intelligence | 7 | Grafel-backed orientation, graph, surface, analysis, patterns, workspace, and repair |
| Semantic IDE | 2 | LSP-backed symbol/refactor workflows with multi-root/provider support |
| Learning | 1 | Controller-reviewed durable learning checkpoints and sinks |
| Hermes Partner | 1 | Optional A2A collaboration through Hermes' authenticated Runs API |

Total public MCP surface: **62 tools**.

## Architecture at a glance

```text
AI / MCP client
      |
      v
Agent Core :8765
  |-- machine control (src/rdc)
  |-- MemoryService
  |-- Game Mode / phone
  |-- Grafel Code Intelligence
  |-- Semantic IDE / LSP
  |-- Learning
  |-- Hermes Partner
  |
  +-- optional authenticated tunnel for remote ChatGPT access
```

Subsystems are siblings. Memory, Code Intelligence, Learning, Semantic IDE, Game Mode, and Hermes Partner do not become hidden routing or authorization gates for normal machine-control operations.

## Install / recovery

### Recommended: stable Windows release

1. Open the [latest GitHub release](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/latest).
2. Download `Agent-Core-v0.12.0.zip`.
3. Verify the SHA-256 published with the release.
4. Extract the archive to the desired project directory.
5. Configure local secrets/runtime state locally; never commit them.
6. Start Agent Core with the packaged launcher/runtime.

The stable package intentionally excludes live `.env`, secrets, OAuth/API-key state, user memory notes, tracker logs, browser profiles, backups, Git metadata, and protected reference repositories.

> **v0.12.0 recovery note:** the immutable v0.12.0 ZIP was created before discovery that its bundled `.env.example` had been overwritten by filesystem corruption. Use the release asset `Agent-Core-v0.12.0-env.example` instead. The `main` branch contains the corrected source-grounded template.

### Portable recovery bootstrap and self-healing

Current `main` includes `scripts/windows/Recover-Agent-Core.ps1`. Future stable packages carry `INTEGRITY-MANIFEST.json`, a deterministic per-file SHA-256 manifest for immutable package files. Mutable/private state is deliberately excluded from integrity enforcement.

For a **new machine**, download the recovery script from this private repository, authenticate `gh`, then bootstrap into an empty directory:

```powershell
gh auth login
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Recover-Agent-Core.ps1 `
  -Mode Bootstrap -Destination D:\Agent-Core
```

Bootstrap resolves the latest release, downloads the ZIP plus `SHA256SUMS.txt`, verifies the archive SHA-256 before extraction, applies a corrective env-example asset when the release provides one, installs only into an empty destination, and runs project-local Node runtime health/self-repair.

For an existing **packaged** installation:

```powershell
npm run recovery:audit
npm run recovery:repair
```

`recovery:audit` checks immutable files against `INTEGRITY-MANIFEST.json`. `recovery:repair` downloads the same-version trusted release, verifies its ZIP checksum, backs up each damaged file under `runtime\recovery\backups`, replaces only missing/mismatched immutable files, preserves unknown files, and audits again after repair.

Offline repair/bootstrap can use `-SourceZip` with `-ChecksumFile` or `-ExpectedZipSha256`. Live `.env`, secrets, auth/OAuth data, user memory, tunnel credentials, browser profiles, subsystem state, and forensic backups are never governed or overwritten by automatic integrity repair.

The immutable v0.12.0 archive predates the packaged per-file manifest. The new bootstrap can still trust that release by verifying its archive SHA-256 and deriving a local manifest after extraction; later packages will ship the manifest directly.

### Build the core from source

Requirements:

- Windows
- Node.js **>= 24.15.0**
- npm
- .NET SDK only when rebuilding the native launcher

```powershell
Copy-Item .env.example .env
npm ci
npm run build
npm start
```

For the web UI:

```powershell
Set-Location src\ui
npm ci
npm run build
```

Do not copy credentials from another machine blindly. Recreate machine-local authentication/runtime state as appropriate.

## MCP and authentication

The local listener is loopback-bound by default at `127.0.0.1:8765`. The MCP endpoint requires a valid Agent Core API key or OAuth access token.
Remote ChatGPT access uses the authenticated tunnel path rather than exposing the local listener directly.

See [SECURITY.md](SECURITY.md) for the security boundary and credential-handling rules.

## Repository / recovery policy

This repository's `main` branch is a **recovery mirror of the current local Agent Core source line**. It is not a source that should be merged into a newer local tree merely because the histories differ.

The Git mirror intentionally excludes:

- `.env` and credential backups
- `secrets/`
- private runtime memory/auth/tracker/browser state
- `runtime/backups/` and forensic corruption artifacts
- protected `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/` reference trees
- browser/RDC profiles and caches
- generated `bin/`, `obj/`, temporary build outputs, and large packaged binaries

Large stable binaries are stored as GitHub Release assets instead of normal Git objects.

## Documentation

- [Architecture source of truth](docs/CODEBASE.md)
- [Security policy](SECURITY.md)
- [Maintenance notes](Maintenance.md)
- [Changelog](CHANGELOG.md)
- [Release artifacts](release/README.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)

## Development and verification

Common commands:

```powershell
npm run build
npm test
npm run release:plan
npm run release:compat
```

Tests and broader verification are run deliberately according to the task scope; the presence of a test command does not make every test suite an automatic execution gate.

## License

No public open-source license is declared for this private repository. Do not assume redistribution rights from source visibility alone.

## Current source handoff — 2026-10-11

The local source/version is now **0.15.0-beta.1** with the scoped Memory02–05 changes integrated on top of the current Workflows/Memory01 installation. This is **source and staged build only**: the installed Agent Core launcher and connected Node Core remain 0.15.0-beta.0. No new release, deployment, provider switch, Memory migration or embedding was performed. See `docs/Memory02-05-Permanent-Integration-Execution-20261011.md` and `docs/releases/0.15.0-beta.1.md` for the distinct activation and provider/data/volume/cost gates.

## Beta.1 live installation correction — 2026-10-11

The earlier staged-source-only note is historical. This installation now runs **Agent Core 0.15.0-beta.1** from the original `E:/Projects/Agent-Core` launcher and Core with 51/51 installed artifact hashes verified. Memory02, host-bound external Memory03, real Memory04 v3 embedding index (130/130), and Workflows Windows UI have scoped live smoke evidence; Memory05 retains the accepted offline scripted evidence without any model-benefit assertion. Two earlier independent cutovers rolled back safely due to checking the legacy instead of experience-v2 index; the corrected helper completed the final installation without rollback. Consult `docs/Memory02-05-Permanent-Integration-Execution-20261011.md` for exact hashes, evidence, and pending approval for deletion of three historical temp workspaces. No new release/publish was run.
