# Agent Core Memory — one-time UAC symlink fixture setup (INSTALLED; normal client accepted)

Historical acceptance below records 17 October only. The 18 October Workflows integration now uses a protected fixed `request.json` mailbox instead of registry requests and adds persistent Workflows fixture validation/reuse. See [current ownership and lifecycle](../Windows-Workflows-Symlink-Fixture.md) and its current execution evidence; do not infer the current host's installed state from this historical report.

**Scope:** Windows setup approved by the user on 17 October 2026 and performed through installer `-Mode Install` (the user-facing `Start-Process -Verb RunAs` entrypoint). One protected on-demand SYSTEM task, NTFS worker/config and HKCU metadata are **INSTALLED**. Normal-user restricted-token Prepare and Cleanup succeeded without requesting UAC; two real Memory symlink tests passed using the installed task. **Important:** the restricted test process was Administrator-disabled but still carried a High Integrity label, not Medium. No Agent Core resident startup/restart/deploy occurred; do not conflate this helper with production Memory activation.

## 1. Existing mechanism consulted

- `Restart-Agent-Core.cmd` calls `scripts/windows/Invoke-Agent-Core-Restart.ps1`, which installs a per-user on-demand Scheduled Task after UAC, validates the exact task action and identity, then uses Scheduler COM without recurring prompts. It dispatches its fixed restart worker. **We did not run or modify restart scripts.**
- The reuse is limited to: preview before UAC, a persistent on-demand Task Scheduler COM registration, exact action/identity verification, interactive user SID binding, and explicit recorded failures.
- **Deliberate difference:** the restart worker can reside in a writable checkout, which is unacceptable for a privileged general-purpose symlink worker. Our task action instead invokes only a protected, versioned *copy* under NTFS, NEVER any script from this checkout after installation.

## 2. Approved persistent changes — INSTALLED on this machine (earlier proposal retained for context)

**Proposed path template:** `%ProgramData%\AgentCore-SymlinkFixture-<first-16-hex-sha256-user-SID>`. Compute from the current Windows SID every time; no drive/user paths embedded in scripts. Preview on the inspected machine currently resolves to `C:\ProgramData\AgentCore-SymlinkFixture-50fdf1feaa7b6d65` on NTFS; this is an observed result, **not hardcoded implementation**. Its installed files and subdirectories would be:

- `Worker.ps1` — copied from `scripts/windows/Agent-Core-Symlink-Fixture-Worker.ps1`, then installed *read/execute only* for the target user; task execution is pinned to this copy.
- `settings.json` — version 1, user SID, random installation GUID, SHA-256 of installed worker. Protected alongside executable; no privileged paths from HKCU.
- `fixtures\<fresh-random-GUID>\inside\linked-root` and `...\parent-alias` — two **real directory symbolic links** pointing to the synthetic sibling directory `fixtures\<GUID>\outside`, empty initially.
- `receipts\<GUID>.prepare.json` and `<GUID>.cleanup.json` — protected result receipts; the normal user reads but cannot alter them.

**Task name template:** `AgentCore-MemorySymlink-<SID hash>`; current preview resolves to `AgentCore-MemorySymlink-50fdf1feaa7b6d65`. **Account:** `NT AUTHORITY\SYSTEM`, highest privileges; **on demand only**, no event/time/login/startup triggers, no automatic restarts, no arbitrary executable, command arguments, script path, or filesystem target supplied by the caller. Task is registered once, ACL grants only SYSTEM/Administrators Full and the installing Windows SID **Read + Execute/Run**; owner Administrators. Task action is *fixed* Windows PowerShell starting only `Worker.ps1` from the protected path, with **no dynamic Task Scheduler argument substitutions** (preventing command-line injection).

**NTFS install ACL:** parent root and helper/config/files protected from inheritance as needed; SYSTEM/Administrators have Full Control, owner Administrators, current user Read/Execute **without Write/WRITE_DAC**. Client and worker check the owner, ACL, no reparse points, exact worker SHA-256 and Task action. Installing UAC under a *different* administrator account is explicitly rejected: initial setup requires same-account admin elevation. No credentials/passwords stored.

