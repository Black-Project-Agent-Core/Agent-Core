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
        var output = new Queue<ActivityEntry>(Math.Max(1, limit));
        if (!File.Exists(_journalPath)) return output.ToArray();
        var clearCutoff = ReadClearCutoff();
        var effectiveAfter = after.HasValue && after.Value > clearCutoff ? after.Value : clearCutoff;

        try
        {
            using var stream = new FileStream(_journalPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var reader = new StreamReader(stream, Encoding.UTF8);
            string? line;
            while ((line = reader.ReadLine()) is not null)
            {
                var entry = TryParseEntry(line, effectiveAfter);
                if (entry is null) continue;
                output.Enqueue(entry);
                while (output.Count > limit) output.Dequeue();
            }
        }
        catch
        {
            // Activity rendering must not take down the launcher.
        }
        return output.ToArray();
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

            return new ActivityEntry(
                root.GetProperty("id").GetString() ?? Guid.NewGuid().ToString("N"),
                root.GetProperty("time").GetString() ?? "--:--:--",
                root.GetProperty("module").GetString() ?? "SYSTEM",
                root.GetProperty("level").GetString() ?? "info",
                root.GetProperty("message").GetString() ?? string.Empty);
        }
        catch
        {
            return null;
        }
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
