using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace AgentCore.Launcher;

public sealed class AgentCoreRuntime : IDisposable
{
    private const int CorePort = 8765;
    private const int TunnelPort = 8787;
    private const int PublicGatewayPort = 8788;
    private static readonly TimeSpan CoreColdStartTimeout = TimeSpan.FromSeconds(180);
    private static readonly TimeSpan TunnelStartTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan PublicGatewayStartTimeout = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan WatchdogInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan StatusProbeGrace = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan ProcessSnapshotProbeTimeout = TimeSpan.FromSeconds(2);
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private readonly HttpClient _agentHttp = new() { Timeout = TimeSpan.FromMinutes(10) };
    private readonly string _agentUiToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private readonly ActivityJournal _journal;
    private readonly OwnedProcessJob _ownedProcessJob = new();
    private readonly SemaphoreSlim _shutdownGate = new(1, 1);
    private readonly string _launcherControlFile;
    private DateTimeOffset _visibleAfter = DateTimeOffset.MinValue;
    private DesktopStatus? _lastStatus;
    private int? _lastCpuPid;
    private TimeSpan _lastCpuTotal;
    private DateTimeOffset _lastCpuAt;
    private string? _lastHealthyCoreJson;
    private readonly PassiveStatusGrace _coreStatusGrace = new();
    private readonly PassiveStatusGrace _tunnelStatusGrace = new();
    private readonly PassiveStatusGrace _executionStatusGrace = new();
    private readonly PassiveStatusGrace _gameModeStatusGrace = new();
    private DateTimeOffset _lastProcessSnapshotWarningAt;
    private bool _shutdownCompleted;
    private bool _shutdownRequested;
    private bool _coreStoppedByUser;
    private readonly CancellationTokenSource _watchdogCancellation = new();
    private bool _disposed;

    public AgentCoreRuntime(string root)
    {
        Root = root;
        _journal = new ActivityJournal(root);
        _visibleAfter = _journal.MarkCleared();
        _launcherControlFile = Path.Combine(
            Root,
            "runtime",
            "launcher",
            $"shutdown-{Environment.ProcessId}.signal");
        Directory.CreateDirectory(Path.GetDirectoryName(_launcherControlFile)!);
        TryDeleteLauncherControlFile();
    }
    public string Root { get; }
    public event Action<ActivityEntry>? LogAdded;

    public IReadOnlyList<ActivityEntry> Logs => _journal.ReadRecent(200, _visibleAfter);
    public ActivityDetailPage GetActivityDetail(string invocationId, string phase, int offset)
        => _journal.ReadDetail(invocationId, phase, offset, _visibleAfter);

    public async Task InitializeAsync()
    {
        await RunLifecycleAsync(async () =>
        {
            AddLog("SYSTEM", "sys", "Agent Core desktop initialized");
            RepairAutostartPathIfEnabled();

            // Tunnel performs OAuth discovery at startup and retains a failed result.
            // Keep the cold-start allowance, but start discovery only after Core is ready.
            await EnsureCoreAsync();
            await EnsurePublicGatewayAsync();
            await EnsureTunnelAsync();

            AddLog(
                "CONNECTION",
                "success",
                "Agent Core HTTP endpoint, public MCP gateway and tunnel are reachable; Execution readiness is reported by /health");
        });
        // Started only after a successful bring-up, so a failed startup is reported instead of retried silently.
        _ = Task.Run(() => WatchdogLoopAsync(_watchdogCancellation.Token));
        // Fixed fixture setup is fail-soft and runs after ordinary services start.
        await SymlinkFixtureSetup.EnsureAsync(Root, (level, message) => AddLog("FIXTURE", level, message));
    }
    public async Task<DesktopStatus> GetStatusAsync()
    {
        var health = await GetHealthForStatusAsync();
        var tunnelReady = await IsTunnelReadyForStatusAsync();
        var status = StabilizePassiveStatus(DesktopStatusMapper.FromHealth(health, tunnelReady, IsAutostartEnabled(), Root));
        TrackStatusTransitions(status);
        return status;
    }

    public async Task<DesktopSnapshot> GetSnapshotAsync()
    {
        var healthJson = await GetHealthForStatusAsync();
        var tunnelReady = await IsTunnelReadyForStatusAsync();
        var status = StabilizePassiveStatus(DesktopStatusMapper.FromHealth(healthJson, tunnelReady, IsAutostartEnabled(), Root));
        TrackStatusTransitions(status);

        using var healthDocument = string.IsNullOrWhiteSpace(healthJson)
            ? JsonDocument.Parse("{}")
            : JsonDocument.Parse(healthJson);
        var healthRoot = healthDocument.RootElement;
        var version = ReadString(healthRoot, "version") ?? typeof(AgentCoreRuntime).Assembly.GetName().Version?.ToString(3) ?? "unknown";
        var core = await ReadCoreRuntimeSnapshotAsync(healthJson is not null);

        return new DesktopSnapshot(
            status,
            DateTimeOffset.Now.ToString("O"),
            version,
            core,
            new TunnelSnapshot(TunnelPort, tunnelReady),
            new DesktopPathsSnapshot(
                Root,
                Path.Combine(Root, "runtime", "memory"),
                Path.Combine(Root, "runtime", "cache"),
                Path.Combine(Root, "runtime", "tracker")),
            ReadHealthSnapshot(healthRoot));
    }

