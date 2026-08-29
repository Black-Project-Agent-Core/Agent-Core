# GPT Supervisor Visible Terminal

This integration lets the Custom GPT route validated Codespace commands through a terminal task that is visible in the VS Code/Codespaces terminal list as **GPT Supervisor**.

## Architecture

```text
Custom GPT
  -> GPT Action bridge (authenticated)
  -> /terminal/invocations
  -> private queue under ~/.codespace-supervisor/state/visible-terminal
  -> VS Code automatic task: GPT Supervisor
  -> validated argv execution (shell=false)
  -> live output in the visible terminal
  -> bounded result JSON
  -> GPT polls /terminal/invocations/{id}
```

The queue is outside the repository and is mode-restricted. It is not exposed as a public shell or raw PTY endpoint. The Action bridge validates workspace cwd, executable resolution, and protected-branch policy before queueing an invocation. The terminal runner uses a sanitized environment and does not inherit the bridge token or normal user credential files.

## GPT Action operations

After the Builder Action schema is refreshed from `codespace-windows-tools-gateway-openapi-v1.2.0.yaml`, the GPT can use:

- `getSupervisorTerminalStatus`: verify the visible task is connected;
- `invokeSupervisorTerminal`: queue one validated argv command for visible execution;
- `getSupervisorTerminalInvocation`: poll status, exit code, and bounded output.

Use the visible terminal for commands the user benefits from watching (builds, tests, linters, verification, repository inspection). Continue using normal workspace Actions for deterministic file writes, Git commits, and operations that do not benefit from terminal visibility.

### Compatibility before Builder schema refresh

The already-exposed `runWorkspaceCommand` Action can use the local client without exposing the bridge credential:

```text
python3 .devcontainer/scripts/gpt-supervisor-terminal-client.py status
python3 .devcontainer/scripts/gpt-supervisor-terminal-client.py run --cwd . --timeout 120 -- go test ./...
python3 .devcontainer/scripts/gpt-supervisor-terminal-client.py get <invocation-id>
```

The client reads the protected bridge token internally and never prints it. This compatibility path lets the GPT use the visible terminal even when the current Builder Action schema has not yet been refreshed to show the three dedicated terminal operations.

## Lifecycle

`.vscode/settings.json` already allows automatic tasks. `.vscode/tasks.json` starts `GPT Supervisor` on folder open with an instance limit of one. The runner is `.devcontainer/scripts/gpt-supervisor-terminal.py`.

On the current Codespaces window, a newly added `runOn: folderOpen` task may require one window reload/reopen before the visible terminal is created. After that, it starts automatically for subsequent attaches. This UI activation requirement is separate from the backend bridge runtime.

## Security model

- No arbitrary shell string endpoint is exposed.
- Commands are represented as argv and validated by the existing Codespace supervisor before queueing.
- The runner uses `subprocess.Popen(..., shell=False)`.
- Workspace path restrictions and protected-branch checks remain authoritative.
- Child environment is allowlisted and HOME is isolated under supervisor state.
- Terminal display masks arguments whose names indicate token/password/secret/authorization material.
- Queue and result directories are private supervisor state, not committed project data.

## Availability semantics

A heartbeat younger than the configured stale threshold means the visible terminal task is connected. If `getSupervisorTerminalStatus` reports unavailable, the GPT must not pretend that a command was visible; use normal backend execution or report that the Codespaces window/task needs to be reloaded/started.
