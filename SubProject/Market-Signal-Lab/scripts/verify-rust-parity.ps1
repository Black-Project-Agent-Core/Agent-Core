param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$WorkerPath = '',
    [string]$GoExe = ''
)

$ErrorActionPreference = 'Stop'
$LogPath = Join-Path $RepoRoot 'MSL_Rust_Parity_Gate.txt'
if ([string]::IsNullOrWhiteSpace($WorkerPath)) {
    $WorkerPath = Join-Path $RepoRoot 'engines\rust\target\release\msl-analytics-rust.exe'
}

Set-Location $RepoRoot
Remove-Item $LogPath -Force -ErrorAction SilentlyContinue

function Write-Log([string]$Text) {
    Add-Content -LiteralPath $LogPath -Value $Text
    Write-Host $Text
}

function Run-Native {
    param(
        [string]$Name,
        [string]$Exe,
        [string[]]$Arguments
    )

    Write-Log ''
    Write-Log "=== $Name ==="
    $previousPreference = $ErrorActionPreference
    $global:ErrorActionPreference = 'Continue'
    try {
        & $Exe @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append
        $Code = $LASTEXITCODE
    }
    finally {
        $global:ErrorActionPreference = $previousPreference
    }
    Write-Log "EXIT_CODE=$Code"
    if ($Code -ne 0) {
        throw "$Name failed with exit code $Code. Send $LogPath back for diagnosis."
    }
}

function Resolve-PortableGo {
    param([string]$RequestedGoExe)

    if (-not [string]::IsNullOrWhiteSpace($RequestedGoExe)) {
        if (-not (Test-Path -LiteralPath $RequestedGoExe)) {
            throw "Requested Go executable not found: $RequestedGoExe"
        }
        return (Resolve-Path -LiteralPath $RequestedGoExe).Path
    }

    # Repo layout expected by the isolated Windows test setup:
    # <portable-root>\Market-Signal-Lab
    # <portable-root>\Go\sdk\go\bin\go.exe
    $PortableRoot = Split-Path -Parent $RepoRoot
    $GoBase = Join-Path $PortableRoot 'Go'
    $PortableGo = Join-Path $GoBase 'sdk\go\bin\go.exe'

    if (Test-Path -LiteralPath $PortableGo) {
        $env:GOROOT = Join-Path $GoBase 'sdk\go'
        $env:GOPATH = Join-Path $GoBase 'workspace'
        $env:GOMODCACHE = Join-Path $GoBase 'modcache'
        $env:GOCACHE = Join-Path $GoBase 'buildcache'
        $env:GOTMPDIR = Join-Path $GoBase 'tmp'
        $env:GOBIN = Join-Path $GoBase 'bin'
        $env:GOENV = 'off'
        $env:GOTOOLCHAIN = 'local'
        $env:APPDATA = Join-Path $GoBase 'AppData'
        $env:LOCALAPPDATA = Join-Path $GoBase 'LocalAppData'
        $env:TEMP = Join-Path $PortableRoot 'Temp'
        $env:TMP = $env:TEMP

        foreach ($Directory in @(
            $env:GOPATH,
            $env:GOMODCACHE,
            $env:GOCACHE,
            $env:GOTMPDIR,
            $env:GOBIN,
            $env:APPDATA,
            $env:LOCALAPPDATA,
            $env:TEMP
        )) {
            New-Item -ItemType Directory -Force -Path $Directory | Out-Null
        }

        $env:Path = "$env:GOROOT\bin;$env:Path"
        Write-Log 'GoMode=portable-isolated'
        Write-Log ("PortableRoot=" + $PortableRoot)
        Write-Log ("GOROOT=" + $env:GOROOT)
        Write-Log ("GOPATH=" + $env:GOPATH)
        Write-Log ("GOMODCACHE=" + $env:GOMODCACHE)
        Write-Log ("GOCACHE=" + $env:GOCACHE)
        Write-Log ("GOTMPDIR=" + $env:GOTMPDIR)
        return (Resolve-Path -LiteralPath $PortableGo).Path
    }

    $Command = Get-Command go -ErrorAction SilentlyContinue
    if ($null -eq $Command) {
        throw "Go was not found. Expected portable Go at $PortableGo or a go executable in PATH."
    }
    Write-Log 'GoMode=PATH'
    return $Command.Source
}

try {
    Write-Log 'Market Signal Lab - Rust Parity Gate'
    Write-Log ("StartedAt=" + (Get-Date).ToString('o'))
    Write-Log ("RepoRoot=" + $RepoRoot)
    Write-Log ("WorkerPath=" + $WorkerPath)

    if (-not (Test-Path $WorkerPath)) {
        throw "Compiled Rust worker not found: $WorkerPath"
    }
    $Worker = Get-Item $WorkerPath
    $Hash = Get-FileHash $WorkerPath -Algorithm SHA256
    Write-Log ("WorkerBytes=" + $Worker.Length)
    Write-Log ("WorkerSHA256=" + $Hash.Hash)

    $ResolvedGoExe = Resolve-PortableGo $GoExe
    Write-Log ("GoExe=" + $ResolvedGoExe)

    $env:MSL_RUST_WORKER = $WorkerPath

    Run-Native 'Go version' $ResolvedGoExe @('version')
    Run-Native 'Frozen Alpha 6.5.2.1 reference vectors' $ResolvedGoExe @('test','./internal/analyticsengine','-run','^TestRustReferenceVectorParity$','-count=1','-v')
    Run-Native 'Deterministic parity 10K' $ResolvedGoExe @('test','./internal/analyticsengine','-run','^TestParityCorpus/10000$','-count=1','-v')
    Run-Native 'Deterministic parity 100K' $ResolvedGoExe @('test','./internal/analyticsengine','-run','^TestParityCorpus/100000$','-count=1','-v')
    Run-Native 'Deterministic parity 1M' $ResolvedGoExe @('test','./internal/analyticsengine','-run','^TestParityCorpus/1000000$','-count=1','-v')

    Write-Log ''
    Write-Log ("CompletedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=PASS'
    Write-Host ''
    Write-Host 'Rust parity gate PASSED.' -ForegroundColor Green
    Write-Host "Send this file back to ChatGPT: $LogPath"
    exit 0
}
catch {
    Write-Log ''
    Write-Log ("ERROR=" + $_.Exception.Message)
    Write-Log ("FailedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=FAIL'
    Write-Host ''
    Write-Host 'Rust parity gate FAILED.' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Send this file back to ChatGPT: $LogPath"
    exit 1
}
