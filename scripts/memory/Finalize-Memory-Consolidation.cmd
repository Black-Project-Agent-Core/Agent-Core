@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
cd /d "%ROOT%" || exit /b 1
if not exist "runtime\node\node.exe" (
  echo ERROR: Node project-local tidak ditemukan.
  exit /b 2
)
powershell.exe -NoLogo -NoProfile -Command ^
 "$root=(Get-Location).Path.ToLowerInvariant(); $p=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $x=$_.ExecutablePath; $c=$_.CommandLine; ($_.Name -ieq 'Agent Core.exe' -and $x -and $x.ToLowerInvariant().StartsWith($root)) -or ($_.Name -ieq 'node.exe' -and $x -and $x.ToLowerInvariant().StartsWith($root) -and $c -and $c -match 'dist[\\/]index\.js') }); if($p.Count -gt 0){Write-Host 'ERROR: Agent Core / Memory writer masih berjalan. Tutup dulu seluruh proses Agent Core.'; exit 42}"
if errorlevel 1 (
  echo ERROR: Preflight gagal. Tidak ada migrasi dilakukan.
  exit /b 3
)
"runtime\node\node.exe" "scripts\memory\activate-canonical.mjs" --migrate-control-state --dry-run
if errorlevel 1 (
  echo ERROR: Dry-run metadata gagal. Data tidak diubah oleh helper.
  exit /b 4
)
"runtime\node\node.exe" "scripts\memory\activate-canonical.mjs" --migrate-control-state
if errorlevel 1 (
  echo ERROR: Migrasi control-state tidak berhasil. Jangan mulai Agent Core.
  exit /b 5
)
echo Metadata migrasi selesai. Menjalankan launcher Agent Core...
start "" "%ROOT%\Agent Core.exe"
exit /b 0

