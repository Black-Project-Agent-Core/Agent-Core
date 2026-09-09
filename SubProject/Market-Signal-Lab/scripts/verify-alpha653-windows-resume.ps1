param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$PortableRoot = Split-Path -Parent $RepoRoot
$GoBase = Join-Path $PortableRoot 'Go'
$GoExe = Join-Path $GoBase 'sdk\go\bin\go.exe'
$LogPath = Join-Path $RepoRoot 'MSL_Alpha653_Windows_Resume_Verification.txt'
$WorkerBuild = Join-Path $RepoRoot 'engines\rust\target\release\msl-analytics-rust.exe'
$OriginalVerifiedWorkerSHA256 = '1B74CB768E396DCDC30C5BA9232A6788CA4F65B17A60B0FF2C3C3A77EB790D48'
$script:VerifiedWorkerSHA256 = ''
$ExpectedCleanupSHA256 = '7C8273979F6F37259CE089A600D7CFBBE4FED099F7C414CA4B5599271EE594BE'
$DistRoot = Join-Path $RepoRoot 'dist\alpha6.5.3-rust-production-windows-final'
$PackageRoot = Join-Path $DistRoot 'Market Signal Lab'
$PackagedWorker = Join-Path $PackageRoot 'engines\rust\msl-analytics-rust.exe'
$PackagedApp = Join-Path $PackageRoot 'Market Signal Lab.exe'

Set-Location -LiteralPath $RepoRoot
$PreviousEvidence = ''
if (Test-Path -LiteralPath $LogPath) {
    $PreviousEvidence = [System.IO.File]::ReadAllText($LogPath)
}
Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue

function Write-Log([string]$Text) {
    $Text | Tee-Object -FilePath $LogPath -Append | Out-Host
}

function Run-Native {
    param(
        [string]$Name,
        [string]$Exe,
        [string[]]$Arguments,
        [string]$WorkingDirectory = $RepoRoot
    )
    Write-Log ''
    Write-Log "=== $Name ==="
    $Old = Get-Location
    Set-Location -LiteralPath $WorkingDirectory
    $PreviousPreference = $ErrorActionPreference
    $global:ErrorActionPreference = 'Continue'
    try {
        & $Exe @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Host
        $Code = $LASTEXITCODE
    }
    finally {
        $global:ErrorActionPreference = $PreviousPreference
        Set-Location -LiteralPath $Old.Path
    }
    Write-Log ("EXIT_CODE=" + $Code)
    if ($Code -ne 0) {
        throw "$Name failed with exit code $Code"
    }
}

function Configure-IsolatedGo {
    if (-not (Test-Path -LiteralPath $GoExe)) {
        throw "Portable Go was not found: $GoExe"
    }
    $env:GOROOT = Join-Path $GoBase 'sdk\go'
    $env:GOPATH = Join-Path $GoBase 'workspace'
    $env:GOMODCACHE = Join-Path $GoBase 'modcache'
    $env:GOCACHE = Join-Path $GoBase 'buildcache'
    $env:GOTMPDIR = Join-Path $GoBase 'tmp'
    $env:GOBIN = Join-Path $GoBase 'bin'
    $env:GOENV = 'off'
    $env:GOTOOLCHAIN = 'local'
    $env:TEMP = Join-Path $PortableRoot 'Temp'
    $env:TMP = $env:TEMP
    foreach ($Dir in @($env:GOPATH,$env:GOMODCACHE,$env:GOCACHE,$env:GOTMPDIR,$env:GOBIN,$env:TEMP)) {
        New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    }
    $env:Path = "$env:GOROOT\bin;$env:Path"
}

