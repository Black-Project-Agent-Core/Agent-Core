namespace AgentCore.Launcher;

public sealed record ActivityEntry(
    string Id,
    string Time,
    string Module,
    string Level,
    string Message);
