# GPT Builder → Windows Desktop Commander Gateway

## Purpose

Extend the verified Codespace Supervisor so the Custom GPT can operate one paired Windows machine without Codex, Codex CLI, or another AI agent.

The Custom GPT remains the only reasoning agent:

```text
user brief
  -> Custom GPT reasoning
  -> GPT Action /windows/*
  -> Codespace policy + persistent session state
  -> outbound Windows Relay
  -> Desktop Commander MCP and bounded native execution
  -> result/event
  -> Custom GPT reasoning for the next step
```

The Windows Relay never calls an LLM. It does not expose an inbound Windows management port.

## Current verified deployment — 2026-08-21

The currently accepted Windows workspace is:

```text
F:\Chrome-Isolated\Downloads\Trends&Insights
```

Current live acceptance through GPT Builder:

```text
relayConnected=true
desktopCommanderAvailable=true
paired=true
relayVersion=1.1.1
desktopCommanderVersion=0.2.47
allowedRoots=[F:\Chrome-Isolated\Downloads\Trends&Insights]
filesystemRead=true
filesystemWrite=true
destructiveDelete=false
```

A scoped acceptance session on the F: root passed `listDirectory`, `writeFile`, `readFile`, and `whoami.exe` with auditable `requested -> started -> completed` events. This is the authoritative working root for Windows project/tool work unless the user explicitly changes it.

The Windows relay runtime/state is now workspace-scoped:

```text
F:\Chrome-Isolated\Downloads\Trends&Insights\.codespace-windows-relay
```

The bootstrap temp directory, Desktop Commander private runtime, npm cache, relay source, device identity, and relay credential state are kept under that F: state root for this deployment. The current installer deliberately does not copy a legacy long-term credential from C: during migration; only the stable machine identity may be migrated, and the F: state obtains its own fresh pairing credential.

The server-side Windows gateway pairing/root policy is persisted separately in Codespaces under:

```text
/workspaces/.assistant-tools/state/windows-gateway
```

`bridge-start.sh` always exports this location through `WINDOWS_GATEWAY_STATE_DIR`, so a Full Rebuild may recreate `/home/vscode/.codespace-supervisor` without losing the paired machine/root policy. The non-secret `machine.json` currently records both `configuredAllowedRoots` and advertised `allowedRoots` as the F: root above.

## Security model

- GPT -> Codespace continues to use the existing `BRIDGE_TOKEN`.
- First-time Windows setup uses a short-lived one-time pairing code created by `/windows/pairing`.
- The long-term device token is returned only over HTTPS to the Windows Relay and is never returned to the GPT Action.
- Codespace stores only the device-token SHA-256 hash.
- The first paired Windows root is pinned in Codespace as `configuredAllowedRoots`.
- The relay can narrow that root but cannot expand it.
- File paths are checked in Codespace and checked again on Windows after resolving existing junction/symlink components.
- `runCommand` is server executable-allowlisted and executed by the relay with Node `spawn(..., shell:false)`. Extensionless Windows aliases such as `powershell`, `cargo`, or `npm` are normalized only when the corresponding allowlisted executable (`.exe`/`.cmd`/`.bat`/`.com`) already exists in policy; this does not widen the allowlist.
- Desktop Commander is used through local MCP stdio. The Windows machine does not expose MCP, PowerShell, CMD, or another management listener to the internet.
- Destructive `deletePath` is disabled by default (`WINDOWS_ALLOW_DELETE=0`).
- Codespace pairing/session policy survives Full Rebuild under `/workspaces/.assistant-tools/state/windows-gateway`.
- The current F: relay state survives Codespace container rebuild independently because it lives on the Windows machine under the approved F: root.
- Never print or copy the Windows long-term device credential into chat, documentation, shell history, or repository source.

## Action operations exposed to the GPT

