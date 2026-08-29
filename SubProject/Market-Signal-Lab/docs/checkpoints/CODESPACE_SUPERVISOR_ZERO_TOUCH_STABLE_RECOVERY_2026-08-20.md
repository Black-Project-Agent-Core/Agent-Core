# Codespace Supervisor Zero-Touch Stable Recovery Runbook

**Status:** VERIFIED STABLE BASELINE  
**Verified date:** 2026-08-20 (Asia/Jakarta)  
**Repository:** `https://github.com/rendevouz999/Market-Signal-Lab`  
**Workspace:** `/workspaces/Market-Signal-Lab`  
**Branch:** `task/c1-task5-red-20260819`  
**Golden stable commit:** `0cdbb44cd2ed4f8500bb47cd8a42421197fa2e1e`  
**Commit title:** `fix(codespace): harden supervisor autostart lifecycle`  
**GPT Action bridge:** `https://cautious-space-succotash-r7p4gjxw6qj5hpv59-8787.app.github.dev`  
**Bridge port:** `8787`

---

## 1. Purpose

This document is the recovery source of truth for the ChatGPT Codespace Supervisor lifecycle that was proven to recover automatically after a **full GitHub Codespaces Rebuild Container**.

The verified target behavior is:

1. User starts, resumes, or rebuilds the Codespace.
2. The devcontainer lifecycle invokes the supervisor automatically.
3. The bridge starts and verifies local HTTP health.
4. The watchdog starts and continuously repairs local bridge health and public forwarding health.
5. The terminal keepalive starts.
6. Port `8787` is forwarded and repaired back to `public` when needed.
7. GPT Action can call `/health` without the user running `codespace-bridge-start` manually.

This runbook is designed to recover the system if future changes break any part of that behavior.

---

## 2. Verified success evidence

On 2026-08-20 the user performed a **full Rebuild Container** and intentionally did **not** run the bridge manually. GPT Action connected successfully immediately afterward.

Verified runtime state:

```text
bridge_listener_pid=1389
local_health=OK
watchdog_pid=1165
watchdog=RUNNING
terminal_keepalive_pid=1140
terminal_keepalive=RUNNING
lifecycle_last=2026-08-20T06:43:29Z [codespace-supervisor/lifecycle] post-start exit=0
port_visibility=public
public_health=OK
```

The numeric PIDs are ephemeral and will change on future boots. The important acceptance signals are the `OK`, `RUNNING`, `public`, and `exit=0` states.

The active merged devcontainer snapshot was also verified to contain:

```text
postCreateCommand=bash .devcontainer/scripts/post-create.sh
postStartCommand=bash .devcontainer/scripts/post-start.sh
postAttachCommand=bash .devcontainer/scripts/post-start.sh
forwardPorts=[8787]
```

This proves the active Codespace was no longer using the old devcontainer snapshot that previously omitted `postStartCommand`.

---

## 3. Golden baseline

The stable recovery reference is:

```text
0cdbb44cd2ed4f8500bb47cd8a42421197fa2e1e
```

At verification time:

```text
HEAD -> task/c1-task5-red-20260819
origin/task/c1-task5-red-20260819 -> same commit
```

Do not replace the golden commit reference in this document unless a newer configuration has passed the same full rebuild and zero-touch verification procedure.

### Previous lifecycle milestone

An earlier lifecycle/watchdog implementation existed at:

```text
fca57237dc0ff77949df6c3e84eeb0485b2ac097
chore(codespace): add resilient supervisor lifecycle
```

The later golden commit `0cdbb44...` is the preferred restore point because it fixed the devcontainer lifecycle activation problem and added fallback startup behavior.

---

## 4. Stable architecture

```text
GitHub Codespace start / resume / rebuild
        |
        +--> postCreateCommand (fresh/rebuilt container)
        |      |
        |      +--> bootstrap supervisor/runtime
        |      +--> configure native Git auth helper
        |      +--> invoke post-start immediately
        |
        +--> postStartCommand (container start)
        |      |
        |      +--> bridge-start.sh
        |      +--> watchdog-start.sh
        |      +--> keepalive-start.sh
        |
        +--> postAttachCommand (fallback on editor attach)
               |
               +--> same idempotent post-start.sh

watchdog.sh
   |
   +--> localhost /health fails twice
   |      +--> bridge-start.sh self-repairs wedged/dead uvicorn
   |
   +--> port 8787 not public
   |      +--> gh codespace ports visibility 8787:public
   |
   +--> public /health fails while local is healthy
          +--> refresh private -> public forwarding relay

GPT Action
   |
   +--> public port 8787
          +--> supervisor FastAPI/uvicorn
                 +--> /health
                 +--> workspace/action endpoints
```

