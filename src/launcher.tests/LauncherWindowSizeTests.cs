using System;
using System.IO;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class LauncherWindowSizeTests
{
    [Fact]
    public void Defaults_and_explicit_sizes_survive_a_fresh_read()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-window-size-{Guid.NewGuid():N}");
        try
        {
            Assert.Equal(new LauncherWindowSize(1202, 811), LauncherWindowSizeStore.Load(root));
            Assert.False(File.Exists(Path.Combine(root, "runtime", "launcher", "window-size.json")));
            LauncherWindowSizeStore.Save(root, new LauncherWindowSize(1024, 768));
            Assert.Equal(new LauncherWindowSize(1024, 768), LauncherWindowSizeStore.Load(root));
            LauncherWindowSizeStore.Save(root, new LauncherWindowSize(1400, 900));
            Assert.Equal(new LauncherWindowSize(1400, 900), LauncherWindowSizeStore.Load(root));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public void Invalid_input_or_corrupt_settings_does_not_replace_existing_state()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-window-size-{Guid.NewGuid():N}");
        try
        {
            LauncherWindowSizeStore.Save(root, new LauncherWindowSize(1202, 811));
            var path = Path.Combine(root, "runtime", "launcher", "window-size.json");
            var original = File.ReadAllText(path);
            Assert.Throws<ArgumentOutOfRangeException>(() => LauncherWindowSizeStore.Save(root, new LauncherWindowSize(0, 811)));
            Assert.Equal(original, File.ReadAllText(path));
            File.WriteAllText(path, "{invalid");
            Assert.Throws<System.Text.Json.JsonException>(() => LauncherWindowSizeStore.Load(root));
            Assert.Equal("{invalid", File.ReadAllText(path));
            const string invalidSchema = "{\"SchemaVersion\":2,\"Width\":1202,\"Height\":811}";
            File.WriteAllText(path, invalidSchema);
            Assert.Throws<InvalidDataException>(() => LauncherWindowSizeStore.Load(root));
            Assert.Equal(invalidSchema, File.ReadAllText(path));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
