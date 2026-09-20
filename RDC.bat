@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -File "%~dp0RDC-STANDALONE.ps1"
set "RDC_EXIT=%ERRORLEVEL%"
if not "%RDC_EXIT%"=="0" pause
exit /b %RDC_EXIT%
