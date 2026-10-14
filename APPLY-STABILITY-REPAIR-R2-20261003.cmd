@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "E:\Projects\Agent-Core\runtime\tmp\stability-20261003\apply-stability-repair-r2.ps1"
set "EC=%ERRORLEVEL%"
echo.
if not "%EC%"=="0" echo Stability repair r2 was NOT installed.
pause
exit /b %EC%