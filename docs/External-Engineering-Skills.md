# Engineering Skills for external controllers

Agent Core uses the existing `SkillService` catalog. The user-approved artifacts are `performance-oriented-software-engineering` and `reverse-engineer-anything`; versioned portable seeds live in `bundled-skills`, and active revisions live in `runtime/skills/catalog`. Release packaging imports only these two seeds through the same owner. Personal runtimes, unrelated Skills and operational catalog history are not copied.

## Instruction hooks

The external contract requires a relevance check on each task. After contract acknowledgement, the existing controller bootstrap reports installation status and an exact `skills(action=read, name, expectedActiveDigest, maxBytes)` request. Task context refreshes the guidance from the current catalog. Follow every returned `nextOffset` until null before applying the instructions; re-inspect on revision drift. Read relevant references with existing file tools under the selected catalog directory.

For software where scale, latency, throughput, CPU/I/O or memory affects design, read and apply the performance Skill before choosing an implementation. Keep ordinary trivial edits proportionate. For a selected shipped artifact, use the REA target route and bounded evidence. Ordinary source maintenance does not require reverse engineering.

These are Agent Core external instruction hooks. The bundled Python `UserPromptSubmit` helper is an optional Codex-host adapter and is not executed by Agent Core. The hooks do not run scripts/models, grant execution permissions, change Native behavior, or prove that a controller complied. Missing or unreadable artifacts remain explicitly unavailable.

## REA runtime

The adapted launcher first uses a local pinned runtime, then existing personal Skill locations under `CODEX_HOME/skills`, `~/.codex/skills` or `~/.agents/skills`. A custom `AGENT_CORE_REA_SKILL_ROOT` selects one owning Skill folder; an explicit missing or mismatched installation fails closed. Both dependency manifest and installed package must identify `rea-agents@6.5.0`.

From the task workspace, verify an established or repaired integration with:

```powershell
& '<PROJECT_ROOT>/runtime/node/node.exe' '<PROJECT_ROOT>/runtime/skills/catalog/reverse-engineer-anything/scripts/rea.mjs' --version
```

On a new computer with no matching runtime, restore the included Skill's `tooling/rea/package-lock.json` using an existing compatible npm:

```powershell
npm ci --prefix '<PROJECT_ROOT>/runtime/skills/catalog/reverse-engineer-anything/tooling/rea' --ignore-scripts --no-audit --no-fund
```

This is explicit dependency restoration. No automatic download, global installation, MCP registration or provider installation occurs. Native pseudocode still requires a compatible analysis provider; the REA guide describes target-specific prerequisites and observed platform limits.

Agent Core's `artifact_inspect` remains a separate bounded static JS/ASAR/managed-metadata owner with its existing task and operator permits. It rechecks the exact external task and final lease before delivery, reports returned/dropped findings, and marks clipped output partial. `reconstruction_harness` checks proof obligations; neither tool becomes a general decompiler through Skill installation.
