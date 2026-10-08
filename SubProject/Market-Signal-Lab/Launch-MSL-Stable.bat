@echo off
setlocal
set "ROOT=%~dp0"
set "APP=%ROOT%release-stable\Portable\Market Signal Lab.exe"

if not exist "%APP%" (
  echo [MSL] Stable portable runtime is not present.
  echo [MSL] Expected: "%APP%"
  echo [MSL] Restore or promote the verified release into "%ROOT%release-stable".
  exit /b 2
)

start "Market Signal Lab" "%APP%"
exit /b 0
