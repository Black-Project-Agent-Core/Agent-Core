@echo off
setlocal
set "PERF_SKILL_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%PERF_SKILL_PYTHON%" goto bundled
where.exe py.exe >nul 2>nul
if not errorlevel 1 goto launcher
echo Python 3 was not found. Open INSTALL.md for manual installation instructions.
set "PERF_SKILL_EXIT=1"
goto finished

:bundled
"%PERF_SKILL_PYTHON%" -I "%~dp0scripts\install_skill.py" %*
set "PERF_SKILL_EXIT=%ERRORLEVEL%"
goto finished

:launcher
py.exe -3 -I "%~dp0scripts\install_skill.py" %*
set "PERF_SKILL_EXIT=%ERRORLEVEL%"

:finished
echo.
pause
exit /b %PERF_SKILL_EXIT%
