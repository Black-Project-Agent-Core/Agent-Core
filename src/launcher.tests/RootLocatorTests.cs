using System;
using System.IO;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class RootLocatorTests
{
    [Fact]
    public void Finds_root_from_candidate_directory()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-root-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "tunnel-client"));
        Directory.CreateDirectory(Path.Combine(root, "dist", "ui"));
        File.WriteAllText(Path.Combine(root, "package.json"), "{}");
        File.WriteAllText(Path.Combine(root, "tunnel-client", "agent-core.yaml"), "config_version: 1");
        try { Assert.Equal(root, RootLocator.FindFrom(new[] { root })); }
        finally { Directory.Delete(root, true); }
    }
}
