using System.Text;
using System.Text.Json;

namespace AgentCore.Launcher;

public sealed class ActivityJournal
{
    private readonly string _journalPath;
    private readonly string _textLogPath;
    private readonly string _reportsDir;
    private readonly string _lockPath;
    private readonly string _clearMarkerPath;
    private readonly object _gate = new();
    private const long MaxReportBytes = 128L * 1024L * 1024L;
    private static readonly TimeSpan MaxReportAge = TimeSpan.FromDays(365);
    private static readonly TimeSpan LockStaleAge = TimeSpan.FromSeconds(30);
    private readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public ActivityJournal(string root)
    {
        var trackerRoot = Path.Combine(root, "runtime", "tracker");
        _journalPath = Path.Combine(trackerRoot, "activity.jsonl");
        _textLogPath = Path.Combine(trackerRoot, "activity log.txt");
        _reportsDir = Path.Combine(trackerRoot, "reports");
        _lockPath = _journalPath + ".lock";
        _clearMarkerPath = Path.Combine(trackerRoot, "activity.clear");
        Directory.CreateDirectory(_reportsDir);
        RecoverJournal();
        RebuildTextMirror();
        PruneReports();
    }
    public void Append(
        ActivityEntry entry,
        string source = "launcher",
        string kind = "event",
        object? context = null)
    {
        var envelope = new
        {
            id = entry.Id,
            timestamp = DateTimeOffset.UtcNow.ToString("O"),
            time = entry.Time,
            module = entry.Module,
            level = entry.Level,
            message = entry.Message,
            source,
            kind,
            context
        };
        AppendEnvelope(envelope);
    }

    public void CaptureFailure(string module, Exception error, string kind, object? context = null)
    {
        var now = DateTimeOffset.UtcNow;
        var entry = new ActivityEntry(
            Guid.NewGuid().ToString("N"),
            DateTime.Now.ToString("HH:mm:ss"),
            module.ToUpperInvariant(),
            "error",
            error.Message);
        var envelope = new
        {
            id = entry.Id,
            timestamp = now.ToString("O"),
            time = entry.Time,
            module = entry.Module,
            level = entry.Level,
            message = entry.Message,
            source = "launcher",
            kind,
            context,
            error = new { name = error.GetType().FullName ?? error.GetType().Name, message = error.Message, stack = error.ToString() }
        };
        AppendEnvelope(envelope);
        WriteFailureSnapshot(entry, envelope, now);
    }
    public DateTimeOffset MarkCleared()
    {
        var cutoff = DateTimeOffset.UtcNow;
        FileStream? fileLock = null;
        try
        {
            fileLock = TryAcquireJournalLock();
            if (fileLock is null) return cutoff;
            OwnedAtomicFile.WriteAllText(_clearMarkerPath, cutoff.ToString("O"), new UTF8Encoding(false));
            File.WriteAllText(_textLogPath, string.Empty, new UTF8Encoding(false));
        }
        finally { ReleaseJournalLock(fileLock); }
        return cutoff;
    }

    private DateTimeOffset ReadClearCutoff()
    {
        try
        {
            if (!File.Exists(_clearMarkerPath)) return DateTimeOffset.MinValue;
            var raw = File.ReadAllText(_clearMarkerPath, Encoding.UTF8).Trim();
            return DateTimeOffset.TryParse(raw, out var cutoff) ? cutoff : DateTimeOffset.MinValue;
        }
        catch { return DateTimeOffset.MinValue; }
    }

