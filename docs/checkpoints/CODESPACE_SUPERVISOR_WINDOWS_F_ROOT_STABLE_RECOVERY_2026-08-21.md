# Codespace Supervisor + Windows F: Root Stable Recovery Runbook

**Status:** FULL-REBUILD CANDIDATE — promote only after real zero-touch Full Rebuild acceptance  
**Date:** 2026-08-21 (Asia/Jakarta)  
**Repository:** `https://github.com/rendevouz999/Market-Signal-Lab`  
**Codespace workspace:** `/workspaces/Market-Signal-Lab`  
**Candidate branch:** `task/windows-relay-ampersand-path-fix-20260821`  
**Behavioral golden:** `PENDING_FULL_REBUILD_ACCEPTANCE`  
**Current public hostname:** derive dynamically from `/workspaces/.codespaces/shared/.env`; never treat a copied hostname as permanent  
**Only intended public Codespaces port:** `8787`

---

## 1. Purpose

This is the current recovery source of truth for the combined GPT Builder → Codespace Supervisor → Windows Relay path after migration of the Windows working root from the legacy C: workspace to:

```text
F:\Chrome-Isolated\Downloads\Trends&Insights
```

This document exists so a future GPT session can recover the currently verified architecture after repeated failed changes **without destructive repository cleanup and without guessing which layer is broken**.

The required recovery principle is:

```text
observe current health
        ↓
identify failed layer
        ↓
repair only that layer
        ↓
re-run acceptance
        ↓
if repeated future changes still fail
        ↓
restore only supervisor/Windows-gateway paths from this documented golden
        ↓
Full Rebuild again
```

Never begin recovery with `git reset --hard` or `git clean -fd`.

---

## 2. Current accepted Windows deployment before Full Rebuild promotion

GPT Builder currently has live access to Windows with:

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

A scoped acceptance session on F: passed:

- `listDirectory`
- `writeFile`
- `readFile`
- `whoami.exe`
- auditable `requested -> started -> completed` events

Current Windows Relay state root:

```text
F:\Chrome-Isolated\Downloads\Trends&Insights\.codespace-windows-relay
```

Current Codespace Windows-gateway persistent state:

```text
/workspaces/.assistant-tools/state/windows-gateway
```

The current `machine.json` non-secret policy metadata records:

```text
configuredAllowedRoots=[F:\Chrome-Isolated\Downloads\Trends&Insights]
allowedRoots=[F:\Chrome-Isolated\Downloads\Trends&Insights]
```

These two lists must continue to match after Full Rebuild.

---

## 3. Why this should survive a Codespace Full Rebuild

The design deliberately separates ephemeral container state from persistent state.

### Ephemeral and recreated automatically

```text
/home/vscode/.codespace-supervisor
/usr/local/bin/codespace-bridge-*
/usr/local/bin/codespace-keepalive*
```

`postCreateCommand` / `postStartCommand` recreate these from repository source and Codespaces secrets.

### Persistent across Full Rebuild

```text
/workspaces/Market-Signal-Lab
/workspaces/.assistant-tools
/workspaces/.assistant-tools/state/windows-gateway
```

`bridge-start.sh` always launches the supervisor with:

```text
WINDOWS_GATEWAY_STATE_DIR=/workspaces/.assistant-tools/state/windows-gateway
```

Therefore a new `/home/vscode/.codespace-supervisor` runtime should reload the same Windows machine/root policy instead of silently falling back to a legacy C: root.

The Windows-side state is independent of the Codespace container and remains on F::

```text
F:\Chrome-Isolated\Downloads\Trends&Insights\.codespace-windows-relay
```

---

## 4. Windows migration fixes already in the branch history

### Ampersand-safe npm invocation

Commit:

```text
b754ad22a7cfea8bf83e84b2be92938d4fec4847
```

Purpose:

- `Trends&Insights` previously broke because `npm.cmd` was interpreted through `cmd.exe` and split at `&`.
- Installer now invokes npm through `node.exe + npm-cli.js` directly.
- Desktop Commander can therefore be installed under the requested F: root without path truncation.