The bridge uses **HTTP health as the source of truth**, not only PID/socket existence. This matters because a previous uvicorn process remained listening while its event loop was wedged; local `/health` timed out and the public tunnel returned HTTP 504.

---

## 5. Stable source files

The complete supervisor/devcontainer baseline at the golden commit includes:

| Path | Responsibility |
|---|---|
| `.devcontainer/devcontainer.json` | Lifecycle hooks, forwarded ports, devcontainer features |
| `.devcontainer/codespace-supervisor/server.py` | Supervisor FastAPI bridge |
| `.devcontainer/codespace-supervisor/requirements.txt` | Bridge Python dependencies |
| `.devcontainer/scripts/bootstrap-supervisor.sh` | Recreates runtime, token state, helper symlinks |
| `.devcontainer/scripts/bridge-start.sh` | Health-based bridge start/restart and wedged-process repair |
| `.devcontainer/scripts/bridge-status.sh` | Consolidated health/status report |
| `.devcontainer/scripts/configure-native-git-auth.sh` | Codespaces-native Git credential setup |
| `.devcontainer/scripts/keepalive-start.sh` | Idempotent terminal keepalive launcher |
| `.devcontainer/scripts/keepalive-terminal.sh` | Keepalive process |
| `.devcontainer/scripts/post-create.sh` | Fresh/rebuild bootstrap plus immediate supervisor start |
| `.devcontainer/scripts/post-start.sh` | Main idempotent lifecycle start orchestration |
| `.devcontainer/scripts/supervisor-common.sh` | Shared paths, health helpers, Codespaces metadata |
| `.devcontainer/scripts/watchdog-start.sh` | Idempotent watchdog launcher |
| `.devcontainer/scripts/watchdog.sh` | Continuous local/public self-healing |

### Git object integrity manifest at `0cdbb44...`

```text
9ee3899f9f7f72a2e4920e002c3ca40b5d51f2c2 .devcontainer/codespace-supervisor/requirements.txt
a70b4f4efd62cc47ef244c96f5606164f74644a4 .devcontainer/codespace-supervisor/server.py
122624b1eb21ddc84d160235d2e01608f6095a19 .devcontainer/devcontainer.json
9722ca26172eaffccddecc1bb7b269e6d2acdd0f .devcontainer/scripts/bootstrap-supervisor.sh
a55107708ad288354d4a02750dd092789cc83583 .devcontainer/scripts/bridge-start.sh
6d7a284107a431c3dd81f13f65f91c4a9171705a .devcontainer/scripts/bridge-status.sh
44792ae7f5f793f9d956081935dc86b091c5d337 .devcontainer/scripts/configure-native-git-auth.sh
8a769cc1d1a67b1f2dff0acfa3748eecb603905b .devcontainer/scripts/keepalive-start.sh
7f87e7db29c350fdab4f64a4fd29a635e1a9d352 .devcontainer/scripts/keepalive-terminal.sh
0a49e8199b80973cf174fcca34dc76927fadb91c .devcontainer/scripts/post-create.sh
3c8708ed808cceed6c210b778a1f6762d2a70018 .devcontainer/scripts/post-start.sh
a59f8092f901d9a5fd1e4f0e03705489dfacf72f .devcontainer/scripts/supervisor-common.sh
c67e0ebce8b822795e9532841a253b818861f181 .devcontainer/scripts/watchdog-start.sh
989de2cac1c50818b74627b2ba56f449af78a445 .devcontainer/scripts/watchdog.sh
```

These are Git object IDs, not filesystem SHA-256 hashes. They can be checked with `git ls-tree` against the golden commit.

---

## 6. Security assumptions that must remain true

### 6.1 Bridge token

`BRIDGE_TOKEN` must be provided as a **GitHub Codespaces secret**. It must never be hard-coded into the repository, pasted into chat, printed in logs, or stored in backup documentation.

Safe presence check:

```bash
if [ -n "${BRIDGE_TOKEN:-}" ]; then
  echo "BRIDGE_TOKEN_PRESENT"
else
  echo "BRIDGE_TOKEN_MISSING"
fi
```

Do **not** run `echo "$BRIDGE_TOKEN"`.

Bootstrap persists the token only into protected supervisor state:

```text
/home/vscode/.codespace-supervisor/state/bridge.token
```

The file is expected to use restrictive permissions.

### 6.2 Port exposure

Only supervisor port `8787` is intended to become public for GPT Action access.

Port `37700`, when used by `claude-mem`, is intended to remain local/private.

