using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading.Tasks;
using AgentCore.Launcher;
using Xunit;
using Xunit.Abstractions;

namespace AgentCore.Launcher.Tests;

public sealed class WindowsTcpListenerTests
{
    private readonly ITestOutputHelper _output;

    public WindowsTcpListenerTests(ITestOutputHelper output) => _output = output;

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    public void FindsCurrentListenerAndDoesNotReuseClosedPort(string address)
    {
        using var listener = new TcpListener(IPAddress.Parse(address), 0);
        if (listener.Server.AddressFamily == AddressFamily.InterNetworkV6)
            listener.Server.DualMode = false;
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        Assert.Equal(Environment.ProcessId, WindowsTcpListener.GetProcessId(port));
        listener.Stop();
        Assert.Null(WindowsTcpListener.GetProcessId(port));
    }

    [Fact]
    public void BoundSocketWithoutListenerIsNotAnOwner()
    {
        using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        socket.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        var port = ((IPEndPoint)socket.LocalEndPoint!).Port;
        Assert.Null(WindowsTcpListener.GetProcessId(port));
    }

    [Fact]
    public async Task ProcessProbeRetainsIdentityWithinPassiveBudget()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-probe-{Guid.NewGuid():N}");
        try
        {
            using var runtime = new AgentCoreRuntime(root);
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var probe = typeof(AgentCoreRuntime).GetMethod("GetPortProcessInfoAsync", BindingFlags.Instance | BindingFlags.NonPublic)!;
            for (var sample = 0; sample < 5; sample++)
            {
                var elapsed = Stopwatch.StartNew();
                var task = (Task)probe.Invoke(runtime, new object[] { port, TimeSpan.FromSeconds(2) })!;
                await task;
                var info = task.GetType().GetProperty("Result")!.GetValue(task)!;
                Assert.NotNull(info);
                Assert.Equal(Environment.ProcessId, info.GetType().GetProperty("ProcessId")!.GetValue(info));
                Assert.Equal(Environment.ProcessPath, info.GetType().GetProperty("ExecutablePath")!.GetValue(info));
                Assert.False(string.IsNullOrWhiteSpace((string?)info.GetType().GetProperty("CommandLine")!.GetValue(info)));
                _output.WriteLine($"Identity probe {sample + 1}: {elapsed.ElapsedMilliseconds} ms");
            }
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(65536)]
    public void RejectsInvalidPorts(int port) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => WindowsTcpListener.GetProcessId(port));
}
