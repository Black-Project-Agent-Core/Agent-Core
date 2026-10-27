# Tooling and host integration

Read this reference only when performance work requires installing or maintaining a runtime, compiler, SDK, dependency, or optional prompt hook. The main skill remains sufficient for ordinary design, profiling, and optimization work.

## Isolated Tooling & File Ownership

When the selected programming language requires an unavailable runtime, compiler, SDK, or dependency, help the user install the missing requirements within applicable permissions. Prefer self-contained, isolated installations over global installations or system-wide configuration changes.

### Tooling Location & Isolation

Store reusable skill-owned runtimes, compilers, SDKs, and dependencies in a dedicated `tooling` subdirectory within their owning skill folder whenever technically feasible. Keep these environments isolated, reusable, and separate from project artifacts. Project-specific dependencies and environments belong in the designated project workspace. If no relevant skill exists, use a project-local isolated environment instead; do not create or misuse a skill folder solely to store project requirements.

### Script & Artifact Ownership

Determine file placement by ownership and purpose, not by when or during which task a file was created.

- **Skill-owned:** Reusable scripts for downloading, installing, configuring, or preparing a skill's requirements belong in that skill's folder, including scripts created while completing a project task.
- **Project-owned:** Project source code, task-specific scripts, project-only setup scripts, downloaded project assets, build artifacts, and outputs belong exclusively in the designated project workspace.

Never place skill-owned scripts in project folders, or project-owned files and folders inside skill folders. A project workspace must never be nested within a skill folder.

### Installation Permissions & Fallbacks

Avoid global installations and system-wide changes whenever a compatible local alternative exists. If isolation is technically unsupported or incompatible with the requirements, explain the limitation and obtain explicit approval before performing any system-wide installation or configuration change. When installation permissions are unavailable, provide installation instructions instead of proceeding without authorization.

### Consistency & Reusability

Maintain clear ownership boundaries, avoid redundant installations and duplicate setup scripts, and reuse existing compatible tooling whenever possible. Do not relocate existing project files into skill folders or mix project artifacts with reusable skill infrastructure.

## Optional host hook

`scripts/performance_prompt_hook.py` supplies a short relevance reminder for a host's `UserPromptSubmit` event. The AI still decides whether the current brief warrants this skill. The hook does not select techniques, run a model, inspect a repository, store prompts, or change task permissions. Native implicit skill selection and explicit invocation remain usable without the hook. Hook registration and trust are host configuration, separate from these portable instructions.

For installation on another computer, see [INSTALL.md](../INSTALL.md). `scripts/install_skill.py` reuses existing Python and registers the hook with destination paths while preserving other hooks; trust is reviewed on the destination host.