**Registry:** `HKCU\Software\AgentCore\SymlinkFixture`, values `SetupVersion`, `InstallId`, `TaskName`, `HelperPath`, and the volatile bounded `Request` JSON value (`{version:1,operation:'prepare'|'cleanup',runId:32hex,installId:32hex,issuedAt:ISO}`). The SYSTEM worker opens the current user's registry hive using the SID from **protected settings** and accepts only these two fixed verbs and constrained GUIDs. **HKCU is a request mailbox, never authorization or an executable/path source.** An elevated worker never evaluates content as PowerShell code.

**Risk and limits:** this installs a persistent limited privileged Scheduled Task. It is NOT a global UAC exemption or symlink permission grant. The worker is restricted to its own named protected NTFS root, with a maximum of 16 outstanding fixtures. A stale, changed or unknown installation fails closed: perform explicit supervised setup/repair, never auto-escalate during ordinary test invocation. Unknown outcome is not silently retried.

## 3. Scripts created under project scripts/windows

| Source file | Entrypoint |
| --- | --- |
| `Install-Agent-Core-Symlink-Fixture.ps1` | `-Mode Preview` (default), `-Mode Install` (one UAC), `-Mode Uninstall` (one UAC); internal elevated modes are not daily commands |
| `Invoke-Agent-Core-Symlink-Fixture.ps1` | `-Operation Status`, `-Operation Prepare`, `-Operation Cleanup -RunId <32hex>`. Never UAC; verifies a valid installed task before sending request |
| `Agent-Core-Symlink-Fixture-Worker.ps1` | Not a daily user entrypoint. SYSTEM task executes **installed protected copy** without arguments, based on bounded per-user registry request |

**Initial preview (safe, read-only, no UAC):**

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-Agent-Core-Symlink-Fixture.ps1 -Mode Preview`

**First installation — run manually ONLY after agreeing to the path and persistent changes above:** 

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-Agent-Core-Symlink-Fixture.ps1 -Mode Install`

Installer repeats the preview then requests a single UAC consent. Installed configuration remains valid for this SID/machine/version. Normal use must **not** request UAC and must never run helper directly from exFAT; it invokes the task with its *fixed* action.

**Subsequent normal-user status / manual fixture lifecycle:**

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Invoke-Agent-Core-Symlink-Fixture.ps1 -Operation Status`

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Invoke-Agent-Core-Symlink-Fixture.ps1 -Operation Prepare`

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Invoke-Agent-Core-Symlink-Fixture.ps1 -Operation Cleanup -RunId <GUID-from-prepare>`

The normal client writes only an enum+GUID registry request, triggers the task with **no arguments**, and waits for a protected receipt. A timeout is `SYMLINK_RESULT_UNKNOWN_NO_RETRY`; do not blindly retry or delete unknown paths. Each preparation generates a distinct GUID and links under a protected run directory. The worker cleanup checks both exact real links, their trusted target, and the empty sibling before unlinking; it does not recurse through a symlink.

**Both original tests (after successful manual installation):**

`node node_modules/vitest/vitest.mjs run tests/memory/engine/memory-preservation.test.ts --testNamePattern "standalone refuses a symlinked root|parent-directory symlink aliases" --reporter verbose`

`adaptiveSymlinkFixture` first checks native capability. If missing, it invokes the non-elevated client to prepare a *fresh* protected fixture; the two original `initializeMemoryRoot` → `MEMORY_PATH_SYMLINK` assertions and empty-outside-target checks run **unchanged in meaning** on real directory links. Only the already-provisioned link creation step is not repeated; no test executes elevated. Teardown invokes the fixed cleanup task with the same GUID and verifies protected fixture removal. If setup is absent/invalid, the two tests report **NOT RUN** with the setup-required reason; never PASS from probe alone.

**Uninstall (user initiated, reviewed + UAC):**

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-Agent-Core-Symlink-Fixture.ps1 -Mode Uninstall`

Uninstall refuses while the task is active or any owned fixture remains. First invoke bounded cleanup for known RunIds. It verifies task action and install layout, then deletes that task, only the recognized protected worker/config/receipts/empty fixture directory, and the per-user registry key. It never deletes general temp directories, backups, canonical Memory or arbitrary foreign paths.

## 4. Approval and evidence boundary — superseded by installed readback in §6

**Approval requested for persistent changes only:** (a) create the NTFS protected root above; (b) register the named fixed SYSTEM on-demand task; (c) write HKCU installation/request metadata. No registry tweaks to UAC, symbolic link policy or Developer Mode; no machine reboot or Agent Core resident restart.

