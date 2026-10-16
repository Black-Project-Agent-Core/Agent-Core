@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
echo Memory recovery is explicit. No legacy engine is selected and no files are deleted.
echo Stop Agent Core. Inspect retained snapshots in "%ROOT%\runtime\memory\state\backups".
echo For old layouts, preview: scripts\memory\activate-memory.cmd --migrate-control-state --dry-run
echo Historical memory-v2 roots instead require --relocate-historical --dry-run.
echo Interrupted preparing markers or active locks require investigation before any retry.
exit /b 0
