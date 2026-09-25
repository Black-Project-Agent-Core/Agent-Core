using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

public sealed class DesktopStatusMapperTests
{
    [Fact]
    public void HealthyBridgeReportsTruthfulExecutionAndAvailableMemoryState()
    {
        const string health = """{"status":"ok","execution":{"status":"available","mode":"rdc-direct"},"memory":{"status":"available","mode":"file-native"}}""";
        var status = DesktopStatusMapper.FromHealth(health, tunnelReady: true, autostart: true, root: @"C:\AgentCoreTest");

        Assert.Equal("online", status.Overall);
        Assert.Equal("on", status.Connection);
        Assert.Equal("available", status.Memory);
        Assert.Equal("on", status.Tunnel);
        Assert.Equal("available", status.Execution);
        Assert.True(status.Autostart);
    }

    [Fact]
    public void DegradedMemoryDegradesOverallWithoutTurningOffBridge()
    {
        const string health = """{"status":"ok","execution":{"status":"available","mode":"rdc-direct"},"memory":{"status":"degraded","mode":"file-native"}}""";
        var status = DesktopStatusMapper.FromHealth(health, tunnelReady: true, autostart: false, root: @"C:\AgentCoreTest");

        Assert.Equal("degraded", status.Overall);
        Assert.Equal("on", status.Connection);
        Assert.Equal("degraded", status.Memory);
        Assert.Equal("on", status.Tunnel);
        Assert.Equal("available", status.Execution);
    }
    [Fact]
    public void UnavailableExecutionDegradesOverallStatus()
    {
        const string health = """{"status":"ok","execution":{"status":"unavailable","mode":"rdc-direct"},"memory":{"status":"available","mode":"file-native"}}""";
        var status = DesktopStatusMapper.FromHealth(health, tunnelReady: true, autostart: false, root: @"C:\AgentCoreTest");

        Assert.Equal("degraded", status.Overall);
        Assert.Equal("on", status.Connection);
        Assert.Equal("available", status.Memory);
        Assert.Equal("on", status.Tunnel);
        Assert.Equal("unavailable", status.Execution);
    }

    [Fact]
    public void PhoneControllerAvailableTurnsGameModeOn()
    {
        const string health = """{"status":"ok","execution":{"status":"available"},"memory":{"status":"available"},"phone":{"status":"available"}}""";
        var status = DesktopStatusMapper.FromHealth(health, tunnelReady: true, autostart: false, root: @"C:\AgentCoreTest");

        Assert.Equal("on", status.GameMode);
        Assert.Equal("online", status.Overall);
    }

    [Fact]
    public void DisruptedPhoneControllerTurnsGameModeOffWithoutDegradingOverall()
    {
        const string health = """{"status":"ok","execution":{"status":"available"},"memory":{"status":"available"},"phone":{"status":"unavailable"}}""";
        var status = DesktopStatusMapper.FromHealth(health, tunnelReady: true, autostart: false, root: @"C:\AgentCoreTest");

        Assert.Equal("off", status.GameMode);
        // Game Mode is an independent indicator: an unplugged phone must not degrade Agent Core overall.
        Assert.Equal("online", status.Overall);
    }

    [Fact]
    public void MissingPhoneSectionDefaultsGameModeOff()
    {
        const string health = """{"status":"ok","execution":{"status":"available"},"memory":{"status":"available"}}""";
        var status = DesktopStatusMapper.FromHealth(health, tunnelReady: true, autostart: false, root: @"C:\AgentCoreTest");

        Assert.Equal("off", status.GameMode);
    }

}