Source preparation and non-elevated syntax/status checks are allowed now. **DO NOT run -Mode Install, -Mode InstallElevated, -Mode Uninstall, or worker as SYSTEM until the owner approves this precise external protected installation path and task principal.** After manual installation, verify the task security descriptor and worker SHA, perform a non-elevated Prepare and Cleanup, then run the two real tests and report actual assertion counts. If any step fails, record the exact error; do not claim "one UAC forever" or 2/2 PASS without evidence.


## 5. Pemeriksaan source lokal sebelum ada instalasi

**Yang benar-benar dijalankan tanpa memasang helper:**

| Pemeriksaan | Hasil |
| --- | --- |
| PowerShell Parser.ParseFile terhadap ketiga skrip | **PASS: exit 0, zero parse errors** untuk installer, normal CLI dan source worker |
| Installer `-Mode Preview` | **PASS: exit 0**, hanya menampilkan proposal, tidak meminta UAC |
| Normal CLI `-Operation Status` sebelum instalasi | **Exit 3, SYMLINK_SETUP_REQUIRED** seperti kontrak fail-closed |
| `npm run build` | **PASS: exit 0**, path policy `416 authored files / 0 exceptions` |
| Dua test asli dengan filter Vitest | **2/2 PASS (28 filtered SKIP)**, **tetapi jalur native langsung**, bukan Scheduled Task |
| Pemeriksaan instalasi persisten | **0 terpasang**: protected root=false, scheduled task=false, HKCU key=false |

**Penting:** sesi Windows yang menjalankan tes tersebut teridentifikasi **High Mandatory Integrity**, anggota Administrators aktif; privilege `SeCreateSymbolicLinkPrivilege` terlihat Disabled (Windows dapat mengaktifkannya saat membuat symlink). Probe native pada NTFS berhasil, sehingga fixture helper elevated **tidak dipanggil** dan mekanisme satu-UAC tetap **UNVERIFIED**. Ini bukan bukti bahwa proses **Medium Integrity** bebas UAC atau bahwa task terpasang.

Log dan receipt task-owned: `runtime/tmp/one-time-uac-symlink-source-review-tc4gM3/build.log`, `build.receipt.json`, `two-original-symlink-tests.log` dan `two-original-symlink-tests.receipt.json`. Kedua root sintetis test melaporkan `MEMORY_SYMLINK_FIXTURE_TEARDOWN cleaned:true`. Tidak ada fixture yang sengaja disimpan di user temp. No production Memory, Agent Core resident, Scheduled Task atau persistent registry mutation.

**Acceptance yang masih memerlukan persetujuan:** pengguna menyetujui lokasi ProgramData, principal SYSTEM dan Task ACL; kemudian **pengguna sendiri** menjalankan `-Mode Install` dan menyetujui UAC, dari sesi Windows akun yang sama. Setelah instalasi: verifikasi `Status`, jalankan `Prepare/Cleanup` dari **proses Medium Integrity**, cek receipt+link+target, lalu jalankan dua test dari Medium Integrity dan catat 2/2 PASS pada jalur fixed task. Bila task atau ACL invalid, laporkan perbaikan setup, bukan bypass.


## 6. Installed acceptance — 17 Oktober 2026 (latest factual state)

**User approval:** explicit chat approval for the precise protected ProgramData folder + SYSTEM on-demand Scheduled Task, received before any persistent mutation. Actual installation invoked the existing `-Mode Install`, which calls `Start-Process -Verb RunAs` to invoke the protected installation mode. Outer installation exit code **0**; the installation is independently established by readback of installed folder, Task Scheduler entry, HKCU key and worker settings. Because the caller's Windows token was already administrator-capable, **no claim that a specific visual UAC dialog appeared** is made; the consent path was invoked, not bypassed via `InstallElevated`.

**Installed fixed identity, this machine:** `C:\ProgramData\AgentCore-SymlinkFixture-50fdf1feaa7b6d65`; task `AgentCore-MemorySymlink-50fdf1feaa7b6d65`. **Account:** `SYSTEM`, `ServiceAccount` logon type 5. **Task:** enabled, **0 triggers**, **1 fixed action**, no dynamic commands/parameters, lastTaskResult **0**. Task ACL owner Administrators; actual scheduler-normalized rights: SYSTEM and Administrators `001F01FF` Full, target user `001200A9` Read/Execute. Filesystem root ACL inheritance disabled; owner Administrators, SYSTEM/Admin Full and the target user ReadAndExecute only. Protected worker hash matches sealed `settings.json` and checked-in source. Installed HKCU key is present.

