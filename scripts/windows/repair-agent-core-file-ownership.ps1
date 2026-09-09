<#
.SYNOPSIS
  Reclaims Agent Core runtime files left owned by a Windows account that no longer resolves.

.DESCRIPTION
  When the project tree is carried across machines or the local account is recreated, files
  written by the previous account keep an unresolvable owner SID. The inherited ACL grants
  BUILTIN\Users only Write and ReadAndExecute, so the current account can read and overwrite
  those files but cannot delete or atomically replace them. Agent Core then reports
  "EPERM: operation not permitted, unlink ..." and degrades - most visibly the execution
  runtime, whose stale lease file cannot be cleared.

  This script takes ownership of the affected subtree and grants the current account full
  control, then drops an execution lease whose owning process is gone. It also reclaims and
  deletes the regenerable caches listed in -PurgeSubtrees, which are unreachable for the same
  ownership reason. Nothing outside those paths is touched.

  Must be run elevated (takeown requires it for files owned by another account).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\repair-agent-core-file-ownership.ps1
#>
[CmdletBinding()]
param(
  [string]$ProjectRoot = '',
  [string[]]$Subtrees = @('runtime', '.git', 'dist', 'src', 'scripts', 'capabilities', 'secrets', 'tunnel-client'),
  [string[]]$PurgeSubtrees = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 leaves $PSScriptRoot empty while binding parameter defaults, so the project
# root is resolved here from the running script's own path instead.
if (-not $ProjectRoot) {
  $scriptPath = $MyInvocation.MyCommand.Path
  if (-not $scriptPath) { $scriptPath = $PSCommandPath }
  if (-not $scriptPath) { throw 'Could not resolve the script path; pass -ProjectRoot explicitly.' }
  $ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $scriptPath))
}
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $ProjectRoot)) { throw "Project root not found: $ProjectRoot" }
Write-Output "project root: $ProjectRoot"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'This repair changes file ownership and must be run from an elevated PowerShell window.'
}

function Test-StaleExecutionLease {
  # A lease is stale when no live process holds it. An unreadable or malformed lease is also stale:
  # it is a torn write from a killed process, and leaving it in place blocks every later start.
  param([string]$Path)
  try { $record = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json } catch { return $true }
  if (-not $record -or -not $record.PSObject.Properties['pid']) { return $true }
  $processId = 0
  if (-not [int]::TryParse([string]$record.pid, [ref]$processId) -or $processId -le 0) { return $true }
  return -not (Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

foreach ($subtree in $Subtrees) {
  $target = Join-Path $ProjectRoot $subtree
  if (-not (Test-Path -LiteralPath $target)) {
    Write-Output "skip (absent): $target"
    continue
  }

  Write-Output "reclaiming (this can take a few minutes on large trees): $target"
  & takeown.exe /F $target /R /D Y | Out-Null
  & icacls.exe $target /grant ("{0}:(OI)(CI)F" -f $identity.Name) /T /C | Out-Null
  Write-Output "ownership reclaimed: $target"

  foreach ($lease in @(Get-ChildItem -LiteralPath $target -Filter '*.runtime.json' -File -Force -ErrorAction SilentlyContinue)) {
    if (Test-StaleExecutionLease $lease.FullName) {
      Remove-Item -LiteralPath $lease.FullName -Force
      Write-Output "stale lease removed: $($lease.FullName)"
    } else {
      Write-Output "lease still owned by a live process, left in place: $($lease.FullName)"
    }
  }
}

foreach ($subtree in $PurgeSubtrees) {
  $target = Join-Path $ProjectRoot $subtree
  if (-not (Test-Path -LiteralPath $target)) {
    Write-Output "purge skip (absent): $target"
    continue
  }
  # Regenerable cache only: reclaim first, because its files carry the same unresolvable owner.
  & takeown.exe /F $target /R /D Y | Out-Null
  & icacls.exe $target /grant ("{0}:(OI)(CI)F" -f $identity.Name) /T /C | Out-Null
  Remove-Item -LiteralPath $target -Recurse -Force
  Write-Output "purged: $target"
}

Write-Output 'Restart Agent Core from the Agent Code tray so the execution runtime re-acquires its lease.'
