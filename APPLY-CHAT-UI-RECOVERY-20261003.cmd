@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "E:\Projects\Agent-Core\runtime\tmp\chat-ui-startup-recovery-20261003.ps1"
set "EC=%ERRORLEVEL%"
echo.
if not "%EC%"=="0" echo Chat UI recovery was NOT installed.
pause
exit /b %EC%