### Workspace-scoped Windows Relay state

Commit:

```text
825752f801a35f3d20c311f84d54a630f393d596
```

Purpose:

- `windows-relay.mjs` now honors `CODESPACE_WINDOWS_STATE_ROOT`.
- Installer persists the requested F: state root.
- Only legacy `device.json` machine identity may be migrated from old state.
- Legacy long-term credentials are not copied into the new F: state.
- Startup-folder fallback is removed when disabled.
- Relay is started directly with `node.exe` when Scheduled Task registration is unavailable.

### Current known Windows-side persistence gap

Scheduled Task registration on the current Windows machine returned:

```text
Access is denied.
```

Therefore current-session operation is verified, but **full Windows reboot/logon autostart is not yet proven**. This is separate from Codespace Full Rebuild persistence and must not be conflated with it.

---

## 5. Codespace zero-touch lifecycle that must remain intact

`.devcontainer/devcontainer.json` must continue to contain:

```text
postCreateCommand=bash .devcontainer/scripts/post-create.sh
postStartCommand=bash .devcontainer/scripts/post-start.sh
postAttachCommand=bash .devcontainer/scripts/post-start.sh
forwardPorts=[8787]
portsAttributes.8787.onAutoForward=silent
portsAttributes.37700.onAutoForward=ignore
```

Normal lifecycle:

```text
Codespace create / resume / Full Rebuild
        |
        +--> postCreateCommand
        |      +--> bootstrap supervisor
        |      +--> install/check assistant tools
        |      +--> install/check cognitive tools
        |      +--> configure native Git auth
        |      +--> post-start
        |
        +--> postStartCommand
        |      +--> repair ephemeral runtime if needed
        |      +--> bridge-start
        |      +--> watchdog-start
        |      +--> keepalive-start
        |
        +--> postAttachCommand
               +--> idempotent post-start fallback
```

The watchdog must use HTTP health, not PID/socket existence, as source of truth.

---

## 6. New non-secret Windows persistence diagnostics

`codespace-bridge-status` now reports Windows root-policy persistence without printing credentials.

Expected stable lines:

```text
windows_gateway_state_dir=/workspaces/.assistant-tools/state/windows-gateway
windows_gateway_state=PRESENT
windows_configured_roots=F:\Chrome-Isolated\Downloads\Trends&Insights
windows_advertised_roots=F:\Chrome-Isolated\Downloads\Trends&Insights
windows_root_policy_match=YES
```

Interpretation:

- `PRESENT + match=YES`: persistent server-side root policy survived.
- `PRESENT + match=NO`: relay and pinned server root disagree; stop project work and repair/re-pair intentionally.
- `MISSING`: persistent pairing/root state was lost or the wrong state directory is in use; do not silently create a new root policy until the cause is understood.

---

## 7. Regression test that protects Full Rebuild persistence

`.devcontainer/codespace-supervisor/tests/test_windows_gateway.py` includes a persistence test that:

1. creates a Windows gateway with `WINDOWS_GATEWAY_STATE_DIR` pointing at one persistent directory;
2. pairs the F: root;
3. recreates the gateway with a different transient runtime directory;
4. verifies the new runtime still loads the F: root from the persistent state directory.

The bootstrap test also uses the real current path shape containing `Trends&Insights` so future regressions do not quietly reintroduce the ampersand-path failure.

Run:

```bash
cd /workspaces/Market-Signal-Lab
PYTHONPATH=.devcontainer/codespace-supervisor \
  /home/vscode/.codespace-supervisor/.venv/bin/python \
  -m unittest discover \
  -s .devcontainer/codespace-supervisor/tests \
  -p 'test_windows_gateway.py'
```

Expected: all Windows gateway tests pass.

---

## 8. Full Rebuild acceptance — required before promoting the golden

A candidate is stable only after a **real Full Rebuild**.

Before rebuild:

```bash
cd /workspaces/Market-Signal-Lab
git status --short --branch
git log -3 --oneline --decorate
codespace-bridge-status
```

Trigger Full Rebuild using the current Codespace identity from shared metadata:

