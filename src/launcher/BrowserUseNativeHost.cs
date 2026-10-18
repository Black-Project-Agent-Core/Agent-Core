using System.Buffers;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading.Channels;

namespace AgentCore.Launcher;

// Adapted from iFurySt/open-browser-use internal/host/relay.go and internal/wire/frame.go
// at b136cac71a3c497b5696aefd871dd15cba7d7559. MIT, Copyright (c) 2026 Leo.
// The MIT permission and warranty notice are retained in ../rdc/browser-control/open-browser-use-LICENSE.txt.
public static class BrowserUseNativeHost
{
    public const string HostName = "com.ifuryst.open_browser_use.extension";
    public const string ExtensionId = "bgjoihaepiejlfjinojjfgokghnodnhd";
    private const int MaxFrame = 1024 * 1024;
    private const int MaxClients = 16;
    private const int MaxPending = 128;
    private const int MaxClientPending = 16;

    public static bool TryRunHelperMode(string[] args)
    {
        if (args.Contains("--browser-use-transport", StringComparer.Ordinal))
        {
            try
            {
                if (args.Length != 2 || args[0] != "--browser-use-transport" || !Path.IsPathFullyQualified(args[1]))
                    throw new InvalidDataException("BROWSER_OBU_TRANSPORT_PATH_REFUSED");
                RunTransportAsync(RootLocator.Find(), args[1], Console.OpenStandardInput(), Console.OpenStandardOutput()).GetAwaiter().GetResult();
            }
            catch { Console.Error.WriteLine("BROWSER_OBU_TRANSPORT_FAILED"); Environment.ExitCode = 1; }
            return true;
        }
        var origin = "chrome-extension://" + ExtensionId + "/";
        var foundOrigin = false;
        var foundParent = false;
        for (var index = 0; index < args.Length; index++)
        {
            if (args[index] == origin && !foundOrigin) { foundOrigin = true; continue; }
            var argument = args[index];
            string? parent = null;
            if (argument.StartsWith("--parent-window=", StringComparison.Ordinal)) parent = argument[16..];
            else if (argument == "--parent-window" && index + 1 < args.Length) parent = args[++index];
            if (foundParent || parent is null || parent.Length == 0 || !parent.All(char.IsAsciiDigit)
                || !ulong.TryParse(parent, out _)) return false;
            foundParent = true;
        }
        if (!foundOrigin) return false;
        try
        {
            RunOwnedAsync(RootLocator.Find(), Console.OpenStandardInput(), Console.OpenStandardOutput()).GetAwaiter().GetResult();
        }
        catch { Console.Error.WriteLine("BROWSER_OBU_NATIVE_HOST_FAILED"); Environment.ExitCode = 1; }
        return true;
    }

    public static async Task RunAsync(string root, Stream input, Stream output, CancellationToken cancellationToken = default)
    {
        using var relay = new Relay(root, input, output, cancellationToken);
        await relay.Run();
    }

