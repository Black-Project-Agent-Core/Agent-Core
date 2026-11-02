# Node.js and npm: one owner

The Node.js and npm in `runtime/node` are the only ones on this PC. Everything else that resolves `node`, `npm` or `npx` is a duplicate and is removed.

| Item | Location |
| --- | --- |
| Node.js + npm + npx | `runtime/node` (repaired by `scripts/windows/Ensure-Agent-Core-LocalRuntime.ps1`) |
| npm cache | `runtime/npm-cache` (`NPM_CONFIG_CACHE`, user environment) |
| Global packages and their commands | `runtime/npm-prefix` (`NPM_CONFIG_PREFIX`, user environment; on PATH) |
| User npm config (registry token) | `secrets/npm-user.npmrc` (`NPM_CONFIG_USERCONFIG`, never committed) |
| PATH | machine PATH starts with `runtime/node`, then `runtime/npm-prefix` |

Agent Core's own child processes (`AgentCoreRuntime.ApplyOwnedChildEnvironment`) use the same cache and prefix, but keep a private user config (`runtime/npmrc`) and an isolated home.

## Register, check, undo

```powershell
# elevated window: edits the machine PATH (it is read before the user PATH, so a stray machine entry would win)
powershell -ExecutionPolicy Bypass -File scripts\windows\Register-Agent-Core-Npm.ps1 -Action Register
powershell -ExecutionPolicy Bypass -File scripts\windows\Register-Agent-Core-Npm.ps1 -Action Verify
powershell -ExecutionPolicy Bypass -File scripts\windows\Register-Agent-Core-Npm.ps1 -Action Unregister
```

- `Register` sets `NPM_CONFIG_CACHE` and `NPM_CONFIG_PREFIX`, puts the two project folders first in PATH, and removes other Node/npm folders from PATH (`%APPDATA%\npm`, `...\npm-global`, any folder holding `node.exe`/`npm.cmd`/`npx.cmd`, dead `...\node` folders). It resolves the project root from its own location, so run it again after the project folder moves or its drive letter changes.
- `Verify` prints PASS/FAIL: the first `node.exe`/`npm.cmd`/`npx.cmd` on the machine PATH is the project one, no second copy exists, cache and prefix point into `runtime/`, no installed Node.js, no version manager or old npm folder, and winget manages no Node.js package. Exit code 1 on any FAIL. It is the drift detector for every route.
- `Unregister` removes the two environment variables and the two PATH entries. It installs nothing and deletes no folder.
- Open a new terminal, and restart Claude Desktop and Codex, after `Register`: a running process keeps the PATH it started with.

## Guard against a second Node/npm

`~/.claude/hooks/npm-single-owner-guard.cjs` is a Claude Code `PreToolUse` hook (matcher `Bash|PowerShell|mcp__.*__start_process`). It denies commands that:

- install Node.js with `winget`, `choco` or `scoop`, run an MSI/EXE installer, or download one from nodejs.org;
- use a Node version manager (`nvm`, `fnm`, `volta`, `nvs`);
- run `npm install -g npm` or `-g node` (this is how a stray npm copy appeared under `E:\n8n`);
- set the npm prefix or cache outside the project root (`npm config set`, `--cache`, `--prefix -g`, `setx`, `$env:npm_config_*`);
- start a Node/npm launcher from `Program Files\nodejs`, `%APPDATA%\npm` or `E:\n8n`.

Normal `npm install`, `npm run`, `npx`, global installs into the project prefix and `Ensure-Agent-Core-LocalRuntime.ps1` stay allowed.

Limits: the hook covers Claude Code tool calls only. A person running an installer by hand, or another host (Codex, Claude Desktop), is not blocked; `Verify` is what notices that.

## Exception: the isolated OpenClaw install (user decision 2026-11-03)

`F:\Workflow\openclaw` needs Node 24.22.1 or newer (`engines` in its `package.json`), while `runtime/node` is 24.21.0. By the user's explicit decision it gets its own portable Node.js (the official zip, SHA-256 checked) in `F:\Workflow\openclaw-env\node`, used only by that folder's launcher. Everything it writes (npm and pnpm caches, corepack, home, temp, OpenClaw state) stays under `F:\Workflow\openclaw-env` and `F:\Workflow\openclaw`; nothing is added to PATH, the registry, a service or a scheduled task. The guard treats exactly that folder as allowed (`ISOLATED_ZONE` in `npm-single-owner-guard.cjs`); every other location still follows the rules above, and `Verify` is unchanged because the portable Node is not on PATH.

## Risk: the drive letter

Node now lives only on the project drive. If that drive gets another letter (it appeared as `G:` on 2026-10-31) there is no `node` on the machine, and every node-based hook stops. Run `Register` again from the project at its new location, or pin the drive letter in Disk Management.

## Repair

If `runtime/node` is damaged, run `scripts/windows/Ensure-Agent-Core-LocalRuntime.ps1 -ForceRepair`, never a Node.js installer.
