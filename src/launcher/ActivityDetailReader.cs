using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AgentCore.Launcher;

public static class ActivityDetailReader
{
    private const int PageChars = 4096;
    private const int MaxSegments = 32;
    public static ActivityDetailPage Read(string journal, DateTimeOffset cutoff,
        string invocationId, string phase, int offset)
    {
        if (!Regex.IsMatch(invocationId, "^[a-fA-F0-9]{32}$") ||
            phase is not ("request" or "response") || offset < 0 || offset > 32768)
            return new(invocationId, phase, "unavailable", false, "", 0, null, 0);
        var chunks = new SortedDictionary<int, string>();
        var expected = 0;
        var state = "unavailable";
        var redacted = false;
        try
        {
            if (!File.Exists(journal)) return new(invocationId, phase, state, false, "", offset, null, 0);
            using var stream = new FileStream(journal, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var reader = new StreamReader(stream, Encoding.UTF8);
            string? line;
            while ((line = reader.ReadLine()) is not null)
            {
                if (!line.Contains(invocationId, StringComparison.Ordinal)) continue;
                using var doc = JsonDocument.Parse(line);
                var item = doc.RootElement;
                if (!item.TryGetProperty("kind", out var kind) || kind.GetString() != "tool-detail") continue;
                if (!item.TryGetProperty("timestamp", out var time) ||
                    !DateTimeOffset.TryParse(time.GetString(), out var at) || at <= cutoff) continue;
                if (!item.TryGetProperty("context", out var context) || context.ValueKind != JsonValueKind.Object) continue;
                string? Field(string key) => context.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
                    ? value.GetString() : null;
                if (Field("invocationId") != invocationId || Field("detailPhase") != phase) continue;
                if (!context.TryGetProperty("detailSegment", out var indexNode) || !indexNode.TryGetInt32(out var index)
                    || index < 0 || index >= MaxSegments) continue;
                if (!context.TryGetProperty("detailSegments", out var countNode) || !countNode.TryGetInt32(out var count)
                    || count < 1 || count > MaxSegments) continue;
                expected = count;
                state = Field("detailState") ?? "unavailable";
                redacted |= context.TryGetProperty("detailRedacted", out var flag) && flag.ValueKind == JsonValueKind.True;
                chunks[index] = (Field("detailText") ?? "")[..Math.Min(1500, (Field("detailText") ?? "").Length)];
            }
        }
        catch { return new(invocationId, phase, "unavailable", false, "", offset, null, 0); }
        if (expected == 0) return new(invocationId, phase, "unavailable", false, "", offset, null, 0);
        if (chunks.Count != expected || Enumerable.Range(0, expected).Any(i => !chunks.ContainsKey(i)))
            return new(invocationId, phase, "expired", redacted, "", offset, null, 0);
        var text = string.Concat(chunks.Values);
        // Defense in depth for historical rows and transport. New rows are redacted before persistence.
        var safe = Regex.Replace(text, @"\bBearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [REDACTED]", RegexOptions.IgnoreCase);
        // JSON stores multiline commands with escaped \n/\r: do not consume the
        // remaining safe command after a redacted header in a serialized value.
        safe = Regex.Replace(safe, @"((?:set-)?cookie|authorization|proxy-authorization)\s*:\s*(?:(?!\\[nr]|""|\r|\n).)*",
            "$1: [REDACTED]", RegexOptions.IgnoreCase);
        safe = Regex.Replace(safe, @"\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{10,}\b",
            "[REDACTED]", RegexOptions.IgnoreCase);
        redacted |= safe != text;
        var from = Math.Min(offset, safe.Length);
        var size = Math.Min(PageChars, safe.Length - from);
        var next = from + size < safe.Length ? from + size : (int?)null;
        return new(invocationId, phase, state, redacted, safe.Substring(from, size), from, next, safe.Length);
    }
}
