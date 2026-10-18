namespace AgentCore.Launcher;

public sealed record DesktopSnapshot(
    DesktopStatus Status,
    string CapturedAt,
    string Version,
    CoreRuntimeSnapshot Core,
    TunnelSnapshot Tunnel,
    DesktopPathsSnapshot Paths,
    DesktopHealthSnapshot Health);

public sealed record CoreRuntimeSnapshot(
    int? Pid,
    double? UptimeSeconds,
    long? WorkingSetBytes,
    long? MemoryCapacityBytes,
    double? CpuPercent,
    int Port,
    bool HttpHealthy);

public sealed record TunnelSnapshot(int Port, bool Ready);

public sealed record DesktopPathsSnapshot(
    string Root,
    string Memory,
    string RuntimeCache,
    string Logs);

public sealed record DesktopHealthSnapshot(
    MemoryHealthSnapshot Memory,
    ExecutionHealthSnapshot Execution,
    PhoneHealthSnapshot Phone,
    CodeIntelligenceHealthSnapshot CodeIntelligence,
    SemanticIdeHealthSnapshot SemanticIde,
    LearningHealthSnapshot Learning,
    AgentRuntimeHealthSnapshot? AgentRuntime,
    AgentChatHealthSnapshot? AgentChat,
    SkillsHealthSnapshot? Skills = null,
    ExternalControllerLearningHealthSnapshot? ExternalControllerLearning = null,
    WebResearchHealthSnapshot? WebResearch = null,
    MutationSafetyHealthSnapshot? McpMutationSafety = null);

public sealed record MemoryHealthSnapshot(
    string Status,
    string? CanonicalStore,
    int NoteCount,
    int IssueCount,
    string? Index,
    string? Embedding,
    string? Intelligence);

public sealed record ExecutionHealthSnapshot(string Status, string? Mode);

public sealed record PhoneHealthSnapshot(
    string Status,
    string? Mode,
    string? Transport,
    bool DeviceOnline,
    string? DeviceId);

public sealed record CodeIntelligenceHealthSnapshot(
    string Status,
    string? Provider,
    string? Index,
    string? Daemon,
    int IssueCount,
    string? Issue,
    bool IsolationOk);

public sealed record ProviderServerSnapshot(
    string Id,
    string? ObservedVersion,
    string? Compatibility);

public sealed record SemanticIdeHealthSnapshot(
    string Status,
    int IssueCount,
    string? Issue,
    IReadOnlyList<ProviderServerSnapshot> ConfiguredServers);

public sealed record SinkHealthSnapshot(string Name, bool Available);

public sealed record LearningHealthSnapshot(
    string Status,
    int IssueCount,
    IReadOnlyList<SinkHealthSnapshot> SinkStatus);

public sealed record SkillsHealthSnapshot(
    string Status,
    string? Mode,
    int? SkillCount,
    bool? ExecutionAuthority,
    string? DiscoveryMode,
    bool? InstructionRead,
    string? Issue);

public sealed record ExternalControllerLearningHealthSnapshot(
    string Status,
    string? Mode,
    int? EpisodeCount,
    int? PendingLearningEpisodes,
    int? ProcedureCount,
    int? ReadyProcedureCount,
    string? SemanticAuthority,
    string? Issue);

public sealed record WebResearchHealthSnapshot(
    string Status,
    bool? SearchConfigured,
    bool? ReaderConfigured,
    bool? NativeReaderAvailable,
    bool? ExternalReaderConfigured,
    IReadOnlyList<string>? SearchProviders,
    IReadOnlyList<string>? OpenProviders,
    string? Issue);

public sealed record MutationSafetyHealthSnapshot(
    string Status,
    int? IssueCount,
    string? Issue,
    bool? Draining,
    int? ActiveMutations,
    int? JournalEntries);

public sealed record AgentRuntimeHealthSnapshot(
    string Status,
    int IssueCount,
    string? Issue,
    int ProviderCount,
    int ConfiguredProviderCount,
    int SessionCount,
    int RunningSessionCount,
    int SkillCount,
    int PendingFinalizationCount);


public sealed record AgentChatHealthSnapshot(
    string Status,
    int ConversationCount,
    int ActiveConversationCount,
    int RunningTurnCount,
    int ResumableTurnCount);
