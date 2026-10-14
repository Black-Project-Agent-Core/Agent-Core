@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%CD%"
set "NODE=%ROOT%\runtime\node\node.exe"
set "MARKER=%ROOT%\runtime\memory-v2-activation.json"
set "LOG=%ROOT%\runtime\backups\memory-v2-activation-last.log"
if not exist "%NODE%" (echo FAILED: local Node runtime unavailable.& exit /b 2)
if not exist "%ROOT%\runtime\backups" mkdir "%ROOT%\runtime\backups"
powershell.exe -NoProfile -NonInteractive -Command "if (Get-Process -Name 'Agent Core' -ErrorAction SilentlyContinue) { Write-Error 'Close Agent Core Launcher completely before activation'; exit 7 }"
if errorlevel 1 (echo FAILED: Launcher still running. No activation started. >"%LOG%" & echo FAILED: Launcher still running. No activation started. & echo Diagnostic output: %LOG% & exit /b 7)
echo Starting Memory v2 migration. Please wait for VERIFIED ACTIVATION.
"%NODE%" "%ROOT%\scripts\memory\activate-v2.mjs" 1>"%LOG%" 2>&1
set "RUN_EXIT=%ERRORLEVEL%"
type "%LOG%"
if not "%RUN_EXIT%"=="0" (echo FAILED: activation exited %RUN_EXIT%. Review %LOG%. Do not delete Memory roots.& exit /b 1)
if not exist "%MARKER%" (echo FAILED: node exited 0 but activation marker is absent. Review %LOG%.& exit /b 3)
powershell.exe -NoProfile -NonInteractive -Command "$m=Get-Content -LiteralPath '%MARKER%' -Raw|ConvertFrom-Json; if($m.mode -ne 'experience-v2' -or $m.root -ne 'runtime/memory-v2' -or !$m.finalDigest) { Write-Error 'Activation marker content invalid'; exit 8 }"
if errorlevel 1 (echo FAILED: activation marker was not valid.& exit /b 8)
echo VERIFIED ACTIVATION: marker exists and engine v2 is selected on the next startup.
echo Restart Agent Core Launcher normally, then request fresh MCP acceptance.
echo Diagnostic output: %LOG%
exit /b 0
