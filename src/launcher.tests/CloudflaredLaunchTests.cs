using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

public sealed class CloudflaredLaunchTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"agent-core-cloudflared-{Guid.NewGuid():N}");

    public CloudflaredLaunchTests() => Directory.CreateDirectory(_root);

    public void Dispose() => Directory.Delete(_root, true);

    [Fact]
    public void DotEnvTokenReachesChildThroughEnvironmentNeverArguments()
    {
        File.WriteAllText(Path.Combine(_root, ".env"), "OTHER=1\nCLOUDFLARE_TUNNEL_TOKEN=\"secret-token\"\n");
        var plan = CloudflaredLaunch.Resolve(_root);
        Assert.NotNull(plan);
        Assert.Equal("secret-token", plan!.Environment["TUNNEL_TOKEN"]);
        Assert.DoesNotContain("secret-token", string.Join(' ', plan.Arguments));
        Assert.Equal("run", plan.Arguments[^1]);
    }

    [Fact]
    public void TokenFileIsUsedWhenDotEnvHasNoToken()
    {
        File.WriteAllText(Path.Combine(_root, ".env"), "CLOUDFLARE_TUNNEL_TOKEN=\n");
        Directory.CreateDirectory(Path.Combine(_root, "secrets"));
        var tokenFile = Path.Combine(_root, "secrets", "cloudflare-tunnel-token.txt");
        File.WriteAllText(tokenFile, "file-token\n");
        var plan = CloudflaredLaunch.Resolve(_root);
        Assert.NotNull(plan);
        Assert.Empty(plan!.Environment);
        Assert.Equal(["--token-file", tokenFile], plan.Arguments[^2..]);
    }

    [Fact]
    public void NoTokenAnywhereMeansNoPlan() => Assert.Null(CloudflaredLaunch.Resolve(_root));

    [Fact]
    public void RegistrationIsReadOnlyFromBytesWrittenAfterTheOffset()
    {
        var log = Path.Combine(_root, "cloudflared.log");
        File.WriteAllText(log, "{\"message\":\"Registered tunnel connection\"}\n");
        var offset = new FileInfo(log).Length;
        Assert.False(CloudflaredLaunch.HasRegisteredConnection(log, offset));
        File.AppendAllText(log, "{\"message\":\"Registered tunnel connection\"}\n");
        Assert.True(CloudflaredLaunch.HasRegisteredConnection(log, offset));
        Assert.False(CloudflaredLaunch.HasRegisteredConnection(Path.Combine(_root, "missing.log"), 0));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ServiceOwnershipAcceptsExactQuotedOrUnquotedImageWithoutExposingArguments(bool quoted)
    {
        var root = Path.Combine(_root, "operator's project.exe folder");
        var executable = CloudflaredLaunch.ExecutablePath(root).ToUpperInvariant();
        var command = (quoted ? '"' + executable + '"' : executable) + " tunnel run --token private-token";
        var result = await QueryFakeService(root, command);
        Assert.Equal(0, result.ExitCode);
        using var json = JsonDocument.Parse(result.Output);
        Assert.Equal("Cloudflared", json.RootElement.GetProperty("Name").GetString());
        Assert.Equal("Running", json.RootElement.GetProperty("State").GetString());
        Assert.Equal(123, json.RootElement.GetProperty("ProcessId").GetInt32());
        Assert.Equal(3, json.RootElement.EnumerateObject().Count());
        Assert.DoesNotContain("private-token", result.Output + result.Error);
        Assert.DoesNotContain("PathName", result.Output);
    }

    [Theory]
    [InlineData("other-root")]
    [InlineData("suffix")]
    [InlineData("quoted-suffix")]
    public async Task ServiceOwnershipRejectsOtherExecutableWithoutStartingIt(string mismatch)
    {
        var executable = CloudflaredLaunch.ExecutablePath(_root);
        var command = mismatch switch {
            "other-root" => '"' + CloudflaredLaunch.ExecutablePath(_root + "-other") + '"',
            "suffix" => executable + ".other.exe",
            _ => '"' + executable + '"' + "suffix",
        };
        var result = await QueryFakeService(_root, command + " --token private-token", startIfStopped: true, state: "Stopped");
        Assert.Equal(0, result.ExitCode);
        Assert.Equal("null", result.Output.Trim());
        Assert.Empty(result.Error);
    }

    [Fact]
    public async Task ServiceStartUsesOnlyTheMatchingStoppedServiceAndReturnsFreshMetadata()
    {
        var result = await QueryFakeService(_root, '"' + CloudflaredLaunch.ExecutablePath(_root) + '"' + " tunnel run --token private-token",
            startIfStopped: true, state: "Stopped", allowStart: true);
        Assert.Equal(0, result.ExitCode);
        using var json = JsonDocument.Parse(result.Output);
        Assert.Equal("Running", json.RootElement.GetProperty("State").GetString());
        Assert.Equal(456, json.RootElement.GetProperty("ProcessId").GetInt32());
        Assert.DoesNotContain("private-token", result.Output + result.Error);
    }

    [Theory]
    [InlineData("Running")]
    [InlineData("Start Pending")]
    public async Task ServiceStartLeavesAnExistingRunningOrStartingInstanceAlone(string state)
    {
        var result = await QueryFakeService(_root, '"' + CloudflaredLaunch.ExecutablePath(_root) + '"',
            startIfStopped: true, state: state);
        Assert.Equal(0, result.ExitCode);
        using var json = JsonDocument.Parse(result.Output);
        Assert.Equal(state, json.RootElement.GetProperty("State").GetString());
        Assert.Equal(123, json.RootElement.GetProperty("ProcessId").GetInt32());
    }

    [Fact]
    public async Task MissingServiceRemainsAbsentWithoutStartingAnything()
    {
        var result = await RunPowerShell("function Get-CimInstance { $null };function Start-Service { throw 'Must not start' };" +
            CloudflaredLaunch.ServiceQueryScript(_root, startIfStopped: true));
        Assert.Equal(0, result.ExitCode);
        Assert.Equal("null", result.Output.Trim());
        Assert.Empty(result.Error);
    }

    [Fact]
    public async Task ServiceQueryFailureIsNotReportedAsAbsentOrLeaked()
    {
        var result = await RunPowerShell("function Get-CimInstance { throw 'private-token' };" + CloudflaredLaunch.ServiceQueryScript(_root));
        Assert.NotEqual(0, result.ExitCode);
        Assert.Empty(result.Output);
        Assert.Contains("Cloudflared service query failed.", result.Error);
        Assert.DoesNotContain("private-token", result.Error);
    }

    [Fact]
    public async Task UnreadableServiceIdentityIsNotReportedAsAbsent()
    {
        var result = await QueryFakeService(_root, string.Empty);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Empty(result.Output);
        Assert.Contains("Cloudflared service query failed.", result.Error);
    }

    private static Task<(int ExitCode, string Output, string Error)> QueryFakeService(string root, string command,
        bool startIfStopped = false, string state = "Running", bool allowStart = false)
    {
        var fixture = JsonSerializer.Serialize(new { Name = "Cloudflared", State = state, ProcessId = 123, PathName = command })
            .Replace("'", "''");
        var script = "$script:fixture=ConvertFrom-Json '" + fixture + "';" +
            "function Get-CimInstance { $script:fixture };" +
            "function Start-Service { param($Name) " + (allowStart
                ? "if($Name -ne 'Cloudflared') { throw 'Unexpected service' };$script:fixture.State='Running';$script:fixture.ProcessId=456"
                : "throw 'Start-Service must not run'") + " };" +
            CloudflaredLaunch.ServiceQueryScript(root, startIfStopped);
        return RunPowerShell(script);
    }

    private static async Task<(int ExitCode, string Output, string Error)> RunPowerShell(string script)
    {
        var info = new ProcessStartInfo("powershell.exe") {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
        };
        foreach (var argument in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
            Convert.ToBase64String(Encoding.Unicode.GetBytes("$ProgressPreference='SilentlyContinue';" + script)) }) info.ArgumentList.Add(argument);
        using var process = Process.Start(info)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); }
        catch (TimeoutException) { process.Kill(entireProcessTree: true); throw; }
        return (process.ExitCode, await output, await error);
    }
}