### 6.3 No manual private-key GPG backup

Git/GPG behavior must use GitHub Codespaces-native mechanisms. Do not introduce a manually copied private GPG key into repository files, logs, or this backup.

---

## 7. Normal health check

From the Codespace terminal:

```bash
cd /workspaces/Market-Signal-Lab
codespace-bridge-status
```

Healthy target:

```text
bridge_listener_pid=<some PID>
local_health=OK
watchdog_pid=<some PID>
watchdog=RUNNING
terminal_keepalive_pid=<some PID>
terminal_keepalive=RUNNING
lifecycle_last=<timestamp> [codespace-supervisor/lifecycle] post-start exit=0
port_visibility=public
public_health=OK
```

Direct local health:

```bash
curl --max-time 5 -fsS \
  -H "Authorization: Bearer $(cat /home/vscode/.codespace-supervisor/state/bridge.token)" \
  http://127.0.0.1:8787/health \
  && echo
```

Direct public health:

```bash
curl --max-time 10 -fsS \
  -H "Authorization: Bearer $(cat /home/vscode/.codespace-supervisor/state/bridge.token)" \
  "https://${CODESPACE_NAME}-8787.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/health" \
  && echo
```

Expected result is JSON containing at least `"ok":true`.

---

## 8. Recovery decision tree

Use the least invasive recovery level that fixes the problem.

```text
codespace-bridge-status
       |
       +-- local_health=OK, public_health=OK
       |      -> no recovery needed
       |
       +-- local_health=FAIL
       |      -> Level 1: bridge self-repair
       |
       +-- watchdog/keepalive stopped
       |      -> Level 2: rerun post-start
       |
       +-- helper/runtime missing
       |      -> Level 3: bootstrap + post-start
       |
       +-- local OK, public FAIL/private/504
       |      -> Level 4: forwarding repair
       |
       +-- lifecycle hooks absent from merged devcontainer
       |      -> Level 5: full Rebuild Container
       |
       +-- source/configuration changed and recovery still fails
              -> Level 6: targeted restore from golden commit
```

---

## 9. Level 1 - bridge self-repair

Use when `local_health=FAIL`, listener is missing, or a listener exists but HTTP health is wedged.

```bash
cd /workspaces/Market-Signal-Lab
codespace-bridge-start
codespace-bridge-status
```

`bridge-start.sh` is deliberately health-based. If an unhealthy uvicorn still owns port 8787, it terminates that stale process, starts a fresh bridge, and verifies `/health` before declaring success.

Do not manually kill random Python/uvicorn processes unless this script itself cannot run.

---

## 10. Level 2 - restore watchdog and keepalive

Use when the bridge is healthy but watchdog and/or keepalive is stopped.

Run the same idempotent lifecycle command used by Codespaces:

```bash
cd /workspaces/Market-Signal-Lab
bash .devcontainer/scripts/post-start.sh
codespace-bridge-status
```

This should safely converge the running state without creating duplicate bridge/watchdog/keepalive processes.

---

## 11. Level 3 - runtime/helper bootstrap recovery

Use after a partial rebuild, missing virtualenv, missing helper symlink, or missing supervisor state.

```bash
cd /workspaces/Market-Signal-Lab
bash .devcontainer/scripts/bootstrap-supervisor.sh
bash .devcontainer/scripts/post-start.sh
codespace-bridge-status
```

Bootstrap is expected to recreate:

- `/home/vscode/.codespace-supervisor`
- isolated Python virtualenv
- `server.py` runtime copy
- protected bridge token state from `BRIDGE_TOKEN`
- `/usr/local/bin/codespace-bridge-start`
- `/usr/local/bin/codespace-bridge-status`
- watchdog and keepalive helper links

If bootstrap reports that `BRIDGE_TOKEN` is unavailable, restore the Codespaces secret first. Never paste its value into source code.

---

## 12. Level 4 - forwarding/public relay recovery

### Case A: local health is OK but port visibility is private

```bash
timeout 15s gh codespace ports visibility 8787:public \
  -c "$CODESPACE_NAME"

codespace-bridge-status
```

The watchdog normally repairs this automatically within its public-health cycle.

### Case B: port says public but public `/health` returns 504

First verify local health:

```bash
curl --max-time 5 -fsS \
  -H "Authorization: Bearer $(cat /home/vscode/.codespace-supervisor/state/bridge.token)" \
  http://127.0.0.1:8787/health \
  && echo
```

If local health fails, use **Level 1** (`codespace-bridge-start`).

If local health is OK but public relay remains bad, force the same bounded refresh strategy used by the watchdog:

```bash
timeout 8s gh codespace ports visibility 8787:private \
  -c "$CODESPACE_NAME" || true
sleep 1

timeout 15s gh codespace ports visibility 8787:public \
  -c "$CODESPACE_NAME"
sleep 2

codespace-bridge-status
```

The historical 504 incident was caused by a wedged local uvicorn, so always check local health before assuming the GitHub tunnel is the only failure.

---

## 13. Level 5 - devcontainer lifecycle snapshot recovery

A previous failure occurred because the running Codespace still used an **old merged devcontainer snapshot**. The repository file already contained the new lifecycle, but the active container metadata did not.

Inspect the active merged configuration:

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/workspaces/.codespaces/shared/merged_devcontainer.json')
o = json.loads(p.read_text())
for k in ('postCreateCommand', 'postStartCommand', 'postAttachCommand', 'forwardPorts'):
    print(f'{k}={o.get(k)}')
PY
```

Expected:

```text
postCreateCommand=bash .devcontainer/scripts/post-create.sh
postStartCommand=bash .devcontainer/scripts/post-start.sh
postAttachCommand=bash .devcontainer/scripts/post-start.sh
forwardPorts=[8787]
```

If `postStartCommand` or `postAttachCommand` is missing, **stop trying to repair only the running process**. The container needs to consume the current devcontainer definition.

Perform a **Full Rebuild Container** from the Codespaces UI.

After rebuild:

1. Do not manually run `codespace-bridge-start`.
2. Let lifecycle hooks run.
3. Run `codespace-bridge-status` only as verification.
4. Confirm GPT Action can call `/health`.

---

## 14. Level 6 - targeted source restore from the golden commit

Use this when future edits have broken the supervisor source/configuration and Levels 1-5 do not restore stable behavior.

### 14.1 Protect future work first

**Do not start with `git reset --hard` or `git clean -fd`.** Those commands can destroy unrelated work and untracked files.

Capture the current state:

```bash
cd /workspaces/Market-Signal-Lab

git status --short
git branch "backup/pre-supervisor-recovery-$(date +%Y%m%d-%H%M%S)" HEAD
git diff > "/tmp/pre-supervisor-recovery-$(date +%Y%m%d-%H%M%S).patch"
```

If important uncommitted/untracked project work exists, back it up or commit it on an appropriate work branch before replacing supervisor files.

### 14.2 Fetch the golden object

```bash
git fetch origin
STABLE=0cdbb44cd2ed4f8500bb47cd8a42421197fa2e1e
git cat-file -e "$STABLE^{commit}"
```

### 14.3 Restore only supervisor/devcontainer paths

```bash
git restore --source="$STABLE" -- \
  .devcontainer/devcontainer.json \
  .devcontainer/codespace-supervisor \
  .devcontainer/scripts/bootstrap-supervisor.sh \
  .devcontainer/scripts/bridge-start.sh \
  .devcontainer/scripts/bridge-status.sh \
  .devcontainer/scripts/configure-native-git-auth.sh \
  .devcontainer/scripts/keepalive-start.sh \
  .devcontainer/scripts/keepalive-terminal.sh \
  .devcontainer/scripts/post-create.sh \
  .devcontainer/scripts/post-start.sh \
  .devcontainer/scripts/supervisor-common.sh \
  .devcontainer/scripts/watchdog-start.sh \
  .devcontainer/scripts/watchdog.sh
