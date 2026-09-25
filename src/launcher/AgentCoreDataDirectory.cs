namespace AgentCore.Launcher;

public static class AgentCoreDataDirectory
{
    public static string Resolve(string root, Func<string, string?>? getEnvironment = null)
    {
        getEnvironment ??= Environment.GetEnvironmentVariable;
        var configured = getEnvironment("AGENT_CORE_DATA_DIR");
        if (string.IsNullOrWhiteSpace(configured))
            configured = ReadDotEnv(root, "AGENT_CORE_DATA_DIR");
        if (string.IsNullOrWhiteSpace(configured))
            configured = Path.Combine("runtime", "bridge-auth");

        var value = Unquote(configured.Trim());
        return Path.GetFullPath(Path.IsPathRooted(value) ? value : Path.Combine(root, value));
    }

    private static string? ReadDotEnv(string root, string name)
    {
        var file = Path.Combine(root, ".env");
        if (!File.Exists(file)) return null;
        foreach (var rawLine in File.ReadLines(file))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith("export ", StringComparison.Ordinal)) line = line[7..].TrimStart();
            var separator = line.IndexOf('=');
            if (separator <= 0 || !line[..separator].Trim().Equals(name, StringComparison.Ordinal)) continue;
            return Unquote(line[(separator + 1)..].Trim());
        }
        return null;
    }
    private static string Unquote(string value)
    {
        if (value.Length >= 2 && ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
            return value[1..^1];
        var comment = value.IndexOf(" #", StringComparison.Ordinal);
        return comment >= 0 ? value[..comment].TrimEnd() : value;
    }
}