```bash
set -a
. /workspaces/.codespaces/shared/.env
set +a
gh codespace rebuild --full -c "$CODESPACE_NAME"
```

After the rebuild:

1. **Do not manually run `codespace-bridge-start`.**
2. Wait for `postCreateCommand` / `postStartCommand` to converge.
3. Run only verification commands.

Required acceptance:

```text
local_health=OK
watchdog=RUNNING
terminal_keepalive=RUNNING
lifecycle_last=... post-start exit=0
port_visibility=public
public_health=OK
claude_mem=RUNNING
windows_gateway_state=PRESENT
windows_root_policy_match=YES
```

Then through GPT Builder:

```text
healthCheck -> OK
windowsStatus.relayConnected -> true
windowsStatus.desktopCommanderAvailable -> true
getWindowsCapabilities.allowedRoots -> exactly F:\Chrome-Isolated\Downloads\Trends&Insights
```

Then create one scoped F: session and repeat a harmless list/write/read test. Only after all checks pass may the candidate commit be written into this document as the new behavioral golden.

---

## 9. Safe recovery audit — run this first in a future failure

```bash
cd /workspaces/Market-Signal-Lab
set -euo pipefail

echo '=== SOURCE ==='
git status --short --branch
git log -5 --oneline --decorate

echo '=== SUPERVISOR ==='
codespace-bridge-status || true

echo '=== DEVCONTAINER SNAPSHOT ==='
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/workspaces/.codespaces/shared/merged_devcontainer.json')
o = json.loads(p.read_text())
for k in ('postCreateCommand','postStartCommand','postAttachCommand','forwardPorts','portsAttributes'):
    print(f'{k}={o.get(k)}')
PY

echo '=== TOKEN CONSISTENCY — NO SECRET OUTPUT ==='
set -a
. /workspaces/.codespaces/shared/.env
set +a
python3 - <<'PY'
import os, hmac, pathlib
p = pathlib.Path('/home/vscode/.codespace-supervisor/state/bridge.token')
f = p.read_text() if p.is_file() else ''
e = os.environ.get('BRIDGE_TOKEN','')
print('TOKEN_ENV_PRESENT=' + ('YES' if e else 'NO'))
print('TOKEN_FILE_PRESENT=' + ('YES' if f else 'NO'))
print('TOKEN_ENV_FILE_MATCH=' + ('YES' if e and f and hmac.compare_digest(e,f) else 'NO'))
print('TOKEN_FILE_MODE=' + (oct(p.stat().st_mode & 0o777) if p.is_file() else 'N/A'))
PY

echo '=== TOOL READINESS ==='
bash .devcontainer/scripts/install-assistant-tools.sh --check
bash .devcontainer/scripts/install-cognitive-tools.sh --check

echo '=== WINDOWS STATE — NO CREDENTIAL OUTPUT ==='
python3 - <<'PY'
import json, pathlib
p=pathlib.Path('/workspaces/.assistant-tools/state/windows-gateway/machine.json')
if not p.is_file():
    print('WINDOWS_MACHINE_STATE=MISSING')
else:
    o=json.loads(p.read_text())
    print('WINDOWS_MACHINE_STATE=PRESENT')
    print('configuredAllowedRoots=' + repr(o.get('configuredAllowedRoots', [])))
    print('allowedRoots=' + repr(o.get('allowedRoots', [])))
PY
```

Never paste shell history, environment dumps, bridge token contents, Windows `credentials.json`, or Authorization headers into chat/documentation.

---

## 10. Recovery decision tree

