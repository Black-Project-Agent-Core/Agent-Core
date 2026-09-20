@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Agent Core - Isolated Desktop Commander

for %%I in ("%~dp0.") do set "PROJECT_ROOT=%%~fI"
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_DRIVE=%%~dI\"
if not defined PROJECT_DRIVE set "PROJECT_DRIVE=%PROJECT_ROOT%"
cd /d "%PROJECT_ROOT%"

set "RUNTIME_ROOT=%PROJECT_ROOT%\runtime"
set "LOCAL_NODE_ROOT=%RUNTIME_ROOT%\node"
set "NODE_EXE=%LOCAL_NODE_ROOT%\node.exe"
set "NPM_CMD=%LOCAL_NODE_ROOT%\npm.cmd"
set "NPX_CMD=%LOCAL_NODE_ROOT%\npx.cmd"
set "NPM_CACHE=%RUNTIME_ROOT%\npm-cache"
set "NPM_PREFIX=%RUNTIME_ROOT%\npm-prefix"
set "NPM_USERCONFIG=%RUNTIME_ROOT%\npmrc"
set "TEMP_ROOT=%RUNTIME_ROOT%\tmp"
set "PLAYWRIGHT_ROOT=%RUNTIME_ROOT%\playwright"
set "SELF_REPAIR=%PROJECT_ROOT%\scripts\windows\Ensure-Agent-Core-LocalRuntime.ps1"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

set "DC_ROOT=%PROJECT_ROOT%\dist\.desktop-commander"
set "ISOLATED_HOME=%DC_ROOT%\agent-core-home"
set "DEVICE_CONFIG=%ISOLATED_HOME%\.desktop-commander-device\device.json"
set "DC_CONFIG=%ISOLATED_HOME%\.claude-server-commander\config.json"
set "ALLOWLIST_FILE=%PROJECT_ROOT%\Desktop-Commander-Allowlist.txt"
set "ALLOWLIST_SCRIPT=%PROJECT_ROOT%\Apply-Desktop-Commander-Allowlist.ps1"
if not exist "%POWERSHELL_EXE%" goto no_powershell
if not exist "%SELF_REPAIR%" goto no_self_repair

"%POWERSHELL_EXE%" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%SELF_REPAIR%" -ProjectRoot "%PROJECT_ROOT%."
if errorlevel 1 goto runtime_repair_failed

for %%D in ("%NPM_CACHE%" "%NPM_PREFIX%" "%TEMP_ROOT%" "%PLAYWRIGHT_ROOT%" "%ISOLATED_HOME%\AppData\Roaming" "%ISOLATED_HOME%\AppData\Local") do (
  if not exist "%%~D" mkdir "%%~D"
)

if not exist "%NPM_USERCONFIG%" type nul > "%NPM_USERCONFIG%"
set "TEMP=%TEMP_ROOT%"
set "TMP=%TEMP_ROOT%"
set "npm_config_cache=%NPM_CACHE%"
set "npm_config_prefix=%NPM_PREFIX%"
set "npm_config_userconfig=%NPM_USERCONFIG%"
set "npm_config_update_notifier=false"
set "NODE_PATH="
set "PLAYWRIGHT_BROWSERS_PATH=%PLAYWRIGHT_ROOT%"
set "USERPROFILE=%ISOLATED_HOME%"
set "HOME=%ISOLATED_HOME%"
set "APPDATA=%ISOLATED_HOME%\AppData\Roaming"
set "LOCALAPPDATA=%ISOLATED_HOME%\AppData\Local"
set "PATH=%LOCAL_NODE_ROOT%;%PATH%"

if not exist "%NODE_EXE%" goto no_local_node
if not exist "%NPM_CMD%" goto no_local_npm
if not exist "%NPX_CMD%" goto no_local_npx
if not exist "%ALLOWLIST_SCRIPT%" goto no_allowlist_script

echo Applying folder allowlist...
"%POWERSHELL_EXE%" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%ALLOWLIST_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%."
if errorlevel 1 goto allowlist_failed
if not exist "%DC_CONFIG%" goto no_profile_config
if /I "%~1"=="--check" goto check_ok

echo.
echo ============================================
echo Desktop Commander - Agent Core ISOLATED
echo Project: %PROJECT_ROOT%
echo Project drive: %PROJECT_DRIVE%
echo Node: %NODE_EXE%
echo Profile: %ISOLATED_HOME%
echo Allowlist: %ALLOWLIST_FILE%
echo Device config: %DEVICE_CONFIG%
echo ============================================
echo.
echo Starting isolated Desktop Commander...
set "START_ATTEMPT=1"
:start_commander
call "%NPX_CMD%" -y @wonderwhy-er/desktop-commander@latest remote --persist-session
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" goto commander_exit
if "%START_ATTEMPT%"=="1" goto repair_commander

goto commander_exit

:repair_commander
echo.
echo Desktop Commander failed once. Running bounded project-local repair before one retry...
call "%NPM_CMD%" cache verify --cache "%NPM_CACHE%"
if errorlevel 1 call "%NPM_CMD%" cache clean --force --cache "%NPM_CACHE%"
"%POWERSHELL_EXE%" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%SELF_REPAIR%" -ProjectRoot "%PROJECT_ROOT%."
if errorlevel 1 goto runtime_repair_failed
set "START_ATTEMPT=2"
goto start_commander

:commander_exit
echo.
echo Desktop Commander exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

:check_ok
echo.
echo CHECK PASS: Agent Core isolated Desktop Commander environment is ready.
echo Project root: %PROJECT_ROOT%
echo Project drive: %PROJECT_DRIVE%
echo Node: %NODE_EXE%
echo npm cache: %NPM_CACHE%
echo temp: %TEMP_ROOT%
echo Config: %DC_CONFIG%
echo Allowlist: %ALLOWLIST_FILE%
exit /b 0

:runtime_repair_failed
echo ERROR: Project-local Node runtime self-repair gagal.
echo Repair script: %SELF_REPAIR%
pause
exit /b 1

:allowlist_failed
echo ERROR: Allowlist/profile bootstrap gagal. Commander tidak dijalankan.
echo Allowlist: %ALLOWLIST_FILE%
pause
exit /b 1

:no_profile_config
echo ERROR: Profil Agent Core gagal membuat config Desktop Commander.
echo Expected: %DC_CONFIG%
pause
exit /b 1

:no_allowlist_script
echo ERROR: Script allowlist tidak ditemukan.
echo Expected: %ALLOWLIST_SCRIPT%
pause
exit /b 1

:no_self_repair
echo ERROR: Script self-repair runtime tidak ditemukan.
echo Expected: %SELF_REPAIR%
pause
exit /b 1

:no_local_node
echo ERROR: Node portable Agent Core tidak ditemukan setelah self-repair.
echo Expected: %NODE_EXE%
pause
exit /b 1

:no_local_npm
echo ERROR: npm portable Agent Core tidak ditemukan setelah self-repair.
echo Expected: %NPM_CMD%
pause
exit /b 1

:no_local_npx
echo ERROR: npx portable Agent Core tidak ditemukan setelah self-repair.
echo Expected: %NPX_CMD%
pause
exit /b 1

:no_powershell
echo ERROR: Windows PowerShell tidak ditemukan.
echo Expected: %POWERSHELL_EXE%
pause
exit /b 1
