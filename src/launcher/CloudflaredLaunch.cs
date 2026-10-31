namespace AgentCore.Launcher;

// How the launcher starts the project-local cloudflared (scripts/windows/Start-Cloudflare-Tunnel.ps1 installs it).
public static class CloudflaredLaunch
{
    public sealed record Plan(string[] Arguments, IReadOnlyDictionary<string, string> Environment);

    public static string ExecutablePath(string root) =>
        Path.Combine(root, "runtime", "tools", "cloudflared", "cloudflared.exe");

    public static string LogPath(string root) =>
        Path.Combine(root, "runtime", "tools", "cloudflared", "cloudflared.log");

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