**Problem found and fixed without changing the protected worker:** original normal client compared generic SDDL masks `GA/GRGX` as literal `10000000/A0000000`, but the Scheduler COM API returned normalized file rights `001F01FF/001200A9`. `scripts/windows/Invoke-Agent-Core-Symlink-Fixture.ps1::Assert-Install` now accepts only these two equivalent bounded representations; no expanded permission. Post-fix Status **exit 0**.

**Second problem found and fixed:** Windows SYSTEM worker wrote a JSON receipt with `FileShare.None`; the client saw the file before the writer closed it and threw `file is being used by another process`. Worker Cleanup **had succeeded**, and an independent readback found the target fixture absent with canonical cleanup receipt status `ok`. The normal client now polls until the already-started worker's receipt is readable, catches only transient `IOException`, never retries `Task.Run`, and preserves `SYMLINK_RESULT_UNKNOWN_NO_RETRY` after the existing deadline. The protected worker did not change, so no reinstall or second UAC was required.

### Acceptance matrix

| Verification | Observed result |
| --- | --- |
| `-Mode Install` | Exit **0**; installed root, task, HKCU metadata and worker present |
| `Invoke... -Operation Status` | Exit **0** after ACL-normalization fix; task action/ACL/hash/current SID verified |
| Admin-capable caller `Prepare` | Exit **0**, both links real directory symbolic links; target checked empty and correct |
| Admin-capable caller `Cleanup` | Exit **0**, exact fixture directory removed |
| Restricted caller from `runas /trustlevel:0x20000` | `Administrator.Enabled=false`, but token integrity label still **High**, not Medium; **Prepare=0**, **Cleanup=0**, two real symlinks with correct sibling target, target empty, cleanup complete, no elevation call from normal client |
| Two original Memory tests via restricted caller | Exit **0**, **2 passed, 28 filtered skipped**, each log shows `MEMORY_SYMLINK_PRIVILEGED_FIXTURE` and `MEMORY_SYMLINK_FIXTURE_TEARDOWN cleaned:true kind:fixed-scheduled-task`. Both `MEMORY_PATH_SYMLINK` assertions ran; this was **not** native/admin shortcut or mock |
| Final task state | Enabled/on-demand, lastTaskResult 0, **0 active fixtures**, 10 protected receipts preserved for audit |
| PowerShell parser | 3 scripts with **0 syntax errors** |
| Official build after client fix | `npm run build` exit **0**, path policy **416 authored files / 0 exceptions**, compiler passed |
| Production boundary | No restart of resident, no Memory production writes, no migration/reindex, no plugin update or release |

**Synthetic data and evidence location:** `E:\Projects\Agent-Core\runtime\tmp\one-time-uac-install-approved-BNExBg`. Files: `install-attempt.log` / `install.receipt.json`; `first-prepare.receipt.json` / `first-prepare-readback.json` / `first-cleanup-readback.json`; `restricted-caller-first-read-race.json`; `restricted-caller-result.json`; `restricted-test-verified-readback.json`; `restricted-symlink-tests.log` / `restricted-symlink-tests.receipt.json`; `source-parses-final.json`; `build-after-install-client-fix.log` / its receipt. The fixed SYSTEM worker keeps its protected JSON receipts inside ProgramData (`receipts`) and uses individual GUID directories under `fixtures`; all synthetic fixture trees were removed after use. Do not delete the audit receipts or general temp.

**Current operational instructions:** Once installed, `Invoke-Agent-Core-Symlink-Fixture.ps1 -Operation Status|Prepare|Cleanup` may be called from this account without triggering another UAC. Re-run `-Mode Install` only when the protected task/helper/config changes or cannot be validated; the existing valid installation must not be duplicated. `-Mode Uninstall` intentionally requires separate user-approved UAC and refuses unknown/nonempty fixture directories. On another Windows machine, rerun the initial installation and consent procedure; do not import the registry key as authorization.

**Residual verification distinction:** the restricted process had Administrators membership **disabled**, but the Windows mandatory label was **High** rather than Medium. No claim of execution under a verified Medium Integrity token is made. For a strict Medium-Integrity acceptance, launch the same non-elevated client/tests from a genuine Medium Integrity desktop session and inspect that token; no new registry/system installation should be necessary. The demonstrated repeatable no-UAC path and the two real fixture tests did not require any second elevation.
