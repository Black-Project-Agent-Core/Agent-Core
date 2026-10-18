using System.Diagnostics;
using System.Text.Json;

namespace AgentCore.Launcher;

/// <summary>Runs only the fixed synthetic-fixture setup after Core is available.</summary>
internal static class SymlinkFixtureSetup
{
    public static async Task EnsureAsync(string root, Action<string, string> report)
    {
        var script = Path.Combine(root, "scripts", "windows", "Ensure-Agent-Core-Symlink-Fixture.ps1");
        if (!File.Exists(script))
        {
            report("warn", "Symlink fixture setup script is unavailable; normal runtime remains available.");
            return;
        }
        try
        {
            var start = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = root,
            };
            foreach (var argument in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", "Startup" })
                start.ArgumentList.Add(argument);
            using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start fixture setup.");
            var output = process.StandardOutput.ReadToEndAsync();
            var errors = process.StandardError.ReadToEndAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
            try { await process.WaitForExitAsync(timeout.Token); }
            catch (OperationCanceledException)
            {
                report("warn", "Symlink setup is still awaiting completion; no duplicate request was sent.");
                return;
            }
            var text = (await output).Trim();
            var error = (await errors).Trim();
            if (process.ExitCode != 0)
            {
                report("warn", "Symlink fixture setup did not complete: " + (error.Length > 600 ? error[..600] : error));
                return;
            }
            using var result = JsonDocument.Parse(text);
            if (result.RootElement.GetProperty("status").GetString() != "ready")
                throw new InvalidOperationException("Unexpected fixture setup result.");
            var reused = result.RootElement.GetProperty("reusedExisting").GetBoolean();
            report("success", reused ? "Validated existing symlink fixture; no UAC or new links needed." : "Symlink fixture created and verified; future starts reuse it without UAC.");
        }
        catch (Exception error)
        {
            report("warn", "Symlink fixture setup unavailable: " + error.Message);
        }
    }
}
