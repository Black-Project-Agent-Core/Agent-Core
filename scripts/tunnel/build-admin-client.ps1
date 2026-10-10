[CmdletBinding()]
param(
  [string]$WorkRoot = (Join-Path ([IO.Path]::GetTempPath()) ('tunnel-admin-build-' + [Guid]::NewGuid().ToString('N')))
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$upstream = 'https://github.com/openai/tunnel-client.git'
$revision = '105e17a79a36e4e5c897fd698ed2b8dbf935b144'
$tag = 'v0.0.10'
$pnpmVersion = '10.11.0'
$buildScriptPath = $PSCommandPath
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$buildRoot = [IO.Path]::GetFullPath($WorkRoot)
if (-not $buildRoot.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The upstream checkout and build must remain inside the temporary directory.'
}
if (Test-Path -LiteralPath $buildRoot) { throw 'Choose a new, empty build directory.' }
$sourceRoot = Join-Path $buildRoot 'source'
$artifactRoot = Join-Path $buildRoot 'artifacts'
[IO.Directory]::CreateDirectory($artifactRoot) | Out-Null
$buildLog = Join-Path $artifactRoot 'build.log'
$utf8 = [Text.UTF8Encoding]::new($false)

function Invoke-BuildCommand([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments 2>&1 | Tee-Object -FilePath $buildLog -Append | Write-Output
  if ($LASTEXITCODE -ne 0) { throw "$Command exited with code $LASTEXITCODE" }
}

function Source-Path([string]$Relative) {
  $target = [IO.Path]::GetFullPath((Join-Path $sourceRoot $Relative))
  if (-not $target.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected source path.' }
  return $target
}

function Edit-Source([string]$Relative, [scriptblock]$Transform) {
  $target = Source-Path $Relative
  $before = [IO.File]::ReadAllText($target).Replace("`r`n", "`n")
  $after = & $Transform $before
  if ($after -eq $before) { throw "Pinned source structure did not match: $Relative" }
  $notice = if ($Relative.EndsWith('.svelte')) {
    "<!-- Local modification: admin-only distribution without an interactive assistant. -->`n"
  } else { "// Local modification: admin-only distribution without an interactive assistant.`n" }
  [IO.File]::WriteAllText($target, $notice + $after, $utf8)
}

Invoke-BuildCommand 'git' @('clone', '--depth', '1', '--branch', $tag, $upstream, $sourceRoot)
$resolved = (& git -C $sourceRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $resolved -ne $revision) { throw 'Upstream revision does not match the pinned release.' }

Edit-Source 'pkg/adminui/fxmodule.go' {
  param($text)
  $text -replace '(?m)^.*codexappserver.*\n', '' -replace '(?m)^.*"/api/codex/.*\n', ''
}
Edit-Source 'cmd/client/root_command.go' { param($text) $text -replace '(?m)^.*AddCommand\(newCodexCommand.*\n', '' }
Edit-Source 'pkg/adminui/startup.go' { param($text) $text.Replace('codexplugin.Detect(os.LookupEnv)', 'codexplugin.Detection{}') -replace '(?m)^\s*"os"\n', '' }
Edit-Source 'adminui/src/App.svelte' {
  param($text)
  $text -replace '(?m)^.*import CodexPanel.*\n', '' -replace '(?m)^.*id: "codex", label: "Assistant".*\n', '' -replace '(?ms)^<section[^\n]*id="panel-codex".*?</section>\n', ''
}
Edit-Source 'cmd/client/help_topics.go' { param($text) $text -replace '(?m)^.*Fastest Codex terminal path:.*\n', '' }
Edit-Source 'pkg/adminui/fxmodule_test.go' {
  param($text)
  $text.Replace('TestRegisterRoutesProtectsCodexWritesFromCrossOriginPosts', 'TestAdminOnlyBuildDoesNotRegisterAssistantEndpoints').Replace('http.StatusForbidden', 'http.StatusNotFound').Replace('http.StatusServiceUnavailable', 'http.StatusNotFound')
}
Edit-Source 'cmd/client/ux_command_test.go' {
  param($text)
  $text -replace '(?m)^.*require.Contains\(t, stdout, "(?:codex|tunnel-client codex assistant)"\).*\n', ''
}
Edit-Source 'cmd/client/root_command_test.go' {
  param($text)
  $text.Replace('require.Contains(t, output, "codex")', 'require.NotContains(t, output, "codex")')
}
foreach ($relative in @('pkg/mcpclient/channel_transport_factory_test.go', 'pkg/health/health_test.go', 'cmd/client/main_test.go')) {
  Edit-Source $relative { param($text) $text.Replace('os.CreateTemp("/tmp",', 'os.CreateTemp(os.TempDir(),') }
}
Edit-Source 'adminui/src/components/__tests__/App.test.ts' {
  param($text)
  $position = $text.IndexOf('  it("posts an Assistant turn through the rendered shell"')
  if ($position -lt 0) { throw 'Pinned UI test structure changed.' }
  $text.Substring(0, $position) + @'
  it("keeps the operational tabs without an assistant surface or requests", async () => {
    const requests: string[] = [];
    installAppFetchMock({ onRequest: ({ url }) => { requests.push(url); return undefined; } });
    const { getByRole, queryByRole, container } = render(App);
    for (const name of ["Overview", "Metrics", "OAuth", "Harpoon", "System", "Logs"]) {
      expect(getByRole("tab", { name })).toBeTruthy();
    }
    expect(queryByRole("tab", { name: "Assistant" })).toBeNull();
    expect(container.querySelector("#panel-codex")).toBeNull();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests.some(url => url.includes("/api/codex/"))).toBe(false);
  });
});
'@
}

