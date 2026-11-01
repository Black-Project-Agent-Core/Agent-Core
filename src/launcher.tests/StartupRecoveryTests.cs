using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

public sealed class StartupRecoveryTests
{
    [Fact]
    public async Task FailedBringupKeepsOneRecoveryLoopAliveUntilDisposed()
    {
        var root = Path.Combine(Path.GetTempPath(), "agent-core-startup-" + Guid.NewGuid().ToString("N"));
        var runtime = new AgentCoreRuntime(root);
        try
        {
            // This root has no Core entry, so startup fails without starting or stopping a service.
            await Assert.ThrowsAnyAsync<Exception>(() => runtime.InitializeAsync());
            var recovery = typeof(AgentCoreRuntime).GetField("_watchdogTask", BindingFlags.Instance | BindingFlags.NonPublic)
                ?.GetValue(runtime) as Task;
            Assert.NotNull(recovery);
            Assert.False(recovery!.IsCompleted);

            await Assert.ThrowsAnyAsync<Exception>(() => runtime.InitializeAsync());
            Assert.Same(recovery, typeof(AgentCoreRuntime).GetField("_watchdogTask", BindingFlags.Instance | BindingFlags.NonPublic)!
                .GetValue(runtime));
            runtime.Dispose();
            await recovery.WaitAsync(TimeSpan.FromSeconds(3));
        }
        finally
        {
            runtime.Dispose();
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}
