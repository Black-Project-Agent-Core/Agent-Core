@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Agent Core - Isolated Desktop Commander

set "ORIGINAL_USERPROFILE=%USERPROFILE%"
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
cd /d "%PROJECT_ROOT%"

set "DC_ROOT=%PROJECT_ROOT%\dist\.desktop-commander"
set "NPM_CACHE=%DC_ROOT%\npm-cache"
set "ISOLATED_HOME=%DC_ROOT%\agent-core-home"
set "DEVICE_CONFIG=%ISOLATED_HOME%\.desktop-commander-device\device.json"
set "DC_CONFIG=%ISOLATED_HOME%\.claude-server-commander\config.json"
set "ALLOWLIST_FILE=%PROJECT_ROOT%\Desktop-Commander-Allowlist.txt"
set "ALLOWLIST_SCRIPT=%PROJECT_ROOT%\Apply-Desktop-Commander-Allowlist.ps1"
set "SEED_CONFIG=%ORIGINAL_USERPROFILE%\.claude-server-commander\config.json"

if not exist "%NPM_CACHE%" mkdir "%NPM_CACHE%"
if not exist "%ISOLATED_HOME%" mkdir "%ISOLATED_HOME%"

set "npm_config_cache=%NPM_CACHE%"
set "USERPROFILE=%ISOLATED_HOME%"
set "HOME=%ISOLATED_HOME%"

where node.exe >nul 2>&1 || goto no_node
where npx.cmd >nul 2>&1 || goto no_npx
where powershell.exe >nul 2>&1 || goto no_powershell

if not exist "%ALLOWLIST_SCRIPT%" goto no_allowlist_script

echo Applying folder allowlist...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ALLOWLIST_SCRIPT%" -ProjectRoot "%PROJECT_ROOT%" -SeedConfigPath "%SEED_CONFIG%"
if errorlevel 1 goto allowlist_failed
if not exist "%DC_CONFIG%" goto no_profile_config

if /I "%~1"=="--check" goto check_ok

echo.
echo ============================================
echo Desktop Commander - Agent Core ISOLATED
echo Project: %PROJECT_ROOT%
echo Profile: %ISOLATED_HOME%
echo Allowlist: %ALLOWLIST_FILE%
echo Device config: %DEVICE_CONFIG%
echo ============================================
echo.
echo Starting isolated Desktop Commander...
call npx.cmd -y @wonderwhy-er/desktop-commander@0.2.47 remote --persist-session

set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Desktop Commander exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

:check_ok
echo.
echo CHECK PASS: Isolated Desktop Commander profile is ready.
echo Config: %DC_CONFIG%
echo Allowlist: %ALLOWLIST_FILE%
exit /b 0

:allowlist_failed
echo.
echo ERROR: Allowlist/profile bootstrap gagal. Commander tidak dijalankan.
echo Allowlist: %ALLOWLIST_FILE%
echo Seed config: %SEED_CONFIG%
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

:no_node
echo Node.js tidak ditemukan.
pause
exit /b 1

:no_npx
echo npx tidak ditemukan.
pause
exit /b 1

:no_powershell
echo PowerShell tidak ditemukan.
pause
exit /b 1
