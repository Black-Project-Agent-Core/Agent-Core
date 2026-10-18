# Windows Workflows symlink fixture

The desktop launcher calls `scripts/windows/Ensure-Agent-Core-Symlink-Fixture.ps1 -Mode Startup` after Core and Tunnel are available. `Setup-Agent-Core-Symlink-Fixture.cmd` calls the same owner with `-Mode Ensure` for explicit setup. This implements the user's 18 October 2026 request for the previously failing **test fixture**, with the persistent task pattern used by `Restart-Agent-Core.cmd`.

An absent installation uses the existing installer and one same-account UAC elevation when the calling token requires it. An already elevated token needs no redundant prompt. Startup records an attempted setup and does not repeat a failed/cancelled installation on each launch; the explicit CMD can retry. Invalid installations require review and are never overwritten automatically. Registry traces are convenience metadata; protected files, hashes, task definition, SID and ACL checks establish installation identity.

The protected root is `%ProgramData%\AgentCore-SymlinkFixture-<first16-lowercase-SHA256-current-SID>`. Its SYSTEM task is on demand with zero triggers and a single fixed action running the protected worker copy. Ordinary callers receive Read/Execute; only the pre-created regular `request.json` additionally grants WriteData. Its Administrators owner and protected parent prevent user deletion, replacement or permission changes. The client writes a bounded JSON snapshot to this file, then invokes the task without arguments. The worker reads it under an exclusive handle and accepts only fixed operations, GUIDs, matching install identity and a fresh timestamp; never paths or commands. No global symlink privilege, Developer Mode or UAC policy is changed.

`Invoke-Agent-Core-Symlink-Fixture.ps1 -Operation Workflows` validates this exact persistent layout before reuse:

```text
fixtures/workflows/
  root/src/index.ts
  root/src/linked.ts               -> outside/outside.ts (file symlink)
  root/src/linked-dir              -> outside/private    (directory symlink)
  root/SubProject/excluded-fixture -> outside            (directory symlink)
  outside/outside.ts
  outside/private/file.ts
  outside/project-link            -> root               (directory symlink)
```

Only fixed synthetic source bytes are present. Parent directories must be regular, source files protected/read-only, and each link an actual SymbolicLink with its exact expected target. Partial, changed or foreign layouts fail without repair/deletion. A valid existing layout returns `reusedExisting:true`, `runId:null` without Task.Run, a new receipt or elevation. Creation uses one fresh GUID request/receipt; an unknown result is not blindly retried.

The Windows analyzer test invokes only this normal-user client. It never installs/elevates and never deletes the persistent ProgramData fixture. It checks all four links with `lstat`/`realpath`, then runs the original analyzer assertions: one allowed source, no edges, two unresolved imports, symlink limitation, and rejection of a linked project root. Other platforms create ordinary disposable fixtures. Missing setup fails explicitly rather than passing or mocking the guard.

For manual status, the Ensure owner supports `-Mode Preview` (read-only) and `-Mode Status`. Explicit `Invoke... -Operation CleanupWorkflows` validates the entire fixed layout before unlinking and deleting only known files/empty directories; it never recurses. Clean up Memory GUID fixtures with their existing bounded Cleanup operation before requesting installer Uninstall. Updating/removing a protected worker is a separate administrative operation; no-repeat-UAC applies to normal use of the valid installed version.

Windows PowerShell clients restrict their own child-process module discovery to `$PSHOME\Modules`, avoiding incompatible inherited module paths. Registry keys are created only when absent to preserve setup traces. Requests use the shared physical mailbox because the initial SYSTEM worker could not see the user's registry mailbox. Uncaught bootstrap errors after protected-path validation leave at most 16 bounded diagnostic receipts, without retrying the task.

Historical Memory-helper acceptance remains in `docs/memory/ONE-TIME-UAC-SYMLINK-FIXTURE-SETUP-20261017.md`; it does not establish this machine's current Workflows result. Current evidence is recorded in `runtime/build/symlink-autosetup-*`.

## Resident acceptance — 18 October 2026

34 Workflows tests passed, including actual four-link and analyzer assertions; two original Memory symlink tests passed through the helper and cleaned their GUID fixtures. Calls ran from verified Medium Integrity with Administrators disabled. Reuse preserved the task's LastRunTime, receipt count and request hash. Opening the protected worker for writing was denied. Explicit fixed-layout cleanup/recreation also passed without elevation.

Core build and launcher publish passed with 31 frozen files / 78 shared sections intact. The new EXE was installed with a retained backup, then one official restart completed (receipt `runtime/restart/6078fe05d68441009061a9fa4036fd05.json`, exit 0). The actual launcher logged validated fixture reuse at 09:46:11 +07:00; Core health was ok and Memory/Learning available. Version remains 0.15.0-beta.4. Engineering setup required an initial installation and two administrative refreshes while correcting the helper; normal reuse of the final installation required none. This is targeted acceptance, not a claim that every repository test ran.
