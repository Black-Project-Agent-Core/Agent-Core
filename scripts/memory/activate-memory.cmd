@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
set "NODE=%ROOT%\runtime\node\node.exe"
if not exist "%NODE%" (echo ERROR: project-local Node is unavailable.& exit /b 2)
powershell.exe -NoProfile -NonInteractive -Command "if (Get-Process -Name 'Agent Core' -ErrorAction SilentlyContinue) {Write-Error 'Stop Agent Core before offline Memory migration'; exit 7}"
if errorlevel 1 exit /b 7
if "%~1"=="" (echo Usage: activate-memory.cmd --fresh or --relocate-historical or --migrate-control-state [--dry-run]& exit /b 2)
"%NODE%" "%ROOT%\scripts\memory\activate-canonical.mjs" %*
exit /b %ERRORLEVEL%