```text
healthCheck / codespace-bridge-status
        |
        +-- local_health=FAIL
        |      -> codespace-bridge-start
        |
        +-- watchdog/keepalive stopped
        |      -> bash .devcontainer/scripts/post-start.sh
        |
        +-- supervisor runtime missing
        |      -> bootstrap-supervisor.sh + post-start.sh
        |
        +-- local OK; public health/visibility bad
        |      -> repeat idempotent 8787:public repair
        |
        +-- Windows state PRESENT + root match YES, relay disconnected
        |      -> inspect current Codespace URL and Windows launcher; fresh bootstrap only if URL/credential is stale
        |
        +-- Windows state PRESENT + root match NO
        |      -> stop Windows project work; controlled re-pair/root repair
        |
        +-- Windows state MISSING
        |      -> verify WINDOWS_GATEWAY_STATE_DIR and /workspaces persistence before pairing again
        |
        +-- lifecycle snapshot stale
        |      -> Full Rebuild
        |
        +-- repeated source/config regressions
               -> targeted restore from documented behavioral golden; Full Rebuild again
```

---

## 11. Hostname / URL recovery

Never trust a hostname copied from an old document.

Derive current public URL:

```bash
set -a
. /workspaces/.codespaces/shared/.env
set +a
printf 'https://%s-8787.%s\n' "$CODESPACE_NAME" "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"
```

If GPT Builder points to an old hostname:

1. verify current local/public `/health` first;
2. patch only `servers[0].url` in the reviewed Action schema copy;
3. keep Bearer authentication unchanged unless `BRIDGE_TOKEN` itself was intentionally rotated;
4. do not replace the reviewed Builder schema with live FastAPI `/openapi.json`.

If the Codespace hostname changes, the Windows launcher may also need a fresh bootstrap so `CODESPACE_WINDOWS_GATEWAY_URL` is rewritten to the current host.

---

## 12. BRIDGE_TOKEN safety

The authoritative secret model remains:

```text
GitHub Codespaces secret BRIDGE_TOKEN
        ↓
/home/vscode/.codespace-supervisor/state/bridge.token (mode 600)
        ↓
running bridge environment
        ↓
GPT Builder Bearer credential must match
```

Never write the token into repository source, documentation, screenshots, logs, or chat.

---

## 13. Targeted restore after repeated future failures

Use only after preserving current work and confirming ordinary recovery failed.

```bash
cd /workspaces/Market-Signal-Lab

git status --short --branch
git branch "backup/pre-supervisor-recovery-$(date +%Y%m%d-%H%M%S)" HEAD
git diff > "/tmp/pre-supervisor-recovery-$(date +%Y%m%d-%H%M%S).patch"
git fetch origin
```

After this runbook is promoted, set:

```bash
STABLE=<behavioral-golden-commit-recorded-in-this-file>
git cat-file -e "$STABLE^{commit}"
```

Restore only the supervisor/Windows integration surface, not the whole product repository:

```bash
git restore --source="$STABLE" -- \
  .devcontainer/devcontainer.json \
  .devcontainer/codespace-supervisor \
  .devcontainer/scripts \
  .devcontainer/windows-relay \
  docs/gpt-actions/windows-desktop-commander-gateway.md

git diff --check
git diff -- .devcontainer docs/gpt-actions/windows-desktop-commander-gateway.md
git status --short
```

Review the diff before committing. Never automatically restore/delete unrelated product files.

After targeted restore:

1. commit only the intended recovery paths;
2. push the recovery branch;
3. perform a real Full Rebuild;
4. do not manually start the bridge;
5. rerun the complete Codespace + Windows acceptance above.

---

## 14. What must never be silently “fixed”

- Do not move project work back to C: if F: root access fails.
- Do not expose the Windows long-term device credential.
- Do not expose additional public Windows management ports.
- Do not enable destructive delete merely to make a test pass.
- Do not weaken kernel/privilege policy to force blocked tooling to run.
- Do not claim Windows reboot/logon persistence until it has actually been tested.
- Do not claim a new stable golden until a real Full Rebuild has passed zero-touch acceptance.

---

## 15. Promotion record

This section must be updated only after the real Full Rebuild acceptance passes.

```text
behavioral_golden=PENDING_FULL_REBUILD_ACCEPTANCE
full_rebuild_zero_touch=PENDING
post_rebuild_windows_F_root=PENDING
post_rebuild_F_smoke_test=PENDING
```

A later documentation-only commit may sit on top of the behavioral golden to record the successful evidence; the behavioral golden should remain the exact commit that was actually present during the successful Full Rebuild.
