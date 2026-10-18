@echo off
setlocal
title Agent Core Symlink Fixture Setup
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Ensure-Agent-Core-Symlink-Fixture.ps1" -Mode Ensure
exit /b %ERRORLEVEL%