    public IReadOnlyList<ActivityEntry> ReadRecent(int limit, DateTimeOffset? after = null)
    {
        var entries = new List<ActivityEntry>();
        var invocations = new Dictionary<string, int>(StringComparer.Ordinal);
        if (!File.Exists(_journalPath)) return entries;
        var clearCutoff = ReadClearCutoff();
        var effectiveAfter = after.HasValue && after.Value > clearCutoff ? after.Value : clearCutoff;
        try
        {
            using var stream = new FileStream(_journalPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            // Polling reads only a bounded journal tail; full stored details are loaded on demand.
            const long scanLimit = 16L * 1024 * 1024;
            var skipPartialLine = stream.Length > scanLimit;
            if (skipPartialLine) stream.Seek(-scanLimit, SeekOrigin.End);
            using var reader = new StreamReader(stream, Encoding.UTF8);
            if (skipPartialLine) reader.ReadLine();
            string? line;
            while ((line = reader.ReadLine()) is not null)
            {
                var entry = TryParseEntry(line, effectiveAfter);
                if (entry is null || entry.Kind == "tool-detail") continue;
                if (entry.InvocationId is { Length: 32 } id && entry.Status is not null)
                {
                    if (invocations.TryGetValue(id, out var index))
                    {
                        // Correlate by invocation ID, never by tool name or nearby timestamps.
                        // A duplicate/late start cannot retroactively prove an earlier terminal.
                        if (entry.Kind == "tool-invocation-start") continue;
                        var previous = entries[index];
                        var hasObservedStart = previous.StartedAt is not null;
                        entries[index] = previous with {
                            Status = entry.Status,
                            Lifecycle = hasObservedStart ? "complete" : "incomplete",
                            TerminalAt = entry.Timestamp,
                            DurationMs = hasObservedStart ? entry.DurationMs : null,
                            Level = entry.Status == "error" ? "error" : entry.Level == "success" ? "success" : previous.Level,
                            Tool = entry.Tool ?? previous.Tool,
                            Target = entry.Target ?? previous.Target
                        };
                        continue;
                    }
                    invocations[id] = entries.Count;
                    var startObserved = entry.Kind == "tool-invocation-start";
                    entries.Add(entry with {
                        Lifecycle = startObserved ? "start-only" : "incomplete",
                        StartedAt = startObserved ? entry.Timestamp : null,
                        TerminalAt = startObserved ? null : entry.Timestamp,
                        // Without observed start, the terminal duration cannot be corroborated.
                        DurationMs = null
                    });
                }
                else entries.Add(entry);
                if (entries.Count > Math.Max(200, limit * 3))
                {
                    entries.RemoveRange(0, entries.Count - Math.Max(200, limit * 2));
                    invocations.Clear();
                    for (var i = 0; i < entries.Count; i++)
                        if (entries[i].InvocationId is { Length: 32 } key) invocations[key] = i;
                }
            }
        }
        catch { /* A partial journal must never break the desktop UI. */ }
        return entries.TakeLast(Math.Max(1, limit)).ToArray();
    }
    private ActivityEntry? TryParseEntry(string line, DateTimeOffset? after)
    {
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (after.HasValue && root.TryGetProperty("timestamp", out var timestampNode) &&
                DateTimeOffset.TryParse(timestampNode.GetString(), out var timestamp) && timestamp <= after.Value)
                return null;

            var kind = root.TryGetProperty("kind", out var kindNode) ? kindNode.GetString() : null;
            var context = root.TryGetProperty("context", out var contextNode) && contextNode.ValueKind == JsonValueKind.Object
                ? contextNode : default;
            string? Ctx(string key) => context.ValueKind == JsonValueKind.Object
                && context.TryGetProperty(key, out var node) && node.ValueKind == JsonValueKind.String
                ? node.GetString() : null;
            var id = Ctx("invocationId");
            if (id is not null && !System.Text.RegularExpressions.Regex.IsMatch(id, "^[a-fA-F0-9]{32}$")) id = null;
            var status = kind switch {
                "tool-invocation-start" => "running",
                "tool-call" => "success",
                "handled-tool-failure" or "tool-exception" => "error",
                "tool-invocation-interrupted" => "unknown",
                _ => null
            };
            double? duration = context.ValueKind == JsonValueKind.Object &&
                context.TryGetProperty("durationMs", out var d) && d.ValueKind == JsonValueKind.Number
                && d.TryGetDouble(out var elapsed) && double.IsFinite(elapsed) && elapsed >= 0 ? elapsed : null;
            return new ActivityEntry(
                root.GetProperty("id").GetString() ?? Guid.NewGuid().ToString("N"),
                root.GetProperty("time").GetString() ?? "--:--:--",
                root.GetProperty("module").GetString() ?? "SYSTEM",
                root.GetProperty("level").GetString() ?? "info",
                root.GetProperty("message").GetString() ?? string.Empty)
            {
                Timestamp = root.TryGetProperty("timestamp", out var stamp) ? stamp.GetString() : null,
                Kind = kind, InvocationId = id, Tool = Ctx("tool"),
                Target = Ctx("targetSummary"), Status = status, DurationMs = duration
            };
        }
        catch
        {
            return null;
        }
    }
    public ActivityDetailPage ReadDetail(string id, string phase, int offset, DateTimeOffset? after = null)
    {
        var cutoff = ReadClearCutoff();
        if (after.HasValue && after.Value > cutoff) cutoff = after.Value;
        return ActivityDetailReader.Read(_journalPath, cutoff, id, phase, offset);
    }

    private FileStream? TryAcquireJournalLock()
    {
        for (var attempt = 0; attempt < 40; attempt++)
        {
            try
            {
                return new FileStream(_lockPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            }
            catch (IOException)
            {
                try
                {
                    if (File.Exists(_lockPath) && DateTime.UtcNow - File.GetLastWriteTimeUtc(_lockPath) > LockStaleAge)
                        File.Delete(_lockPath);
                }
                catch { }
                Thread.Sleep(5);
            }
        }
        return null;
    }

    private void ReleaseJournalLock(FileStream? fileLock)
    {
        if (fileLock is null) return;
        try { fileLock.Dispose(); } catch { }
        try { File.Delete(_lockPath); } catch { }
    }

    private void RecoverJournal()
    {
        if (!File.Exists(_journalPath)) return;
        FileStream? fileLock = null;
        try
        {
            fileLock = TryAcquireJournalLock();
            if (fileLock is null) return;
            var valid = new List<string>();
            var corrupt = new List<string>();
            foreach (var line in File.ReadLines(_journalPath))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try { using var _ = JsonDocument.Parse(line); valid.Add(line); }
                catch { corrupt.Add(line); }
            }
            if (corrupt.Count == 0) return;
            var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddTHHmmssfffZ");
            File.WriteAllLines(Path.Combine(Path.GetDirectoryName(_journalPath)!, $"activity.corrupt.{stamp}.jsonl"), corrupt, new UTF8Encoding(false));
            File.WriteAllLines(_journalPath, valid, new UTF8Encoding(false));
        }
        catch { }
        finally { ReleaseJournalLock(fileLock); }
    }