function Assert-EvidenceIdentity {
    $CleanupPath = Join-Path $RepoRoot 'internal\storage\cleanup.go'
    $CleanupHash = (Get-FileHash -LiteralPath $CleanupPath -Algorithm SHA256).Hash
    if ($CleanupHash -ne $ExpectedCleanupSHA256) {
        throw "Windows cleanup repair source hash mismatch: $CleanupHash"
    }
    Write-Log ("CleanupSHA256=" + $CleanupHash)

    & git -C $RepoRoot diff --quiet -- engines/rust/Cargo.toml engines/rust/src
    if ($LASTEXITCODE -ne 0) {
        throw 'Rust source working tree changed since the verified production build'
    }
    & git -C $RepoRoot diff --cached --quiet -- engines/rust/Cargo.toml engines/rust/src
    if ($LASTEXITCODE -ne 0) {
        throw 'Rust source index changed since the verified production build'
    }
    Write-Log 'Rust source identity against verified Git baseline: PASS'

    if (-not (Test-Path -LiteralPath $WorkerBuild)) {
        throw "Previously verified Rust worker is missing: $WorkerBuild"
    }
    $WorkerHash = (Get-FileHash -LiteralPath $WorkerBuild -Algorithm SHA256).Hash
    $script:VerifiedWorkerSHA256 = $WorkerHash
    Write-Log ("CurrentWorkerSHA256=" + $WorkerHash)
    if ($WorkerHash -ne $OriginalVerifiedWorkerSHA256) {
        Write-Log ("INFO=Current worker hash differs from the earlier production-gate build. This is expected after a later release rebuild; fresh parity in this run establishes the current worker identity.")
        Write-Log ("OriginalVerifiedWorkerSHA256=" + $OriginalVerifiedWorkerSHA256)
    }
}

function Assert-PreviousWindowsRegressionEvidence {
    if ([string]::IsNullOrWhiteSpace($PreviousEvidence)) {
        throw 'Previous Windows resume evidence is missing; cannot safely skip the already-proven Windows regression stages'
    }
    if ($PreviousEvidence -notmatch '(?s)=== Windows legacy cleanup regression ===.*?EXIT_CODE=0') {
        throw 'Previous evidence does not prove the Windows legacy cleanup regression passed'
    }
    if ($PreviousEvidence -notmatch '(?s)=== Windows full Go regression ===.*?EXIT_CODE=0') {
        throw 'Previous evidence does not prove the Windows full Go regression passed'
    }
    if ($PreviousEvidence -notmatch 'ERROR=Staged diff check failed with exit code 2') {
        throw 'Previous evidence did not stop specifically at the staged diff hygiene gate'
    }
    Write-Log 'Previous Windows cleanup regression evidence: PASS'
    Write-Log 'Previous Windows full Go regression evidence: PASS'
    Write-Log 'Resume point verified: staged diff hygiene gate'
}

function Assert-NoForbiddenRuntimeTokens {
    $Forbidden = @('ModeGoNative','ModeShadow','NewGoEngine','ShadowEngine','RustFallbackEngine','SetAnalyticsEngineMode','Purge Legacy Demo Data','purgeLegacyDemoData','/api/system/purge-legacy-demo','/api/system/demo-integrity')
    $Files = Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'internal') -Recurse -File | Where-Object { $_.Name -notlike '*_test.go' -and ($_.Extension -eq '.go' -or $_.Extension -eq '.html' -or $_.Extension -eq '.js') }
    $Files += Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'cmd\market-signal-lab') -Recurse -File -Filter '*.go' | Where-Object { $_.Name -notlike '*_test.go' }
    foreach ($Token in $Forbidden) {
        foreach ($File in $Files) {
            if ((Get-Content -LiteralPath $File.FullName -Raw) -match [regex]::Escape($Token)) {
                throw "Forbidden production runtime token '$Token' remains in $($File.FullName)"
            }
        }
    }
    Write-Log 'Production runtime forbidden-token scan: PASS'
}

