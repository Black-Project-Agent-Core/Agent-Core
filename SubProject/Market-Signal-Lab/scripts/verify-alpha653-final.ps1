param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$PortableRoot = Split-Path -Parent $RepoRoot
$GoBase = Join-Path $PortableRoot 'Go'
$RustBase = Join-Path $PortableRoot 'Rust'
$LogPath = Join-Path $RepoRoot 'MSL_Alpha653_Final_Verification.txt'
$DistRoot = Join-Path $RepoRoot 'dist\alpha6.5.3-rust-production-verification'
$PackageRoot = Join-Path $DistRoot 'Market Signal Lab'
$SourceStage = Join-Path $DistRoot 'source-stage'
$SourceExtract = Join-Path $DistRoot 'source-retest'
$SourceZip = Join-Path $DistRoot 'Market_Signal_Lab_v0.3_Alpha6.5.3_Source.zip'
$GoExe = Join-Path $GoBase 'sdk\go\bin\go.exe'
$CargoExe = Join-Path $RustBase 'cargo\bin\cargo.exe'
$RustcExe = Join-Path $RustBase 'cargo\bin\rustc.exe'
$RustupExe = Join-Path $RustBase 'cargo\bin\rustup.exe'
$WorkerBuild = Join-Path $RepoRoot 'engines\rust\target\release\msl-analytics-rust.exe'
$PackagedWorker = Join-Path $PackageRoot 'engines\rust\msl-analytics-rust.exe'
$PackagedApp = Join-Path $PackageRoot 'Market Signal Lab.exe'

Set-Location $RepoRoot
Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue

function Write-Log([string]$Text) {
    $Text | Tee-Object -FilePath $LogPath -Append | Out-Host
}

function Run-Native {
    param([string]$Name,[string]$Exe,[string[]]$Arguments,[string]$WorkingDirectory=$RepoRoot)
    Write-Log ''
    Write-Log "=== $Name ==="
    $old = Get-Location
    Set-Location -LiteralPath $WorkingDirectory
    $previousPreference = $ErrorActionPreference
    $global:ErrorActionPreference = 'Continue'
    try {
        & $Exe @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Host
        $Code = $LASTEXITCODE
    }
    finally {
        $global:ErrorActionPreference = $previousPreference
        Set-Location $old
    }
    Write-Log "EXIT_CODE=$Code"
    if ($Code -ne 0) { throw "$Name failed with exit code $Code" }
}

function Configure-IsolatedToolchains {
    foreach ($Path in @($GoExe,$CargoExe,$RustcExe,$RustupExe)) {
        if (-not (Test-Path -LiteralPath $Path)) { throw "Required portable tool not found: $Path" }
    }
    $env:GOROOT = Join-Path $GoBase 'sdk\go'
    $env:GOPATH = Join-Path $GoBase 'workspace'
    $env:GOMODCACHE = Join-Path $GoBase 'modcache'
    $env:GOCACHE = Join-Path $GoBase 'buildcache'
    $env:GOTMPDIR = Join-Path $GoBase 'tmp'
    $env:GOBIN = Join-Path $GoBase 'bin'
    $env:GOENV = 'off'
    $env:GOTOOLCHAIN = 'local'
    $env:CARGO_HOME = Join-Path $RustBase 'cargo'
    $env:RUSTUP_HOME = Join-Path $RustBase 'rustup'
    $env:TEMP = Join-Path $PortableRoot 'Temp'
    $env:TMP = $env:TEMP
    foreach ($Dir in @($env:GOPATH,$env:GOMODCACHE,$env:GOCACHE,$env:GOTMPDIR,$env:GOBIN,$env:TEMP)) {
        New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    }
    $env:Path = "$env:GOROOT\bin;$env:CARGO_HOME\bin;$env:Path"
}

