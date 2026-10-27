---
name: reverse-engineer-anything
description: Investigate shipped applications, Electron/JavaScript bundles, executables, managed assemblies, archives, and recorded behavior with REA. Use for reverse engineering, decompilation, tracing packaged features, comparing app versions, or evidence-based reconstruction. Skip ordinary source-repository analysis and unrelated coding tasks.
metadata:
  upstream_skill_version: "42"
  runtime_version: "6.5.0"
---

# REA: Reverse Engineer Anything

Understand a shipped feature from its actual artifact and evidence, then
explain it or guide a tested implementation. Distinguish observations,
derivations, hypotheses, and unknowns. Decompiled or reconstructed code is not
automatically the original source.

## Triggers

- Reverse engineering, decompilation, tracing, comparison, or evidence-based reconstruction of shipped applications, Electron or JavaScript bundles, executables, managed assemblies, archives, databases, firmware, or recorded runtime behavior.

## Non-triggers

- Ordinary source-repository analysis, unrelated coding tasks, or work where the authoritative source and normal build-time tooling already answer the question.

## Use the installed runtime

Use an existing connected REA MCP server when appropriate. Otherwise this
skill's isolated CLI works without MCP registration or a host restart:

```text
node "<skill-folder>/scripts/rea.mjs" <command> ... --format json
```

Resolve `<skill-folder>` to the directory containing this `SKILL.md`. Invoke
the launcher by absolute path from the project workspace. It uses the current
Node executable and forwards arguments, stdin, output, and working directory.
Replace bare `rea` commands in the guides with this prefix when necessary.
Prefer this pinned runtime over repeated `npx` downloads.

When this skill is imported into Agent Core's catalog, `node_modules` is
intentionally excluded. Its launcher reuses the original pinned runtime in
the current user's `.codex/skills` or `.agents/skills` location. For a custom
location, set `AGENT_CORE_REA_SKILL_ROOT` to the owning skill folder. An explicit
missing or mismatched runtime fails closed; importing instructions is not
runtime installation. Use `--version` once to verify the selected runtime
when establishing or repairing this integration. No automatic download,
provider installation or MCP registration occurs.

Agent Core deliberately gives execution processes an isolated HOME. Its local
installation may therefore record an explicit runtime link at
`runtime/skills/tooling/reverse-engineer-anything.json`, outside the catalog.
The catalog launcher honors that validated, host-local link; it is not shipped
in release packages or copied into Skill artifacts. No user-profile scan or
change to the execution environment's isolation is required.

Use command-specific `--help` or `--schema` and the connected MCP's actual tool
schemas. MCP names generally use underscores; CLI names use hyphens. Independent
CLI invocations do not preserve an active native target or retained Evidence
session: select an advertised one-shot CLI workflow or keep one MCP connection.
Diagnose only relevant observed blockers; do not run doctor/setup before each
investigation. See [source-and-runtime.md](references/source-and-runtime.md)
for provenance, restoration and platform requirements.

## Route the selected target

Use the user's selected artifact, app, version or endpoint. Resolve an app name
to one clear installed artifact when possible; ask when ambiguous. Unrelated
reports and test fixtures never select the user's target.

| Target | Starting route |
| --- | --- |
| JavaScript/Electron tree or ASAR | `analyze-javascript-application PATH`; use exact `--source-path` selections when sufficient. |
| Package/archive inventory | MCP `open_binary`, then `inspect_artifact`; inspect contained code separately. |
| .NET assembly | `inspect-managed-artifact PATH`, then selected types/members without loading the assembly. |
| Native executable/library | An available native provider; MCP `open_binary`, then focused functions, strings, references or pseudocode. |
| PE resources or Go/Rust metadata | `inspect-pe-resources`, `inspect-go-binary`, or `inspect-rust-binary` with the explicit file. |
| SQLite snapshot | `inspect-sqlite-database PATH`; schema before selected rows; preserve DB/WAL identity. |
| Android, WASM, firmware or EVM | Target-specific route and prerequisites in the detailed guides. |
| Browser/Electron runtime or saved capture | The matching observation/capture route; requested actions and platform support remain required. |

Read only the guide relevant to the question:

- Detailed target routing and less common operations:
  [upstream-workflow.md](references/upstream-workflow.md).
- JavaScript/Electron graphs, IPC, source maps, tracing and comparisons:
  [javascript-applications.md](references/javascript-applications.md).
- Native, managed, archives and extraction:
  [native-and-artifacts.md](references/native-and-artifacts.md).
- Android declarations and static methods:
  [android-applications.md](references/android-applications.md).
- Browser/Electron observations:
  [runtime-observation.md](references/runtime-observation.md).
- Evidence views, comparisons and reconstruction verification:
  [evidence-workflows.md](references/evidence-workflows.md).
- Observed registration, approval or provider failures:
  [connection-and-recovery.md](references/connection-and-recovery.md).

The retained upstream guides match the installed release. CLI use requires no
MCP registration. Use a scoped setup plan only when an MCP integration is
actually needed and authorized; it may replace the bundled skill.

## Investigate with bounded evidence

Break broad requests into specific questions and track their sources and gaps.
Start with the smallest sufficient inventory/source selection. Preserve target
identity, digests, locations, Evidence IDs, limitations and coverage. Trace a
feature from its entry point through relevant code, IPC or state to its result.
Filenames and matching strings alone do not prove behavior.

Save large CLI JSON results in the project workspace, then use a focused
`inspect-analysis-view` over that saved record. This release's JavaScript CLI
returns complete Evidence; do not invent a `--detail summary` flag absent from
its help. A supported MCP summary reduces delivery, not necessarily analysis.
Reuse completed analysis instead of repeating it after a truncated preview.
Use returned node IDs and same-session Evidence IDs for subsequent views.

Static evidence does not demonstrate execution. Runtime workflows may launch
or interact with the target: preserve the requested target/actions and host
access boundaries. Offline recordings do not authorize live capture or fetching
recorded URLs. Inspection does not authorize patching, injection, or closing a
user's running app or attached analysis database.

Explain findings with Evidence IDs and concise supporting facts. Mark original
questions answered, partial or unresolved; keep negative searches bounded.
When building a similar feature, separate observed behavior from design choices,
use normal coding tools in the project, and test the implementation. Export
needed Evidence before closing owned sessions. Close native sessions opened
for the task without closing an attached user's GUI database.

## Keep ownership and tooling clear

Reuse compatible runtimes/providers. Reusable skill requirements and setup
helpers belong in this skill's `tooling` and `scripts` folders. Targets,
recovered source, extracted assets, evidence, comparisons, generated code and
task-specific scripts belong in the designated project workspace. Never nest
a workspace in this skill folder or relocate existing project files into it.
Avoid redundant environments and duplicate setup scripts.

Prefer local isolated installation when requirements are missing. REA setup
does not install unrelated runtimes/providers. If a system-wide change is
technically necessary, explain it and obtain explicit approval; if installation
permission is unavailable, provide instructions.
