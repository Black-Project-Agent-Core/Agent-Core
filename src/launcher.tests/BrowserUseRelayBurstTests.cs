using System;
using System.IO;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

public sealed class BrowserUseRelayBurstTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task NotificationBurstRetainsHealthyClientAndIsolatesStalledPeer(bool includeStalledPeer)
    {
        var project = Path.GetFullPath(RootLocator.Find());
        // AF_UNIX paths have a short native limit; the normal Windows temp path is too long.
        var root = Path.Combine(project, "o" + Guid.NewGuid().ToString("N")[..8]);
        Assert.False(Directory.Exists(root));
        Directory.CreateDirectory(root);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        using var input = new QueuedStream();
        using var output = new QueuedStream();
        var relay = BrowserUseNativeHost.RunAsync(root, input, output, timeout.Token);
        try
        {
            var directory = Path.Combine(root, "runtime", "rdc", "browser-control", "managed");
            var endpoint = new UnixDomainSocketEndPoint(Assert.Single(Directory.GetFiles(directory, "*.sock")));
            using var healthySocket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified)
                { ReceiveBufferSize = 4096 };
            await healthySocket.ConnectAsync(endpoint, timeout.Token);
            using var healthy = new NetworkStream(healthySocket, ownsSocket: false);
            await RoundTrip(healthy, input, output, "ready", timeout.Token);

            using var stalledSocket = includeStalledPeer
                ? new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified) { ReceiveBufferSize = 4096 }
                : null;
            if (stalledSocket is not null) await stalledSocket.ConnectAsync(endpoint, timeout.Token);
            using var stalled = stalledSocket is null ? null : new NetworkStream(stalledSocket, ownsSocket: false);
            if (stalled is not null) await RoundTrip(stalled, input, output, "stalled-ready", timeout.Token);

            const int count = 256;
            var received = ReadBurst(healthy, count, timeout.Token);
            for (var index = 0; index < count; index++)
                await input.WriteAsync(Frame(new { jsonrpc = "2.0", method = "Page.frameNavigated",
                    @params = new { sequence = index, padding = new string('x', 2800) } }), timeout.Token);
            await received.WaitAsync(TimeSpan.FromSeconds(5));
            await RoundTrip(healthy, input, output, "after-burst", timeout.Token);

            if (stalled is not null)
            {
                var buffer = new byte[8192];
                while (await stalled.ReadAsync(buffer, timeout.Token).AsTask().WaitAsync(TimeSpan.FromSeconds(3)) != 0) { }
            }
        }
        finally
        {
            timeout.Cancel();
            await relay.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.Equal(project, Directory.GetParent(Path.GetFullPath(root))!.FullName);
            Directory.Delete(root, recursive: true);
        }
    }

    private static async Task ReadBurst(Stream client, int count, CancellationToken cancellationToken)
    {
        // A healthy reader can be descheduled briefly while navigation events arrive together.
        await Task.Delay(120, cancellationToken);
        for (var index = 0; index < count; index++)
        {
            using var message = await ReadFrame(client, cancellationToken);
            Assert.Equal("Page.frameNavigated", message.RootElement.GetProperty("method").GetString());
            Assert.Equal(index, message.RootElement.GetProperty("params").GetProperty("sequence").GetInt32());
        }
    }

    private static async Task RoundTrip(Stream client, Stream input, Stream output, string id, CancellationToken cancellationToken)
    {
        await client.WriteAsync(Frame(new { jsonrpc = "2.0", id, method = "fixture.ready" }), cancellationToken);
        using var forwarded = await ReadFrame(output, cancellationToken);
        var hostId = forwarded.RootElement.GetProperty("id").GetString();
        await input.WriteAsync(Frame(new { jsonrpc = "2.0", id = hostId, result = new { ok = true } }), cancellationToken);
        using var response = await ReadFrame(client, cancellationToken);
        Assert.Equal(id, response.RootElement.GetProperty("id").GetString());
        Assert.True(response.RootElement.GetProperty("result").GetProperty("ok").GetBoolean());
    }

    private static byte[] Frame(object message)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(message);
        var frame = new byte[bytes.Length + 4];
        BitConverter.GetBytes(bytes.Length).CopyTo(frame, 0);
        bytes.CopyTo(frame, 4);
        return frame;
    }

    private static async Task<JsonDocument> ReadFrame(Stream stream, CancellationToken cancellationToken)
    {
        var header = new byte[4];
        await stream.ReadExactlyAsync(header, cancellationToken);
        var length = BitConverter.ToInt32(header);
        Assert.InRange(length, 2, 1024 * 1024);
        var bytes = new byte[length];
        await stream.ReadExactlyAsync(bytes, cancellationToken);
        return JsonDocument.Parse(bytes);
    }

    private sealed class QueuedStream : Stream
    {
        private readonly Channel<byte[]> chunks = Channel.CreateUnbounded<byte[]>();
        private byte[]? current;
        private int offset;
        public override bool CanRead => true;
        public override bool CanWrite => true;
        public override bool CanSeek => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            while (current is null)
            {
                if (!await chunks.Reader.WaitToReadAsync(cancellationToken)) return 0;
                if (chunks.Reader.TryRead(out current)) offset = 0;
            }
            var count = Math.Min(buffer.Length, current.Length - offset);
            current.AsMemory(offset, count).CopyTo(buffer);
            offset += count;
            if (offset == current.Length) current = null;
            return count;
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default) =>
            chunks.Writer.WriteAsync(buffer.ToArray(), cancellationToken);
        public override void Flush() { }
        public override Task FlushAsync(CancellationToken cancellationToken) => Task.CompletedTask;
        protected override void Dispose(bool disposing) { chunks.Writer.TryComplete(); base.Dispose(disposing); }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
    }
}
