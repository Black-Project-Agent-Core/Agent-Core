# Agent Core Dynamic Path Governance

## Status

This is the authoritative implementation policy for path portability in Agent Core.

Current policy state: **live-activated; no active hardcoded-path exceptions**.

Project-wide folder ownership and the generated directory snapshot live together in [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md). `npm run structure:check` compares the map with the actual tree; `npm run structure:sync` updates only its generated block after validating ownership declarations. `path:check` and build include that comparison. The shared filesystem owner admits directory creation/moves before side effects and synchronizes accepted changes for Native, external controllers and Raka. Shell/editor changes remain outside interception and must follow the same declarations and checks. See `src/portability/project-structure.ts` and `scripts/portability/project-structure.mjs`.

Machine-readable exception registry:

`scripts/portability/path-exceptions.json`

Enforcement command:

`npm run path:check`

Human-readable report:

`npm run path:report`

The normal TypeScript build invokes the path-policy check before compilation.

Skill storage ownership is checked by the same command through `scripts/portability/skill-storage-layout.mjs`. Respect the original parent `runtime/skills`: maintained source belongs in its `capability-packs` child, alongside the existing catalog/state roles. Recreating `bundled-skills` or another known parallel home, unregistered roles, malformed artifact/revision locations and storage links fails without path exceptions. Only the maintained source subtree and parent README are included in Git/package inputs; private runtime state remains excluded. The bounded checker reads structure and entrypoint owner metadata; it never moves/deletes artifacts or replaces SkillService validation. See [the ownership map](External-Engineering-Skills.md#storage-ownership) and `AGENTS.md` before creating a directory.

## Objective

Agent Core must remain movable between folders, drives, and machines without treating a drive letter, current working directory, user profile, or previous installation root as product identity.

Every new subsystem, task runner, build helper, provider, downloaded tool, local runtime, cache, state directory, launcher helper, and project-owned configuration path should use a dynamically resolved project root or a path derived from the owning script/module.

## Path classes

### 1. Project-owned

Examples include `runtime`, `dist`, `src`, `scripts`, `assets`, `node_modules`, project-local providers, generated caches, local toolchains, and Agent Core-owned state.

Required behavior:

- Resolve the project root from the running module/launcher location with `resolveModuleProjectRoot(import.meta.url)` or launcher-equivalent root discovery.
- Resolve configurable project-owned paths with `resolvePortableProjectPath(projectRoot, override, defaultRelativePath)`.
- Prefer relative paths, `@project/...`, `<PROJECT_ROOT>/...`, `${AGENT_CORE_PROJECT_ROOT}`, or `%AGENT_CORE_PROJECT_ROOT%`.
- Project-local toolchains should live under a project-owned `runtime` location appropriate to the subsystem, not a fixed drive path.
- Do not use `process.cwd()`, `Environment.CurrentDirectory`, `Get-Location`, `$PWD`, or `%CD%` as ownership authority.

### 2. User-supplied

Absolute file paths supplied by the user remain explicit user intent and are not silently rebased.

Relative user paths handled by Agent Core machine-control resolve from the dynamic Agent Core project root unless a tool explicitly exposes another workspace/root contract.

`~` may resolve to the current user's home because it represents user-path semantics, not Agent Core ownership.

### 3. External integration

External tools and services may live outside Agent Core.

Prefer, in order:

1. explicit environment/config override;
2. dynamic discovery from PATH/system registration;
3. dynamic sibling/project-relative discovery where that relationship is part of the integration contract.

Do not convert a genuinely external path into project-owned state merely to satisfy portability.

### 4. Machine-bound exception

A fixed or machine-bound path is allowed only when the external system cannot provide a dynamic/configurable/discoverable location.

Before considering that integration complete:

- add one entry to `scripts/portability/path-exceptions.json`;
- document the same exception ID in this file;
- state why dynamic resolution is impossible;
- state the owner/subsystem;
- state what breaks after moving machines;
- give the exact relocation/reconfiguration procedure.

The build policy rejects undocumented findings and also rejects stale exception entries after the offending path is removed.

## Exception registry schema

Each exception must contain:

- `id`
- `file`
- `rule`
- `contains`
- `classification`
- `reason`
- `relocationGuidance`

Example shape:

```json
{
  "id": "PATH-EX-001",
  "file": "src/example.ts",
  "rule": "cwd-path-authority",
  "contains": "process.cwd()",
  "classification": "external-machine-bound",
  "reason": "The external product exposes no install-location discovery API.",
  "relocationGuidance": "Set EXAMPLE_HOME to the new installation before starting Agent Core."
}
```

The example is documentation only and is not an active exception.

## Build/task/tool rules

When adding or modifying a build, task, tool, provider, script, or installer:

1. Derive Agent Core root from module/script/launcher location.
2. Put project-owned runtime state beneath that dynamic root.
3. Pass the resolved root explicitly to child processes as `cwd` when their work is project-owned.
4. Never persist the current drive letter as identity.
5. Treat old absolute project-owned defaults as relocation candidates and rebase only when ownership is unambiguous.
6. Preserve explicit unrelated external absolute paths.
7. Run the normal build; path governance runs before TypeScript compilation.
8. If dynamic resolution is impossible, register and document the exception before completion.

## Language-specific patterns

Node/TypeScript:

- preferred root: `resolveModuleProjectRoot(import.meta.url)`
- configurable project path: `resolvePortableProjectPath(...)`
- avoid project ownership from `process.cwd()`

PowerShell:

- derive project location from `$PSScriptRoot`
- use `Join-Path`
- avoid project ownership from `$PWD` or `Get-Location`

Batch/CMD:

- derive from `%~dp0`
- avoid `%CD%` as project identity

.NET launcher:

- derive from executable/AppContext location and validate Agent Core root markers
- do not depend on `Environment.CurrentDirectory`

## Current active exceptions

None.

If this section ever lists an exception, its ID must also exist in `scripts/portability/path-exceptions.json`. The path-policy checker enforces that relationship.

## Relocation checklist

After moving/copying Agent Core:

- preserve the project directory structure;
- start from the copied launcher/project;
- allow canonical root discovery to resolve the new location;
- verify `runtime/portability/root-state.json` names the new root;
- ensure Grafel converges to the new exact root before relocation evidence clears;
- use `npm run path:report` to inspect path-policy state;
- reconfigure only documented external/machine-bound exceptions.

Secrets, OAuth state, user memory, external application installs, and device-specific resources keep their existing ownership contracts and must not be guessed or silently rewritten.
