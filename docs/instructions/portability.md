# Portability

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Dynamic path / portability protocol

Agent Core project identity is the project itself, never its current drive letter, parent folder, process working directory, or the machine where it was built.

- Treat `<PROJECT_ROOT>` as dynamic on every task. Never memorize or introduce a literal current root such as a drive-specific `...\Agent-Core` path into active source/config/scripts.
- For Node/TypeScript project-owned paths, use `resolveModuleProjectRoot(import.meta.url)` for module-root discovery and `resolvePortableProjectPath(...)` for configurable project-owned overrides.
- For PowerShell project-owned paths, derive from `$PSScriptRoot`; for Batch/CMD derive from `%~dp0`; for the .NET launcher derive from executable/AppContext location plus validated Agent Core root markers.
- Do not use `process.cwd()`, `Environment.CurrentDirectory`, `Directory.GetCurrentDirectory()`, `$PWD`, `Get-Location`, or `%CD%` as project-owned path authority.
- Project-owned runtimes, caches, downloaded providers/toolchains, generated state, and helper binaries should be placed beneath a dynamically resolved project-owned `runtime` location appropriate to the subsystem unless an existing architecture already defines another project-owned location.
- Child processes doing Agent Core project work should receive the resolved project root (or another explicit dynamic workspace root) as `cwd`; they must not inherit an incidental caller working directory as ownership.
- User-supplied absolute paths and genuine external integration paths remain explicit external intent. Prefer environment/config overrides, PATH/system discovery, or documented dynamic sibling discovery; do not silently rewrite unrelated external paths into Agent Core.
- If a tool/integration genuinely cannot use a dynamic/configurable/discoverable path, register the exception in `scripts\portability\path-exceptions.json` and document the same exception ID plus exact relocation procedure in `docs\PATH-GOVERNANCE.md` before considering the task complete.
- The normal `npm run build`, UI build and launcher build check project path policy before compilation. Run targeted tests and retain authentication, source-drift, checkpoint and authority checks for the changed owners.
- `scripts\windows\Test-Agent-Core-Portability.ps1` also invokes the dynamic path policy when Node is available. The policy is an engineering integrity check, not a permission or workflow router.
- Current policy and exception procedure live in `docs\PATH-GOVERNANCE.md`; executable policy lives in `scripts\portability\check-path-policy.mjs`.

