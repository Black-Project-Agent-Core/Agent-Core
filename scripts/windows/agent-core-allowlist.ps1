Set-StrictMode -Version Latest

function Resolve-AgentCoreAllowedRoots {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][string]$AllowListPath
  )

  $resolvedRoot = [IO.Path]::GetFullPath($Root)
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $roots = [Collections.Generic.List[string]]::new()

  if ($seen.Add($resolvedRoot)) { $roots.Add($resolvedRoot) }

  if (Test-Path -LiteralPath $AllowListPath) {
    foreach ($rawLine in @(Get-Content -LiteralPath $AllowListPath -ErrorAction Stop)) {
      $line = ([string]$rawLine).Trim()
      if (-not $line -or $line.StartsWith('#')) { continue }
      if ($line.Contains(';')) {
        Write-Warning "Ignoring Agent Core allow-list entry containing ';': $line"
        continue
      }
      if (-not [IO.Path]::IsPathRooted($line)) {
        Write-Warning "Ignoring non-absolute Agent Core allow-list entry: $line"
        continue
      }
      try {
        $resolved = [IO.Path]::GetFullPath($line)
      } catch {
        Write-Warning "Ignoring invalid Agent Core allow-list entry: $line"
        continue
      }
      if ($seen.Add($resolved)) { $roots.Add($resolved) }
    }
  }

  return @($roots)
}
