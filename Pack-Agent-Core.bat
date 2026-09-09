@echo off
setlocal
set "ROOT=%~dp0"
set "PACKER=%ROOT%scripts\windows\agent-core-pack.ps1"
if not exist "%PACKER%" (
  echo [ERROR] Agent Core packer not found: %PACKER%
  if not "%AGENT_CORE_NO_PAUSE%"=="1" pause
  exit /b 1
)
echo Creating a safe portable Agent Core package...
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%PACKER%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" echo [ERROR] Packaging failed with exit code %EXIT_CODE%.
if "%EXIT_CODE%"=="0" echo [OK] Packaging completed. See the transfer folder next to Agent-Core.
echo.
if not "%AGENT_CORE_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