- `windowsStatus`
- `getWindowsCapabilities`
- `createWindowsPairing`
- `createWindowsSession`
- `getWindowsSession`
- `invokeWindowsTool`
- `getWindowsInvocation`
- `getWindowsEvents`
- `completeWindowsSession`
- `cancelWindowsSession`

Internal `/windows/relay/*` routes are deliberately absent from the GPT Action schema.

## Effective logical tools

The relay only advertises tools it can actually provide. Current logical tool set can include:

- `listDirectory` -> Desktop Commander `list_directory`
- `readFile` -> Desktop Commander `read_file`
- `writeFile` -> Desktop Commander `write_file`
- `createDirectory` -> Desktop Commander `create_directory`
- `movePath` -> Desktop Commander `move_file`
- `listProcesses` -> Desktop Commander `list_processes`
- `copyPath` -> bounded native filesystem operation
- `searchFiles` -> bounded native filesystem search
- `runCommand` -> argv-based native process execution (`shell:false`)
- `deletePath` -> native filesystem operation, disabled by default by the Codespace policy

Desktop screenshot/click/type controls are not advertised unless a separately verified backend is added. Do not claim desktop GUI control merely because Desktop Commander is connected.

## GPT Builder operating behavior

For any Windows task:

1. Call `windowsStatus`.
2. Call `getWindowsCapabilities` and treat it as authoritative; do not rely on a historical document for the active root.
3. If the expected deployment root is `F:\Chrome-Isolated\Downloads\Trends&Insights` but capabilities show C:, an empty list, or another root, stop Windows project work and repair the relay/persistent gateway state first.
4. Create one scoped Windows session using the user's brief, success criteria, and the narrowest required root. Once the user has explicitly approved that task scope, reuse the same session for the full execution lifecycle; do not solicit approval again for ordinary non-destructive audit, repair, dependency/toolchain recovery, retry, or verification steps that remain inside the approved scope.
5. Choose exactly one deterministic tool operation at a time. A failed invocation is not automatically a hard blocker: inspect the failure, use an equivalent allowlisted command/tool where possible, repair PATH/environment or required standard dependencies within scope, and retry before stopping.
6. If an invocation returns `202`, poll `getWindowsInvocation` until it is terminal while continuing to surface useful progress to the user.
7. Read `getWindowsEvents` when audit/progress context is useful.
8. Reason in the GPT from the returned result, then choose the next tool. Stop only when the next required operation would cross the session root/scope, require a materially destructive or security-policy-changing action not covered by the user's approval, or when no available capability can perform the required work.
9. When the success criteria are met, call `completeWindowsSession` with a concise result summary.
10. Use `cancelWindowsSession` for cancellation; do not terminate unrelated Windows processes.

Never start Codex, another LLM, or another autonomous reasoning agent as part of this loop.

## Private-repository bootstrap

If the task branch cannot be downloaded from `raw.githubusercontent.com` without GitHub authentication, do not ask the user to expose a GitHub token. Use the temporary pairing-code bootstrap endpoint instead:

```text
POST /windows/bootstrap
{ "code": "<short-lived pairing code>", "allowedRoot": "F:\\Chrome-Isolated\\Downloads\\Trends&Insights" }
```

The endpoint is intentionally excluded from the GPT Action schema. It validates the short-lived pairing code and returns a PowerShell bootstrap payload containing the reviewed installer and relay source. The payload contains no long-term device credential. The actual device token is created only by `/windows/relay/pair` after the bootstrap runs on Windows.

The bootstrap generator now keeps both the temporary bootstrap directory and the relay state under the requested Windows root. For the current deployment it therefore computes:

```text
StateRoot = F:\Chrome-Isolated\Downloads\Trends&Insights\.codespace-windows-relay
TempRoot  = F:\Chrome-Isolated\Downloads\Trends&Insights\.codespace-windows-bootstrap-<random>
```

This is important for roots containing `&`: the installer invokes npm through `node.exe + npm-cli.js` instead of `npm.cmd`, avoiding `cmd.exe` splitting `Trends&Insights` at the ampersand.

