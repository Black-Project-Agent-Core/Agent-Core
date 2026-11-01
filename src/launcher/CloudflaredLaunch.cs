namespace AgentCore.Launcher;

// How the launcher starts the project-local cloudflared (scripts/windows/Start-Cloudflare-Tunnel.ps1 installs it).
public static class CloudflaredLaunch
{
    public sealed record Plan(string[] Arguments, IReadOnlyDictionary<string, string> Environment);

    public static string ExecutablePath(string root) =>
        Path.Combine(root, "runtime", "tools", "cloudflared", "cloudflared.exe");

    public static string LogPath(string root) =>
        Path.Combine(root, "runtime", "tools", "cloudflared", "cloudflared.log");

    // Service command lines may contain a token; match ownership inside PowerShell and return metadata only.
    public static string ServiceQueryScript(string root, bool startIfStopped = false)
    {
        var executable = ExecutablePath(root).Replace("'", "''");
        var start = startIfStopped
            ? "if($service.State -eq 'Stopped') { $null=Start-Service -Name $service.Name -ErrorAction Stop; " +
              "$service=Get-CimInstance Win32_Service -Filter \"Name='Cloudflared'\" -ErrorAction Stop; " +
              "if($null -eq $service) { throw 'Service disappeared' } };"
            : string.Empty;
        return "$ErrorActionPreference='Stop';try { " +
            $"$expected='{executable}';" +
            "$service=Get-CimInstance Win32_Service -Filter \"Name='Cloudflared'\" -ErrorAction Stop;" +
            "if($null -eq $service) { 'null';exit 0 };" +
            "if([string]::IsNullOrWhiteSpace([string]$service.PathName)) { throw 'Service identity unavailable' };" +
            "$command=([string]$service.PathName).TrimStart();" +
            "$prefix=if($command.StartsWith('\"')) { '\"'+$expected+'\"' } else { $expected };" +
            "$owned=$command.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and " +
            "($command.Length -eq $prefix.Length -or [char]::IsWhiteSpace($command[$prefix.Length]));" +
            "if(-not $owned) { 'null';exit 0 };" + start +
            "$service | Select-Object Name,State,ProcessId | ConvertTo-Json -Compress" +
            " } catch { [Console]::Error.WriteLine('Cloudflared service query failed.');exit 1 }";
    }

    // The token reaches cloudflared through TUNNEL_TOKEN or --token-file, never the command line,
    // because the command line of any process is readable by other processes.
    // Null when no token is configured: the Cloudflare tunnel is optional.
    public static Plan? Resolve(string root)
    {
        string[] arguments = ["tunnel", "--no-autoupdate", "--loglevel", "info", "--logfile", LogPath(root), "run"];
        var token = AgentCoreDataDirectory.ReadDotEnv(root, "CLOUDFLARE_TUNNEL_TOKEN");
        if (!string.IsNullOrWhiteSpace(token))
            return new Plan(arguments, new Dictionary<string, string> { ["TUNNEL_TOKEN"] = token.Trim() });

        var tokenFile = Path.Combine(root, "secrets", "cloudflare-tunnel-token.txt");
        if (File.Exists(tokenFile) && !string.IsNullOrWhiteSpace(File.ReadAllText(tokenFile)))
            return new Plan([.. arguments, "--token-file", tokenFile], new Dictionary<string, string>());
        return null;
    }

    // True once the log holds a registered edge connection written after offset (the log is appended across runs).
    public static bool HasRegisteredConnection(string log, long offset)
    {
        try
        {
            using var stream = new FileStream(log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            stream.Seek(offset <= stream.Length ? offset : 0, SeekOrigin.Begin);
            using var reader = new StreamReader(stream);
            return reader.ReadToEnd().Contains("Registered tunnel connection", StringComparison.Ordinal);
        }
        catch (IOException) { return false; }
    }
}
