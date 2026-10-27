using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

public sealed class HealthResponseTimeoutTests
{
    [Fact]
    public async Task PartialResponseBodyCannotHoldHealthPollingPastHttpTimeout()
    {
        var root = Path.Combine(Path.GetTempPath(), "agent-core-health-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var headersSent = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseBody = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var server = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync(deadline.Token);
            await using var stream = client.GetStream();
            using var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, leaveOpen: true);
            while (await reader.ReadLineAsync(deadline.Token) is { Length: > 0 }) { }
            await stream.WriteAsync(Encoding.ASCII.GetBytes(
                "HTTP/1.1 200 OK\r\nContent-Length: 20\r\nConnection: close\r\n\r\n{"), deadline.Token);
            await stream.FlushAsync(deadline.Token);
            headersSent.SetResult();
            await releaseBody.Task.WaitAsync(deadline.Token);
        });
        try
        {
            // This disposable root owns journal/control files; initialization never starts Core or a GUI.
            using var runtime = new AgentCoreRuntime(root);
            var client = (HttpClient)typeof(AgentCoreRuntime).GetField("_http", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(runtime)!;
            client.Timeout = TimeSpan.FromMilliseconds(300);
            var method = typeof(AgentCoreRuntime).GetMethod("TryGetStringAsync", BindingFlags.Instance | BindingFlags.NonPublic)!;
            var elapsed = Stopwatch.StartNew();
            var response = (Task<string?>)method.Invoke(runtime, new object[] {
                $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/health"
            })!;
            await headersSent.Task.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.Null(await response.WaitAsync(TimeSpan.FromSeconds(3)));
            Assert.InRange(elapsed.Elapsed, TimeSpan.FromMilliseconds(100), TimeSpan.FromSeconds(3));
        }
        finally
        {
            releaseBody.TrySetResult();
            listener.Stop();
            await server;
            Directory.Delete(root, recursive: true);
        }
    }
}
