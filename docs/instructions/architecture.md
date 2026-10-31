# Architecture

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Codebase architecture source of truth

`<PROJECT_ROOT>\docs\CODEBASE.md` is the maintained architecture documentation produced from the full Agent Core audit. Every AI/controller operating Agent Core must know that this file exists, what it represents, and that it is the architecture source of truth for the audited system map.

Reading `CODEBASE.md` is **not mandatory before every task**. Do not open it mechanically when the current task already has enough precise context. Read the relevant part when architecture context, module ownership, runtime topology, tool surface, persistence paths, launcher/UI/tunnel behavior, subsystem relationships, or uncertainty makes it useful.

- Do not repeat a full-repository grounding merely to understand Agent Core when `CODEBASE.md` already contains the audited architecture.
- Source code remains authoritative if it conflicts with `CODEBASE.md`. When such a conflict is discovered, correct the affected `CODEBASE.md` section in the same task.
- **Every change to Agent Core, whether small or large, requires an update to the relevant part of `CODEBASE.md` in the same task.** This is an action requirement, not a reminder.
- Treat only items explicitly marked **OPEN** as outstanding work. Completed, closed, superseded, historical, or evidence-only entries are not tasks and must never be resumed implicitly.
- Active documentation must not preserve stale phase plans or ambiguous reminders after the corresponding work is completed.
- Update only the affected architecture/subsystem/file-map/workflow/change-record section when a surgical update is sufficient. Do not rewrite the whole document unnecessarily.
- If a change does not fit an existing section, add the smallest precise documentation needed so `CODEBASE.md` still describes the current implemented state.
- A modification to Agent Core is not documentation-complete until the corresponding `CODEBASE.md` update has been made.
- Never document planned or intended behavior as if it already exists. Record the implemented state only.
- Documentation is not runtime proof. Verification claims still require actual evidence and must respect the user's verification/test authorization rule.
Normal architecture grounding must skip these paths entirely unless the user explicitly instructs otherwise:

- `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT`
- `<PROJECT_ROOT>\.env`
- `<PROJECT_ROOT>\secrets`

These exclusions apply both when reading the codebase and when refreshing `docs\CODEBASE.md`. Do not infer or invent their contents to fill documentation gaps.

