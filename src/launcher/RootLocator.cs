namespace AgentCore.Launcher;

public static class RootLocator
{
    public static string Find()
    {
        var candidates = new List<string>();
        var processPath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(processPath))
            candidates.Add(Path.GetDirectoryName(processPath)!);
        candidates.Add(AppContext.BaseDirectory);
        return FindFrom(candidates);
    }

    public static string FindFrom(IEnumerable<string> candidates)
    {
        foreach (var candidate in candidates.Where(c => !string.IsNullOrWhiteSpace(c)))
        {
            for (var current = new DirectoryInfo(candidate); current is not null; current = current.Parent)
            {
                if (IsRoot(current.FullName)) return current.FullName;
            }
        }
        throw new InvalidOperationException("Agent Core root could not be located.");
    }

    private static bool IsRoot(string path) =>
        File.Exists(Path.Combine(path, "package.json"))
        && File.Exists(Path.Combine(path, "tunnel-client", "agent-core.yaml"))
        && Directory.Exists(Path.Combine(path, "dist", "ui"));
}