    public async Task<JsonElement> RunAgentAsync(string prompt, string? workspace = null)
    {
        if (string.IsNullOrWhiteSpace(prompt)) throw new ArgumentException("Agent prompt is required.", nameof(prompt));
        var request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{CorePort}/agent/run");
        request.Headers.TryAddWithoutValidation("X-Agent-Core-UI-Token", _agentUiToken);
        request.Content = new StringContent(
            JsonSerializer.Serialize(new { prompt = prompt.Trim(), workspace = string.IsNullOrWhiteSpace(workspace) ? null : workspace.Trim() }),
            Encoding.UTF8,
            "application/json");
        using var response = await _agentHttp.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            string message = $"Native agent request failed ({(int)response.StatusCode}).";
            try
            {
                using var errorDocument = JsonDocument.Parse(body);
                if (errorDocument.RootElement.TryGetProperty("error", out var errorNode) && errorNode.ValueKind == JsonValueKind.String)
                    message = errorNode.GetString() ?? message;
            }
            catch { }
            throw new InvalidOperationException(message);
        }
        using var document = JsonDocument.Parse(body);
        return document.RootElement.Clone();
    }

    public async Task<JsonElement> GetWorkflowsAsync()
    {
        const int maxBytes = 4 * 1024 * 1024;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        using var request = CreateAgentChatRequest(HttpMethod.Get, "/agent/workflows");
        using var response = await _agentHttp.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Workflows request failed ({(int)response.StatusCode}).");
        if (response.Content.Headers.ContentLength > maxBytes)
            throw new InvalidOperationException("Workflows snapshot exceeds the 4 MiB limit.");
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        using var buffer = new MemoryStream();
        var chunk = new byte[65536];
        int read;
        while ((read = await stream.ReadAsync(chunk, timeout.Token)) > 0)
        {
            if (buffer.Length + read > maxBytes)
                throw new InvalidOperationException("Workflows snapshot exceeds the 4 MiB limit.");
            buffer.Write(chunk, 0, read);
        }
        buffer.Position = 0;
        using var document = await JsonDocument.ParseAsync(buffer, cancellationToken: timeout.Token);
        return document.RootElement.Clone();
    }

    /// <summary>Read-only actual-changes report for one task; the only input is a validated task id.</summary>
    public async Task<JsonElement> GetTaskChangesAsync(string taskId)
    {
        const int maxBytes = 2 * 1024 * 1024;
        if (!System.Text.RegularExpressions.Regex.IsMatch(taskId, @"^[A-Za-z0-9._:-]{1,200}$"))
            throw new InvalidOperationException("TASK_CHANGES_INPUT_INVALID");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(22));
        using var request = CreateAgentChatRequest(HttpMethod.Get, "/agent/task-changes?taskId=" + Uri.EscapeDataString(taskId));
        using var response = await _agentHttp.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"TASK_CHANGES_UNAVAILABLE ({(int)response.StatusCode})");
        if (response.Content.Headers.ContentLength > maxBytes)
            throw new InvalidOperationException("TASK_CHANGES_SIZE_LIMIT");
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        using var buffer = new MemoryStream();
        var chunk = new byte[65536];
        int read;
        while ((read = await stream.ReadAsync(chunk, timeout.Token)) > 0)
        {
            if (buffer.Length + read > maxBytes) throw new InvalidOperationException("TASK_CHANGES_SIZE_LIMIT");
            buffer.Write(chunk, 0, read);
        }
        buffer.Position = 0;
        using var document = await JsonDocument.ParseAsync(buffer, cancellationToken: timeout.Token);
        return document.RootElement.Clone();
    }

    public Task<JsonElement> GetProposalDocumentsAsync() => ReadProposalJsonAsync("/agent/proposals");

    public Task<JsonElement> ReadProposalDocumentAsync(string id, string revisionDigest, string documentDigest)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(id, @"^(?:doc|skill-proposal):[a-f0-9]{32}$") ||
            !System.Text.RegularExpressions.Regex.IsMatch(revisionDigest, @"^sha256:[a-f0-9]{64}$") ||
            !System.Text.RegularExpressions.Regex.IsMatch(documentDigest, @"^sha256:[a-f0-9]{64}$"))
            throw new InvalidOperationException("PROPOSAL_DOCUMENT_INPUT_INVALID");
        return ReadProposalJsonAsync("/agent/proposals/read?id=" + Uri.EscapeDataString(id) +
            "&revisionDigest=" + Uri.EscapeDataString(revisionDigest) + "&documentDigest=" + Uri.EscapeDataString(documentDigest));
    }

    private async Task<JsonElement> ReadProposalJsonAsync(string route)
    {
        const int maxBytes = 2 * 1024 * 1024;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        using var request = CreateAgentChatRequest(HttpMethod.Get, route);
        using var response = await _agentHttp.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(response.StatusCode == System.Net.HttpStatusCode.Conflict
                ? "PROPOSAL_DOCUMENT_CHANGED" : $"PROPOSAL_DOCUMENT_UNAVAILABLE ({(int)response.StatusCode})");
        if (response.Content.Headers.ContentLength > maxBytes)
            throw new InvalidOperationException("PROPOSAL_DOCUMENT_SIZE_LIMIT");
        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        using var buffer = new MemoryStream();
        var chunk = new byte[16384];
        int count;
        while ((count = await stream.ReadAsync(chunk, timeout.Token)) > 0)
        {
            if (buffer.Length + count > maxBytes) throw new InvalidOperationException("PROPOSAL_DOCUMENT_SIZE_LIMIT");
            buffer.Write(chunk, 0, count);
        }
        buffer.Position = 0;
        using var document = await JsonDocument.ParseAsync(buffer, cancellationToken: timeout.Token);
        return document.RootElement.Clone();
    }

    public async Task<JsonElement> ListAgentConversationsAsync()
    {
        using var request = CreateAgentChatRequest(HttpMethod.Get, "/agent/chat/conversations");
        return await SendAgentChatJsonAsync(request);
    }

    public async Task<JsonElement> ListAgentProvidersAsync()
    {
        using var request = CreateAgentChatRequest(HttpMethod.Get, "/agent/chat/providers");
        return await SendAgentChatJsonAsync(request);
    }

    /// <summary>Slash menu entries of the chat composer: the /compact command first, then the active Skills.</summary>
    public async Task<JsonElement> ListSlashCommandsAsync()
    {
        using var request = CreateAgentChatRequest(HttpMethod.Get, "/agent/chat/slash-commands");
        return await SendAgentChatJsonAsync(request);
    }

    /// <summary>Installed Skills with their Native on/off state (GET /agent/skills).</summary>
    public async Task<JsonElement> ListNativeSkillsAsync()
    {
        using var request = CreateAgentChatRequest(HttpMethod.Get, "/agent/skills");
        return await SendAgentChatJsonAsync(request);
    }

    /// <summary>Switches one Skill on or off for Native (POST /agent/skills/{name}/native-enabled).</summary>
    public async Task<JsonElement> SetNativeSkillEnabledAsync(string name, bool enabled)
    {
        var id = Uri.EscapeDataString(name);
        using var request = CreateAgentChatRequest(HttpMethod.Post, $"/agent/skills/{id}/native-enabled");
        request.Content = new StringContent(JsonSerializer.Serialize(new { enabled }), Encoding.UTF8, "application/json");
        return await SendAgentChatJsonAsync(request);
    }

    public async Task<JsonElement> CreateAgentConversationAsync(string? workspace = null)
    {
        using var request = CreateAgentChatRequest(HttpMethod.Post, "/agent/chat/conversations");
        request.Content = new StringContent(
            JsonSerializer.Serialize(new { workspace = string.IsNullOrWhiteSpace(workspace) ? null : workspace.Trim() }),
            Encoding.UTF8,
            "application/json");
        return await SendAgentChatJsonAsync(request);
    }

    public async Task<JsonElement> ReadAgentConversationAsync(string conversationId)
    {
        var id = Uri.EscapeDataString(conversationId);
        using var request = CreateAgentChatRequest(HttpMethod.Get, $"/agent/chat/conversations/{id}");
        return await SendAgentChatJsonAsync(request);
    }

    public async Task<JsonElement> SelectAgentChatAsync(string providerId, string model, string reasoningEffort)
    {
        using var request = CreateAgentChatRequest(HttpMethod.Put, "/agent/chat/selection");
        request.Content = new StringContent(
            JsonSerializer.Serialize(new { providerId, model, reasoningEffort }),
            Encoding.UTF8,
            "application/json");
        return await SendAgentChatJsonAsync(request);
    }

    public async Task<JsonElement> ReadAgentStepAsync(string turnId, int seq)
    {
        var id = Uri.EscapeDataString(turnId);
        using var request = CreateAgentChatRequest(HttpMethod.Get, $"/agent/chat/steps/{id}/{seq}");
        return await SendAgentChatJsonAsync(request);
    }

    public async Task RunAgentTurnStreamAsync(
        string conversationId,
        string clientRequestId,
        string prompt,
        Action<JsonElement> onEnvelope,
        CancellationToken cancellationToken = default,
        string? providerId = null,
        string? reasoningEffort = null,
        string? model = null,
        bool goalMode = false,
        JsonElement? attachments = null)
    {
        var id = Uri.EscapeDataString(conversationId);
        using var request = CreateAgentChatRequest(HttpMethod.Post, $"/agent/chat/conversations/{id}/turns");
        // providerId is a route chosen in the UI; omitted or "auto" keeps automatic rotation on the Core side.
        var payload = new Dictionary<string, object?> { ["clientRequestId"] = clientRequestId, ["prompt"] = prompt.Trim() };
        if (!string.IsNullOrWhiteSpace(providerId)) payload["providerId"] = providerId.Trim();
        if (reasoningEffort is not null) payload["reasoningEffort"] = reasoningEffort;
        if (!string.IsNullOrWhiteSpace(model)) payload["model"] = model.Trim();
        if (goalMode) payload["goalMode"] = true;
        if (attachments is { } files) payload["attachments"] = files;
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");
        await ReadAgentTurnStreamAsync(request, onEnvelope, cancellationToken);
    }

    public async Task ResumeAgentTurnStreamAsync(string turnId, Action<JsonElement> onEnvelope, CancellationToken cancellationToken = default)
    {
        var id = Uri.EscapeDataString(turnId);
        using var request = CreateAgentChatRequest(HttpMethod.Post, $"/agent/chat/turns/{id}/resume");
        await ReadAgentTurnStreamAsync(request, onEnvelope, cancellationToken);
    }

    private async Task ReadAgentTurnStreamAsync(HttpRequestMessage request, Action<JsonElement> onEnvelope, CancellationToken cancellationToken)
    {
        using var response = await _agentHttp.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw await CreateAgentChatExceptionAsync(response);

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        // This loop runs on the UI thread. EndOfStream reads the socket synchronously, so every quiet
        // stretch of a turn (tool or model call in flight) froze the window; only ReadLineAsync may wait.
        string? line;
        while ((line = await reader.ReadLineAsync(cancellationToken)) is not null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(line)) continue;
            using var document = JsonDocument.Parse(line);
            var envelope = document.RootElement.Clone();
            onEnvelope(envelope);
            if (envelope.TryGetProperty("type", out var typeNode)
                && typeNode.ValueKind == JsonValueKind.String
                && typeNode.GetString() == "error")
            {
                var message = envelope.TryGetProperty("error", out var errorNode)
                    && errorNode.ValueKind == JsonValueKind.String
                    ? errorNode.GetString() ?? "Agent chat turn failed."
                    : "Agent chat turn failed.";
                throw new InvalidOperationException(message);
            }
        }
    }

    public async Task<bool> CancelAgentTurnAsync(string turnId)
    {
        var id = Uri.EscapeDataString(turnId);
        using var request = CreateAgentChatRequest(HttpMethod.Post, $"/agent/chat/turns/{id}/cancel");
        var result = await SendAgentChatJsonAsync(request);
        return result.TryGetProperty("stopped", out var stopped) && stopped.ValueKind == JsonValueKind.True;
    }

    public async Task<bool> PauseAgentTurnAsync(string turnId)
    {
        var id = Uri.EscapeDataString(turnId);
        using var request = CreateAgentChatRequest(HttpMethod.Post, $"/agent/chat/turns/{id}/pause");
        var result = await SendAgentChatJsonAsync(request);
        return result.TryGetProperty("paused", out var paused) && paused.ValueKind == JsonValueKind.True;
    }

    /// <summary>
    /// Asks the Core to compact the running turn's context window. Returns the Core's status string
    /// ("scheduled" on 200, "not-running" on 404); 404 is a normal answer here, not an exception.
    /// </summary>
    public async Task<string> CompactAgentTurnAsync(string turnId)
    {
        var id = Uri.EscapeDataString(turnId);
        using var request = CreateAgentChatRequest(HttpMethod.Post, $"/agent/chat/turns/{id}/compact");
        using var response = await _agentHttp.SendAsync(request);
        if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.NotFound)
            throw await CreateAgentChatExceptionAsync(response);
        var body = await response.Content.ReadAsStringAsync();
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("status", out var statusNode)
                && statusNode.ValueKind == JsonValueKind.String)
                return statusNode.GetString() ?? "unavailable";
        }
        catch { }
        return response.StatusCode == HttpStatusCode.NotFound ? "not-running" : "unavailable";
    }

    public async Task ArchiveAgentConversationAsync(string conversationId)
    {
        var id = Uri.EscapeDataString(conversationId);
        using var request = CreateAgentChatRequest(HttpMethod.Post, $"/agent/chat/conversations/{id}/archive");
        _ = await SendAgentChatJsonAsync(request);
    }

    private HttpRequestMessage CreateAgentChatRequest(HttpMethod method, string route)
    {
        var request = new HttpRequestMessage(method, $"http://127.0.0.1:{CorePort}{route}");
        request.Headers.TryAddWithoutValidation("X-Agent-Core-UI-Token", _agentUiToken);
        return request;
    }

    private async Task<JsonElement> SendAgentChatJsonAsync(HttpRequestMessage request)
    {
        using var response = await _agentHttp.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw await CreateAgentChatExceptionAsync(response);
        var body = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(body);
        return document.RootElement.Clone();
    }

    private static async Task<Exception> CreateAgentChatExceptionAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        var message = $"Agent chat request failed ({(int)response.StatusCode}).";
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("error", out var errorNode)
                && errorNode.ValueKind == JsonValueKind.String)
                message = errorNode.GetString() ?? message;
        }
        catch { }
        return new InvalidOperationException(message);
    }

    public async Task ExecuteActionAsync(string action)
    {
        if (action is "start-core" or "stop-core" or "restart-core" or
            "restart-tunnel" or "restart-all" or "reset-oauth")
        {
            await RunLifecycleAsync(() => ExecuteActionCoreAsync(action));
            return;
        }
        await ExecuteActionCoreAsync(action);
    }

    private async Task RunLifecycleAsync(Func<Task> action)
    {
        // Startup, UI restarts and close share one process-lifecycle lock.
        await _shutdownGate.WaitAsync();
        try
        {
            ThrowIfShutdownRequested();
            await action();
        }
        catch (OperationCanceledException) when (_shutdownRequested) { }
        finally { _shutdownGate.Release(); }
    }

    private void ThrowIfShutdownRequested()
    {
        if (_shutdownRequested || _disposed)
            throw new OperationCanceledException("Agent Core launcher is closing.");
    }

    private async Task ExecuteActionCoreAsync(string action)
    {
        AddLog("ACTION", "info", $"Action requested: {action}", "ui-action");
        switch (action)
        {
            case "activity-monitor":
                AddLog("SYSTEM", "info", $"CPU threads: {Environment.ProcessorCount} | Process working set: {Environment.WorkingSet / 1024 / 1024} MB");
                break;
            case "tunnel-details":
                AddLog("TUNNEL", await IsTunnelReadyAsync() ? "success" : "warn", await IsTunnelReadyAsync() ? "Tunnel is ready on internal port 8787" : "Tunnel is unavailable");
                break;
            case "open-tunnel-admin": OpenTunnelAdmin(); break;
            case "open-folder": OpenPath(Root); break;
            case "open-runtime-folder": OpenPath(Path.Combine(Root, "runtime")); break;
            case "open-memory-folder": OpenPath(Path.Combine(Root, "runtime", "memory")); break;
            case "open-logs": OpenPath(Path.Combine(Root, "runtime", "tracker")); break;
            case "start-core": _coreStoppedByUser = false; await EnsureCoreAsync(); break;
            case "stop-core":
                _coreStoppedByUser = true;
                await StopCoreProcessesAsync();
                AddLog("SYSTEM", "warn", "Agent Core stopped from the desktop UI; watchdog will not restart it until started again");
                break;
            case "restart-core": _coreStoppedByUser = false; await RestartCoreAsync(); break;
            case "restart-tunnel": await RestartTunnelAsync(); break;
            case "restart-all": _coreStoppedByUser = false; await RestartAllAsync(); break;
            case "view-process-details":
                var processSnapshot = await GetSnapshotAsync();
                AddLog("SYSTEM", "info", $"Core PID {processSnapshot.Core.Pid?.ToString() ?? "—"} | {processSnapshot.Core.WorkingSetBytes.GetValueOrDefault() / 1024 / 1024} MB | port {CorePort}", "process-details");
                break;
            case "system-snapshot":
                var snapshot = await GetSnapshotAsync();
                AddLog("SYSTEM", "success", $"System snapshot: core={(snapshot.Core.HttpHealthy ? "healthy" : "unavailable")}, memory={snapshot.Health.Memory.Status}, code={snapshot.Health.CodeIntelligence.Status}, semantic={snapshot.Health.SemanticIde.Status}", "system-snapshot");
                break;
            case "reset-oauth": await ResetOAuthAsync(); break;
            case "toggle-autostart": ToggleAutostart(); break;
            case "clear-logs": ClearLogs(); break;
            default: throw new InvalidOperationException($"Unknown launcher action: {action}");
        }
    }

    public void ClearLogs()
    {
        _visibleAfter = _journal.MarkCleared();
    }

    public void CaptureFailure(string module, Exception error, string kind, object? context = null)
    {
        _journal.CaptureFailure(module, error, kind, context);
        LogAdded?.Invoke(new ActivityEntry(Guid.NewGuid().ToString("N"), DateTime.Now.ToString("HH:mm:ss"), module.ToUpperInvariant(), "error", error.Message));
    }

    public async Task ShutdownAsync()
    {
        _shutdownRequested = true;
        _watchdogCancellation.Cancel();
        ResetStatusGrace();
        await _shutdownGate.WaitAsync();
        try
        {
            if (_shutdownCompleted) return;

            AddLog("SYSTEM", "info", "Full Agent Core shutdown requested from launcher close", "launcher-close-shutdown");
            var issues = new List<string>();
            var coreEntry = Path.Combine(Root, "dist", "index.js");
            var tunnelExecutable = Path.Combine(Root, "tunnel-client", "tunnel-client.exe");
            var nodeExecutable = Path.Combine(Root, "runtime", "node", "node.exe");
            var publicGatewayEntry = Path.Combine(Root, "scripts", "tunnel", "public-mcp-gateway.mjs");

            try
            {
                var core = await GetPortProcessInfoAsync(CorePort);
                if (core is not null)
                {
                    var commandLine = core.CommandLine ?? string.Empty;
                    if (commandLine.Contains(coreEntry, StringComparison.OrdinalIgnoreCase))
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(_launcherControlFile)!);
                        File.WriteAllText(
                            _launcherControlFile,
                            $"{Environment.ProcessId}|{DateTimeOffset.UtcNow:O}");
                        var corePid = core.ProcessId;
                        var graceful = await WaitUntilAsync(
                            () => Task.FromResult(!IsProcessAlive(corePid)),
                            TimeSpan.FromSeconds(20));
                        if (!graceful)
                        {
                            issues.Add("core-graceful-timeout");
                            await KillProcessTreeBoundedAsync(corePid);
                        }
                    }
                    else
                    {
                        issues.Add("core-port-foreign-owner");
                        AddLog(
                            "SYSTEM",
                            "warn",
                            $"Port {CorePort} is owned by PID {core.ProcessId}, but its identity is not Agent Core; refusing to stop it",
                            "shutdown-foreign-port-owner",
                            new { port = CorePort, pid = core.ProcessId });
                    }
                }
            }
            catch (Exception error)
            {
                issues.Add("core-stop");
                CaptureFailure("SYSTEM", error, "launcher-close-core-stop");
                try { await StopOwnedPortProcessAsync(CorePort, coreEntry); } catch { }
            }
            finally
            {
                TryDeleteLauncherControlFile();
            }

            try
            {
                await StopOwnedPortProcessAsync(TunnelPort, tunnelExecutable);
            }
            catch (Exception error)
            {
                issues.Add("tunnel-stop");
                CaptureFailure("TUNNEL", error, "launcher-close-tunnel-stop");
            }

            try
            {
                await StopServiceProcessesAsync(PublicGatewayPort, nodeExecutable, publicGatewayEntry);
            }
            catch (Exception error)
            {
                issues.Add("gateway-stop");
                CaptureFailure("GATEWAY", error, "launcher-close-gateway-stop");
            }

            IReadOnlyList<OwnedProcessInfo> residual = [];
            for (var attempt = 0; attempt < 3; attempt += 1)
            {
                residual = await GetOwnedResidualProcessesAsync();
                if (residual.Count == 0) break;

                foreach (var processInfo in residual)
                {
                    try
                    {
                        await KillProcessTreeBoundedAsync(processInfo.ProcessId);
                    }
                    catch (Exception error)
                    {
                        CaptureFailure(
                            "SYSTEM",
                            error,
                            "launcher-close-residual-stop",
                            new { pid = processInfo.ProcessId, processInfo.ExecutablePath });
                    }
                }

                await Task.Delay(250);
            }

            residual = await GetOwnedResidualProcessesAsync();
            if (residual.Count > 0)
            {
                issues.Add("owned-residual-processes");
                AddLog(
                    "SYSTEM",
                    "warn",
                    $"Shutdown left {residual.Count} exact-owned process(es); launcher job close will perform the final kill-on-close sweep",
                    "launcher-close-residual-warning",
                    new { pids = residual.Select(item => item.ProcessId).ToArray() });
            }

            _shutdownCompleted = true;
            AddLog(
                "SYSTEM",
                issues.Count == 0 ? "success" : "warn",
                issues.Count == 0
                    ? "Agent Core shutdown completed; no owned runtime process remains"
                    : "Agent Core shutdown completed with bounded fallback actions",
                "launcher-close-shutdown-complete",
                new { issueCount = issues.Count, issues });
        }
        finally
        {
            _shutdownGate.Release();
        }
    }

    // Detects a dead Core or public gateway and starts it again, under the same lifecycle lock as user actions.
    private async Task WatchdogLoopAsync(CancellationToken token)
    {
        while (!_shutdownRequested)
        {
            try { await Task.Delay(WatchdogInterval, token); }
            catch (OperationCanceledException) { return; }
            try
            {
                await RunLifecycleAsync(async () =>
                {
                    if (!_coreStoppedByUser && !await IsCoreReadyAsync())
                    {
                        AddLog("WATCHDOG", "warn", "Agent Core is not responding; starting it again", "watchdog-core-restart");
                        await EnsureCoreAsync();
                    }
                    if (!await IsPublicGatewayReadyAsync())
                    {
                        AddLog("WATCHDOG", "warn", $"Public MCP gateway is not listening on {PublicGatewayPort}; starting it again", "watchdog-gateway-restart");
                        await EnsurePublicGatewayAsync();
                    }
                });
            }
            catch (OperationCanceledException) when (_shutdownRequested) { return; }
            catch (Exception error) { CaptureFailure("WATCHDOG", error, "watchdog-restart-failed"); }
        }
    }

    private async Task EnsureCoreAsync()
    {
        ThrowIfShutdownRequested();
        var entry = Path.Combine(Root, "dist", "index.js");
        var node = Path.Combine(Root, "runtime", "node", "node.exe");
        var owner = await GetPortProcessInfoAsync(CorePort);
        if (owner is not null && !IsOwnedService(owner, node, entry))
            throw new InvalidOperationException($"Port {CorePort} is already owned by a different process (PID {owner.ProcessId}).");
        if (owner is not null && await IsCoreReadyAsync()) return;

        var existing = await GetOwnedServiceProcessesAsync(node, entry);
        if (!File.Exists(entry)) throw new FileNotFoundException("Agent Core bridge is not built.", entry);
        if (existing.Count == 0)
        {
            node = await ResolveNodeAsync();
            ThrowIfShutdownRequested();
            TryDeleteLauncherControlFile();
            StartHidden(node, [entry], Root, "EXECUTION");
        }
        else
        {
            AddLog("EXECUTION", "info", $"Waiting for existing Agent Core process (PID {existing[0].ProcessId})", "core-start-reused");
        }
        if (!await WaitForStartupAsync(IsCoreReadyAsync, CoreColdStartTimeout))
            throw new InvalidOperationException(
                $"Agent Core bridge did not become healthy within {CoreColdStartTimeout.TotalSeconds:0} seconds.");
        AddLog("EXECUTION", "info", "Agent Core HTTP bridge is responding; direct Execution readiness is reported by /health");
    }

    private async Task EnsureTunnelAsync()
    {
        ThrowIfShutdownRequested();
        await EnsureCoreAsync();
        var tunnel = Path.Combine(Root, "tunnel-client", "tunnel-client.exe");
        var profile = Path.Combine(Root, "tunnel-client", "agent-core.yaml");
        if (!File.Exists(tunnel)) throw new FileNotFoundException("Tunnel client is missing.", tunnel);
        if (!File.Exists(profile)) throw new FileNotFoundException("Tunnel profile is missing.", profile);
        var owner = await GetPortProcessInfoAsync(TunnelPort);
        if (owner is not null && !IsOwnedService(owner, tunnel))
            throw new InvalidOperationException($"Port {TunnelPort} is already owned by a different process (PID {owner.ProcessId}).");
        if (await IsTunnelReadyAsync()) return;

        // An old tunnel may still be listening with a cached OAuth discovery error.
        // Replace only this project's tunnel after its discovery endpoint is ready.
        if (!await WaitForStartupAsync(
                async () => await TryGetStringAsync($"http://127.0.0.1:{CorePort}/.well-known/oauth-protected-resource") is not null,
                CoreColdStartTimeout))
            throw new InvalidOperationException("Core OAuth discovery endpoint did not become ready for the tunnel.");
        await StopTunnelProcessesAsync();
        ThrowIfShutdownRequested();
        StartHidden(tunnel, ["run", "--profile-file", profile, "--harpoon.allow-plaintext-http"], Root, "TUNNEL");
        if (!await WaitForStartupAsync(IsTunnelReadyAsync, TunnelStartTimeout))
            throw new InvalidOperationException(
                $"Tunnel did not become ready within {TunnelStartTimeout.TotalSeconds:0} seconds.");
        AddLog("TUNNEL", "success", "Secure tunnel is ready");
    }

    // The public Cloudflare VPC service reaches this loopback gateway, which forwards only MCP and OAuth routes to Core.
    private async Task EnsurePublicGatewayAsync()
    {
        ThrowIfShutdownRequested();
        var node = Path.Combine(Root, "runtime", "node", "node.exe");
        var script = Path.Combine(Root, "scripts", "tunnel", "public-mcp-gateway.mjs");
        if (!File.Exists(node)) throw new FileNotFoundException("Bundled Node runtime is missing.", node);
        if (!File.Exists(script)) throw new FileNotFoundException("Public MCP gateway script is missing.", script);
        var owner = await GetPortProcessInfoAsync(PublicGatewayPort);
        if (owner is not null && !IsOwnedService(owner, node, script))
            throw new InvalidOperationException($"Port {PublicGatewayPort} is already owned by a different process (PID {owner.ProcessId}).");
        if (await IsPublicGatewayReadyAsync()) return;

        // A stale gateway from an earlier launcher or manual start is replaced by this launcher's owned child.
        await StopServiceProcessesAsync(PublicGatewayPort, node, script);
        ThrowIfShutdownRequested();
        StartHidden(node, [script], Root, "GATEWAY");
        if (!await WaitForStartupAsync(IsPublicGatewayReadyAsync, PublicGatewayStartTimeout))
            throw new InvalidOperationException(
                $"Public MCP gateway did not listen on {PublicGatewayPort} within {PublicGatewayStartTimeout.TotalSeconds:0} seconds.");
        AddLog("GATEWAY", "success", $"Public MCP gateway is listening on internal port {PublicGatewayPort}");
    }

    private async Task RestartCoreAsync()
    {
        await StopCoreProcessesAsync();
        await EnsureCoreAsync();
        AddLog("SYSTEM", "success", "Agent Core restarted");
    }
    private async Task RestartTunnelAsync()
    {
        await StopTunnelProcessesAsync();
        await EnsureTunnelAsync();
        AddLog("TUNNEL", "success", "Tunnel restarted");
    }

    private async Task RestartAllAsync()
    {
        await StopTunnelProcessesAsync();
        await StopCoreProcessesAsync();
        await EnsureCoreAsync();
        await EnsureTunnelAsync();
        AddLog("SYSTEM", "success", "Agent Core and tunnel restarted");
    }

    private async Task ResetOAuthAsync()
    {
        await StopCoreProcessesAsync();
        var data = AgentCoreDataDirectory.Resolve(Root);
        var reset = OAuthStateResetter.Reset(data);
        await EnsureCoreAsync();
        AddLog("AUTH", "warn", $"OAuth grants reset in {Path.GetRelativePath(Root, data)}; preserved {reset.ClientsPreserved} client registration(s); re-authentication is required");
    }

    private void OpenTunnelAdmin() => Process.Start(new ProcessStartInfo("http://127.0.0.1:8787/") { UseShellExecute = true });
    private static void OpenPath(string path)
    {
        Directory.CreateDirectory(path);
        Process.Start(new ProcessStartInfo("explorer.exe", path) { UseShellExecute = true });
    }
    private const string AutostartRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AutostartValueName = "Agent Core";

    private string GetAutostartCommand() => $"\"{Path.Combine(Root, "Agent Core.exe")}\"";

    private void RepairAutostartPathIfEnabled()
    {
        using var key = Registry.CurrentUser.CreateSubKey(AutostartRegistryPath);
        if (key.GetValue(AutostartValueName) is not string currentValue) return;
        var desiredValue = GetAutostartCommand();
        if (string.Equals(currentValue, desiredValue, StringComparison.OrdinalIgnoreCase)) return;
        key.SetValue(AutostartValueName, desiredValue);
        AddLog("SYSTEM", "success", "Windows autostart path repaired for the current Agent Core location", "autostart-path-repair");
    }

    private void ToggleAutostart()
    {
        using var key = Registry.CurrentUser.CreateSubKey(AutostartRegistryPath);
        if (key.GetValue(AutostartValueName) is string)
        {
            key.DeleteValue(AutostartValueName, false);
            AddLog("SYSTEM", "info", "Start with Windows disabled");
        }
        else
        {
            key.SetValue(AutostartValueName, GetAutostartCommand());
            AddLog("SYSTEM", "success", "Start with Windows enabled");
        }
    }

    private bool IsAutostartEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(AutostartRegistryPath);
        return key?.GetValue(AutostartValueName) is string value &&
               string.Equals(value, GetAutostartCommand(), StringComparison.OrdinalIgnoreCase);
    }

    private async Task<bool> IsCoreReadyAsync() => await TryGetStringAsync($"http://127.0.0.1:{CorePort}/health") is not null;

    // A loopback TCP connect proves the owned gateway listens without sending an HTTP request into Core's journal.
    private static async Task<bool> IsPublicGatewayReadyAsync()
    {
        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(IPAddress.Loopback, PublicGatewayPort).WaitAsync(TimeSpan.FromSeconds(2));
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> IsTunnelEndpointReadyAsync()
    {
        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"http://127.0.0.1:{TunnelPort}/readyz");
            request.Headers.ConnectionClose = true;
            using var response = await _http.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> IsTunnelReadyForStatusAsync()
    {
        var ready = await IsTunnelEndpointReadyAsync();
        return _tunnelStatusGrace.Observe(ready, DateTimeOffset.UtcNow, StatusProbeGrace);
    }

    private async Task<bool> IsTunnelReadyAsync()
    {
        if (!await IsTunnelEndpointReadyAsync()) return false;
        try
        {
            var owner = await GetPortProcessInfoAsync(TunnelPort);
            if (owner?.ExecutablePath is null) return false;
            var expected = Path.GetFullPath(
                Path.Combine(Root, "tunnel-client", "tunnel-client.exe"));
            var observed = Path.GetFullPath(owner.ExecutablePath);
            return string.Equals(
                observed,
                expected,
                StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private async Task<string?> GetHealthForStatusAsync()
    {
        var current = await TryGetStringAsync($"http://127.0.0.1:{CorePort}/health");
        if (!string.IsNullOrWhiteSpace(current))
        {
            _lastHealthyCoreJson = current;
        }
        return _coreStatusGrace.Observe(!string.IsNullOrWhiteSpace(current), DateTimeOffset.UtcNow, StatusProbeGrace)
            ? _lastHealthyCoreJson
            : null;
    }

    private DesktopStatus StabilizePassiveStatus(DesktopStatus status)
    {
        var now = DateTimeOffset.UtcNow;
        var execution = status.Execution;
        var gameMode = status.GameMode;

        if (status.Connection == "off")
        {
            _executionStatusGrace.Reset();
            _gameModeStatusGrace.Reset();
        }
        if (_executionStatusGrace.Observe(execution == "available", now, StatusProbeGrace)) execution = "available";
        if (_gameModeStatusGrace.Observe(gameMode == "on", now, StatusProbeGrace)) gameMode = "on";

        var memoryDegraded = status.Memory is "degraded" or "error" or "unavailable";
        var overall = status.Connection == "off" && status.Tunnel == "off"
            ? "offline"
            : status.Connection == "off" || status.Tunnel == "off" || memoryDegraded || execution != "available"
                ? "degraded"
                : "online";

        return status with { Overall = overall, Execution = execution, GameMode = gameMode };
    }

    private void ResetStatusGrace()
    {
        _lastHealthyCoreJson = null;
        _coreStatusGrace.Reset();
        _tunnelStatusGrace.Reset();
        _executionStatusGrace.Reset();
        _gameModeStatusGrace.Reset();
    }

    private async Task<string?> TryGetStringAsync(string url)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.ConnectionClose = true;
            using var response = await _http.SendAsync(request);
            if (!response.IsSuccessStatusCode) return null;
            return await response.Content.ReadAsStringAsync();
        }
        catch { return null; }
    }

    private static async Task<bool> WaitUntilAsync(Func<Task<bool>> predicate, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (await predicate()) return true;
            await Task.Delay(200);
        }
        return false;
    }

    private Task<bool> WaitForStartupAsync(Func<Task<bool>> predicate, TimeSpan timeout) =>
        WaitUntilAsync(async () =>
        {
            ThrowIfShutdownRequested();
            var ready = await predicate();
            ThrowIfShutdownRequested();
            return ready;
        }, timeout);

    private async Task<CoreRuntimeSnapshot> ReadCoreRuntimeSnapshotAsync(bool httpHealthy)
    {
        PortProcessInfo? processInfo;
        try
        {
            processInfo = await GetPortProcessInfoAsync(CorePort, ProcessSnapshotProbeTimeout);
        }
        catch (TimeoutException)
        {
            if (_lastProcessSnapshotWarningAt == default ||
                DateTimeOffset.UtcNow - _lastProcessSnapshotWarningAt >= TimeSpan.FromMinutes(1))
            {
                _lastProcessSnapshotWarningAt = DateTimeOffset.UtcNow;
                AddLog(
                    "LAUNCHER",
                    "warn",
                    "Process metrics probe timed out; HTTP health remains authoritative",
                    "process-metrics-probe-timeout");
            }
            return new CoreRuntimeSnapshot(null, null, null, null, null, CorePort, httpHealthy);
        }
        if (processInfo is null ||
            !(processInfo.CommandLine ?? string.Empty).Contains(Path.Combine(Root, "dist", "index.js"), StringComparison.OrdinalIgnoreCase))
            return new CoreRuntimeSnapshot(null, null, null, null, null, CorePort, httpHealthy);

        try
        {
            using var process = Process.GetProcessById(processInfo.ProcessId);
            process.Refresh();
            var now = DateTimeOffset.UtcNow;
            var totalCpu = process.TotalProcessorTime;
            double? cpuPercent = null;
            if (_lastCpuPid == process.Id && _lastCpuAt != default)
            {
                var wallMs = (now - _lastCpuAt).TotalMilliseconds;
                var cpuMs = (totalCpu - _lastCpuTotal).TotalMilliseconds;
                if (wallMs > 0 && cpuMs >= 0)
                    cpuPercent = Math.Clamp(cpuMs / wallMs / Math.Max(1, Environment.ProcessorCount) * 100d, 0d, 100d);
            }
            _lastCpuPid = process.Id;
            _lastCpuTotal = totalCpu;
            _lastCpuAt = now;

            double? uptimeSeconds = null;
            try { uptimeSeconds = Math.Max(0, (DateTime.Now - process.StartTime).TotalSeconds); } catch { }
            long? memoryCapacityBytes = null;
            try
            {
                var available = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
                if (available > 0) memoryCapacityBytes = available;
            }
            catch { }
            return new CoreRuntimeSnapshot(process.Id, uptimeSeconds, process.WorkingSet64, memoryCapacityBytes, cpuPercent, CorePort, httpHealthy);
        }
        catch (ArgumentException)
        {
            return new CoreRuntimeSnapshot(null, null, null, null, null, CorePort, httpHealthy);
        }
    }

    private static DesktopHealthSnapshot ReadHealthSnapshot(JsonElement root)
    {
        var memory = ReadObject(root, "memory");
        var execution = ReadObject(root, "execution");
        var phone = ReadObject(root, "phone");
        var code = ReadObject(root, "codeIntelligence");
        var semantic = ReadObject(root, "semanticIde");
        var learning = ReadObject(root, "learning");
        var agentRuntime = ReadObject(root, "agentRuntime");
        var agentChat = ReadObject(root, "agentChat");
        var skills = ReadObject(root, "skills");
        var skillDiscovery = ReadObject(skills, "discovery");
        var externalLearning = ReadObject(root, "externalControllerLearning");
        var webResearch = ReadObject(root, "webResearch");
        var mutationSafety = ReadObject(root, "mcpMutationSafety");

        var servers = new List<ProviderServerSnapshot>();
        if (semantic.ValueKind == JsonValueKind.Object &&
            semantic.TryGetProperty("configuredServers", out var serverArray) &&
            serverArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var server in serverArray.EnumerateArray())
            {
                servers.Add(new ProviderServerSnapshot(
                    ReadString(server, "id") ?? "unknown",
                    ReadString(server, "observedVersion"),
                    ReadString(server, "compatibility")));
            }
        }

        var sinks = new List<SinkHealthSnapshot>();
        if (learning.ValueKind == JsonValueKind.Object &&
            learning.TryGetProperty("sinkStatus", out var sinkArray) &&
            sinkArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var sink in sinkArray.EnumerateArray())
                sinks.Add(new SinkHealthSnapshot(ReadString(sink, "name") ?? "unknown", ReadBool(sink, "available")));
        }

        return new DesktopHealthSnapshot(
            new MemoryHealthSnapshot(
                ReadString(memory, "status") ?? "not-used",
                ReadString(memory, "canonicalStore"),
                ReadInt(memory, "noteCount"),
                ReadInt(memory, "issueCount"),
                ReadString(memory, "index"),
                ReadString(memory, "embedding"),
                ReadString(memory, "intelligence")),
            new ExecutionHealthSnapshot(ReadString(execution, "status") ?? "unavailable", ReadString(execution, "mode")),
            new PhoneHealthSnapshot(
                ReadString(phone, "status") ?? "unavailable",
                ReadString(phone, "mode"),
                ReadString(phone, "transport"),
                ReadBool(phone, "deviceOnline"),
                ReadString(phone, "deviceId")),
            new CodeIntelligenceHealthSnapshot(
                ReadString(code, "status") ?? "unavailable",
                ReadString(code, "provider"),
                ReadString(code, "index"),
                ReadString(code, "daemon"),
                ReadInt(code, "issueCount"),
                ReadString(code, "issue"),
                ReadBool(ReadObject(code, "isolation"), "ok")),
            new SemanticIdeHealthSnapshot(
                ReadString(semantic, "status") ?? "unavailable",
                ReadInt(semantic, "issueCount"),
                ReadString(semantic, "issue"),
                servers),
            new LearningHealthSnapshot(
                ReadString(learning, "status") ?? "unavailable",
                ReadInt(learning, "issueCount"),
                sinks),
            agentRuntime.ValueKind == JsonValueKind.Object
                ? new AgentRuntimeHealthSnapshot(
                    ReadString(agentRuntime, "status") ?? "unavailable",
                    ReadInt(agentRuntime, "issueCount"),
                    ReadString(agentRuntime, "issue"),
                    ReadInt(agentRuntime, "providerCount"),
                    ReadInt(agentRuntime, "configuredProviderCount"),
                    ReadInt(agentRuntime, "sessionCount"),
                    ReadInt(agentRuntime, "runningSessionCount"),
                    ReadInt(agentRuntime, "skillCount"),
                    ReadInt(agentRuntime, "pendingFinalizationCount"))
                : null,
            agentChat.ValueKind == JsonValueKind.Object
                ? new AgentChatHealthSnapshot(
                    ReadString(agentChat, "status") ?? "unavailable",
                    ReadInt(agentChat, "conversationCount"),
                    ReadInt(agentChat, "activeConversationCount"),
                    ReadInt(agentChat, "runningTurnCount"),
                    ReadInt(agentChat, "resumableTurnCount"))
                : null,
            skills.ValueKind == JsonValueKind.Object
                ? new SkillsHealthSnapshot(
                    ReadString(skills, "status") ?? "unknown",
                    ReadString(skills, "mode"),
                    ReadNullableInt(skills, "skillCount"),
                    ReadNullableBool(skills, "executionAuthority"),
                    ReadString(skillDiscovery, "defaultMode"),
                    ReadNullableBool(skillDiscovery, "instructionRead"),
                    ReadString(skills, "issue"))
                : null,
            externalLearning.ValueKind == JsonValueKind.Object
                ? new ExternalControllerLearningHealthSnapshot(
                    ReadString(externalLearning, "status") ?? "unknown",
                    ReadString(externalLearning, "mode"),
                    ReadNullableInt(externalLearning, "episodeCount"),
                    ReadNullableInt(externalLearning, "pendingLearningEpisodes"),
                    ReadNullableInt(externalLearning, "procedureCount"),
                    ReadNullableInt(externalLearning, "readyProcedureCount"),
                    ReadString(externalLearning, "semanticAuthority"),
                    ReadString(externalLearning, "issue"))
                : null,
            webResearch.ValueKind == JsonValueKind.Object
                ? new WebResearchHealthSnapshot(
                    ReadString(webResearch, "status") ?? "unknown",
                    ReadNullableBool(webResearch, "searchConfigured"),
                    ReadNullableBool(webResearch, "readerConfigured"),
                    ReadNullableBool(webResearch, "nativeReaderAvailable"),
                    ReadNullableBool(webResearch, "externalReaderConfigured"),
                    ReadStringArray(webResearch, "searchProviders"),
                    ReadStringArray(webResearch, "openProviders"),
                    ReadString(webResearch, "issue"))
                : null,
            mutationSafety.ValueKind == JsonValueKind.Object
                ? new MutationSafetyHealthSnapshot(
                    ReadString(mutationSafety, "status") ?? "unknown",
                    ReadNullableInt(mutationSafety, "issueCount"),
                    ReadString(mutationSafety, "issue"),
                    ReadNullableBool(mutationSafety, "draining"),
                    ReadNullableInt(mutationSafety, "activeMutations"),
                    ReadNullableInt(mutationSafety, "journalEntries"))
                : null);
    }

    private static JsonElement ReadObject(JsonElement root, string name)
    {
        if (root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty(name, out var node) &&
            node.ValueKind == JsonValueKind.Object)
            return node;
        return default;
    }

    private static string? ReadString(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var node)) return null;
        return node.ValueKind == JsonValueKind.String ? node.GetString() : null;
    }

    private static int ReadInt(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var node)) return 0;
        return node.ValueKind == JsonValueKind.Number && node.TryGetInt32(out var value) ? value : 0;
    }

    private static bool ReadBool(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var node)) return false;
        return node.ValueKind == JsonValueKind.True || (node.ValueKind == JsonValueKind.String && bool.TryParse(node.GetString(), out var value) && value);
    }

    private static int? ReadNullableInt(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var node)) return null;
        return node.ValueKind == JsonValueKind.Number && node.TryGetInt32(out var value) ? value : null;
    }

    private static bool? ReadNullableBool(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var node)) return null;
        return node.ValueKind == JsonValueKind.True ? true : node.ValueKind == JsonValueKind.False ? false : null;
    }

    private static IReadOnlyList<string>? ReadStringArray(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var node)
            || node.ValueKind != JsonValueKind.Array) return null;
        var values = new List<string>();
        foreach (var item in node.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) return null;
            values.Add(item.GetString()!);
        }
        return values;
    }

    private ChildRuntimePaths PrepareOwnedChildRuntime()
    {
        var runtime = Path.Combine(Root, "runtime");
        var temp = Path.Combine(runtime, "tmp");
        var npmCache = Path.Combine(runtime, "npm-cache");
        var npmPrefix = Path.Combine(runtime, "npm-prefix");
        var npmUserConfig = Path.Combine(runtime, "npmrc");
        var isolatedHome = Path.Combine(runtime, "home");
        var roamingAppData = Path.Combine(isolatedHome, "AppData", "Roaming");
        var localAppData = Path.Combine(isolatedHome, "AppData", "Local");
        var playwright = Path.Combine(runtime, "playwright");
        var rdcConfig = Path.Combine(runtime, "rdc");
        var puppeteer = Path.Combine(rdcConfig, "puppeteer-cache");
        foreach (var directory in new[] { temp, npmCache, npmPrefix, isolatedHome, roamingAppData, localAppData, playwright, rdcConfig, puppeteer })
            Directory.CreateDirectory(directory);
        if (!File.Exists(npmUserConfig)) File.WriteAllText(npmUserConfig, string.Empty);
        return new ChildRuntimePaths(runtime, temp, npmCache, npmPrefix, npmUserConfig, isolatedHome, roamingAppData, localAppData, playwright, rdcConfig, puppeteer);
    }

    private void ApplyOwnedChildEnvironment(ProcessStartInfo info, ChildRuntimePaths paths)
    {
        info.Environment["AGENT_CORE_PROJECT_ROOT"] = Root;
        info.Environment["AGENT_CORE_LAUNCHER_CONTROL_FILE"] = _launcherControlFile;
        info.Environment["AGENT_CORE_UI_TOKEN"] = _agentUiToken;
        info.Environment["AGENT_CORE_RDC_CONFIG_DIR"] = paths.RdcConfig;
        info.Environment["AGENT_CORE_PUPPETEER_CACHE_DIR"] = paths.Puppeteer;
        info.Environment["TEMP"] = paths.Temp;
        info.Environment["TMP"] = paths.Temp;
        info.Environment["HOME"] = paths.IsolatedHome;
        info.Environment["USERPROFILE"] = paths.IsolatedHome;
        info.Environment["APPDATA"] = paths.RoamingAppData;
        info.Environment["LOCALAPPDATA"] = paths.LocalAppData;
        info.Environment["npm_config_cache"] = paths.NpmCache;
        info.Environment["npm_config_prefix"] = paths.NpmPrefix;
        info.Environment["npm_config_userconfig"] = paths.NpmUserConfig;
        info.Environment["npm_config_update_notifier"] = "false";
        info.Environment["NODE_PATH"] = string.Empty;
        info.Environment["PLAYWRIGHT_BROWSERS_PATH"] = paths.Playwright;
        var inheritedPath = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        info.Environment["PATH"] = Path.Combine(paths.Runtime, "node") + Path.PathSeparator + inheritedPath;
    }

    private void StartHidden(string executable, IReadOnlyList<string> arguments, string workingDirectory, string module)
    {
        ThrowIfShutdownRequested();
        var info = new ProcessStartInfo(executable) {
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        ApplyOwnedChildEnvironment(info, PrepareOwnedChildRuntime());

        var process = Process.Start(info) ?? throw new InvalidOperationException($"Failed to start {executable}");
        process.EnableRaisingEvents = true;
        var pid = process.Id;
        if (!_ownedProcessJob.TryAssign(process))
        {
            AddLog(
                module,
                "warn",
                $"Process started outside launcher kill-on-close job (PID {pid}); exact-identity shutdown fallback remains active",
                "process-job-assignment-failed",
                new { pid, executable });
        }
        AddLog(module, "info", $"Process started (PID {pid})", "process-start", new { pid, executable });
        process.Exited += (_, _) =>
        {
            try
            {
                AddLog(module, process.ExitCode == 0 ? "info" : "error", $"Process exited with code {process.ExitCode} (PID {pid})", "process-exit", new { pid, process.ExitCode });
            }
            catch (Exception error)
            {
                CaptureFailure(module, error, "process-exit-observer", new { pid });
            }
            finally
            {
                process.Dispose();
            }
        };
    }
    private async Task<PortProcessInfo?> GetPortProcessInfoAsync(int port, TimeSpan? timeout = null)
    {
        var processId = WindowsTcpListener.GetProcessId(port);
        if (processId is null) return null;
        var script = $"$ErrorActionPreference='SilentlyContinue'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId={processId.Value}' -ErrorAction SilentlyContinue; if(!$p){{exit 0}}; $p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress";
        var json = await RunPowerShellAsync(script, timeout);
        if (string.IsNullOrWhiteSpace(json)) return null;
        return JsonSerializer.Deserialize<PortProcessInfo>(json);
    }

    private static bool IsOwnedService(PortProcessInfo process, string executable, string? entry = null)
    {
        if (!string.Equals(process.ExecutablePath, executable, StringComparison.OrdinalIgnoreCase)) return false;
        if (entry is null) return true;
        // Launcher starts Node with the entry as its first argument. Do not match
        // a suffix such as index.js.backup or a path passed to another script.
        var match = Regex.Match(process.CommandLine ?? string.Empty,
            "^\\s*(?:\"[^\"]*\"|\\S+)\\s+(?:\"(?<entry>[^\"]*)\"|(?<entry>\\S+))(?:\\s|$)");
        return match.Success && string.Equals(match.Groups["entry"].Value, entry, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<IReadOnlyList<PortProcessInfo>> GetOwnedServiceProcessesAsync(string executable, string? entry = null)
    {
        var script = string.Join(";",
            "$ErrorActionPreference='Stop'",
            $"$exe={PowerShellQuote(executable)}",
            "$owned=@(Get-CimInstance Win32_Process | Where-Object { " +
                "$_.ExecutablePath -and $_.ExecutablePath.Equals($exe,[StringComparison]::OrdinalIgnoreCase) " +
                "} | Select-Object ProcessId,ExecutablePath,CommandLine)",
            "ConvertTo-Json -InputObject @($owned) -Compress");
        var json = await RunPowerShellAsync(script);
        var processes = JsonSerializer.Deserialize<List<PortProcessInfo>>(json) ?? [];
        return processes.Where(process => IsOwnedService(process, executable, entry)).ToArray();
    }

    private async Task StopCoreProcessesAsync()
    {
        _lastHealthyCoreJson = null;
        _coreStatusGrace.Reset();
        _executionStatusGrace.Reset();
        _gameModeStatusGrace.Reset();
        await StopServiceProcessesAsync(
            CorePort,
            Path.Combine(Root, "runtime", "node", "node.exe"),
            Path.Combine(Root, "dist", "index.js"));
    }

    private async Task StopTunnelProcessesAsync()
    {
        _tunnelStatusGrace.Reset();
        await StopServiceProcessesAsync(
            TunnelPort,
            Path.Combine(Root, "tunnel-client", "tunnel-client.exe"));
    }

    private async Task StopServiceProcessesAsync(int port, string executable, string? entry = null)
    {
        var owner = await GetPortProcessInfoAsync(port);
        if (owner is not null && !IsOwnedService(owner, executable, entry))
            throw new InvalidOperationException($"Refused to stop PID {owner.ProcessId} on port {port}: process identity does not match Agent Core.");
        foreach (var process in await GetOwnedServiceProcessesAsync(executable, entry))
            await KillProcessTreeBoundedAsync(process.ProcessId);
    }

    private async Task StopOwnedPortProcessAsync(int port, string identityNeedle)
    {
        var processInfo = await GetPortProcessInfoAsync(port);
        if (processInfo is null) return;
        var commandLine = processInfo.CommandLine ?? string.Empty;
        if (!commandLine.Contains(identityNeedle, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Refused to stop PID {processInfo.ProcessId} on port {port}: process identity does not match Agent Core.");
        await KillProcessTreeBoundedAsync(processInfo.ProcessId);
    }

    private async Task<IReadOnlyList<OwnedProcessInfo>> GetOwnedResidualProcessesAsync()
    {
        var script = string.Join(
            ";",
            $"$root={PowerShellQuote(Root)}",
            $"$current={Environment.ProcessId}",
            @"$launcher=Join-Path $root 'Agent Core.exe'",
            @"$node=Join-Path $root 'runtime\node\node.exe'",
            @"$coreEntry=Join-Path $root 'dist\index.js'",
            @"$gatewayEntry=Join-Path $root 'scripts\tunnel\public-mcp-gateway.mjs'",
            @"$tunnel=Join-Path $root 'tunnel-client\tunnel-client.exe'",
            @"$grafelRoot=(Join-Path $root 'runtime\grafel')+'\'",
            @"$semanticRoot=(Join-Path $root 'runtime\semantic-ide')+'\'",
            @"$browserRoot=Join-Path $root 'runtime\rdc\browser-control'",
            @"$webViewRoot=Join-Path $root 'runtime\webview2'",
            "$owned=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { " +
                "$ep=[string]$_.ExecutablePath; $cl=[string]$_.CommandLine; " +
                "[int]$_.ProcessId -ne $current -and (" +
                    "($ep -and $ep.Equals($tunnel,[StringComparison]::OrdinalIgnoreCase)) -or " +
                    "($ep -and $ep.StartsWith($grafelRoot,[StringComparison]::OrdinalIgnoreCase)) -or " +
                    "($ep -and $ep.StartsWith($semanticRoot,[StringComparison]::OrdinalIgnoreCase)) -or " +
                    "($ep -and $ep.Equals($node,[StringComparison]::OrdinalIgnoreCase) -and $cl.IndexOf($coreEntry,[StringComparison]::OrdinalIgnoreCase) -ge 0) -or " +
                    "($ep -and $ep.Equals($node,[StringComparison]::OrdinalIgnoreCase) -and $cl.IndexOf($gatewayEntry,[StringComparison]::OrdinalIgnoreCase) -ge 0) -or " +
                    "($ep -and $ep.Equals($launcher,[StringComparison]::OrdinalIgnoreCase) -and $cl.IndexOf('--native-dump-helper',[StringComparison]::OrdinalIgnoreCase) -ge 0) -or " +
                    "($cl -and $cl.IndexOf($browserRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0) -or " +
                    "($cl -and $cl.IndexOf($webViewRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0)" +
                ")" +
            "} | Select-Object ProcessId,ExecutablePath,CommandLine)",
            "ConvertTo-Json -InputObject @($owned) -Compress");

        var json = await RunPowerShellAsync(script);
        if (string.IsNullOrWhiteSpace(json)) return [];

        using var document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind == JsonValueKind.Array)
            return JsonSerializer.Deserialize<List<OwnedProcessInfo>>(json) ?? [];
        if (document.RootElement.ValueKind == JsonValueKind.Object)
        {
            var single = JsonSerializer.Deserialize<OwnedProcessInfo>(json);
            return single is null ? [] : [single];
        }
        return [];
    }

    private static bool IsProcessAlive(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return !process.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static async Task KillProcessTreeBoundedAsync(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
        }
        catch (ArgumentException) { }
        catch (InvalidOperationException) { }
    }

    private void TryDeleteLauncherControlFile()
    {
        try { File.Delete(_launcherControlFile); } catch { }
    }

    private static string PowerShellQuote(string value) => $"'{value.Replace("'", "''")}'";

    private async Task<string> RunPowerShellAsync(string script, TimeSpan? timeout = null)
    {
        var info = new ProcessStartInfo("powershell.exe") {
            WorkingDirectory = Root,
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
        };
        info.ArgumentList.Add("-NoLogo"); info.ArgumentList.Add("-NoProfile"); info.ArgumentList.Add("-NonInteractive");
        info.ArgumentList.Add("-Command"); info.ArgumentList.Add(script);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("Failed to query Windows process state.");
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        try
        {
            await process.WaitForExitAsync().WaitAsync(timeout ?? TimeSpan.FromSeconds(6));
        }
        catch (TimeoutException)
        {
            try { process.Kill(entireProcessTree: true); } catch { }
            throw new TimeoutException("Agent Core Windows process-state query timed out.");
        }

        var output = (await outputTask).Trim();
        var error = (await errorTask).Trim();
        if (process.ExitCode != 0 && string.IsNullOrWhiteSpace(output))
            throw new InvalidOperationException(
                $"Windows process-state query failed ({process.ExitCode}): {error}".Trim());
        return output;
    }

    private sealed record ChildRuntimePaths(
        string Runtime,
        string Temp,
        string NpmCache,
        string NpmPrefix,
        string NpmUserConfig,
        string IsolatedHome,
        string RoamingAppData,
        string LocalAppData,
        string Playwright,
        string RdcConfig,
        string Puppeteer);
    private sealed record PortProcessInfo(int ProcessId, string? ExecutablePath, string? CommandLine);
    private sealed record OwnedProcessInfo(int ProcessId, string? ExecutablePath, string? CommandLine);

    private async Task<string> ResolveNodeAsync()
    {
        var repairScript = Path.Combine(Root, "scripts", "windows", "Ensure-Agent-Core-LocalRuntime.ps1");
        if (!File.Exists(repairScript))
            throw new FileNotFoundException("Agent Core local-runtime self-repair script is missing.", repairScript);

        var info = new ProcessStartInfo("powershell.exe")
        {
            WorkingDirectory = Root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        info.ArgumentList.Add("-NoLogo");
        info.ArgumentList.Add("-NoProfile");
        info.ArgumentList.Add("-NonInteractive");
        info.ArgumentList.Add("-ExecutionPolicy");
        info.ArgumentList.Add("Bypass");
        info.ArgumentList.Add("-File");
        info.ArgumentList.Add(repairScript);
        info.ArgumentList.Add("-ProjectRoot");
        info.ArgumentList.Add(Root);

        using var process = Process.Start(info) ?? throw new InvalidOperationException("Failed to start local-runtime self-repair.");
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        try
        {
            if (!await WaitForStartupAsync(() => Task.FromResult(process.HasExited), CoreColdStartTimeout))
                throw new TimeoutException("Agent Core local-runtime preparation timed out.");
        }
        catch
        {
            try { process.Kill(entireProcessTree: true); } catch { }
            throw;
        }
        var output = (await outputTask).Trim();
        var error = (await errorTask).Trim();
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"Agent Core local-runtime self-repair failed ({process.ExitCode}): {error}\n{output}".Trim());

        var node = Path.Combine(Root, "runtime", "node", "node.exe");
        if (!File.Exists(node))
            throw new FileNotFoundException("Project-local Node.js runtime is missing after self-repair.", node);
        return node;
    }

    private void AddLog(string module, string level, string message, string kind = "event", object? context = null)
    {
        var entry = new ActivityEntry(Guid.NewGuid().ToString("N"), DateTime.Now.ToString("HH:mm:ss"), module.ToUpperInvariant(), level, message);
        _journal.Append(entry, "launcher", kind, context);
        LogAdded?.Invoke(entry);
    }

    private void TrackStatusTransitions(DesktopStatus status)
    {
        if (_lastStatus is null)
        {
            _lastStatus = status;
            return;
        }
        if (_lastStatus.Connection != status.Connection)
            AddLog("CONNECTION", status.Connection == "on" ? "success" : "error", $"RDC bridge changed to {status.Connection.ToUpperInvariant()}", "status-transition");
        if (_lastStatus.Tunnel != status.Tunnel)
            AddLog("TUNNEL", status.Tunnel == "on" ? "success" : "error", $"Tunnel changed to {status.Tunnel.ToUpperInvariant()}", "status-transition");
        if (_lastStatus.Execution != status.Execution)
            AddLog("EXECUTION", status.Execution == "available" ? "success" : "error", $"Execution changed to {status.Execution.ToUpperInvariant()}", "status-transition");
        if (_lastStatus.GameMode != status.GameMode)
            AddLog("GAMEMODE", status.GameMode == "on" ? "success" : "warn", $"Game Mode changed to {status.GameMode.ToUpperInvariant()}", "status-transition");
        _lastStatus = status;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _watchdogCancellation.Cancel();
        _watchdogCancellation.Dispose();
        ResetStatusGrace();
        TryDeleteLauncherControlFile();
        _ownedProcessJob.Dispose();
        _http.Dispose();
        _agentHttp.Dispose();
        _shutdownGate.Dispose();
    }
}
