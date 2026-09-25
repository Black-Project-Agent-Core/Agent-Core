using System.Diagnostics;
using System.Text.Json;
using Microsoft.Win32;

namespace AgentCore.Launcher;

public sealed class AgentCoreRuntime : IDisposable
{
    private const int CorePort = 8765;
    private const int TunnelPort = 8787;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly ActivityJournal _journal;
    private DateTimeOffset _visibleAfter = DateTimeOffset.MinValue;
    private DesktopStatus? _lastStatus;
    private int? _lastCpuPid;
    private TimeSpan _lastCpuTotal;
    private DateTimeOffset _lastCpuAt;

    public AgentCoreRuntime(string root)
    {
        Root = root;
        _journal = new ActivityJournal(root);
        _visibleAfter = _journal.MarkCleared();
    }
    public string Root { get; }
    public event Action<ActivityEntry>? LogAdded;

    public IReadOnlyList<ActivityEntry> Logs => _journal.ReadRecent(200, _visibleAfter);

    public async Task InitializeAsync()
    {
        AddLog("SYSTEM", "sys", "Agent Core desktop initialized");
        RepairAutostartPathIfEnabled();
        await EnsureCoreAsync();
        await EnsureTunnelAsync();
        AddLog("CONNECTION", "success", "Agent Core HTTP endpoint and tunnel are reachable; Execution readiness is reported by /health");
    }
    public async Task<DesktopStatus> GetStatusAsync()
    {
        var health = await TryGetStringAsync($"http://127.0.0.1:{CorePort}/health");
        var tunnelReady = await IsTunnelReadyAsync();
        var status = DesktopStatusMapper.FromHealth(health, tunnelReady, IsAutostartEnabled(), Root);
        TrackStatusTransitions(status);
        return status;
    }

