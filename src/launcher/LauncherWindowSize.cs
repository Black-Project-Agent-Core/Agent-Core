using System.Text;
using System.Text.Json;

namespace AgentCore.Launcher;

public sealed record LauncherWindowSize(int Width, int Height);

public static class LauncherWindowSizeStore
{
    public const int DefaultWidth = 1202;
    public const int DefaultHeight = 811;
    public const int MinimumWidth = 1;
    public const int MinimumHeight = 1;
    public const int MaximumDimension = 32767;

    private sealed record Settings(int SchemaVersion, int Width, int Height);
    public static LauncherWindowSize Default => new(DefaultWidth, DefaultHeight);
    public static bool IsValid(int width, int height) =>
        width is >= MinimumWidth and <= MaximumDimension && height is >= MinimumHeight and <= MaximumDimension;

    private static string SettingsPath(string root) => Path.Combine(root, "runtime", "launcher", "window-size.json");

    public static LauncherWindowSize Load(string root)
    {
        var path = SettingsPath(root);
        if (!File.Exists(path)) return Default;
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0 || new FileInfo(path).Length > 4096)
            throw new InvalidDataException("WINDOW_SIZE_SETTINGS_INVALID");
        var settings = JsonSerializer.Deserialize<Settings>(File.ReadAllText(path));
        if (settings is null || settings.SchemaVersion != 1 || !IsValid(settings.Width, settings.Height))
            throw new InvalidDataException("WINDOW_SIZE_SETTINGS_INVALID");
        return new LauncherWindowSize(settings.Width, settings.Height);
    }

    public static void Save(string root, LauncherWindowSize size)
    {
        if (!IsValid(size.Width, size.Height)) throw new ArgumentOutOfRangeException(nameof(size), "WINDOW_SIZE_INVALID");
        var settings = new Settings(1, size.Width, size.Height);
        OwnedAtomicFile.WriteAllText(SettingsPath(root), JsonSerializer.Serialize(settings), new UTF8Encoding(false));
    }
}
