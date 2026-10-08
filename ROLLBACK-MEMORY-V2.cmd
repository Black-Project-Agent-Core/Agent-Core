@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%CD%"
set "NODE=%ROOT%\runtime\node\node.exe"
if not exist "%NODE%" (echo ERROR: project-local Node is unavailable.& exit /b 2)
powershell.exe -NoProfile -NonInteractive -Command "if (Get-Process -Name 'Agent Core' -ErrorAction SilentlyContinue) {Write-Error 'Close Agent Core Launcher completely before rollback'; exit 7}"
if errorlevel 1 exit /b 7
echo Backing up current Memory v2 and restoring the legacy startup selection...
"%NODE%" "%ROOT%\scripts\memory\rollback-v2.mjs"
if errorlevel 1 (echo FAILED: no automatic deletion or restart was performed.& exit /b 1)
echo Legacy startup selection restored. Memory v2 root and its backup remain retained.
echo Launch Agent Core.exe manually; do not delete the v2 backup.
exit /b 0
