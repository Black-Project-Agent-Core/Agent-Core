@echo off
setlocal EnableExtensions
title Market Signal Lab - Desktop Commander Remote

rem Always use the folder containing this BAT as the MSL root.
set "MSL_ROOT=%~dp0"
if "%MSL_ROOT:~-1%"=="\" set "MSL_ROOT=%MSL_ROOT:~0,-1%"
cd /d "%MSL_ROOT%"

rem Keep Desktop Commander temporary/cache files inside the MSL folder.
set "DC_ROOT=%MSL_ROOT%\dist\.desktop-commander"
set "TEMP=%DC_ROOT%\temp"
set "TMP=%TEMP%"
set "npm_config_cache=%DC_ROOT%\npm-cache"

if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%npm_config_cache%" mkdir "%npm_config_cache%"

echo ============================================================
echo   MARKET SIGNAL LAB - DESKTOP COMMANDER REMOTE
echo ============================================================
echo   Root : %MSL_ROOT%
echo   Temp : %TEMP%
echo   Cache: %npm_config_cache%
echo ============================================================
echo.

where npx.cmd >nul 2>&1
if errorlevel 1 goto :no_npx

echo Starting Desktop Commander...
echo Keep this window open while ChatGPT is working.
echo.
call npx.cmd -y @wonderwhy-er/desktop-commander@latest remote
set "DC_EXIT=%ERRORLEVEL%"
echo.
echo Desktop Commander stopped. Exit code: %DC_EXIT%
pause
exit /b %DC_EXIT%

:no_npx
echo ERROR: npx.cmd was not found in PATH.
echo Install/repair Node.js, then run this BAT again.
pause
exit /b 1