    public async Task<DesktopSnapshot> GetSnapshotAsync()
    {
        var healthJson = await TryGetStringAsync($"http://127.0.0.1:{CorePort}/health");
        var tunnelReady = await IsTunnelReadyAsync();
        var status = DesktopStatusMapper.FromHealth(healthJson, tunnelReady, IsAutostartEnabled(), Root);
        TrackStatusTransitions(status);

        using var healthDocument = string.IsNullOrWhiteSpace(healthJson)
            ? JsonDocument.Parse("{}")
            : JsonDocument.Parse(healthJson);
        var healthRoot = healthDocument.RootElement;
        var version = ReadString(healthRoot, "version") ?? "0.12.0";
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

    public async Task ExecuteActionAsync(string action)
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
            case "start-core": await EnsureCoreAsync(); break;
            case "stop-core": await StopOwnedPortProcessAsync(CorePort, Path.Combine(Root, "dist", "index.js")); AddLog("SYSTEM", "warn", "Agent Core stopped from the desktop UI"); break;
            case "restart-core": await RestartCoreAsync(); break;
            case "restart-tunnel": await RestartTunnelAsync(); break;
            case "restart-all": await RestartAllAsync(); break;
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
    private async Task EnsureCoreAsync()
    {
        if (await IsCoreReadyAsync()) return;
        var entry = Path.Combine(Root, "dist", "index.js");
        if (!File.Exists(entry)) throw new FileNotFoundException("Agent Core bridge is not built.", entry);
        var node = await ResolveNodeAsync();
        StartHidden(node, [entry], Root, "EXECUTION");
        if (!await WaitUntilAsync(IsCoreReadyAsync, TimeSpan.FromSeconds(30)))
            throw new InvalidOperationException("Agent Core bridge did not become healthy.");
        AddLog("EXECUTION", "info", "Agent Core HTTP bridge is responding; direct Execution readiness is reported by /health");
    }

    private async Task EnsureTunnelAsync()
    {
        if (await IsTunnelReadyAsync()) return;
        var tunnel = Path.Combine(Root, "tunnel-client", "tunnel-client.exe");
        var profile = Path.Combine(Root, "tunnel-client", "agent-core.yaml");
        if (!File.Exists(tunnel)) throw new FileNotFoundException("Tunnel client is missing.", tunnel);
        if (!File.Exists(profile)) throw new FileNotFoundException("Tunnel profile is missing.", profile);
        StartHidden(tunnel, ["run", "--profile-file", profile, "--harpoon.allow-plaintext-http"], Root, "TUNNEL");
        if (!await WaitUntilAsync(IsTunnelReadyAsync, TimeSpan.FromSeconds(12)))
            throw new InvalidOperationException("Tunnel did not become ready.");
        AddLog("TUNNEL", "success", "Secure tunnel is ready");
    }

    private async Task RestartCoreAsync()
    {
        await StopOwnedPortProcessAsync(CorePort, Path.Combine(Root, "dist", "index.js"));
        await EnsureCoreAsync();
        AddLog("SYSTEM", "success", "Agent Core restarted");
    }
    private async Task RestartTunnelAsync()
    {
        await StopOwnedPortProcessAsync(TunnelPort, Path.Combine(Root, "tunnel-client", "agent-core.yaml"));
        await EnsureTunnelAsync();
        AddLog("TUNNEL", "success", "Tunnel restarted");
    }

    private async Task RestartAllAsync()
    {
        await StopOwnedPortProcessAsync(TunnelPort, Path.Combine(Root, "tunnel-client", "agent-core.yaml"));
        await StopOwnedPortProcessAsync(CorePort, Path.Combine(Root, "dist", "index.js"));
        await EnsureCoreAsync();
        await EnsureTunnelAsync();
        AddLog("SYSTEM", "success", "Agent Core and tunnel restarted");
    }

    private async Task ResetOAuthAsync()
    {
        await StopOwnedPortProcessAsync(CorePort, Path.Combine(Root, "dist", "index.js"));
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

    private async Task<bool> IsTunnelReadyAsync()
    {
        try
        {
            using var response = await _http.GetAsync($"http://127.0.0.1:{TunnelPort}/readyz");
            return response.IsSuccessStatusCode;
        }
        catch { return false; }
    }
    private async Task<string?> TryGetStringAsync(string url)
    {
        try
        {
            using var response = await _http.GetAsync(url);
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

    private async Task<CoreRuntimeSnapshot> ReadCoreRuntimeSnapshotAsync(bool httpHealthy)
    {
        var processInfo = await GetPortProcessInfoAsync(CorePort);
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
        var partner = ReadObject(root, "partner");

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
            new PartnerHealthSnapshot(
                ReadString(partner, "status") ?? "unavailable",
                ReadString(partner, "provider"),
                ReadString(partner, "transport"),
                ReadInt(partner, "issueCount"),
                ReadString(partner, "issue")));
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

    private void StartHidden(string executable, IReadOnlyList<string> arguments, string workingDirectory, string module)
    {
        var info = new ProcessStartInfo(executable) {
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);

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

        info.Environment["AGENT_CORE_PROJECT_ROOT"] = Root;
        info.Environment["AGENT_CORE_RDC_CONFIG_DIR"] = rdcConfig;
        info.Environment["AGENT_CORE_PUPPETEER_CACHE_DIR"] = puppeteer;
        info.Environment["TEMP"] = temp;
        info.Environment["TMP"] = temp;
        info.Environment["HOME"] = isolatedHome;
        info.Environment["USERPROFILE"] = isolatedHome;
        info.Environment["APPDATA"] = roamingAppData;
        info.Environment["LOCALAPPDATA"] = localAppData;
        info.Environment["npm_config_cache"] = npmCache;
        info.Environment["npm_config_prefix"] = npmPrefix;
        info.Environment["npm_config_userconfig"] = npmUserConfig;
        info.Environment["npm_config_update_notifier"] = "false";
        info.Environment["NODE_PATH"] = string.Empty;
        info.Environment["PLAYWRIGHT_BROWSERS_PATH"] = playwright;
        info.Environment["PATH"] = Path.Combine(runtime, "node") + Path.PathSeparator + (Environment.GetEnvironmentVariable("PATH") ?? string.Empty);

        var process = Process.Start(info) ?? throw new InvalidOperationException($"Failed to start {executable}");
        process.EnableRaisingEvents = true;
        var pid = process.Id;
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
    private async Task<PortProcessInfo?> GetPortProcessInfoAsync(int port)
    {
        var script = $"$c=Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){{$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$c.OwningProcess); if($p){{$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}}}}";
        var json = await RunPowerShellAsync(script);
        if (string.IsNullOrWhiteSpace(json)) return null;
        return JsonSerializer.Deserialize<PortProcessInfo>(json);
    }

    private async Task StopOwnedPortProcessAsync(int port, string identityNeedle)
    {
        var script = $"$c=Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){{$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$c.OwningProcess); if($p){{$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}}}}";
        var json = await RunPowerShellAsync(script);
        if (string.IsNullOrWhiteSpace(json)) return;
        var processInfo = JsonSerializer.Deserialize<PortProcessInfo>(json);
        if (processInfo is null) return;
        var commandLine = processInfo.CommandLine ?? string.Empty;
        if (!commandLine.Contains(identityNeedle, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Refused to stop PID {processInfo.ProcessId} on port {port}: process identity does not match Agent Core.");
        try
        {
            var process = Process.GetProcessById(processInfo.ProcessId);
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
        }
        catch (ArgumentException) { }
    }

    private static async Task<string> RunPowerShellAsync(string script)
    {
        var info = new ProcessStartInfo("powershell.exe") {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
        };
        info.ArgumentList.Add("-NoLogo"); info.ArgumentList.Add("-NoProfile"); info.ArgumentList.Add("-NonInteractive");
        info.ArgumentList.Add("-Command"); info.ArgumentList.Add(script);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("Failed to query Windows process state.");
        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();
        return output.Trim();
    }

    private sealed record PortProcessInfo(int ProcessId, string? ExecutablePath, string? CommandLine);

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
        await process.WaitForExitAsync();
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

    public void Dispose() => _http.Dispose();
}
