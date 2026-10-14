using System;
using System.IO;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class AgentCoreDataDirectoryTests
{
    [Fact]
    public void Defaults_to_runtime_bridge_auth()
    {
        var root = CreateRoot();
        try
        {
            var actual = AgentCoreDataDirectory.Resolve(root, _ => null);
            Assert.Equal(Path.GetFullPath(Path.Combine(root, "runtime", "bridge-auth")), actual);
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void Reads_relative_override_from_dotenv()
    {
        var root = CreateRoot();
        File.WriteAllText(Path.Combine(root, ".env"), "AGENT_CORE_DATA_DIR=\"runtime\\custom-auth\"\n");
        try
        {
            var actual = AgentCoreDataDirectory.Resolve(root, _ => null);
            Assert.Equal(Path.GetFullPath(Path.Combine(root, "runtime", "custom-auth")), actual);
        }
        finally { Directory.Delete(root, true); }
    }
    [Fact]
    public void Process_environment_wins_over_dotenv()
    {
        var root = CreateRoot();
        File.WriteAllText(Path.Combine(root, ".env"), "AGENT_CORE_DATA_DIR=runtime\\dotenv-auth\n");
        try
        {
            var actual = AgentCoreDataDirectory.Resolve(root, name =>
                name == "AGENT_CORE_DATA_DIR" ? "runtime\\process-auth" : null);
            Assert.Equal(Path.GetFullPath(Path.Combine(root, "runtime", "process-auth")), actual);
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void Rebases_stale_absolute_default_path_after_project_relocation()
    {
        var root = CreateRoot();
        try
        {
            var actual = AgentCoreDataDirectory.Resolve(root, name =>
                name == "AGENT_CORE_DATA_DIR" ? @"E:\PreviousMachine\Agent-Core\runtime\bridge-auth" : null);
            Assert.Equal(Path.GetFullPath(Path.Combine(root, "runtime", "bridge-auth")), actual);
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void Supports_explicit_project_root_token()
    {
        var root = CreateRoot();
        try
        {
            var actual = AgentCoreDataDirectory.Resolve(root, name =>
                name == "AGENT_CORE_DATA_DIR" ? @"@project\runtime\custom-auth" : null);
            Assert.Equal(Path.GetFullPath(Path.Combine(root, "runtime", "custom-auth")), actual);
        }
        finally { Directory.Delete(root, true); }
    }

    private static string CreateRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-data-dir-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        return root;
    }
}
