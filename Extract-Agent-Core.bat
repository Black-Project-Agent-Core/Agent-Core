@echo off
setlocal
set "HERE=%~dp0"
set "EXTRACTOR=%HERE%agent-core-extract.ps1"
if not exist "%EXTRACTOR%" set "EXTRACTOR=%HERE%scripts\windows\agent-core-extract.ps1"
if not exist "%EXTRACTOR%" (
  echo [ERROR] Agent Core extractor not found.
  if not "%AGENT_CORE_NO_PAUSE%"=="1" pause
  exit /b 1
)
if "%~1"=="" (
  powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%EXTRACTOR%"
) else (
  powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%EXTRACTOR%" -ArchivePath "%~1"
)
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [ERROR] Extraction failed with exit code %EXIT_CODE%.
if "%EXIT_CODE%"=="0" echo [OK] Agent Core extracted. Nothing was started.
if "%EXIT_CODE%"=="0" echo Next: open the extracted Agent-Core folder and run SubProject\Agent-Code\"Agent Code Native.exe".
echo.
if not "%AGENT_CORE_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
