namespace AgentCore.Launcher;

public sealed record ActivityEntry(
    string Id,
    string Time,
    string Module,
    string Level,
    string Message)
{
    public string? Timestamp { get; init; }
    public string? Kind { get; init; }
    public string? InvocationId { get; init; }
    public string? Tool { get; init; }
    public string? Target { get; init; }
    public string? Status { get; init; }
    // Correlated lifecycle evidence, independent of terminal outcome.
    public string? Lifecycle { get; init; }
    public string? StartedAt { get; init; }
    public string? TerminalAt { get; init; }
    public double? DurationMs { get; init; }
}

public sealed record ActivityDetailPage(
    string InvocationId, string Phase, string State, bool Redacted,
    string Text, int Offset, int? NextOffset, int TotalChars);
