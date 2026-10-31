using System;
using System.IO;
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
}
