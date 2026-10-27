using System.Text.Json;

namespace AgentCore.Launcher;

public sealed record DesktopStatus(
    string Overall,
    string Connection,
    string Memory,
    string Tunnel,
    string Execution,
    string GameMode,
    bool Autostart,
    string Root);

public sealed class PassiveStatusGrace
{
    private bool _hasSucceeded;
    private DateTimeOffset? _firstFailureAt;

    public bool Observe(bool available, DateTimeOffset now, TimeSpan grace)
    {
        if (available)
        {
            _hasSucceeded = true;
            _firstFailureAt = null;
            return true;
        }
        if (!_hasSucceeded) return false;
        _firstFailureAt ??= now;
        return now - _firstFailureAt.Value <= grace;
    }

    public void Reset()
    {
        _hasSucceeded = false;
        _firstFailureAt = null;
    }
}

public static class DesktopStatusMapper
{
    public static DesktopStatus FromHealth(string? healthJson, bool tunnelReady, bool autostart, string root)
    {
        var bridgeReady = false;
        var execution = "unavailable";
        var memory = "not-used";
        // Game Mode is a passive indicator: on when the phone controller transport is
        // stable, off when it is disrupted. It rides the same /health path as the rest,
        // so it goes off automatically whenever Agent Core itself is down.
        var gameMode = "off";

        if (!string.IsNullOrWhiteSpace(healthJson))
        {
            using var document = JsonDocument.Parse(healthJson);
            var rootElement = document.RootElement;
            bridgeReady = rootElement.TryGetProperty("status", out var status) && status.GetString() == "ok";
            if (rootElement.TryGetProperty("execution", out var executionNode) && executionNode.TryGetProperty("status", out var executionStatus))
                execution = executionStatus.GetString() == "available" ? "available" : "unavailable";
            if (rootElement.TryGetProperty("memory", out var memoryNode) && memoryNode.TryGetProperty("status", out var memoryStatus))
                memory = memoryStatus.GetString() ?? "not-used";
            if (rootElement.TryGetProperty("phone", out var phoneNode) && phoneNode.TryGetProperty("status", out var phoneStatus))
                gameMode = phoneStatus.GetString() == "available" ? "on" : "off";
        }

        var memoryDegraded = memory is "degraded" or "error" or "unavailable";
        var executionUnavailable = execution != "available";
        var overall = !bridgeReady && !tunnelReady
            ? "offline"
            : !bridgeReady || !tunnelReady || memoryDegraded || executionUnavailable ? "degraded" : "online";
        return new DesktopStatus(overall, bridgeReady ? "on" : "off", memory, tunnelReady ? "on" : "off", execution, gameMode, autostart, root);
    }
}
