param(
  [Parameter(Mandatory=$false)][string]$Root = '',
  [switch]$VerifyOnly
)
$ErrorActionPreference='Stop'
# Windows PowerShell 5.1 leaves $PSScriptRoot empty while binding parameter defaults; resolve the repo root in the body instead.
if(-not $Root){$Root=(Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..')).Path}
$Root=[IO.Path]::GetFullPath($Root)
$Tools=Join-Path $Root '.tools'
$Required=[ordered]@{
  ripgrep = Join-Path $Tools 'ripgrep\rg.exe'
  uv = Join-Path $Tools 'uv\uv.exe'
  python = Join-Path $Tools 'python\python.exe'
  graphify = Join-Path $Tools 'graphify\graphify.cmd'
}
function Test-PrivateTool([string]$Path) {
  if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){return $false}
  $resolved=[IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  $prefix=$Root.TrimEnd('\')+'\'
  return $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)
}
function Get-Missing {
  @($Required.GetEnumerator() | Where-Object { -not(Test-PrivateTool $_.Value) } | ForEach-Object {$_.Key})
}
$missing=Get-Missing
if($missing.Count -eq 0){Write-Output ('PRIVATE_READY '+($Required.Values -join ';'));exit 0}
if($VerifyOnly){Write-Output ('PRIVATE_MISSING '+($missing -join ','));exit 2}
New-Item -ItemType Directory -Force $Tools,(Join-Path $Tools 'cache') | Out-Null
$cache=Join-Path $Tools 'cache'
if($missing -contains 'ripgrep'){
  $zip=Join-Path $cache 'ripgrep-15.1.0-x86_64-pc-windows-msvc.zip'
  if(-not(Test-Path $zip)){Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/ripgrep-15.1.0-x86_64-pc-windows-msvc.zip' -OutFile $zip}
  $tmp=Join-Path $cache 'ripgrep-expand';if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force};Expand-Archive $zip $tmp
  New-Item -ItemType Directory -Force (Split-Path $Required.ripgrep) | Out-Null;Copy-Item (Get-ChildItem $tmp -Filter rg.exe -File -Recurse|Select-Object -First 1).FullName $Required.ripgrep -Force
}
if($missing -contains 'uv'){
  $zip=Join-Path $cache 'uv-0.12.10-x86_64-pc-windows-msvc.zip'
  if(-not(Test-Path $zip)){Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/astral-sh/uv/releases/download/0.12.10/uv-x86_64-pc-windows-msvc.zip' -OutFile $zip}
  $tmp=Join-Path $cache 'uv-expand';if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force};Expand-Archive $zip $tmp
  New-Item -ItemType Directory -Force (Split-Path $Required.uv) | Out-Null;Copy-Item (Get-ChildItem $tmp -Filter uv.exe -File -Recurse|Select-Object -First 1).FullName $Required.uv -Force
}
if($missing -contains 'python'){
  $zip=Join-Path $cache 'python-3.12.10-embed-amd64.zip'
  if(-not(Test-Path $zip)){Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' -OutFile $zip}
  $pyRoot=Split-Path $Required.python;New-Item -ItemType Directory -Force $pyRoot | Out-Null;Get-ChildItem $pyRoot -Force -ErrorAction SilentlyContinue|Remove-Item -Recurse -Force
  Expand-Archive $zip $pyRoot
  $pth=Get-ChildItem $pyRoot -Filter 'python312._pth'|Select-Object -First 1;$text=Get-Content $pth.FullName -Raw
  if($text -notmatch 'Lib/site-packages'){$text=$text.TrimEnd()+"`r`nLib/site-packages`r`n"};$text=$text -replace '#import site','import site';[IO.File]::WriteAllText($pth.FullName,$text,(New-Object Text.UTF8Encoding($false)))
  New-Item -ItemType Directory -Force (Join-Path $pyRoot 'Lib\site-packages')|Out-Null
}
if($missing -contains 'graphify' -or -not(Test-Path (Join-Path (Split-Path $Required.python) 'Lib\site-packages\graphify'))){
  & $Required.uv pip install --python $Required.python --target (Join-Path (Split-Path $Required.python) 'Lib\site-packages') 'graphifyy==0.9.55' --link-mode copy
  if($LASTEXITCODE -ne 0){throw 'GRAPHIFY_PRIVATE_INSTALL_FAILED'}
  New-Item -ItemType Directory -Force (Split-Path $Required.graphify)|Out-Null
  [IO.File]::WriteAllLines($Required.graphify,@('@echo off','set "ROOT=%~dp0.."','"%ROOT%\python\python.exe" -m graphify %*'),[Text.Encoding]::ASCII)
}
$missing=Get-Missing
if($missing.Count){Write-Output ('PRIVATE_MISSING '+($missing -join ','));exit 2}
$lock=[ordered]@{schemaVersion=1;generatedAt=(Get-Date).ToUniversalTime().ToString('o');ripgrep='15.1.0';uv='0.12.10';python='3.12.10';graphify='0.9.55';files=@{}}
foreach($kv in $Required.GetEnumerator()){$lock.files[$kv.Key]=@{path=$kv.Value.Substring($Root.TrimEnd('\').Length+1);sha256=(Get-FileHash $kv.Value -Algorithm SHA256).Hash.ToLowerInvariant()}}
$lock|ConvertTo-Json -Depth 5|Set-Content (Join-Path $Tools 'memory-tools-lock.json') -Encoding utf8
Write-Output ('PRIVATE_READY '+($Required.Values -join ';'))
