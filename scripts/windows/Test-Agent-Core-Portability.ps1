param(
    [string]$ProjectRoot = '',
    [switch]$RequireLocalRuntime
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
    $ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
} else {
    $ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
}

$package = Join-Path $ProjectRoot 'package.json'
$tunnelProfile = Join-Path $ProjectRoot 'tunnel-client\agent-core.yaml'
$uiDir = Join-Path $ProjectRoot 'dist\ui'
if (-not (Test-Path -LiteralPath $package -PathType Leaf) -or
    -not (Test-Path -LiteralPath $tunnelProfile -PathType Leaf) -or
    -not (Test-Path -LiteralPath $uiDir -PathType Container)) {
    throw "Agent Core root markers are incomplete: $ProjectRoot"
}

$targetPaths = @(
    '.env.example', 'AGENTS.md', 'MEMORY.md',
    'Start-Desktop-Commander.bat', 'Apply-Desktop-Commander-Allowlist.ps1',
    'Edit-Desktop-Commander-Allowlist.bat', 'Agent-Core-Allowlist.txt',
    'Desktop-Commander-Allowlist.txt', 'docs\CODEBASE.md',
    'src\launcher', 'src\rdc',
    'SubProject\Agent-Code\src-tauri\src\agent_core.rs'
)

$files = [System.Collections.Generic.List[string]]::new()
foreach ($relative in $targetPaths) {
    $path = Join-Path $ProjectRoot $relative
    if (Test-Path -LiteralPath $path -PathType Container) {
        Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction Stop |
            Where-Object { $_.FullName -notmatch '\\(?:bin|obj)\\' } |
            ForEach-Object { $files.Add($_.FullName) }
    } elseif (Test-Path -LiteralPath $path -PathType Leaf) {
        $files.Add($path)
    }
}

$forbidden = @(
    @{ Name = 'fixed Agent Core drive/root'; Regex = '(?i)[A-Z]:\\Projects\\Agent-Core' },
    @{ Name = 'fixed system Node path'; Regex = '(?i)C:\\Program Files\\nodejs' },
    @{ Name = 'fixed system Chrome path'; Regex = '(?i)C:\\Program Files(?: \(x86\))?\\Google\\Chrome' }
)

$violations = [System.Collections.Generic.List[string]]::new()
foreach ($file in $files | Sort-Object -Unique) {
    $content = Get-Content -LiteralPath $file -Raw -ErrorAction Stop
    foreach ($rule in $forbidden) {
        if ($content -match $rule.Regex) {
            $rootPrefix = $ProjectRoot.TrimEnd('\') + '\'
            $relative = if ($file.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                $file.Substring($rootPrefix.Length)
            } else {
                $file
            }
            $violations.Add("$relative -> $($rule.Name)")
        }
    }
}
# Active-runtime invariants that must stay relocation-safe.
$startLauncher = Get-Content -LiteralPath (Join-Path $ProjectRoot 'Start-Desktop-Commander.bat') -Raw
if ($startLauncher -notmatch '@wonderwhy-er/desktop-commander@latest') {
    $violations.Add('Start-Desktop-Commander.bat -> external RDC must track @latest for compatibility/self-repair')
}
if ($startLauncher -match '@wonderwhy-er/desktop-commander@\d+\.\d+\.\d+') {
    $violations.Add('Start-Desktop-Commander.bat -> pinned external RDC version')
}
if ($startLauncher.Contains('-ProjectRoot "%PROJECT_ROOT%"')) {
    $violations.Add('Start-Desktop-Commander.bat -> drive-root-unsafe ProjectRoot forwarding')
}
if (-not $startLauncher.Contains('-ProjectRoot "%PROJECT_ROOT%."')) {
    $violations.Add('Start-Desktop-Commander.bat -> missing drive-root-safe ProjectRoot forwarding')
}

$rdcConfigSource = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\rdc\tools\config.ts') -Raw
if ($rdcConfigSource -match '(?i)[A-Z]:\\\\Windows') {
    $violations.Add('src\rdc\tools\config.ts -> fixed Windows drive fallback')
}

$ripgrepSource = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\rdc\utils\ripgrep-resolver.ts') -Raw
if ($ripgrepSource -match '(?i)[A-Z]:\\\\Program Files') {
    $violations.Add('src\rdc\utils\ripgrep-resolver.ts -> fixed Program Files drive fallback')
}

$launcherRuntime = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\launcher\AgentCoreRuntime.cs') -Raw
foreach ($requiredEnvironmentKey in @('HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'npm_config_userconfig')) {
    if ($launcherRuntime -notmatch ('Environment\[\"' + [regex]::Escape($requiredEnvironmentKey) + '\"\]')) {
        $violations.Add("src\launcher\AgentCoreRuntime.cs -> missing project-local child environment: $requiredEnvironmentKey")
    }
}
if ($RequireLocalRuntime) {
    $node = Join-Path $ProjectRoot 'runtime\node\node.exe'
    $npm = Join-Path $ProjectRoot 'runtime\node\npm.cmd'
    $npx = Join-Path $ProjectRoot 'runtime\node\npx.cmd'
    foreach ($runtimeFile in @($node, $npm, $npx)) {
        if (-not (Test-Path -LiteralPath $runtimeFile -PathType Leaf)) {
            $violations.Add("missing project-local runtime file: $runtimeFile")
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Host 'PORTABILITY AUDIT FAIL' -ForegroundColor Red
    $violations | Sort-Object -Unique | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host 'PORTABILITY AUDIT PASS' -ForegroundColor Green
Write-Host "Project root: $ProjectRoot"
Write-Host "Project drive: $([IO.Path]::GetPathRoot($ProjectRoot))"
if ($RequireLocalRuntime) {
    Write-Host 'Project-local Node/npm/npx: present'
}
exit 0