    public static async Task RunTransportAsync(string root, string socket, Stream input, Stream output, CancellationToken cancellationToken = default)
    {
        var endpoint = ValidateManagedSocket(root, socket);
        using var stopping = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        using var connection = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        using (var connecting = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token))
        {
            connecting.CancelAfter(TimeSpan.FromSeconds(3));
            await connection.ConnectAsync(new UnixDomainSocketEndPoint(endpoint), connecting.Token);
        }
        using var network = new NetworkStream(connection, ownsSocket: false);
        using var cancellation = stopping.Token.Register(() =>
        {
            connection.Dispose();
            input.Dispose();
            output.Dispose();
        });
        // Console streams may use synchronous native pipe reads; start each direction independently.
        var copies = new[] { Task.Run(() => CopyBounded(input, network, stopping.Token)),
            Task.Run(() => CopyBounded(network, output, stopping.Token)) };
        try { await await Task.WhenAny(copies); }
        catch (Exception error) when (stopping.IsCancellationRequested && error is OperationCanceledException or ObjectDisposedException or IOException or SocketException) { }
        finally
        {
            stopping.Cancel();
            foreach (var copy in copies) { try { await copy.WaitAsync(TimeSpan.FromSeconds(1)); } catch { } }
        }
    }

    private static string ValidateManagedSocket(string root, string socket)
    {
        if (!Path.IsPathFullyQualified(socket)) throw new InvalidDataException("BROWSER_OBU_TRANSPORT_PATH_REFUSED");
        var project = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        var managed = Path.Combine(project, "runtime", "rdc", "browser-control", "managed");
        var endpoint = Path.GetFullPath(socket);
        var name = Path.GetFileName(endpoint);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (!string.Equals(Path.GetDirectoryName(endpoint), managed, comparison) || name.Length != 37
            || !name.EndsWith(".sock", StringComparison.Ordinal) || name[..32].Any(character => !(character is >= '0' and <= '9' or >= 'a' and <= 'f')))
            throw new InvalidDataException("BROWSER_OBU_TRANSPORT_PATH_REFUSED");
        // .NET AF_UNIX endpoints appear as regular Archive files on Windows. Connect validates the
        // endpoint itself; reject symlinks/reparse points rather than relying on a Unix file-mode bit.
        for (var current = endpoint; ; current = Path.GetDirectoryName(current)!)
        {
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("BROWSER_OBU_TRANSPORT_PATH_REFUSED");
            if (string.Equals(current, project, comparison)) break;
        }
        return endpoint;
    }

    private static async Task CopyBounded(Stream input, Stream output, CancellationToken cancellationToken)
    {
        var bytes = new byte[16 * 1024];
        while (true)
        {
            var count = await input.ReadAsync(bytes, cancellationToken).AsTask().WaitAsync(cancellationToken);
            if (count == 0) return;
            await output.WriteAsync(bytes.AsMemory(0, count), cancellationToken).AsTask().WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
            await output.FlushAsync(cancellationToken).WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
        }
    }

    // The production helper belongs to the current Node Core lifetime, even when Chrome owns its OS process.
    internal static async Task RunOwnedAsync(string root, Stream input, Stream output)
    {
        var owner = ReadOwner(root);
        if (owner is null) return;
        using var stopping = new CancellationTokenSource();
        var watcher = WatchOwner(root, owner, stopping);
        try { await RunAsync(root, input, output, stopping.Token); }
        finally
        {
            stopping.Cancel();
            try { await watcher; } catch (OperationCanceledException) { }
        }
    }

    private sealed record Owner(int Pid, long StartedAt, long ProcessStartTicks);

    private static Owner? ReadOwner(string root)
    {
        try
        {
            var marker = Path.Combine(root, "runtime", "rdc", "browser-control", "managed", "core-owner.json");
            using var file = new FileStream(marker, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            if (file.Length is < 2 or > 1024) return null;
            var bytes = new byte[1025];
            var length = 0;
            while (length < bytes.Length)
            {
                var count = file.Read(bytes, length, bytes.Length - length);
                if (count == 0) break;
                length += count;
            }
            if (length > 1024) return null;
            using var document = JsonDocument.Parse(bytes.AsMemory(0, length), new JsonDocumentOptions { MaxDepth = 8 });
            var value = document.RootElement;
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("pid", out var pidValue) || !pidValue.TryGetInt32(out var pid)
                || pid <= 0 || !value.TryGetProperty("startedAt", out var timeValue) || !timeValue.TryGetInt64(out var startedAt)) return null;
            using var process = Process.GetProcessById(pid);
            if (process.HasExited) return null;
            var start = process.StartTime.ToUniversalTime();
            // A stale marker must not bind a new process that reused an old PID.
            if (startedAt < new DateTimeOffset(start).ToUnixTimeMilliseconds() || startedAt > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 5000) return null;
            return new Owner(pid, startedAt, start.Ticks);
        }
        catch { return null; }
    }

    private static async Task WatchOwner(string root, Owner owner, CancellationTokenSource stopping)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(500));
        while (await timer.WaitForNextTickAsync(stopping.Token))
        {
            if (ReadOwner(root) == owner) continue;
            stopping.Cancel();
            return;
        }
    }

    private sealed class Client
    {
        public readonly long Id;
        public readonly NetworkStream Stream;
        public readonly Channel<byte[]> Outgoing = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(8)
            { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
        public int Pending;
        public Client(long id, Socket socket) { Id = id; Stream = new NetworkStream(socket, ownsSocket: true); }
    }

    private sealed record Pending(Client Client, JsonElement OriginalId);
    private sealed record ExtensionWrite(Client Client, string? Id, byte[] Payload);

    private sealed class Relay : IDisposable
    {
        private readonly object gate = new();
        private readonly Dictionary<long, Client> clients = new();
        private readonly Dictionary<string, Pending> pending = new(StringComparer.Ordinal);
        private readonly ConcurrentDictionary<long, Task> workers = new();
        private readonly Channel<ExtensionWrite> outgoing = Channel.CreateBounded<ExtensionWrite>(new BoundedChannelOptions(16)
            { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
        private readonly Socket listener = new(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        private readonly CancellationTokenSource stopping;
        private readonly Stream input;
        private readonly Stream output;
        private readonly string socketPath;
        private readonly string prefix = "obu:" + Guid.NewGuid().ToString("N") + ":";
        private long nextClient;
        private long nextRequest;
        private bool bound;
        private CancellationTokenRegistration cancellation;

        public Relay(string root, Stream input, Stream output, CancellationToken cancellationToken)
        {
            this.input = input; this.output = output;
            stopping = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var directory = Path.Combine(Path.GetFullPath(root), "runtime", "rdc", "browser-control", "managed");
            Directory.CreateDirectory(directory);
            socketPath = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".sock");
            try
            {
                // Bind is exclusive. Never unlink an existing socket or overwrite shared discovery state.
                listener.Bind(new UnixDomainSocketEndPoint(socketPath));
                bound = true;
                listener.Listen(MaxClients);
                cancellation = stopping.Token.Register(Shutdown);
            }
            catch { Dispose(); throw; }
        }

        public async Task Run()
        {
            var loops = new[] { Accept(), Task.Run(ReadExtension), WriteExtension() };
            try
            {
                var completed = await Task.WhenAny(loops);
                await completed;
            }
            catch (Exception error) when (stopping.IsCancellationRequested && error is OperationCanceledException or ObjectDisposedException or IOException or SocketException) { }
            finally
            {
                stopping.Cancel();
                foreach (var loop in loops) { try { await loop; } catch { } }
                await Task.WhenAll(workers.Values.ToArray());
            }
        }

        private async Task Accept()
        {
            while (!stopping.IsCancellationRequested)
            {
                var socket = await listener.AcceptAsync(stopping.Token);
                Client? client = null;
                lock (gate)
                {
                    if (!stopping.IsCancellationRequested && clients.Count < MaxClients)
                    {
                        client = new Client(++nextClient, socket);
                        clients.Add(client.Id, client);
                    }
                }
                if (client is null) { socket.Dispose(); continue; }
                var id = client.Id;
                var worker = RunClient(client);
                workers[id] = worker;
                _ = worker.ContinueWith(completed => { workers.TryRemove(id, out var ignored); },
                    CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
        }

        private async Task RunClient(Client client)
        {
            var writer = WriteClient(client);
            try
            {
                while (!stopping.IsCancellationRequested)
                {
                    var bytes = await ReadFrame(client.Stream, stopping.Token);
                    if (bytes is null) break;
                    using var document = Parse(bytes);
                    var message = document.RootElement;
                    if (!IsNotification(message) || message.TryGetProperty("result", out _) || message.TryGetProperty("error", out _))
                        throw new InvalidDataException("BROWSER_OBU_REQUEST_INVALID");
                    string? hostId = null;
                    if (message.TryGetProperty("id", out var originalId))
                    {
                        if (!(originalId.ValueKind == JsonValueKind.String && originalId.GetString()!.Length <= 256)
                            && !(originalId.ValueKind == JsonValueKind.Number && originalId.TryGetInt64(out _)))
                            throw new InvalidDataException("BROWSER_OBU_REQUEST_ID_INVALID");
                        lock (gate)
                        {
                            if (!clients.ContainsKey(client.Id) || client.Pending >= MaxClientPending || pending.Count >= MaxPending)
                                throw new InvalidDataException("BROWSER_OBU_PENDING_LIMIT");
                            hostId = prefix + (++nextRequest);
                            pending.Add(hostId, new Pending(client, originalId.Clone()));
                            client.Pending++;
                        }
                        bytes = RewriteId(message, hostId);
                    }
                    if (!outgoing.Writer.TryWrite(new ExtensionWrite(client, hostId, bytes)))
                        throw new InvalidDataException("BROWSER_OBU_WRITE_QUEUE_LIMIT");
                }
            }
            catch { /* Invalid or disconnected local clients cannot terminate other sessions. */ }
            finally
            {
                Drop(client);
                try { await writer; } catch { }
            }
        }

        private async Task WriteClient(Client client)
        {
            try
            {
                await foreach (var bytes in client.Outgoing.Reader.ReadAllAsync(stopping.Token))
                    await WriteFrame(client.Stream, bytes, stopping.Token);
            }
            catch { Drop(client); }
        }

        private async Task WriteExtension()
        {
            await foreach (var item in outgoing.Reader.ReadAllAsync(stopping.Token))
            {
                lock (gate)
                {
                    if (!clients.ContainsKey(item.Client.Id) || (item.Id is not null && !pending.ContainsKey(item.Id))) continue;
                }
                await WriteFrame(output, item.Payload, stopping.Token);
            }
        }

        private async Task ReadExtension()
        {
            while (!stopping.IsCancellationRequested)
            {
                var bytes = await ReadFrame(input, stopping.Token);
                if (bytes is null) return;
                using var document = Parse(bytes);
                var message = document.RootElement;
                if (message.TryGetProperty("id", out var id))
                {
                    if (message.TryGetProperty("method", out _) || message.TryGetProperty("result", out _) == message.TryGetProperty("error", out _))
                        throw new InvalidDataException("BROWSER_OBU_RESPONSE_INVALID");
                    Pending? match = null;
                    lock (gate)
                    {
                        if (id.ValueKind == JsonValueKind.String && pending.Remove(id.GetString()!, out match)) match.Client.Pending--;
                    }
                    // Unknown, late and disconnected-client responses are never broadcast.
                    if (match is not null && !match.Client.Outgoing.Writer.TryWrite(RewriteId(message, match.OriginalId))) Drop(match.Client);
                }
                else
                {
                    if (!IsNotification(message) || message.TryGetProperty("result", out _) || message.TryGetProperty("error", out _))
                        throw new InvalidDataException("BROWSER_OBU_NOTIFICATION_INVALID");
                    Client[] targets;
                    lock (gate) targets = clients.Values.ToArray();
                    foreach (var client in targets) if (!client.Outgoing.Writer.TryWrite(bytes)) Drop(client);
                }
            }
        }

        private void Drop(Client client)
        {
            lock (gate)
            {
                clients.Remove(client.Id);
                foreach (var id in pending.Where(entry => entry.Value.Client == client).Select(entry => entry.Key).ToArray()) pending.Remove(id);
                client.Pending = 0;
            }
            client.Outgoing.Writer.TryComplete();
            client.Stream.Dispose();
        }

        private void Shutdown()
        {
            listener.Dispose();
            outgoing.Writer.TryComplete();
            input.Dispose();
            output.Dispose();
            Client[] snapshot;
            lock (gate) snapshot = clients.Values.ToArray();
            foreach (var client in snapshot) Drop(client);
        }

        public void Dispose()
        {
            stopping.Cancel();
            cancellation.Dispose();
            listener.Dispose();
            if (bound) { try { File.Delete(socketPath); } catch { } bound = false; }
            stopping.Dispose();
        }
    }

    private static JsonDocument Parse(byte[] bytes)
    {
        var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 64 });
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("jsonrpc", out var version)
            || version.ValueKind != JsonValueKind.String || version.GetString() != "2.0"
            || root.EnumerateObject().Select(property => property.Name).Distinct(StringComparer.Ordinal).Count() != root.EnumerateObject().Count())
        { document.Dispose(); throw new InvalidDataException("BROWSER_OBU_JSON_INVALID"); }
        return document;
    }

    private static bool IsNotification(JsonElement message) => message.TryGetProperty("method", out var method)
        && method.ValueKind == JsonValueKind.String && method.GetString()!.Length is > 0 and <= 256;

    private static byte[] RewriteId(JsonElement message, object id)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            foreach (var property in message.EnumerateObject())
            {
                if (property.Name != "id") property.WriteTo(writer);
                else
                {
                    writer.WritePropertyName("id");
                    if (id is JsonElement original) original.WriteTo(writer); else writer.WriteStringValue((string)id);
                }
            }
            writer.WriteEndObject();
        }
        if (buffer.WrittenCount > MaxFrame) throw new InvalidDataException("BROWSER_OBU_FRAME_TOO_LARGE");
        return buffer.WrittenSpan.ToArray();
    }

    private static async Task<byte[]?> ReadFrame(Stream stream, CancellationToken cancellationToken)
    {
        var header = new byte[4];
        var received = await stream.ReadAsync(header, cancellationToken).AsTask().WaitAsync(cancellationToken);
        if (received == 0) return null;
        await stream.ReadExactlyAsync(header.AsMemory(received), cancellationToken).AsTask().WaitAsync(cancellationToken);
        var length = BitConverter.ToUInt32(header);
        if (length < 2 || length > MaxFrame) throw new InvalidDataException("BROWSER_OBU_FRAME_INVALID");
        var bytes = new byte[(int)length];
        await stream.ReadExactlyAsync(bytes, cancellationToken).AsTask().WaitAsync(cancellationToken);
        return bytes;
    }

    private static async Task WriteFrame(Stream stream, byte[] bytes, CancellationToken cancellationToken)
    {
        if (bytes.Length > MaxFrame) throw new InvalidDataException("BROWSER_OBU_FRAME_TOO_LARGE");
        var frame = new byte[bytes.Length + 4];
        BitConverter.TryWriteBytes(frame.AsSpan(0, 4), bytes.Length);
        bytes.CopyTo(frame, 4);
        await stream.WriteAsync(frame, cancellationToken).AsTask().WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
        await stream.FlushAsync(cancellationToken).WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
    }
}
