param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$WorkerPath = '',
    [string]$GoExe = '',
    [int]$Iterations = 5
)

$ErrorActionPreference = 'Stop'
$SummaryPath = Join-Path $RepoRoot 'MSL_Rust_Benchmark_Gate.txt'
$JsonPath = Join-Path $RepoRoot 'MSL_Rust_Benchmark_Evidence.json'
$StderrPath = Join-Path $RepoRoot 'MSL_Rust_Benchmark_Stderr.txt'

if ([string]::IsNullOrWhiteSpace($WorkerPath)) {
    $WorkerPath = Join-Path $RepoRoot 'engines\rust\target\release\msl-analytics-rust.exe'
}
if ($Iterations -lt 1) { $Iterations = 1 }

Set-Location $RepoRoot
Remove-Item $SummaryPath, $JsonPath, $StderrPath -Force -ErrorAction SilentlyContinue

function Write-Log([string]$Text) {
    $Text | Tee-Object -FilePath $SummaryPath -Append | Out-Host
}

function Resolve-IsolatedGo([string]$RequestedGoExe) {
    if (-not [string]::IsNullOrWhiteSpace($RequestedGoExe)) {
        if (-not (Test-Path -LiteralPath $RequestedGoExe)) {
            throw "Requested Go executable not found: $RequestedGoExe"
        }
        return (Resolve-Path -LiteralPath $RequestedGoExe).Path
    }

    $PortableRoot = Split-Path -Parent $RepoRoot
    $GoBase = Join-Path $PortableRoot 'Go'
    $PortableGo = Join-Path $GoBase 'sdk\go\bin\go.exe'
    if (-not (Test-Path -LiteralPath $PortableGo)) {
        $Command = Get-Command go -ErrorAction SilentlyContinue
        if ($null -eq $Command) {
            throw "Go was not found. Expected portable Go at $PortableGo or a go executable in PATH."
        }
        return $Command.Source
    }

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
    return (Resolve-Path -LiteralPath $PortableGo).Path
}

try {
    Write-Log 'Market Signal Lab - Rust Analytics Benchmark Gate'
    Write-Log ("StartedAt=" + (Get-Date).ToString('o'))
    Write-Log ("RepoRoot=" + $RepoRoot)
    Write-Log ("WorkerPath=" + $WorkerPath)
    Write-Log ("Iterations=" + $Iterations)

    if (-not (Test-Path -LiteralPath $WorkerPath)) {
        throw "Compiled Rust worker not found: $WorkerPath"
    }

    $Worker = Get-Item -LiteralPath $WorkerPath
    $WorkerHash = Get-FileHash -LiteralPath $WorkerPath -Algorithm SHA256
    Write-Log ("WorkerBytes=" + $Worker.Length)
    Write-Log ("WorkerSHA256=" + $WorkerHash.Hash)

    $ResolvedGoExe = Resolve-IsolatedGo $GoExe
    Write-Log ("GoExe=" + $ResolvedGoExe)

    $QuotedWorker = '"' + $WorkerPath + '"'
    $Arguments = @(
        'run',
        './cmd/analytics-bench',
        '-worker',
        $QuotedWorker,
        '-iterations',
        [string]$Iterations
    )

    Write-Log ''
    Write-Log '=== Benchmark execution ==='
    $Process = Start-Process -FilePath $ResolvedGoExe -ArgumentList $Arguments -WorkingDirectory $RepoRoot -NoNewWindow -Wait -PassThru -RedirectStandardOutput $JsonPath -RedirectStandardError $StderrPath
    Write-Log ("EXIT_CODE=" + $Process.ExitCode)

    if (Test-Path -LiteralPath $StderrPath) {
        $Stderr = Get-Content -LiteralPath $StderrPath -Raw -ErrorAction SilentlyContinue
        if (-not [string]::IsNullOrWhiteSpace($Stderr)) {
            Write-Log '=== go run stderr ==='
            Write-Log $Stderr.Trim()
        }
    }

    if ($Process.ExitCode -ne 0) {
        if (Test-Path -LiteralPath $JsonPath) {
            Write-Log '=== benchmark JSON ==='
            Write-Log (Get-Content -LiteralPath $JsonPath -Raw)
        }
        throw "analytics benchmark exited with code $($Process.ExitCode)"
    }

    if (-not (Test-Path -LiteralPath $JsonPath)) {
        throw "benchmark JSON was not produced: $JsonPath"
    }

    $RawJson = Get-Content -LiteralPath $JsonPath -Raw
    $Evidence = $RawJson | ConvertFrom-Json
    if ($Evidence.status -ne 'verified') {
        throw "benchmark did not reach verified status: $($Evidence.status) - $($Evidence.message)"
    }
    if ($null -eq $Evidence.parity -or @($Evidence.parity).Count -ne 3) {
        throw "benchmark evidence does not contain all 10K/100K/1M parity reports"
    }
    foreach ($Report in @($Evidence.parity)) {
        if (-not $Report.verified -or $Report.mismatchCount -ne 0 -or $Report.workerErrorCount -ne 0) {
            throw "benchmark parity gate failed at $($Report.observations) observations"
        }
    }
    if ($null -eq $Evidence.benchmarks -or @($Evidence.benchmarks).Count -ne 6) {
        throw "benchmark evidence expected 6 metrics (Go/Rust x 10K/100K/1M)"
    }

    Write-Log ''
    Write-Log '=== Verified benchmark summary ==='
    Write-Log ("RustStartupMicros=" + $Evidence.rustStartupMicros)
    foreach ($Metric in @($Evidence.benchmarks)) {
        Write-Log (("Engine={0} Observations={1} Iterations={2} MedianMicros={3} P95Micros={4} ThroughputObsPerSecond={5:N2}" -f $Metric.engine, $Metric.observations, $Metric.iterations, $Metric.medianMicros, $Metric.p95Micros, $Metric.throughputObsPerSecond))
    }
    Write-Log ("EvidenceJson=" + $JsonPath)
    Write-Log ("CompletedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=PASS'

    Write-Host ''
    Write-Host 'Rust analytics benchmark gate PASSED.' -ForegroundColor Green
    Write-Host "Send these files back to ChatGPT:"
    Write-Host "  $SummaryPath"
    Write-Host "  $JsonPath"
    exit 0
}
catch {
    Write-Log ''
    Write-Log ("ERROR=" + $_.Exception.Message)
    Write-Log ("FailedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=FAIL'
    Write-Host ''
    Write-Host 'Rust analytics benchmark gate FAILED.' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Send this file back to ChatGPT: $SummaryPath"
    exit 1
}
