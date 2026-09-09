param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$LogPath = Join-Path $RepoRoot 'MSL_Rust_Production_Gate.txt'
$Manifest = Join-Path $RepoRoot 'engines\rust\Cargo.toml'
$WindowsWorker = Join-Path $RepoRoot 'engines\rust\target\release\msl-analytics-rust.exe'

Set-Location $RepoRoot
Remove-Item $LogPath -Force -ErrorAction SilentlyContinue

function Write-Log([string]$Text) {
    $Text | Tee-Object -FilePath $LogPath -Append
}

function Run-Native {
    param(
        [string]$Name,
        [string]$Exe,
        [string[]]$Arguments
    )

    Write-Log ''
    Write-Log "=== $Name ==="

    # Windows PowerShell 5.1 can surface native-process stderr as an ErrorRecord
    # when ErrorActionPreference is Stop, even when the native process exits 0.
    # rustup --version legitimately writes informational lines to stderr.
    # Judge native commands by their real exit code instead of stderr presence.
    $PreviousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Exe @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append
        $Code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }

    Write-Log "EXIT_CODE=$Code"
    if ($Code -ne 0) {
        throw "$Name failed with exit code $Code. Send $LogPath back for diagnosis."
    }
}

try {
    Write-Log 'Market Signal Lab - Rust Production Gate'
    Write-Log ("StartedAt=" + (Get-Date).ToString('o'))
    Write-Log ("RepoRoot=" + $RepoRoot)
    Write-Log ("OS=" + [System.Environment]::OSVersion.VersionString)

    if (-not (Test-Path $Manifest)) {
        throw "Rust manifest not found: $Manifest"
    }

    Run-Native 'rustc version' 'rustc' @('--version')
    Run-Native 'cargo version' 'cargo' @('--version')
    Run-Native 'rustup version' 'rustup' @('--version')
    Run-Native 'rustup active toolchain' 'rustup' @('show','active-toolchain')
    Run-Native 'ensure clippy' 'rustup' @('component','add','clippy')

    Run-Native 'cargo test' 'cargo' @('test','--manifest-path',$Manifest,'--all-targets','--verbose')
    Run-Native 'cargo clippy strict' 'cargo' @('clippy','--manifest-path',$Manifest,'--all-targets','--','-D','warnings')
    Run-Native 'cargo release build' 'cargo' @('build','--release','--manifest-path',$Manifest)

    Write-Log ''
    Write-Log '=== Windows worker ==='
    if (-not (Test-Path $WindowsWorker)) {
        throw "Release build succeeded but worker was not found: $WindowsWorker"
    }

    $Worker = Get-Item $WindowsWorker
    $Hash = Get-FileHash $WindowsWorker -Algorithm SHA256
    Write-Log ("WorkerPath=" + $Worker.FullName)
    Write-Log ("WorkerBytes=" + $Worker.Length)
    Write-Log ("WorkerSHA256=" + $Hash.Hash)
    Write-Log ("CompletedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=PASS'

    Write-Host ''
    Write-Host 'Rust production gate PASSED.' -ForegroundColor Green
    Write-Host "Send this file back to ChatGPT: $LogPath"
    Write-Host "Worker built at: $WindowsWorker"
    exit 0
}
catch {
    Write-Log ''
    Write-Log ("ERROR=" + $_.Exception.Message)
    Write-Log ("FailedAt=" + (Get-Date).ToString('o'))
    Write-Log 'RESULT=FAIL'

    Write-Host ''
    Write-Host 'Rust production gate FAILED.' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Send this file back to ChatGPT: $LogPath"
    exit 1
}