$excludedFiles = @(
  'pkg/adminui/codex.go', 'pkg/adminui/codex_test.go',
  'cmd/client/codex_command.go', 'cmd/client/codex_command_test.go',
  'cmd/client/codex_assistant_command.go', 'cmd/client/codex_assistant_kb.go',
  'adminui/src/components/CodexPanel.svelte', 'adminui/src/components/__tests__/CodexPanel.test.ts',
  'adminui/src/lib/codex.ts', 'adminui/src/lib/__tests__/codex.test.ts'
)
foreach ($relative in $excludedFiles) { Remove-Item -LiteralPath (Source-Path $relative) }

$oldCgo = $env:CGO_ENABLED
$oldAssets = $env:ADMIN_UI_ASSETS_DIR
$oldCi = $env:CI
Push-Location $sourceRoot
try {
  $env:CGO_ENABLED = '0'
  $env:CI = 'true'
  $env:ADMIN_UI_ASSETS_DIR = Source-Path 'pkg/adminui/assets'
  Invoke-BuildCommand 'gofmt' @('-w', 'pkg/adminui/fxmodule.go', 'pkg/adminui/startup.go', 'pkg/adminui/fxmodule_test.go', 'cmd/client/root_command.go', 'cmd/client/help_topics.go', 'cmd/client/ux_command_test.go', 'cmd/client/root_command_test.go', 'cmd/client/main_test.go', 'pkg/mcpclient/channel_transport_factory_test.go', 'pkg/health/health_test.go')
  Invoke-BuildCommand 'corepack.cmd' @("pnpm@$pnpmVersion", '--dir', 'adminui', 'install', '--frozen-lockfile', '--ignore-scripts')
  Invoke-BuildCommand 'corepack.cmd' @("pnpm@$pnpmVersion", '--dir', 'adminui', 'run', 'lint')
  Invoke-BuildCommand 'corepack.cmd' @("pnpm@$pnpmVersion", '--dir', 'adminui', 'test')
  Invoke-BuildCommand 'corepack.cmd' @("pnpm@$pnpmVersion", '--dir', 'adminui', 'run', 'build')

  $dependencies = @(& go list -deps ./cmd/client)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the executable dependency graph.' }
  if ($dependencies -contains 'github.com/openai/tunnel-client/pkg/codexappserver') { throw 'The interactive provider package is still compiled.' }
  [IO.File]::WriteAllLines((Join-Path $artifactRoot 'compiled-packages.txt'), $dependencies, $utf8)
  $bundle = [IO.File]::ReadAllText((Source-Path 'pkg/adminui/assets/app.js'))
  if ($bundle.Contains('/api/codex/') -or $bundle.Contains('panel-codex')) { throw 'The generated UI still includes the interactive assistant.' }

  Invoke-BuildCommand 'go' @('test', '-skip', '^TestListenHealthUnixSocketRemovesStaleSocket$', './pkg/adminui', './pkg/app', './pkg/dispatcher', './pkg/mcpclient', './pkg/health', './pkg/controlplane/...')
  Invoke-BuildCommand 'go' @('test', './cmd/client', '-run', '^Test(Run|Root|Health|Config|Admin|Profiles)', '-skip', '^TestProfilesEdit(ValidatesBeforeSaving|CreatesMissingProfileFromSkeleton)$')
  $binary = Join-Path $artifactRoot 'tunnel-client-admin.exe'
  Invoke-BuildCommand 'go' @('build', '-trimpath', '-buildvcs=false', '-ldflags', "-s -w -X github.com/openai/tunnel-client/pkg/version.GitSHA=$revision-admin-only", '-o', $binary, './cmd/client')
  Copy-Item -LiteralPath (Source-Path 'LICENSE') -Destination (Join-Path $artifactRoot 'LICENSE')
  Copy-Item -LiteralPath (Source-Path 'NOTICE') -Destination (Join-Path $artifactRoot 'NOTICE')
  $provenance = [ordered]@{
    upstream = $upstream; tag = $tag; revision = $revision; distribution = 'admin-only'
    modifications = 'Optional interactive assistant UI, API, automatic bridge startup, and assistant CLI removed. Tunnel, MCP, health and operational admin pages retained.'
    license = 'Apache-2.0'; sourceDirectory = $sourceRoot; binary = $binary
    sha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
    goVersion = (& go version); nodeVersion = (& node --version); pnpmVersion = $pnpmVersion
    buildScriptSha256 = (Get-FileHash -LiteralPath $buildScriptPath -Algorithm SHA256).Hash.ToLowerInvariant()
    providerPackageCompiled = $false; tests = @('admin UI lint and full UI suite', 'Go admin/app/dispatcher/MCP/health/control-plane', 'Go run/root/health/config/admin/profiles')
    testExclusions = @(
      'TestListenHealthUnixSocketRemovesStaleSocket: upstream Unix stale-socket errno classification does not handle Windows WSAECONNREFUSED; TCP health and MCP transport remain tested.',
      'TestProfilesEditValidatesBeforeSaving and TestProfilesEditCreatesMissingProfileFromSkeleton: upstream fixtures require sh, unavailable on this Windows build host; profile-edit production code is unchanged and remaining profile tests run.'
    )
  }
  $json = $provenance | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText((Join-Path $artifactRoot 'provenance.json'), $json, $utf8)
  Write-Output $json
} finally {
  Pop-Location
  $env:CGO_ENABLED = $oldCgo
  $env:ADMIN_UI_ASSETS_DIR = $oldAssets
  $env:CI = $oldCi
}