    private static string FormatTextEntry(JsonElement root)
    {
        var time = root.TryGetProperty("time", out var timeNode) ? timeNode.GetString() ?? "--:--:--" : "--:--:--";
        var module = root.TryGetProperty("module", out var moduleNode) ? moduleNode.GetString() ?? "SYSTEM" : "SYSTEM";
        var level = root.TryGetProperty("level", out var levelNode) ? levelNode.GetString() ?? "info" : "info";
        var message = root.TryGetProperty("message", out var messageNode) ? messageNode.GetString() ?? string.Empty : string.Empty;
        return $"{time} | {module} | {level.ToUpperInvariant()} | {message}";
    }

    private void RebuildTextMirror()
    {
        FileStream? fileLock = null;
        try
        {
            fileLock = TryAcquireJournalLock();
            if (fileLock is null) return;
            var cutoff = ReadClearCutoff();
            var lines = new List<string>();
            if (File.Exists(_journalPath))
            {
                foreach (var line in File.ReadLines(_journalPath))
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    try
                    {
                        using var document = JsonDocument.Parse(line);
                        var root = document.RootElement;
                        if (root.TryGetProperty("timestamp", out var timestampNode) &&
                            DateTimeOffset.TryParse(timestampNode.GetString(), out var timestamp) && timestamp <= cutoff)
                            continue;
                        lines.Add(FormatTextEntry(root));
                    }
                    catch { }
                }
            }
            File.WriteAllLines(_textLogPath, lines, new UTF8Encoding(false));
        }
        catch { }
        finally { ReleaseJournalLock(fileLock); }
    }

    private void PruneReports()
    {
        try
        {
            long retainedBytes = 0;
            var now = DateTime.UtcNow;
            var reports = Directory.EnumerateFiles(_reportsDir, "*.json")
                .Select(path => new FileInfo(path))
                .OrderByDescending(info => info.LastWriteTimeUtc)
                .ToArray();
            foreach (var report in reports)
            {
                var tooOld = now - report.LastWriteTimeUtc > MaxReportAge;
                var exceedsBudget = retainedBytes + report.Length > MaxReportBytes;
                if (tooOld || exceedsBudget)
                {
                    try { report.Delete(); } catch { }
                }
                else retainedBytes += report.Length;
            }
        }
        catch { }
    }

    private void AppendEnvelope(object envelope)
    {
        try
        {
            var line = JsonSerializer.Serialize(envelope, _json);
            lock (_gate)
            {
                FileStream? fileLock = null;
                try
                {
                    fileLock = TryAcquireJournalLock();
                    if (fileLock is null) return;
                    using var stream = new FileStream(_journalPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                    using var writer = new StreamWriter(stream, new UTF8Encoding(false));
                    writer.WriteLine(line);
                    writer.Flush();
                    stream.Flush(true);

                    using var document = JsonDocument.Parse(line);
                    File.AppendAllText(_textLogPath, FormatTextEntry(document.RootElement) + Environment.NewLine, new UTF8Encoding(false));
                }
                finally { ReleaseJournalLock(fileLock); }
            }
        }
        catch
        {
            // Tracker failures must never take down Agent Core.
        }
    }

    private void WriteFailureSnapshot(ActivityEntry entry, object failure, DateTimeOffset createdAt)
    {
        try
        {
            var snapshot = new
            {
                reportId = entry.Id,
                createdAt = createdAt.ToString("O"),
                failure,
                annotations = new
                {
                    pid = Environment.ProcessId,
                    os = Environment.OSVersion.ToString(),
                    framework = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
                    architecture = System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),
                    machine = Environment.MachineName,
                    workingSet = Environment.WorkingSet,
                    uptimeMs = Environment.TickCount64
                },
                recentEvents = ReadRecent(256)
            };
            var safeTimestamp = createdAt.ToString("yyyyMMddTHHmmssfffZ");
            var reportPath = Path.Combine(_reportsDir, $"{safeTimestamp}-{entry.Id}.json");
            File.WriteAllText(reportPath, JsonSerializer.Serialize(snapshot, _json));
            PruneReports();
        }
        catch
        {
            // Failure snapshots are best-effort.
        }
    }
}
