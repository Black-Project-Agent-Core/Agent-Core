@echo off
setlocal
title Restart Agent Core
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Invoke-Agent-Core-Restart.ps1" %*
set "restartExit=%ERRORLEVEL%"
if "%restartExit%"=="0" exit /b 0
echo.
echo Restart gagal. Baca pesan di atas sebelum mencoba lagi.
pause
exit /b %restartExit%