```

Review before committing:

```bash
git diff --check
git diff -- .devcontainer
git status --short
```

This is intentionally a targeted restore. It does not reset the rest of the Market-Signal-Lab repository.

### 14.4 Commit the recovery

After reviewing the diff:

```bash
git add .devcontainer
git commit -m "fix(codespace): restore verified supervisor baseline"
git push origin HEAD
```

### 14.5 Rebuild and verify zero-touch again

Perform a **Full Rebuild Container**.

Do not manually start the bridge afterward.

Acceptance test:

```bash
codespace-bridge-status
```

Then verify GPT Action `/health` from ChatGPT Builder.

The system is recovered only when all core acceptance signals in Section 17 are satisfied.

---

## 15. Logs and forensic locations

Supervisor state directory:

```text
/home/vscode/.codespace-supervisor/state
```

Useful files:

```text
bridge.log
bridge.pid
bridge.token          # secret - never print/copy into documentation
watchdog.log
watchdog.pid
watchdog.heartbeat
keepalive.log
keepalive.pid
lifecycle.log
```

Useful diagnostics:

```bash
tail -n 100 /home/vscode/.codespace-supervisor/state/lifecycle.log
tail -n 120 /home/vscode/.codespace-supervisor/state/watchdog.log
tail -n 120 /home/vscode/.codespace-supervisor/state/bridge.log
ps -ef | grep -E 'watchdog\.sh|keepalive-terminal|uvicorn.*8787' | grep -v grep
ss -ltnp | grep ':8787'
```

Never include `bridge.token` contents in a bug report or chat transcript.

---

## 16. Change-management procedure for future lifecycle edits

Before changing supervisor lifecycle code:

1. Record the current stable commit.
2. Create a task branch.
3. Do not modify/delete unrelated untracked files.
4. Run shell syntax checks.
5. Run runtime smoke test in the current container.
6. Commit and push only intended supervisor paths.
7. Perform a **Full Rebuild Container**.
8. Do not manually start the bridge after rebuild.
9. Verify automatic bridge, watchdog, keepalive, public visibility, and GPT Action connectivity.
10. Perform at least one subsequent Codespace stop/start/resume test if the lifecycle change affects startup behavior.
11. Only after those tests pass should a new commit replace `0cdbb44...` as the documented golden baseline.

Suggested checks before commit:

```bash
python3 -m json.tool .devcontainer/devcontainer.json >/dev/null
for f in .devcontainer/scripts/*.sh; do bash -n "$f"; done
git diff --check
bash .devcontainer/scripts/post-start.sh
codespace-bridge-status
```

---

## 17. Core acceptance checklist

The supervisor is considered recovered/stable when all of the following are true:

- [ ] Codespace starts or completes full rebuild without a manual bridge command.
- [ ] GPT Action `healthCheck` returns supervisor JSON rather than a GitHub forwarding HTML page.
- [ ] `local_health=OK`.
- [ ] `watchdog=RUNNING`.
- [ ] `terminal_keepalive=RUNNING`.
- [ ] `lifecycle_last=... post-start exit=0`.
- [ ] `port_visibility=public` for port 8787.
- [ ] `public_health=OK`.
- [ ] Active merged devcontainer contains `postCreateCommand`, `postStartCommand`, `postAttachCommand`, and `forwardPorts=[8787]`.
- [ ] `HEAD` and the intended remote branch contain the recovery changes.
- [ ] No unrelated project files were deleted or overwritten during recovery.

---

## 18. Known limitation at this stable point: claude-mem persistence

The **core Codespace supervisor zero-touch path is verified stable**, but one separate tooling issue remains after the full rebuild:

```text
claude-mem=command-not-found
```

The assistant tool registry may still contain an older status describing `claude-mem` as installed/worker-running. Treat that registry entry as stale until `claude-mem` persistence is repaired and verified after rebuild.

Do not use `claude-mem` as a criterion for deciding whether the core bridge lifecycle has recovered.

Once `claude-mem` is repaired and passes rebuild persistence testing, document that in a later checkpoint rather than silently changing the evidence in this stable runbook.

---

## 19. Commands cheat sheet

### Status

```bash
codespace-bridge-status
```

### Repair only bridge

```bash
codespace-bridge-start
```

### Re-run complete running-container lifecycle

```bash
bash /workspaces/Market-Signal-Lab/.devcontainer/scripts/post-start.sh
```

### Rebuild supervisor runtime and helpers

```bash
cd /workspaces/Market-Signal-Lab
bash .devcontainer/scripts/bootstrap-supervisor.sh
bash .devcontainer/scripts/post-start.sh
```

### Force port public

```bash
timeout 15s gh codespace ports visibility 8787:public -c "$CODESPACE_NAME"
```

### Local health

```bash
curl --max-time 5 -fsS \
  -H "Authorization: Bearer $(cat /home/vscode/.codespace-supervisor/state/bridge.token)" \
  http://127.0.0.1:8787/health
```

### Public health

```bash
curl --max-time 10 -fsS \
  -H "Authorization: Bearer $(cat /home/vscode/.codespace-supervisor/state/bridge.token)" \
  "https://${CODESPACE_NAME}-8787.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/health"
```

### Golden baseline

```bash
STABLE=0cdbb44cd2ed4f8500bb47cd8a42421197fa2e1e
git show --stat "$STABLE"
```

---

## 20. Final recovery principle

The most important distinction is:

```text
Process problem       -> repair bridge/watchdog in current container
Forwarding problem    -> repair visibility/public relay
Lifecycle snapshot    -> Full Rebuild Container
Source regression     -> targeted restore from golden commit, then rebuild
```

Always diagnose which layer failed before applying a more destructive recovery step.

**Golden stable reference:** `0cdbb44cd2ed4f8500bb47cd8a42421197fa2e1e`.
