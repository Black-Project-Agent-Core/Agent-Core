@echo off
setlocal
set "ALLOWLIST=%~dp0Desktop-Commander-Allowlist.txt"
if not exist "%ALLOWLIST%" (
  echo E:\Projects\Agent-Core>"%ALLOWLIST%"
)
start "Desktop Commander Allowlist" notepad.exe "%ALLOWLIST%"
exit /b 0
