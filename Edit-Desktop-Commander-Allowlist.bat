@echo off
setlocal
set "ALLOWLIST=%~dp0Desktop-Commander-Allowlist.txt"
if not exist "%ALLOWLIST%" (
  echo @FIXED_DRIVES>"%ALLOWLIST%"
)
start "Desktop Commander Allowlist" notepad.exe "%ALLOWLIST%"
exit /b 0
