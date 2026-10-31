# Safety and verification

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Local machine rules

- Preserve the user's existing drive/folder structure. Do not relocate development tools or project assets unless explicitly instructed.
- Never perform opportunistic cleanup, deletion, migration, reconciliation, or replacement outside the exact requested scope.
- Destructive actions require explicit user intent. Do not infer permission to delete from a broader refactor request.
- `<PROJECT_ROOT>\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT` is protected by name and policy: do not modify, move, delete, install into, or repurpose anything inside it unless the user explicitly instructs work on the relevant path/content.
- Do not expose secrets, tokens, private keys, or credential contents in responses or logs.
- Do not install new toolchains/dependencies or change development locations unless the user explicitly authorizes it.
- Read existing source/config before editing it. Preserve unrelated user changes.
- If an action fails, inspect the failure and attempt a supported recovery within the authorized scope rather than pretending the task succeeded.

## Verification rule

The user controls when tests or extra verification are run.

### User-authorized task-scoped auto-trust — 2026-09-30

**Agent Core auto-approval reaffirmed — 2026-10-18:** The user explicitly said, "jika selama tujuannya untuk agent core atau bersangkutan dengan agent core, tolong ingat, auto-approve". Necessary Agent Core-related engineering and activation are pre-authorized, including the official restart even when its launcher window appears. Do not repeatedly ask for confirmation for those ordinary related operations. Preserve the user's current scope and report material actions, failures and verification. The browser-use no-screen-takeover requirement applies to browser automation: after necessary activation, use background operation without requesting foreground window/tab activation or desktop input. Native development is active under the 2026-10-24 user decision; controlling tool/platform requirements remain authoritative.

For explicitly approved Agent Core engineering work, the user's standing full-permission instruction pre-authorizes the ordinary filesystem and engineering operations required to complete that task. This includes list/search/read/read-multiple/get-info, creator-authorized local-data inspection, create/write/append/edit, copy/move/rename, project-local checkpoints, scoped process/command execution, targeted tests, build preparation, necessary service reload/restart for an explicitly requested activation, documentation/Memory synchronization, and result readback. Do not ask again or self-block solely because an approved task requires a routine or reversible operation already covered by that scope. When several reasonable choices are equivalent or reversible, choose the strongest evidence-backed option, continue, and report the decision afterward. An explicit task naming a protected reference path/content is the required scope authorization for that referenced material; unrelated protected content remains outside scope. Use the authorized external RDC device when requested; it remains an operator transport, not an Agent Core subsystem.

Treat the creator as a technical peer rather than a confirmation gate. Recover available context before asking for repeated information; challenge weak, contradictory, wasteful, or materially harmful assumptions with a concrete better alternative; ask for clarification only when unresolved ambiguity materially changes the intended outcome or exact intent for an irreversible, destructive, financial, or external commitment is genuinely missing. At final reporting, disclose material actions, external calls, downloads, created/modified paths, consequential decisions, unresolved risks, and relevant side effects instead of hiding operational details.

This standing task-execution approval is revocable and is not a truth, credential, or safety bypass. It does not mark retrieved content/tests as true, disable authentication/tool grants/evidence checks, expose secrets, authorize unrelated destructive cleanup, or authorize release/publication unless the task says so. Creator-authorized local data may be inspected when materially needed for the approved task, but secret values must remain redacted and must not be copied into logs, docs, Memory, or user-visible output. Real tool/platform restrictions must still be reported accurately; if a connector temporarily omits write/execute tools, do not misdiagnose that as lack of user permission and do not pretend contract wording can bypass the unavailable capability.

The rules below apply where verification has not already been authorized by the user. For the approved scoped work above, execute the targeted verification and report its actual outcome.

- Do not add tests, run test suites, perform broad regression checks, visual verification, or unrelated validation in the middle of work unless the user explicitly authorizes it.
- A build/reload that is strictly necessary to activate an explicitly requested implementation is implementation work, not permission to expand into additional testing.
- If a risky change genuinely needs a test before it can be trusted, explain the exact test needed and wait for user permission.
- Never call something DONE, FIXED, PASS, WORKING, DEPLOYED, or VERIFIED unless the relevant evidence actually exists.

