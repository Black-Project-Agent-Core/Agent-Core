@echo off
setlocal
title Agent Core - Remove retired reference folders
echo This removes only these two folders permanently:
echo   E:\Projects\Agent-Core\referensi\01-ponytail
echo   E:\Projects\Agent-Core\referensi\ponytail
echo.
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; try { $referenceRoot=(Resolve-Path -LiteralPath 'E:\Projects\Agent-Core\referensi').ProviderPath; if ($referenceRoot -ne 'E:\Projects\Agent-Core\referensi') { throw 'Unexpected reference root' }; $names=@('01-ponytail','ponytail'); $before=@(Get-ChildItem -LiteralPath $referenceRoot -Directory -Force | Select-Object -ExpandProperty Name); foreach ($name in $names) { $candidate=Join-Path $referenceRoot $name; if (-not (Test-Path -LiteralPath $candidate)) { Write-Host ('Already absent: '+$candidate); continue }; $target=(Resolve-Path -LiteralPath $candidate).ProviderPath; if ((Split-Path -Parent $target) -ne $referenceRoot -or (Split-Path -Leaf $target) -ne $name) { throw 'Deletion scope mismatch' }; $item=Get-Item -LiteralPath $target -Force; if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing linked directory' }; $links=@(Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }); if ($links.Count -ne 0) { throw 'Refusing nested linked directory' }; Remove-Item -LiteralPath $target -Recurse -Force; if (Test-Path -LiteralPath $target) { throw 'Folder still exists' }; Write-Host ('Deleted: '+$target) }; $expected=@($before | Where-Object { $_ -notin $names }); $after=@(Get-ChildItem -LiteralPath $referenceRoot -Directory -Force | Select-Object -ExpandProperty Name); if (@(Compare-Object $expected $after).Count -ne 0) { throw 'Unexpected remaining directory inventory' }; if (-not (Test-Path -LiteralPath (Join-Path $referenceRoot 'rtk') -PathType Container)) { throw 'RTK reference is missing' }; Write-Host 'Verified: both selected folders absent; other reference folders retained.'; exit 0 } catch { Write-Host ('FAILED: '+$_.Exception.Message) -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo.
  echo Cleanup did not complete. Keep the error above for diagnosis.
) else (
  echo.
  echo Cleanup completed and verified.
)
pause
endlocal