## Windows installation

The installer is:

```text
.devcontainer/windows-relay/install-windows-relay.ps1
```

Current behavior:

- verifies Node.js 18+; the F:-scoped bootstrap uses `-RequireExistingNode`, so it does not install Node to the OS drive;
- installs pinned Desktop Commander `0.2.47` into the relay-private runtime under the requested state root;
- runs npm through `node.exe` + `npm-cli.js` so paths containing `&` remain intact;
- installs the reviewed relay source from the bootstrap payload;
- persists `CODESPACE_WINDOWS_STATE_ROOT` and `WINDOWS_ALLOWED_ROOTS` in the launcher;
- supports migration of legacy machine identity (`device.json`) without copying a legacy long-term credential;
- pairs the destination state root with a fresh one-time pairing code when needed;
- attempts a per-user Scheduled Task at logon;
- when Scheduled Task registration is denied and Startup fallback is disabled, removes the legacy Startup fallback and launches the relay directly for the current session using `node.exe`.

### Known persistence gap on the Windows side

On the current Windows machine, Scheduled Task registration returned `Access is denied`. Therefore:

- current-session relay operation on F: is verified;
- Codespace Full Rebuild persistence of the server-side root policy is designed and must be acceptance-tested separately;
- Windows **full reboot/logon autostart is not yet proven** and must not be claimed as stable until a native reboot/logon test passes or a non-C: persistence mechanism is approved.

## Full Rebuild behavior and acceptance

A Codespace Full Rebuild must not require re-pairing merely because `/home/vscode/.codespace-supervisor` was recreated. Required persistence chain:

```text
/workspaces/.assistant-tools/state/windows-gateway/machine.json
        survives Full Rebuild
                |
postCreate/bootstrap recreates /home/vscode runtime
                |
postStart -> bridge-start.sh
                |
WINDOWS_GATEWAY_STATE_DIR=/workspaces/.assistant-tools/state/windows-gateway
                |
WindowsGateway reloads configuredAllowedRoots=F:\...\Trends&Insights
                |
existing F:-scoped Windows Relay reconnects
                |
getWindowsCapabilities returns the same F: root
```

After every lifecycle change affecting the bridge, Windows gateway, or relay contract, the stable acceptance is:

1. Commit and push the candidate branch.
2. Run a **real Full Rebuild** of the Codespace.
3. Do **not** manually start the bridge afterward.
4. Verify `codespace-bridge-status` reports local/public health, watchdog, keepalive, and `windows_root_policy_match=YES`.
5. Verify GPT Builder `healthCheck` succeeds.
6. Verify `windowsStatus.relayConnected=true` and `desktopCommanderAvailable=true`.
7. Verify `getWindowsCapabilities.allowedRoots` is exactly `F:\Chrome-Isolated\Downloads\Trends&Insights`.
8. Create a scoped F: session and repeat a harmless list/read/write smoke test.
9. Record the tested commit as the behavioral golden only after all gates pass.

## Acceptance gate before declaring Windows active

All of these must pass end-to-end on the real Windows machine:

1. `windowsStatus.relayConnected=true`.
2. `windowsStatus.desktopCommanderAvailable=true`.
3. `getWindowsCapabilities` returns the intended pinned root and expected tools.
4. Desktop Commander filesystem read succeeds inside the allowed test folder.
5. Desktop Commander filesystem write succeeds inside the allowed test folder.
6. A harmless PowerShell command succeeds through `runCommand`.
7. A native Windows executable succeeds through `runCommand` (for example `where.exe` or `whoami.exe`).
8. A deliberately out-of-root filesystem request is denied.
9. A long-running command can be cancelled without killing unrelated processes.
10. `getWindowsEvents` contains the corresponding auditable lifecycle events.

Do not claim Windows execution is active before this gate passes.
