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
    '.env.example', 'AGENTS.md',
    'Start-Desktop-Commander.bat', 'Apply-Desktop-Commander-Allowlist.ps1',
    'Edit-Desktop-Commander-Allowlist.bat', 'Agent-Core-Allowlist.txt',
    'Desktop-Commander-Allowlist.txt',
    'src\config.ts', 'src\index.ts', 'src\portability',
    'src\launcher', 'src\rdc', 'src\code-intelligence',
    'src\semantic-ide', 'src\memory', 'src\learning', 'src\phone',
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

$pathPolicyScript = Join-Path $ProjectRoot 'scripts\portability\check-path-policy.mjs'
$localNode = Join-Path $ProjectRoot 'runtime\node\node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$policyNode = if (Test-Path -LiteralPath $localNode -PathType Leaf) {
    $localNode
} elseif ($nodeCommand) {
    $nodeCommand.Source
} else {
    $null
}
if (-not $policyNode) {
    $violations.Add('dynamic path governance -> no Node runtime available to run path policy')
} elseif (-not (Test-Path -LiteralPath $pathPolicyScript -PathType Leaf)) {
    $violations.Add('dynamic path governance -> path policy checker missing')
} else {
    $policyOutput = @(& $policyNode $pathPolicyScript --root $ProjectRoot 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $detail = ($policyOutput | Select-Object -First 8) -join ' | '
        $violations.Add("dynamic path governance -> $detail")
    }
}

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

$configSource = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\config.ts') -Raw
if ($configSource -notmatch 'resolveProjectRoot' -or $configSource -notmatch 'resolvePortableProjectPath') {
    $violations.Add('src\config.ts -> canonical portable-root resolution contract missing')
}
$indexSource = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\index.ts') -Raw
if ($indexSource -match 'MemoryService\.initialize\(process\.cwd\(\)') {
    $violations.Add('src\index.ts -> MemoryService still depends on process.cwd()')
}
$semanticRegistry = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\semantic-ide\provider-registry.ts') -Raw
if ($semanticRegistry -match 'cwd:\s*process\.cwd\(\)') {
    $violations.Add('src\semantic-ide\provider-registry.ts -> provider probe still depends on process.cwd()')
}
$learningPaths = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\learning\paths.ts') -Raw
if ($learningPaths -match 'process\.cwd\(\)') {
    $violations.Add('src\learning\paths.ts -> Learning state root still depends on process.cwd()')
}
$rdcConfig = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\rdc\config.ts') -Raw
if ($rdcConfig -match 'process\.cwd\(\)') {
    $violations.Add('src\rdc\config.ts -> RDC config root still depends on process.cwd()')
}
$browserControl = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\rdc\browser-control\service.ts') -Raw
if ($browserControl -match 'path\.join\(process\.cwd\(\)') {
    $violations.Add('src\rdc\browser-control\service.ts -> browser runtime/cache still depends on process.cwd()')
}
$resultBudget = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\mcp\result-budget.ts') -Raw
if ($resultBudget -match 'path\.join\(process\.cwd\(\)') {
    $violations.Add('src\mcp\result-budget.ts -> result spill storage still depends on process.cwd()')
}
$grafelRuntime = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\code-intelligence\grafel-runtime.ts') -Raw
if ($grafelRuntime -notmatch 'rebaseDefaultFleetPath') {
    $violations.Add('src\code-intelligence\grafel-runtime.ts -> default workspace relocation repair missing')
}
$activityTracker = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\tracker\activity-tracker.ts') -Raw
if ($activityTracker -match 'constructor\(root\s*=\s*path\.join\(process\.cwd\(\)') {
    $violations.Add('src\tracker\activity-tracker.ts -> tracker storage still depends on process.cwd()')
}
$processLedger = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\rdc\process-ledger.ts') -Raw
if ($processLedger -match 'path\.join\(process\.cwd\(\).*process-ledger') {
    $violations.Add('src\rdc\process-ledger.ts -> process ledger storage still depends on process.cwd()')
}

$fleetPath = Join-Path $ProjectRoot 'runtime\grafel\home\.config\grafel\agent-core.fleet.json'
if (Test-Path -LiteralPath $fleetPath -PathType Leaf) {
    try {
        $fleet = Get-Content -LiteralPath $fleetPath -Raw | ConvertFrom-Json
        $defaultRepo = @($fleet.repos) | Where-Object { $_.slug -eq 'agent-core' } | Select-Object -First 1
        if ($defaultRepo) {
            $fleetRoot = [IO.Path]::GetFullPath([string]$defaultRepo.path).TrimEnd('\')
            if (-not $fleetRoot.Equals($ProjectRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
                $violations.Add("runtime Grafel fleet still points to a previous root: $fleetRoot")
            }
        }
    } catch {
        $violations.Add('runtime Grafel fleet is unreadable')
    }
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
