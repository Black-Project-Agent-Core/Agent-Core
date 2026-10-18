using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using AgentCore.Launcher;

internal static class BrowserUseNativeHostTests
{
    private static async Task Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "owner") { await Task.Delay(TimeSpan.FromSeconds(30)); return; }
        if (args.Length > 0 && args[0] == "helper")
        {
            if (!BrowserUseNativeHost.TryRunHelperMode(args[1..])) Environment.ExitCode = 37;
            return;
        }
        var tests = new (string Name, Func<Task> Run)[] {
            ("correlates same IDs and out-of-order responses", CorrelatesIndependentClients),
            ("broadcasts notifications but discards orphan/disconnected responses", IsolatesNotifications),
            ("disconnects malformed/oversized clients without affecting healthy clients", RejectsInvalidClients),
            ("bounds per-client pending and releases disconnected requests", BoundsClientPending),
            ("bounds total pending and releases capacity on disconnect", BoundsTotalPending),
            ("admits sixteen clients and rejects the seventeenth", BoundsClients),
            ("terminates on malformed/oversized native frames", RejectsInvalidExtension),
            ("cleans owned socket and clients on native EOF", CleansOnEof),
            ("concurrent hosts own distinct sockets", PreservesOtherHostSocket),
            ("recognizes only exact extension native-host arguments", RecognizesHelperArguments),
            ("production owner marker stops relay when removed or replaced", BindsCoreLifetime),
            ("production wrapper refuses absent/malformed/dead/stale owner markers", RejectsInvalidOwners),
            ("production relay stops when owner process exits", StopsWithOwnerProcess),
            ("disconnects slow readers without blocking new clients", BoundsSlowReader),
            ("embedded stdio transport connects to native relay and routes a response", RelaysEmbeddedTransport),
            ("embedded transport refuses paths outside managed UUID socket scope", RejectsTransportPaths),
            ("embedded transport refuses an ordinary non-listening file", RejectsOrdinaryTransportFile),
            ("invalid transport helper arguments exit protocol mode without launcher fallback", RejectsTransportHelperArguments),
        };
        foreach (var test in tests) { await test.Run(); Console.WriteLine("PASS " + test.Name); }
        Console.WriteLine($"PASS {tests.Length} executable native relay tests (real AF_UNIX and extension streams)");
    }

    private static async Task IsolatesNotifications()
    {
        await using var fixture = await Fixture.Start();
        using var first = await fixture.Connect();
        using var second = await fixture.Connect();
        await Write(first, "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"getInfo\"}");
        using var request = await Read(fixture.Extension);
        var id = request.RootElement.GetProperty("id").GetString();
        await Write(fixture.Extension, JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result = "first" }));
        using var own = await Read(first);
        Check(own.RootElement.GetProperty("id").GetInt32() == 9, "numeric original ID must survive correlation");
        first.Dispose();
        await Write(fixture.Extension, JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result = "late" }));
        await Write(fixture.Extension, "{\"jsonrpc\":\"2.0\",\"id\":\"foreign\",\"error\":{\"code\":-1,\"message\":\"private\"}}");
        await Write(fixture.Extension, "{\"jsonrpc\":\"2.0\",\"method\":\"onCDPEvent\",\"params\":{\"source\":{\"tabId\":42}}}");
        using var notification = await Read(second);
        Check(!notification.RootElement.TryGetProperty("id", out _)
            && notification.RootElement.GetProperty("method").GetString() == "onCDPEvent", "orphan responses must never reach another client");
    }

    private static async Task RejectsInvalidClients()
    {
        await using var fixture = await Fixture.Start();
        using var healthy = await fixture.Connect();
        foreach (var invalid in new[] { "{broken", "[]", "{\"method\":\"getInfo\"}",
            "{\"jsonrpc\":\"2.0\",\"id\":\"a\",\"id\":\"b\",\"method\":\"getInfo\"}" })
        {
            using var bad = await fixture.Connect();
            await Write(bad, invalid);
            await Closed(bad);
        }
        using (var bad = await fixture.Connect())
        {
            await bad.WriteAsync(BitConverter.GetBytes(1024 * 1024 + 1));
            await Closed(bad);
        }
        await RoundTrip(fixture, healthy, "still-open");
    }

    private static async Task BoundsClientPending()
    {
        await using var fixture = await Fixture.Start();
        using var busy = await fixture.Connect();
        using var healthy = await fixture.Connect();
        for (var index = 0; index < 16; index++)
        {
            await Write(busy, JsonSerializer.Serialize(new { jsonrpc = "2.0", id = index, method = "getInfo" }));
            using var forwarded = await Read(fixture.Extension);
        }
        await Write(busy, "{\"jsonrpc\":\"2.0\",\"id\":17,\"method\":\"getInfo\"}");
        await Closed(busy);
        await RoundTrip(fixture, healthy, "pending-released");
    }

    private static async Task BoundsTotalPending()
    {
        await using var fixture = await Fixture.Start();
        var busy = new List<NetworkStream>();
        try
        {
            for (var clientIndex = 0; clientIndex < 8; clientIndex++)
            {
                var client = await fixture.Connect(); busy.Add(client);
                for (var index = 0; index < 16; index++)
                {
                    await Write(client, JsonSerializer.Serialize(new { jsonrpc = "2.0", id = index, method = "getInfo" }));
                    using var forwarded = await Read(fixture.Extension);
                }
            }
            using var overflow = await fixture.Connect();
            await Write(overflow, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getInfo\"}");
            await Closed(overflow);
            // A refused seventeenth request disconnects this client and releases its sixteen slots.
            await Write(busy[0], "{\"jsonrpc\":\"2.0\",\"id\":17,\"method\":\"getInfo\"}");
            await Closed(busy[0]);
            using var healthy = await fixture.Connect();
            await RoundTrip(fixture, healthy, "global-capacity-released");
        }
        finally { foreach (var client in busy) client.Dispose(); }
    }

    private static async Task BoundsClients()
    {
        await using var fixture = await Fixture.Start();
        var clients = new List<NetworkStream>();
        try
        {
            for (var index = 0; index < 16; index++)
            {
                var client = await fixture.Connect(); clients.Add(client);
                await RoundTrip(fixture, client, "client-" + index);
            }
            using var overflow = await fixture.Connect();
            await Closed(overflow);
            await RoundTrip(fixture, clients[0], "first-still-open");
        }
        finally { foreach (var client in clients) client.Dispose(); }
    }

    private static async Task RejectsInvalidExtension()
    {
        foreach (var oversized in new[] { false, true })
        {
            await using var fixture = await Fixture.Start();
            fixture.ExpectedHostFailure = true;
            using var client = await fixture.Connect();
            if (oversized) await fixture.Extension.WriteAsync(BitConverter.GetBytes(1024 * 1024 + 1));
            else await Write(fixture.Extension, "{broken");
            Exception? failure = null;
            try { await fixture.Host.WaitAsync(TimeSpan.FromSeconds(3)); } catch (Exception error) { failure = error; }
            Check(failure is JsonException or InvalidDataException, "invalid extension frames must fail closed with a bounded protocol error");
            Check(!File.Exists(fixture.SocketPath), "failed native connection must remove its own socket");
            await Closed(client);
        }
    }

    private static async Task CleansOnEof()
    {
        await using var fixture = await Fixture.Start();
        using var client = await fixture.Connect();
        await RoundTrip(fixture, client, "before-eof");
        fixture.Extension.Dispose();
        await fixture.Host.WaitAsync(TimeSpan.FromSeconds(3));
        Check(!File.Exists(fixture.SocketPath), "native EOF must remove owned endpoint");
        await Closed(client);
    }

    private static async Task PreservesOtherHostSocket()
    {
        await using var first = await Fixture.Start();
        var firstPath = first.SocketPath;
        var second = await Fixture.Start(first.Root);
        Check(firstPath != second.SocketPath, "each host must own a unique UUID socket");
        Check(Guid.TryParseExact(Path.GetFileNameWithoutExtension(second.SocketPath), "N", out _), "socket basename must be a UUID");
        await second.DisposeAsync();
        Check(File.Exists(firstPath), "stopping one host must preserve another host's live socket");
        using var client = await first.Connect();
        await RoundTrip(first, client, "first-host-retained");
    }

    private static async Task RecognizesHelperArguments()
    {
        var origin = "chrome-extension://bgjoihaepiejlfjinojjfgokghnodnhd/";
        foreach (var invalid in new[] { Array.Empty<string>(), new[] { "--native-host" }, new[] { origin + "other" },
            new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" }, new[] { origin, "extra" },
            new[] { origin, "--parent-window=evil" }, new[] { origin, origin } })
            Check(!BrowserUseNativeHost.TryRunHelperMode(invalid), "non-exact native-host command line must be rejected");
        foreach (var valid in new[] { new[] { origin }, new[] { origin, "--parent-window=0" }, new[] { "--parent-window", "123", origin } })
        {
            var start = SelfProcess();
            start.ArgumentList.Add("helper");
            foreach (var argument in valid) start.ArgumentList.Add(argument);
            using var process = System.Diagnostics.Process.Start(start)!;
            process.StandardInput.Close();
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            Check(process.ExitCode == 0, "exact native origin must enter helper mode and exit cleanly on EOF");
            Check((await process.StandardOutput.ReadToEndAsync()).Length == 0, "native helper stdout must contain no launcher/log output");
        }
    }

    private static System.Diagnostics.ProcessStartInfo SelfProcess()
    {
        var start = new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!)
        { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        if (Path.GetFileNameWithoutExtension(Environment.ProcessPath!).Equals("dotnet", StringComparison.OrdinalIgnoreCase))
            start.ArgumentList.Add(typeof(BrowserUseNativeHostTests).Assembly.Location);
        return start;
    }

    private static async Task BindsCoreLifetime()
    {
        foreach (var replace in new[] { false, true })
        {
            await using var fixture = await Fixture.Start(ownerBound: true);
            using var client = await fixture.Connect();
            await RoundTrip(fixture, client, "before-owner-change");
            var marker = Path.Combine(fixture.Root, "runtime", "rdc", "browser-control", "managed", "core-owner.json");
            if (replace) await File.WriteAllTextAsync(marker, JsonSerializer.Serialize(new { pid = Environment.ProcessId, startedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 1000 }));
            else File.Delete(marker);
            await fixture.Host.WaitAsync(TimeSpan.FromSeconds(3));
            Check(!File.Exists(fixture.SocketPath), "owner lifetime change must remove owned socket");
            await Closed(client);
        }
    }

    private static async Task StopsWithOwnerProcess()
    {
        var start = SelfProcess(); start.ArgumentList.Add("owner");
        using var owner = System.Diagnostics.Process.Start(start)!;
        try
        {
            await using var fixture = await Fixture.Start(ownerBound: true, ownerPid: owner.Id);
            using var client = await fixture.Connect();
            await RoundTrip(fixture, client, "owner-alive");
            owner.Kill();
            await owner.WaitForExitAsync();
            await fixture.Host.WaitAsync(TimeSpan.FromSeconds(3));
            await Closed(client);
            Check(!File.Exists(fixture.SocketPath), "owner process exit must remove native endpoint without deleting marker");
            Check(File.Exists(Path.Combine(fixture.Root, "runtime", "rdc", "browser-control", "managed", "core-owner.json")),
                "native host must not delete Core-owned marker");
        }
        finally { if (!owner.HasExited) { owner.Kill(); await owner.WaitForExitAsync(); } }
    }

    private static async Task BoundsSlowReader()
    {
        await using var fixture = await Fixture.Start();
        using var slow = await fixture.Connect();
        await RoundTrip(fixture, slow, "slow-client-ready");
        var notification = JsonSerializer.Serialize(new { jsonrpc = "2.0", method = "onCDPEvent", @params = new { data = new string('x', 1024 * 1024 - 200) } });
        for (var index = 0; index < 20; index++) await Write(fixture.Extension, notification);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        var buffer = new byte[65536];
        long received = 0;
        try
        {
            while (true)
            {
                var count = await slow.ReadAsync(buffer, timeout.Token);
                if (count == 0) break;
                received += count;
            }
        }
        catch (IOException) { }
        Check(received < (long)notification.Length * 20, "bounded outgoing queue must disconnect a stalled reader before all frames accumulate");
        using var healthy = await fixture.Connect();
        await RoundTrip(fixture, healthy, "relay-not-blocked");
    }

    private static async Task RelaysEmbeddedTransport()
    {
        await using var fixture = await Fixture.Start();
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        using var node = new TcpClient();
        TcpClient helper;
        try
        {
            await node.ConnectAsync((IPEndPoint)listener.LocalEndpoint);
            helper = await listener.AcceptTcpClientAsync();
        }
        finally { listener.Stop(); }
        using (helper)
        {
            using var stopping = new CancellationTokenSource();
            var stream = helper.GetStream();
            var transport = BrowserUseNativeHost.RunTransportAsync(fixture.Root, fixture.SocketPath, stream, stream, stopping.Token);
            Check(!transport.IsCompleted, "embedded transport must connect and remain attached for stdio traffic");
            await Write(node.GetStream(), "{\"jsonrpc\":\"2.0\",\"id\":\"node-info\",\"method\":\"getInfo\"}");
            using var forwarded = await Read(fixture.Extension);
            var id = forwarded.RootElement.GetProperty("id").GetString();
            await Write(fixture.Extension, JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result = new { type = "extension", version = "1.1.0" } }));
            using var response = await Read(node.GetStream());
            Check(response.RootElement.GetProperty("id").GetString() == "node-info"
                && response.RootElement.GetProperty("result").GetProperty("type").GetString() == "extension", "embedded transport must preserve the correlated response");
            node.Dispose();
            await transport.WaitAsync(TimeSpan.FromSeconds(3));
            Check(!fixture.Host.IsCompleted && File.Exists(fixture.SocketPath), "transport EOF must close only its client connection, preserving the native relay");
        }
    }

    private static async Task RejectsTransportPaths()
    {
        await using var fixture = await Fixture.Start();
        foreach (var path in new[] { Path.Combine(fixture.Root, Guid.NewGuid().ToString("N") + ".sock"),
            Path.Combine(Path.GetDirectoryName(fixture.SocketPath)!, "host.sock"),
            Path.Combine(Path.GetDirectoryName(fixture.SocketPath)!, new string('A', 32) + ".sock"), "relative.sock" })
        {
            using var input = new MemoryStream(); using var output = new MemoryStream();
            Exception? failure = null;
            try { await BrowserUseNativeHost.RunTransportAsync(fixture.Root, path, input, output); } catch (Exception error) { failure = error; }
            Check(failure is InvalidDataException && failure.Message == "BROWSER_OBU_TRANSPORT_PATH_REFUSED", "non-managed/non-UUID transport path must be refused before connection");
            Check(output.ToArray().Length == 0, "refused transport must not emit payload bytes");
        }
    }

    private static async Task RejectsOrdinaryTransportFile()
    {
        await using var fixture = await Fixture.Start();
        var path = Path.Combine(Path.GetDirectoryName(fixture.SocketPath)!, Guid.NewGuid().ToString("N") + ".sock");
        await File.WriteAllTextAsync(path, "ordinary-file-preserved");
        using var input = new MemoryStream(); using var output = new MemoryStream();
        Exception? failure = null;
        try { await BrowserUseNativeHost.RunTransportAsync(fixture.Root, path, input, output).WaitAsync(TimeSpan.FromSeconds(4)); }
        catch (Exception error) { failure = error; }
        Check(failure is SocketException, "a regular file with a socket name must fail the actual AF_UNIX connection");
        Check(await File.ReadAllTextAsync(path) == "ordinary-file-preserved", "failed transport must preserve ordinary files");
        Check(output.ToArray().Length == 0, "failed dial must not emit payload bytes");
    }

    private static async Task RejectsTransportHelperArguments()
    {
        foreach (var arguments in new[] { new[] { "--browser-use-transport" },
            new[] { "--browser-use-transport", "relative.sock" },
            new[] { "--browser-use-transport", Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".sock") },
            new[] { "extra", "--browser-use-transport", "relative.sock" } })
        {
            var start = SelfProcess(); start.ArgumentList.Add("helper");
            foreach (var argument in arguments) start.ArgumentList.Add(argument);
            using var process = System.Diagnostics.Process.Start(start)!;
            process.StandardInput.Close();
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            Check(process.ExitCode == 1, "invalid transport invocation must remain in handled helper mode");
            Check((await process.StandardOutput.ReadToEndAsync()).Length == 0, "rejected transport helper stdout must stay empty");
            Check((await process.StandardError.ReadToEndAsync()).Trim() == "BROWSER_OBU_TRANSPORT_FAILED",
                "rejected transport helper must emit only a fixed sanitized error");
        }
    }

    private static async Task RejectsInvalidOwners()
    {
        var root = Path.Combine(Directory.GetParent(Environment.CurrentDirectory)!.FullName, "obu-owner-test-" + Guid.NewGuid().ToString("N")[..6]);
        var directory = Path.Combine(root, "runtime", "rdc", "browser-control", "managed");
        Directory.CreateDirectory(directory);
        try
        {
            foreach (var marker in new string?[] { null, "{broken", new string('x', 1025),
                JsonSerializer.Serialize(new { pid = int.MaxValue, startedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }),
                JsonSerializer.Serialize(new { pid = Environment.ProcessId, startedAt = 1 }) })
            {
                var path = Path.Combine(directory, "core-owner.json");
                if (marker is null) File.Delete(path); else await File.WriteAllTextAsync(path, marker);
                using var input = new MemoryStream(); using var output = new MemoryStream();
                await BrowserUseNativeHost.RunOwnedAsync(root, input, output).WaitAsync(TimeSpan.FromSeconds(1));
                Check(Directory.GetFiles(directory, "*.sock").Length == 0 && output.Length == 0,
                    "invalid owner identity must not bind a relay or emit stdout");
            }
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    private static async Task RoundTrip(Fixture fixture, Stream client, string result)
    {
        await Write(client, "{\"jsonrpc\":\"2.0\",\"id\":\"request\",\"method\":\"getInfo\"}");
        using var forwarded = await Read(fixture.Extension);
        var id = forwarded.RootElement.GetProperty("id").GetString();
        await Write(fixture.Extension, JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result }));
        for (var count = 0; count < 32; count++)
        {
            using var response = await Read(client);
            if (!response.RootElement.TryGetProperty("id", out var responseId))
            {
                Check(response.RootElement.GetProperty("method").GetString() == "onCDPEvent", "only notifications may precede a correlated response");
                continue;
            }
            Check(responseId.GetString() == "request" && response.RootElement.GetProperty("result").GetString() == result,
                "request/response must remain available and isolated");
            return;
        }
        throw new InvalidOperationException("ASSERT: response must arrive within bounded notification traffic");
    }

    private static async Task Closed(Stream stream)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try { Check(await stream.ReadAsync(new byte[1], timeout.Token) == 0, "rejected/closed client must receive EOF, not payload data"); }
        catch (IOException) { } // Windows may report reset rather than EOF for an actively refused client.
    }

    private static async Task CorrelatesIndependentClients()
    {
        await using var fixture = await Fixture.Start();
        using var first = await fixture.Connect();
        using var second = await fixture.Connect();
        await Write(first, "{\"jsonrpc\":\"2.0\",\"id\":\"same\",\"method\":\"getInfo\"}");
        using var firstForwarded = await Read(fixture.Extension);
        await Write(second, "{\"jsonrpc\":\"2.0\",\"id\":\"same\",\"method\":\"getTabs\"}");
        using var secondForwarded = await Read(fixture.Extension);
        var firstId = firstForwarded.RootElement.GetProperty("id").GetString();
        var secondId = secondForwarded.RootElement.GetProperty("id").GetString();
        Check(firstId != secondId && firstId != "same" && secondId != "same", "host must assign distinct correlation IDs");
        await Write(fixture.Extension, JsonSerializer.Serialize(new { jsonrpc = "2.0", id = secondId, result = "second" }));
        await Write(fixture.Extension, JsonSerializer.Serialize(new { jsonrpc = "2.0", id = firstId, result = "first" }));
        using var secondResult = await Read(second);
        using var firstResult = await Read(first);
        Check(firstResult.RootElement.GetProperty("id").GetString() == "same"
            && firstResult.RootElement.GetProperty("result").GetString() == "first", "first response must preserve own ID and result");
        Check(secondResult.RootElement.GetProperty("id").GetString() == "same"
            && secondResult.RootElement.GetProperty("result").GetString() == "second", "second response must preserve own ID and result");
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException("ASSERT: " + message);
    }

    private static async Task Write(Stream stream, string json)
    {
        var payload = Encoding.UTF8.GetBytes(json);
        await stream.WriteAsync(BitConverter.GetBytes(payload.Length));
        await stream.WriteAsync(payload);
        await stream.FlushAsync();
    }

    private static async Task<JsonDocument> Read(Stream stream)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        var header = new byte[4];
        await stream.ReadExactlyAsync(header, timeout.Token);
        var length = BitConverter.ToInt32(header);
        Check(length is >= 2 and <= 1024 * 1024, "reply frame must be bounded");
        var payload = new byte[length];
        await stream.ReadExactlyAsync(payload, timeout.Token);
        return JsonDocument.Parse(payload);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        public readonly string Root;
        public string SocketPath = "";
        public NetworkStream Extension = null!;
        public Task Host = null!;
        public bool ExpectedHostFailure;
        private readonly bool ownsRoot;
        private readonly CancellationTokenSource stopping = new();
        private TcpClient peer = null!;
        private TcpClient hostPeer = null!;

        private Fixture(string? root)
        {
            ownsRoot = root is null;
            Root = root ?? Path.Combine(Directory.GetParent(Environment.CurrentDirectory)!.FullName, "obu-test-" + Guid.NewGuid().ToString("N")[..6]);
        }

        public static async Task<Fixture> Start(string? root = null, bool ownerBound = false, int? ownerPid = null)
        {
            var fixture = new Fixture(root);
            var directory = Path.Combine(fixture.Root, "runtime", "rdc", "browser-control", "managed");
            var existing = Directory.Exists(directory) ? Directory.GetFiles(directory, "*.sock").ToHashSet() : new HashSet<string>();
            if (ownerBound)
            {
                Directory.CreateDirectory(directory);
                await File.WriteAllTextAsync(Path.Combine(directory, "core-owner.json"),
                    JsonSerializer.Serialize(new { pid = ownerPid ?? Environment.ProcessId, startedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }));
            }
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            try
            {
                fixture.peer = new TcpClient();
                await fixture.peer.ConnectAsync((IPEndPoint)listener.LocalEndpoint);
                fixture.hostPeer = await listener.AcceptTcpClientAsync();
            }
            finally { listener.Stop(); }
            fixture.Extension = fixture.peer.GetStream();
            var hostStream = fixture.hostPeer.GetStream();
            fixture.Host = ownerBound ? BrowserUseNativeHost.RunOwnedAsync(fixture.Root, hostStream, hostStream)
                : BrowserUseNativeHost.RunAsync(fixture.Root, hostStream, hostStream, fixture.stopping.Token);
            for (var i = 0; i < 100; i++)
            {
                if (Directory.Exists(directory))
                {
                    fixture.SocketPath = Directory.GetFiles(directory, "*.sock").SingleOrDefault(path => !existing.Contains(path)) ?? "";
                    if (fixture.SocketPath.Length != 0) return fixture;
                }
                if (fixture.Host.IsCompleted) break;
                await Task.Delay(10);
            }
            await fixture.DisposeAsync();
            throw new InvalidOperationException("ASSERT: native host must bind its own managed UUID socket");
        }

        public async Task<NetworkStream> Connect()
        {
            var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
            await socket.ConnectAsync(new UnixDomainSocketEndPoint(SocketPath));
            return new NetworkStream(socket, ownsSocket: true);
        }

        public async ValueTask DisposeAsync()
        {
            stopping.Cancel();
            peer?.Dispose(); hostPeer?.Dispose();
            try { if (Host != null) await Host.WaitAsync(TimeSpan.FromSeconds(3)); }
            catch (OperationCanceledException) { }
            catch (Exception) when (ExpectedHostFailure) { }
            finally
            {
                stopping.Dispose();
                if (ownsRoot && Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
            }
        }
    }
}