function Assert-NoForbiddenRuntimeTokens {
    $Forbidden = @('ModeGoNative','ModeShadow','NewGoEngine','ShadowEngine','RustFallbackEngine','SetAnalyticsEngineMode','Purge Legacy Demo Data','purgeLegacyDemoData','/api/system/purge-legacy-demo','/api/system/demo-integrity')
    $Files = Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'internal') -Recurse -File -Filter '*.go' | Where-Object { $_.Name -notlike '*_test.go' }
    $Files += Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'cmd\market-signal-lab') -Recurse -File -Filter '*.go' | Where-Object { $_.Name -notlike '*_test.go' }
    $Files += Get-ChildItem -LiteralPath (Join-Path $RepoRoot 'internal\web') -Recurse -File -Include '*.html','*.js'
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
    Write-Log 'Market Signal Lab - Alpha 6.5.3 Final Verification Gate'
    Write-Log ("StartedAt=" + (Get-Date).ToString('o'))
    Write-Log ("RepoRoot=" + $RepoRoot)
    Configure-IsolatedToolchains

    Run-Native 'Go version' $GoExe @('version')
    Run-Native 'Rust compiler version' $RustcExe @('--version')
    Run-Native 'Cargo version' $CargoExe @('--version')
    Run-Native 'Rust unit tests' $CargoExe @('test','--manifest-path',(Join-Path $RepoRoot 'engines\rust\Cargo.toml'),'--all-targets')
    Run-Native 'Rust clippy strict' $CargoExe @('clippy','--manifest-path',(Join-Path $RepoRoot 'engines\rust\Cargo.toml'),'--all-targets','--','-D','warnings')
    Run-Native 'Rust release build' $CargoExe @('build','--release','--manifest-path',(Join-Path $RepoRoot 'engines\rust\Cargo.toml'))

    if (-not (Test-Path -LiteralPath $WorkerBuild)) { throw "Rust worker missing after release build: $WorkerBuild" }
    $env:MSL_RUST_WORKER = $WorkerBuild
    Run-Native 'Go full regression' $GoExe @('test','./...','-count=1')
    Run-Native 'Go vet' $GoExe @('vet','./...')
    Run-Native 'Rust frozen reference parity' $GoExe @('test','./internal/analyticsengine','-run','^TestRustReferenceVectorParity$','-count=1','-v')
    Run-Native 'Rust deterministic parity 10K 100K 1M' $GoExe @('test','./internal/analyticsengine','-run','^TestParityCorpus$','-count=1','-v')

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
    $WorkerHash = (Get-FileHash -LiteralPath $PackagedWorker -Algorithm SHA256).Hash
    Write-Log ("PackagedAppSHA256=" + $AppHash)
    Write-Log ("PackagedWorkerSHA256=" + $WorkerHash)

    # Verify the packaged worker, not the build-tree worker.
    $env:MSL_RUST_WORKER = $PackagedWorker
    Run-Native 'Packaged worker deterministic operation smoke' $GoExe @('test','./internal/analyticsengine','-run','^TestRustReferenceVectorParity/distribution/identical_distribution$','-count=1','-v')

    # Start the packaged application and verify component health sees Rust as healthy.
    $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
    $Listener.Start(); $Port = $Listener.LocalEndpoint.Port; $Listener.Stop()
    $SmokeData = Join-Path $DistRoot 'smoke-data'
    New-Item -ItemType Directory -Force -Path $SmokeData | Out-Null
    $AppProcess = Start-Process -FilePath $PackagedApp -ArgumentList @('--port',[string]$Port,'--data-dir',$SmokeData,'--no-open') -WorkingDirectory $PackageRoot -PassThru
    try {
        $Health = $null
        for ($i=0; $i -lt 50; $i++) {
            Start-Sleep -Milliseconds 200
            try { $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/system/analytics-engine" -TimeoutSec 2; break } catch {}
        }
        if ($null -eq $Health) { throw 'Packaged application did not expose analytics health endpoint' }
        if ($Health.applicationHost.status -ne 'healthy') { throw "Application host not healthy: $($Health.applicationHost.status)" }
        if ($Health.productionAnalytics.status -ne 'healthy') { throw "Production Rust analytics not healthy: $($Health.productionAnalytics.status) $($Health.productionAnalytics.message)" }
        Write-Log 'Packaged pair health smoke: PASS'
    }
    finally {
        if ($null -ne $AppProcess -and -not $AppProcess.HasExited) { Stop-Process -Id $AppProcess.Id -Force -ErrorAction SilentlyContinue }
    }

    # Create source archive from tracked files only.
    New-Item -ItemType Directory -Force -Path $SourceStage | Out-Null
    $Tracked = & git -C $RepoRoot ls-files
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed while creating source archive' }
    foreach ($Rel in $Tracked) {
        $From = Join-Path $RepoRoot $Rel
        $To = Join-Path $SourceStage $Rel
        $Parent = Split-Path -Parent $To
        if ($Parent) { New-Item -ItemType Directory -Force -Path $Parent | Out-Null }
        Copy-Item -LiteralPath $From -Destination $To -Force
    }
    $CargoLock = Join-Path $RepoRoot 'engines\rust\Cargo.lock'
    if (Test-Path -LiteralPath $CargoLock) {
        $CargoLockDst = Join-Path $SourceStage 'engines\rust\Cargo.lock'
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CargoLockDst) | Out-Null
        Copy-Item -LiteralPath $CargoLock -Destination $CargoLockDst -Force
    }
    Compress-Archive -Path (Join-Path $SourceStage '*') -DestinationPath $SourceZip -Force

    # Retest extracted source archive.
    Remove-Item -LiteralPath $SourceExtract -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $SourceExtract | Out-Null
    Expand-Archive -LiteralPath $SourceZip -DestinationPath $SourceExtract -Force
    Run-Native 'Extracted source Rust tests' $CargoExe @('test','--manifest-path',(Join-Path $SourceExtract 'engines\rust\Cargo.toml'),'--all-targets') $SourceExtract
    Run-Native 'Extracted source Rust clippy' $CargoExe @('clippy','--manifest-path',(Join-Path $SourceExtract 'engines\rust\Cargo.toml'),'--all-targets','--','-D','warnings') $SourceExtract
    Run-Native 'Extracted source Go tests' $GoExe @('test','./...','-count=1') $SourceExtract
    Run-Native 'Extracted source Go vet' $GoExe @('vet','./...') $SourceExtract

    Write-Log ("PackageRoot=" + $PackageRoot)
    Write-Log ("SourceZip=" + $SourceZip)
    Write-Log ("CompletedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=PASS'
    Write-Host ''
    Write-Host 'Alpha 6.5.3 final verification gate PASSED.' -ForegroundColor Green
    Write-Host "Send this file back to ChatGPT: $LogPath"
    exit 0
}
catch {
    Write-Log ''
    Write-Log ("ERROR=" + $_.Exception.Message)
    Write-Log ("FailedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=FAIL'
    Write-Host ''
    Write-Host 'Alpha 6.5.3 final verification gate FAILED.' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Send this file back to ChatGPT: $LogPath"
    exit 1
}
