param(
    [ValidateSet('Audit', 'Repair', 'Bootstrap')]
    [string]$Mode = 'Audit',
    [string]$ProjectRoot = '',
    [string]$Destination = '',
    [string]$SourceZip = '',
    [string]$ChecksumFile = '',
    [string]$ExpectedZipSha256 = '',
    [string]$CorrectiveEnvExample = '',
    [string]$Repository = '',
    [switch]$AllowNetworkRecovery,
    [string]$ReleaseTag = '',
    [switch]$SkipRuntimeRepair,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$IntegrityManifestName = 'INTEGRITY-MANIFEST.json'

function Convert-ToSafeRelativePath([string]$Relative) {
    if ([string]::IsNullOrWhiteSpace($Relative)) { throw 'Integrity path is empty.' }
    $value = $Relative.Replace('/', '\')
    if ($value.StartsWith('.\')) { $value = $value.Substring(2) }
    if ([IO.Path]::IsPathRooted($value) -or $value.Contains(':') -or
        $value -match '(^|\\)\.\.(\\|$)') {
        throw "Unsafe integrity path: $Relative"
    }
    return $value
}

function Test-ProtectedRelativePath([string]$Relative) {
    $path = (Convert-ToSafeRelativePath $Relative).ToLowerInvariant()
    if ($path -eq '.env' -or ($path.StartsWith('.env.') -and $path -ne '.env.example')) { return $true }
    if ($path -eq 'tunnel-client\agent-core.yaml') { return $true }
    foreach ($prefix in @(
        '.git\',
        'secrets\',
        'runtime\bridge-auth\',
        'runtime\memory\',
        'runtime\skills\',
        'runtime\tracker\',
        'runtime\webview2\',
        'runtime\backups\',
        'runtime\partner\',
        'runtime\learning\',
        'runtime\semantic-ide\',
        'runtime\rdc\',
        'runtime\phone\',
        'do not touch without instruction explicit\'
    )) {
        if ($path.StartsWith($prefix)) { return $true }
    }
    return $false
}

function Resolve-AgentCoreRoot([string]$Candidate) {
    $current = if ($Candidate) {
        [IO.Path]::GetFullPath($Candidate)
    } else {
        [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    }
    while ($current) {
        if ((Test-Path -LiteralPath (Join-Path $current 'package.json') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $current 'scripts\windows') -PathType Container)) {
            return $current.TrimEnd('\')
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
    throw 'Agent Core project root could not be located.'
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-IntegrityManifest([string]$Root) {
    $path = Join-Path $Root $IntegrityManifestName
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    $manifest = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ([int]$manifest.schemaVersion -ne 1) { throw "Unsupported integrity schema: $($manifest.schemaVersion)" }
    if ([string]$manifest.product -ne 'Agent Core') { throw "Unexpected integrity product: $($manifest.product)" }
    if ([string]$manifest.hashAlgorithm -ne 'sha256') { throw "Unexpected integrity hash: $($manifest.hashAlgorithm)" }
    if ([string]$manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid integrity version: $($manifest.version)" }
    if ($null -eq $manifest.files) { throw 'Integrity manifest has no files array.' }
    $seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in @($manifest.files)) {
        $relative = Convert-ToSafeRelativePath ([string]$entry.path)
        if (-not $seen.Add($relative)) { throw "Duplicate integrity path: $relative" }
        if ([long]$entry.bytes -lt 0) { throw "Invalid integrity byte count: $relative" }
        if (Test-ProtectedRelativePath $relative) {
            throw "Integrity manifest attempts to govern protected/mutable path: $relative"
        }
        if ([string]$entry.sha256 -notmatch '^[0-9a-fA-F]{64}$') {
            throw "Invalid SHA-256 in integrity manifest: $relative"
        }
    }
    return $manifest
}

function Test-Integrity([string]$Root, $Manifest) {
    $issues = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in @($Manifest.files)) {
        $relative = Convert-ToSafeRelativePath ([string]$entry.path)
        $target = Join-Path $Root $relative
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
            $issues.Add([pscustomobject]@{ path = $relative; status = 'missing'; expected = $entry.sha256; actual = $null })
            continue
        }
        $length = (Get-Item -LiteralPath $target).Length
        if ($length -ne [long]$entry.bytes) {
            $issues.Add([pscustomobject]@{ path = $relative; status = 'size-mismatch'; expected = [long]$entry.bytes; actual = $length })
            continue
        }
        $actual = Get-Sha256 $target
        if ($actual -ne ([string]$entry.sha256).ToLowerInvariant()) {
            $issues.Add([pscustomobject]@{ path = $relative; status = 'hash-mismatch'; expected = $entry.sha256; actual = $actual })
        }
    }
    return @($issues)
}

function Get-PackageVersion([string]$Root) {
    $pkg = Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
    $version = [string]$pkg.version
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid Agent Core version: $version" }
    return $version
}

function Get-ExpectedArchiveHash([string]$Zip, [string]$Checksum, [string]$Explicit) {
    if ($Explicit) {
        if ($Explicit -notmatch '^[0-9a-fA-F]{64}$') { throw 'ExpectedZipSha256 must be 64 hexadecimal characters.' }
        return $Explicit.ToLowerInvariant()
    }
    if (-not $Checksum -or -not (Test-Path -LiteralPath $Checksum -PathType Leaf)) {
        throw 'Trusted ZIP checksum is required. Provide -ChecksumFile or -ExpectedZipSha256; implicit network recovery is disabled.'
    }
    $name = [IO.Path]::GetFileName($Zip)
    foreach ($line in Get-Content -LiteralPath $Checksum) {
        if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') {
            if ([IO.Path]::GetFileName($Matches[2].Trim()) -eq $name) {
                return $Matches[1].ToLowerInvariant()
            }
        }
    }
    throw "Checksum entry not found for $name"
}

function Invoke-Gh([string[]]$Arguments, [switch]$AllowFailure) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) { throw 'GitHub CLI (gh) is required for network recovery, or provide -SourceZip.' }
    $output = & $gh.Source @Arguments 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) {
        throw "gh $($Arguments -join ' ') failed ($code): $($output -join [Environment]::NewLine)"
    }
    return [pscustomobject]@{ ExitCode = $code; Output = @($output) }
}

function Resolve-ReleaseTag([string]$Version, [string]$Requested) {
    if ($Requested) { return $Requested }
    if ($Version) { return "v$Version" }
    $result = Invoke-Gh @('release', 'view', '--repo', $Repository, '--json', 'tagName', '--jq', '.tagName')
    $tag = ($result.Output -join '').Trim()
    if (-not $tag) { throw 'Could not resolve latest GitHub release tag.' }
    return $tag
}

function New-WorkRoot([string]$Root, [string]$DestinationRoot) {
    if ($Root) {
        $base = Join-Path $Root 'runtime\recovery\work'
    } else {
        $parent = Split-Path -Parent ([IO.Path]::GetFullPath($DestinationRoot))
        $base = Join-Path $parent '.agent-core-recovery'
    }
    $work = Join-Path $base ([guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    return $work
}

function Get-TrustedPackage([string]$Version, [string]$WorkRoot) {
    if (-not $SourceZip) {
        if (-not $AllowNetworkRecovery -or [string]::IsNullOrWhiteSpace($Repository)) {
            throw 'EXPLICIT_RECOVERY_SOURCE_REQUIRED: provide a trusted -SourceZip and checksum, or explicitly authorize a named non-legacy repository with -AllowNetworkRecovery.'
        }
        if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Invalid explicit recovery repository.' }
        if ($Repository -ieq 'Black-Project-Agent-Core/Agent-Core') { throw 'LEGACY_REFERENCE_ONLY: this repository is not a current-line recovery source.' }
        if (-not $ReleaseTag -or $ExpectedZipSha256 -notmatch '^[0-9a-fA-F]{64}$') {
            throw 'EXPLICIT_RECOVERY_PIN_REQUIRED: network recovery needs -ReleaseTag and an independently trusted -ExpectedZipSha256.'
        }
    }
    $zip = $SourceZip
    $checksum = $ChecksumFile
    $corrective = $CorrectiveEnvExample
    $tag = if ($ReleaseTag) {
        $ReleaseTag
    } elseif ($Version) {
        "v$Version"
    } elseif (-not $zip) {
        Resolve-ReleaseTag '' ''
    } else {
        'offline'
    }

    if (-not $zip) {
        $required = Invoke-Gh @(
            'release', 'download', $tag,
            '--repo', $Repository,
            '--pattern', 'Agent-Core-v*.zip',
            '--pattern', 'SHA256SUMS.txt',
            '--dir', $WorkRoot
        )
        $zipCandidates = @(Get-ChildItem -LiteralPath $WorkRoot -File -Filter 'Agent-Core-v*.zip')
        if ($zipCandidates.Count -ne 1) { throw "Expected exactly one Agent Core ZIP for $tag." }
        $zip = $zipCandidates[0].FullName
        $checksum = Join-Path $WorkRoot 'SHA256SUMS.txt'

        $optional = Invoke-Gh @(
            'release', 'download', $tag,
            '--repo', $Repository,
            '--pattern', 'Agent-Core-v*-env.example',
            '--dir', $WorkRoot
        ) -AllowFailure
        if ($optional.ExitCode -eq 0) {
            $envCandidates = @(Get-ChildItem -LiteralPath $WorkRoot -File -Filter 'Agent-Core-v*-env.example')
            if ($envCandidates.Count -eq 1) { $corrective = $envCandidates[0].FullName }
        }
    }

    $zip = [IO.Path]::GetFullPath($zip)
    if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "Recovery ZIP not found: $zip" }
    $expected = Get-ExpectedArchiveHash $zip $checksum $ExpectedZipSha256
    $actual = Get-Sha256 $zip
    if ($actual -ne $expected) { throw "Recovery ZIP SHA-256 mismatch. expected=$expected actual=$actual" }

    $extract = Join-Path $WorkRoot 'extract'
    New-Item -ItemType Directory -Path $extract -Force | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
    $roots = @(Get-ChildItem -LiteralPath $extract -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') -PathType Leaf
    })
    if ($roots.Count -ne 1) { throw 'Trusted ZIP did not contain exactly one Agent Core package root.' }
    $candidate = $roots[0].FullName

    if ($corrective) {
        $corrective = [IO.Path]::GetFullPath($corrective)
        if (-not (Test-Path -LiteralPath $corrective -PathType Leaf)) {
            throw "Corrective env example not found: $corrective"
        }
        Copy-Item -LiteralPath $corrective -Destination (Join-Path $candidate '.env.example') -Force
    }

    $candidateVersion = Get-PackageVersion $candidate
    if ($Version -and $candidateVersion -ne $Version) {
        throw "Recovery version mismatch. local=$Version candidate=$candidateVersion"
    }

    return [pscustomobject]@{
        Root = $candidate
        Version = $candidateVersion
        Tag = $tag
        Zip = $zip
        Sha256 = $actual
        CorrectiveEnv = $corrective
    }
}

function New-DerivedManifest([string]$Root, [string]$Version) {
    $files = [System.Collections.Generic.List[object]]::new()
    $total = [long]0
    foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -File -Force | Sort-Object FullName) {
        $relative = $file.FullName.Substring($Root.TrimEnd('\').Length + 1)
        if ($relative -eq $IntegrityManifestName -or (Test-ProtectedRelativePath $relative)) { continue }
        $hash = Get-Sha256 $file.FullName
        $files.Add([pscustomobject]@{ path = $relative.Replace('\', '/'); bytes = [long]$file.Length; sha256 = $hash })
        $total += [long]$file.Length
    }
    return [pscustomobject]@{
        schemaVersion = 1
        product = 'Agent Core'
        version = $Version
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        hashAlgorithm = 'sha256'
        policy = [pscustomobject]@{
            mode = 'trusted-archive-derived'
            unexpectedFiles = 'preserve'
            mutableExclusions = @(
                $IntegrityManifestName,
                'tunnel-client/agent-core.yaml',
                'runtime/memory/',
                'runtime/skills/'
            )
        }
        fileCount = $files.Count
        totalBytes = $total
        files = @($files)
    }
}

function Get-CandidateManifest([string]$CandidateRoot, [string]$Version) {
    $manifest = Read-IntegrityManifest $CandidateRoot
    if ($manifest) {
        if ([string]$manifest.version -ne $Version) {
            throw "Trusted package manifest version mismatch. package=$Version manifest=$($manifest.version)"
        }
        $candidateIssues = Test-Integrity $CandidateRoot $manifest
        if ($candidateIssues.Count -gt 0) {
            throw "Trusted package integrity manifest failed inside verified ZIP: $($candidateIssues.Count) issue(s)."
        }
        return [pscustomobject]@{ Manifest = $manifest; Derived = $false }
    }
    return [pscustomobject]@{
        Manifest = (New-DerivedManifest $CandidateRoot $Version)
        Derived = $true
    }
}

function Write-LocalManifest([string]$Root, $Manifest) {
    $target = Join-Path $Root $IntegrityManifestName
    $json = $Manifest | ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText($target, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}

function Repair-Integrity([string]$Root, [string]$CandidateRoot, $Manifest) {
    $issues = Test-Integrity $Root $Manifest
    if ($issues.Count -eq 0) {
        return [pscustomobject]@{ Repaired = @(); BackupRoot = $null; InitialIssues = @() }
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupRoot = Join-Path $Root "runtime\recovery\backups\$stamp"
    $repaired = [System.Collections.Generic.List[string]]::new()

    foreach ($issue in $issues) {
        $relative = Convert-ToSafeRelativePath ([string]$issue.path)
        if (Test-ProtectedRelativePath $relative) {
            throw "Refusing repair of protected/mutable path: $relative"
        }
        $entry = @($Manifest.files | Where-Object { (Convert-ToSafeRelativePath ([string]$_.path)) -eq $relative })
        if ($entry.Count -ne 1) { throw "Integrity entry lookup failed for $relative" }

        $source = Join-Path $CandidateRoot $relative
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Trusted package is missing repair source: $relative"
        }
        if ((Get-Sha256 $source) -ne ([string]$entry[0].sha256).ToLowerInvariant()) {
            throw "Trusted repair source hash mismatch: $relative"
        }

        $target = Join-Path $Root $relative
        $targetParent = Split-Path -Parent $target
        New-Item -ItemType Directory -Path $targetParent -Force | Out-Null

        if (Test-Path -LiteralPath $target -PathType Leaf) {
            $backup = Join-Path $backupRoot $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination $backup -Force
        }

        $temp = "$target.agent-core-recovery-$([guid]::NewGuid().ToString('N')).tmp"
        Copy-Item -LiteralPath $source -Destination $temp -Force
        try {
            if (Test-Path -LiteralPath $target -PathType Leaf) {
                try {
                    [IO.File]::Replace($temp, $target, $null)
                } catch {
                    Move-Item -LiteralPath $temp -Destination $target -Force
                }
            } else {
                Move-Item -LiteralPath $temp -Destination $target
            }
        } finally {
            if (Test-Path -LiteralPath $temp) {
                Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
            }
        }

        $actual = Get-Sha256 $target
        if ($actual -ne ([string]$entry[0].sha256).ToLowerInvariant()) {
            throw "Post-repair hash mismatch: $relative"
        }
        $repaired.Add($relative)
    }

    return [pscustomobject]@{
        Repaired = @($repaired)
        BackupRoot = $backupRoot
        InitialIssues = @($issues)
    }
}

function Invoke-RuntimeSelfRepair([string]$Root) {
    if ($SkipRuntimeRepair) { return 'skipped' }
    $script = Join-Path $Root 'scripts\windows\Ensure-Agent-Core-LocalRuntime.ps1'
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
        throw "Runtime self-repair script missing: $script"
    }
    $args = @(
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $script, '-ProjectRoot', $Root
    )
    & powershell.exe @args
    if ($LASTEXITCODE -ne 0) { throw "Local runtime self-repair failed with exit code $LASTEXITCODE" }
    return 'healthy'
}

function Copy-TrustedPackage([string]$CandidateRoot, [string]$TargetRoot) {
    $target = [IO.Path]::GetFullPath($TargetRoot)
    if (Test-Path -LiteralPath $target) {
        $existing = @(Get-ChildItem -LiteralPath $target -Force -ErrorAction Stop)
        if ($existing.Count -gt 0) {
            throw "Bootstrap destination must be empty: $target"
        }
    } else {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
    }

    foreach ($item in Get-ChildItem -LiteralPath $CandidateRoot -Force) {
        Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force
    }
    return $target
}

function Write-Result($Value) {
    if ($Json) {
        $Value | ConvertTo-Json -Depth 8
    } else {
        $Value
    }
}

$resolvedRoot = $null
$workRoot = $null
try {
    if ($Mode -eq 'Audit') {
        $resolvedRoot = Resolve-AgentCoreRoot $ProjectRoot
        $manifest = Read-IntegrityManifest $resolvedRoot
        if (-not $manifest) {
            if (-not $SourceZip) {
                throw 'No local integrity manifest. Audit is available on packaged releases with INTEGRITY-MANIFEST.json; use Bootstrap for a fresh recovery.'
            }
            $version = Get-PackageVersion $resolvedRoot
            $workRoot = New-WorkRoot $resolvedRoot ''
            $trusted = Get-TrustedPackage $version $workRoot
            $candidateInfo = Get-CandidateManifest $trusted.Root $trusted.Version
            $manifest = $candidateInfo.Manifest
        }
        $localVersion = Get-PackageVersion $resolvedRoot
        if ([string]$manifest.version -ne $localVersion) {
            throw "Local integrity manifest version mismatch. package=$localVersion manifest=$($manifest.version)"
        }
        $issues = Test-Integrity $resolvedRoot $manifest
        $result = [pscustomobject]@{
            mode = 'Audit'
            root = $resolvedRoot
            version = [string]$manifest.version
            ok = ($issues.Count -eq 0)
            checked = @($manifest.files).Count
            issueCount = $issues.Count
            issues = @($issues)
        }
        Write-Result $result
        if ($issues.Count -gt 0) { exit 2 }
        exit 0
    }

    if ($Mode -eq 'Repair') {
        $resolvedRoot = Resolve-AgentCoreRoot $ProjectRoot
        $version = Get-PackageVersion $resolvedRoot
        $localManifest = Read-IntegrityManifest $resolvedRoot
        if (-not $localManifest -and -not (Test-Path -LiteralPath (Join-Path $resolvedRoot 'source') -PathType Container)) {
            throw 'Repair requires a packaged Agent Core layout. For a source checkout, recover into a new empty directory with -Mode Bootstrap.'
        }
        $workRoot = New-WorkRoot $resolvedRoot ''
        $trusted = Get-TrustedPackage $version $workRoot
        $candidateInfo = Get-CandidateManifest $trusted.Root $trusted.Version
        $manifest = $candidateInfo.Manifest

        $repair = Repair-Integrity $resolvedRoot $trusted.Root $manifest
        Write-LocalManifest $resolvedRoot $manifest
        $runtime = Invoke-RuntimeSelfRepair $resolvedRoot
        $finalIssues = Test-Integrity $resolvedRoot $manifest
        $result = [pscustomobject]@{
            mode = 'Repair'
            root = $resolvedRoot
            version = $version
            releaseTag = $trusted.Tag
            archiveSha256 = $trusted.Sha256
            manifestSource = if ($candidateInfo.Derived) { 'trusted-archive-derived' } else { 'release-manifest' }
            repairedCount = @($repair.Repaired).Count
            repaired = @($repair.Repaired)
            backupRoot = $repair.BackupRoot
            runtime = $runtime
            ok = ($finalIssues.Count -eq 0)
            remainingIssueCount = $finalIssues.Count
            remainingIssues = @($finalIssues)
        }
        Write-Result $result
        if ($finalIssues.Count -gt 0) { exit 3 }
        exit 0
    }

    if ($Mode -eq 'Bootstrap') {
        if (-not $Destination) { throw 'Bootstrap requires -Destination <empty-directory>.' }
        $destinationRoot = [IO.Path]::GetFullPath($Destination)
        $workRoot = New-WorkRoot '' $destinationRoot
        $trusted = Get-TrustedPackage '' $workRoot
        $candidateInfo = Get-CandidateManifest $trusted.Root $trusted.Version
        $target = Copy-TrustedPackage $trusted.Root $destinationRoot
        $installedRecovery = Join-Path $target 'scripts\windows\Recover-Agent-Core.ps1'
        if (-not (Test-Path -LiteralPath $installedRecovery -PathType Leaf)) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $installedRecovery) -Force | Out-Null
            Copy-Item -LiteralPath $PSCommandPath -Destination $installedRecovery -Force
        }
        Write-LocalManifest $target $candidateInfo.Manifest
        $runtime = Invoke-RuntimeSelfRepair $target
        $finalIssues = Test-Integrity $target $candidateInfo.Manifest
        $result = [pscustomobject]@{
            mode = 'Bootstrap'
            root = $target
            version = $trusted.Version
            releaseTag = $trusted.Tag
            archiveSha256 = $trusted.Sha256
            manifestSource = if ($candidateInfo.Derived) { 'trusted-archive-derived' } else { 'release-manifest' }
            runtime = $runtime
            ok = ($finalIssues.Count -eq 0)
            issueCount = $finalIssues.Count
            issues = @($finalIssues)
        }
        Write-Result $result
        if ($finalIssues.Count -gt 0) { exit 4 }
        exit 0
    }
} finally {
    if ($workRoot -and (Test-Path -LiteralPath $workRoot)) {
        Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