try {
    Write-Log 'Market Signal Lab - Alpha 6.5.3 Windows Resume Verification'
    Write-Log ("StartedAt=" + (Get-Date).ToString('o'))
    Write-Log ("RepoRoot=" + $RepoRoot)
    Configure-IsolatedGo
    Assert-EvidenceIdentity

    Assert-PreviousWindowsRegressionEvidence
    Run-Native 'Go version' $GoExe @('version')
    Run-Native 'Staged diff check' 'git' @('diff','--cached','--check')

    $env:MSL_RUST_WORKER = $WorkerBuild
    Run-Native 'Post-cutover Rust frozen reference parity' $GoExe @('test','./internal/analyticsengine','-run','^TestRustReferenceVectorParity$','-count=1','-v')
    Run-Native 'Post-cutover Rust deterministic parity 10K 100K 1M' $GoExe @('test','./internal/analyticsengine','-run','^TestParityCorpus$','-count=1','-v')
    Assert-NoForbiddenRuntimeTokens

    Remove-Item -LiteralPath $DistRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path (Join-Path $PackageRoot 'engines\rust') | Out-Null
    Run-Native 'Build Market Signal Lab Windows GUI' $GoExe @('build','-trimpath','-ldflags=-s -w -H=windowsgui','-o',$PackagedApp,'./cmd/market-signal-lab')
    Copy-Item -LiteralPath $WorkerBuild -Destination $PackagedWorker -Force
    Copy-Item -LiteralPath (Join-Path $RepoRoot 'README.md') -Destination (Join-Path $PackageRoot 'README.md') -Force
    if (Test-Path -LiteralPath (Join-Path $RepoRoot 'companion\browser-extension')) {
        Copy-Item -LiteralPath (Join-Path $RepoRoot 'companion\browser-extension') -Destination (Join-Path $PackageRoot 'browser-companion') -Recurse -Force
    }

    $AppHash = (Get-FileHash -LiteralPath $PackagedApp -Algorithm SHA256).Hash
    $PackagedWorkerHash = (Get-FileHash -LiteralPath $PackagedWorker -Algorithm SHA256).Hash
    if ([string]::IsNullOrWhiteSpace($script:VerifiedWorkerSHA256)) {
        throw 'Current Rust worker identity was not established before packaging'
    }
    if ($PackagedWorkerHash -ne $script:VerifiedWorkerSHA256) {
        throw "Packaged Rust worker hash mismatch: $PackagedWorkerHash expected $($script:VerifiedWorkerSHA256)"
    }
    Write-Log ("PackagedAppSHA256=" + $AppHash)
    Write-Log ("PackagedWorkerSHA256=" + $PackagedWorkerHash)

    $env:MSL_RUST_WORKER = $PackagedWorker
    Run-Native 'Packaged worker deterministic operation smoke' $GoExe @('test','./internal/analyticsengine','-run','^TestRustReferenceVectorParity/distribution/identical_distribution$','-count=1','-v')

    $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
    $Listener.Start()
    $Port = $Listener.LocalEndpoint.Port
    $Listener.Stop()
    $SmokeData = Join-Path $DistRoot 'smoke-data'
    New-Item -ItemType Directory -Force -Path $SmokeData | Out-Null
    $AppProcess = Start-Process -FilePath $PackagedApp -ArgumentList @('--port',[string]$Port,'--data-dir',$SmokeData,'--no-open') -WorkingDirectory $PackageRoot -PassThru
    try {
        $Health = $null
        for ($i = 0; $i -lt 50; $i++) {
            Start-Sleep -Milliseconds 200
            try {
                $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/system/analytics-engine" -TimeoutSec 2
                break
            }
            catch {}
        }
        if ($null -eq $Health) {
            throw 'Packaged application did not expose analytics health endpoint'
        }
        if ($Health.applicationHost.status -ne 'healthy') {
            throw "Application host not healthy: $($Health.applicationHost.status)"
        }
        if ($Health.productionAnalytics.status -ne 'healthy') {
            throw "Production Rust analytics not healthy: $($Health.productionAnalytics.status) $($Health.productionAnalytics.message)"
        }
        Write-Log 'Packaged pair health smoke: PASS'
    }
    finally {
        if ($null -ne $AppProcess -and -not $AppProcess.HasExited) {
            Stop-Process -Id $AppProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Log ("PackageRoot=" + $PackageRoot)
    Write-Log ("CompletedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=PASS'
    Write-Host ''
    Write-Host 'Alpha 6.5.3 Windows resume verification PASSED.' -ForegroundColor Green
    Write-Host "Send this file back to ChatGPT: $LogPath"
    exit 0
}
catch {
    Write-Log ''
    Write-Log ("ERROR=" + $_.Exception.Message)
    Write-Log ("FailedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=FAIL'
    Write-Host ''
    Write-Host 'Alpha 6.5.3 Windows resume verification FAILED.' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Send this file back to ChatGPT: $LogPath"
    exit 1
}
