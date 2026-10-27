using System;
using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

public sealed class PassiveStatusGraceTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 24, 0, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(10);

    [Fact]
    public void SlowFirstFailureGetsFullGraceWithoutExtendingItOnRetries()
    {
        var status = new PassiveStatusGrace();
        Assert.True(status.Observe(true, Start, Grace));
        // Three seconds between polls plus a ten-second request timeout.
        Assert.True(status.Observe(false, Start.AddSeconds(13), Grace));
        Assert.True(status.Observe(false, Start.AddSeconds(22), Grace));
        Assert.False(status.Observe(false, Start.AddSeconds(24), Grace));
        Assert.False(status.Observe(false, Start.AddSeconds(30), Grace));
    }

    [Fact]
    public void SuccessRearmsGraceAndResetNeverInventsAvailability()
    {
        var status = new PassiveStatusGrace();
        Assert.False(status.Observe(false, Start, Grace));
        Assert.True(status.Observe(true, Start.AddSeconds(1), Grace));
        Assert.True(status.Observe(false, Start.AddSeconds(14), Grace));
        Assert.False(status.Observe(false, Start.AddSeconds(25), Grace));
        Assert.True(status.Observe(true, Start.AddSeconds(26), Grace));
        Assert.True(status.Observe(false, Start.AddSeconds(50), Grace));
        Assert.False(status.Observe(false, Start.AddSeconds(61), Grace));
        status.Reset();
        Assert.False(status.Observe(false, Start.AddSeconds(62), Grace));
        Assert.True(status.Observe(true, Start.AddSeconds(63), Grace));
        status.Reset();
        Assert.False(status.Observe(false, Start.AddSeconds(64), Grace));
    }
}
