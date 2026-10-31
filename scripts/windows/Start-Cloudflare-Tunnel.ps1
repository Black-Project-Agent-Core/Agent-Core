<#
Agent Core public access through a Cloudflare named tunnel (remote-managed, token based).
Docs: docs\Cloudflare-Tunnel.md

  -Action Install   Download cloudflared into runtime\tools\cloudflared and verify the SHA-256 published by GitHub.
  -Action Run       Start the tunnel with CLOUDFLARE_TUNNEL_TOKEN from .env (or secrets\cloudflare-tunnel-token.txt); foreground, or -Background hidden.
  -Action Stop      Stop the background tunnel started by this script (exact project-local executable only).
  -Action Status    Show whether the background tunnel runs and the last log lines.
  -Action Verify    Check a public URL: OAuth/MCP reachable, everything else blocked (-Url https://host, default from CLOUDFLARE_TUNNEL_HOSTNAME in .env).
#>
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Run', 'Stop', 'Status', 'Verify')][string]$Action = 'Run',
    [switch]$Background,
    [string]$Url,
    [string]$Version = 'latest'
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Dir = Join-Path $Root 'runtime\tools\cloudflared'
$Exe = Join-Path $Dir 'cloudflared.exe'
$Pid_ = Join-Path $Dir 'cloudflared.pid'
$Log = Join-Path $Dir 'cloudflared.log'
$TokenFile = Join-Path $Root 'secrets\cloudflare-tunnel-token.txt'
$EnvFile = Join-Path $Root '.env'

# Value of one NAME=value line in .env (last wins), or ''. Never printed.
function Get-EnvValue([string]$Name) {
    if (-not (Test-Path $EnvFile)) { return '' }
    $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -Last 1
    if (-not $line) { return '' }
    return ($line -replace "^\s*$Name\s*=\s*", '').Trim().Trim('"', "'")
}

# Found by exact executable path, so a tunnel started by Agent Core.exe (which writes no PID file) counts too.
function Get-RunningTunnel {
    Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe } | Select-Object -First 1
}

switch ($Action) {
    'Install' {
        $api = if ($Version -eq 'latest') { 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest' }
               else { "https://api.github.com/repos/cloudflare/cloudflared/releases/tags/$Version" }
        $release = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'agent-core' }
        $asset = $release.assets | Where-Object name -eq 'cloudflared-windows-amd64.exe'
        if (-not $asset -or $asset.digest -notmatch '^sha256:([0-9a-f]{64})$') { throw 'Release asset or SHA-256 digest not found.' }
        $expected = $Matches[1]
        if ((Test-Path $Exe) -and (Get-FileHash $Exe -Algorithm SHA256).Hash.ToLower() -eq $expected) {
            Write-Output "cloudflared $($release.tag_name) already installed and verified."; break
        }
        if (Get-RunningTunnel) { throw 'Stop the running tunnel first: -Action Stop.' }
        New-Item -ItemType Directory -Force -Path $Dir | Out-Null
        $tmp = "$Exe.download"
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -UseBasicParsing
        if ((Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower() -ne $expected) { Remove-Item $tmp -Force; throw 'SHA-256 mismatch; download discarded.' }
        Move-Item $tmp $Exe -Force
        Write-Output "Installed cloudflared $($release.tag_name), SHA-256 verified: $expected"
    }
    'Run' {
        if (-not (Test-Path $Exe)) { throw 'cloudflared is missing. Run: -Action Install' }
        # The token reaches cloudflared through its environment (TUNNEL_TOKEN) or a token file, never the command line.
        $token = Get-EnvValue 'CLOUDFLARE_TUNNEL_TOKEN'
        if ($token) { $env:TUNNEL_TOKEN = $token; $tokenArgs = @() }
        elseif ((Test-Path $TokenFile) -and "$(Get-Content $TokenFile -Raw)".Trim()) { $tokenArgs = @('--token-file', $TokenFile) }
        else { throw "No tunnel token. Set CLOUDFLARE_TUNNEL_TOKEN in .env (Cloudflare Zero Trust > Networks > Tunnels > your tunnel > token), or put it in $TokenFile." }
        if (Get-RunningTunnel) { throw 'Tunnel already running. Use -Action Status or -Action Stop.' }
        $arguments = @('tunnel', '--no-autoupdate', '--loglevel', 'info', '--logfile', $Log, 'run') + $tokenArgs
        if ($Background) {
            $p = Start-Process -FilePath $Exe -ArgumentList ($arguments | ForEach-Object { '"' + $_ + '"' }) -WindowStyle Hidden -PassThru
            Remove-Item Env:TUNNEL_TOKEN -ErrorAction SilentlyContinue
            Set-Content -Path $Pid_ -Value $p.Id
            Write-Output "Tunnel started in background (PID $($p.Id)). Log: $Log"
        } else {
            & $Exe @arguments
            exit $LASTEXITCODE
        }
    }
    'Stop' {
        $p = Get-RunningTunnel
        if (-not $p) { Write-Output 'No project tunnel is running.'; break }
        Stop-Process -Id $p.Id
        Remove-Item $Pid_ -Force -ErrorAction SilentlyContinue
        Write-Output "Stopped tunnel PID $($p.Id)."
    }
    'Status' {
        $p = Get-RunningTunnel
        Write-Output $(if ($p) { "Running (PID $($p.Id))." } else { 'Not running.' })
        if (Test-Path $Log) { Get-Content $Log -Tail 8 }
    }
    'Verify' {
        if (-not $Url) {
            $h = (Get-EnvValue 'CLOUDFLARE_TUNNEL_HOSTNAME').ToLower() -replace '^https?://', '' -replace '[/?#].*$', ''
            if ($h) { $Url = "https://$h" }
        }
        if ($Url -notmatch '^https://[^/\s]+$') { throw 'Pass -Url https://your-hostname (no path), or set CLOUDFLARE_TUNNEL_HOSTNAME in .env.' }
        $Url = $Url.TrimEnd('/')
        # name, method, path, expected status, extra check on body
        $checks = @(
            @('OAuth protected-resource metadata reachable', 'GET',  '/.well-known/oauth-protected-resource/mcp', '200'),
            @('OAuth server metadata reachable',             'GET',  '/.well-known/oauth-authorization-server',   '200'),
            @('/mcp reachable and demands credentials',      'POST', '/mcp',                                      '401'),
            @('/oauth/authorize reachable (rejects empty)',  'GET',  '/oauth/authorize',                          '400'),
            @('/health is NOT exposed',                      'GET',  '/health',                                   '404'),
            @('/agent/* is NOT exposed',                     'GET',  '/agent/chat/conversations',                 '404')
        )
        $failed = 0
        foreach ($c in $checks) {
            $code = & curl.exe -s -m 20 -o NUL -w '%{http_code}' -X $c[1] "$Url$($c[2])"
            $ok = $code -eq $c[3]
            if (-not $ok) { $failed++ }
            Write-Output ('{0}  {1}  (got {2}, want {3})' -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $c[0], $code, $c[3])
        }
        $body = & curl.exe -s -m 20 "$Url/.well-known/oauth-protected-resource/mcp"
        $resourceOk = ($body | Out-String) -match [regex]::Escape("`"resource`":`"$Url/mcp`"")
        if (-not $resourceOk) { $failed++ }
        Write-Output ('{0}  OAuth resource identity equals {1}/mcp' -f $(if ($resourceOk) { 'PASS' } else { 'FAIL' }), $Url)
        if ($failed) { Write-Output "$failed check(s) failed."; exit 1 }
        Write-Output 'All checks passed.'
    }
}
