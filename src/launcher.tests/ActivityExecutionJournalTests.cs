using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class ActivityExecutionJournalTests
{
    private static string NewRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "agent-core-activity-fixture-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "runtime", "tracker"));
        return root;
    }
    private static string Row(string invocationId, string tool, string kind, string level,
        object? context = null, string? message = null)
    {
        var extras = context ?? new { invocationId, tool };
        return JsonSerializer.Serialize(new {
            id = Guid.NewGuid().ToString("N"), timestamp = DateTimeOffset.UtcNow.ToString("O"),
            time = "09:00:00", module = "MCP", level, source = "node", kind,
            message = message ?? tool + " event", context = extras
        });
    }
    [Fact]
    public void Same_named_concurrent_tools_stay_separate_and_unknown_never_becomes_success()
    {
        var root = NewRoot();
        try
        {
            var a = new string('a', 32); var b = new string('b', 32);
            var c = new string('c', 32); var d = new string('d', 32);
            var file = Path.Combine(root, "runtime", "tracker", "activity.jsonl");
            File.WriteAllLines(file, new[] {
                Row(a, "start_process", "tool-invocation-start", "info"),
                Row(b, "start_process", "tool-invocation-start", "info"),
                Row(b, "start_process", "tool-call", "success", new {invocationId=b,tool="start_process",outcome="success",durationMs=12.5}),
                Row(c, "read_process_output", "tool-invocation-start", "info"),
                Row(d, "edit_block", "tool-invocation-start", "info"),
                Row(d, "edit_block", "tool-invocation-interrupted", "warn"),
                Row(a, "start_process", "tool-exception", "error", new {invocationId=a,tool="start_process",outcome="exception",durationMs=44.0})
            });
            var found = new ActivityJournal(root).ReadRecent(25).Where(row=>row.InvocationId!=null).ToArray();
            Assert.Equal(4, found.Length);
            Assert.Equal("error", found.Single(row=>row.InvocationId==a).Status);
            Assert.Equal("success", found.Single(row=>row.InvocationId==b).Status);
            Assert.Equal(12.5, found.Single(row=>row.InvocationId==b).DurationMs);
            Assert.Equal("running", found.Single(row=>row.InvocationId==c).Status);
            Assert.Equal("unknown", found.Single(row=>row.InvocationId==d).Status);
        }
        finally {Directory.Delete(root, recursive:true);}
    }
    [Fact]
    public void Detail_pages_only_saved_segments_and_legacy_rows_remain_openable()
    {
        var root=NewRoot();
        try
        {
            var id=new string('e',32);
            var file=Path.Combine(root,"runtime","tracker","activity.jsonl");
            var text=new string('Q', 5000);
            var lines=new List<string>{ Row(id,"write_file","tool-invocation-start","info") };
            for(var i=0;i<4;i++)
                lines.Add(Row(id,"write_file","tool-detail","info",new {
                    invocationId=id,tool="write_file",detailPhase="request",
                    detailSegment=i,detailSegments=4,detailText=text.Substring(i*1250,1250),
                    detailState="truncated",detailRedacted=true
                }));
            lines.Add(Row("","LAUNCHER","event","info",message:"Legacy event"));
            File.WriteAllLines(file,lines);
            var journal=new ActivityJournal(root);
            var first=journal.ReadDetail(id,"request",0);
            var second=journal.ReadDetail(id,"request",4096);
            Assert.Equal("truncated",first.State);
            Assert.True(first.Redacted);
            Assert.Equal(4096,first.Text.Length);
            Assert.Equal(4096,first.NextOffset);
            Assert.Equal(904,second.Text.Length);
            Assert.Null(second.NextOffset);
            Assert.Equal("unavailable",journal.ReadDetail(new string('f',32),"response",0).State);
            Assert.Contains(journal.ReadRecent(20),row=>row.Message=="Legacy event");
            Assert.Equal("unavailable",journal.ReadDetail("malformed","request",0).State);
        }
        finally {Directory.Delete(root,recursive:true);}
    }
    [Fact]
    public void SanitizationPreservesSafeLinesAcrossEscapedJsonNewlinesAndStoredPages()
    {
        var root = NewRoot();
        try
        {
            var id = new string('f', 32);
            var secret = "FAKE_ACTIVITY_LOG_SECRET_DO_NOT_PERSIST";
            var command = "Write-Output 'before'\nAuthorization: Bearer " + secret
                + "\nWrite-Output 'safe-after'\n" + new string('Z', 5300)
                + "\nWrite-Output 'SAFE_FINAL_MARKER'";
            var payload = JsonSerializer.Serialize(new { command, shell = "powershell.exe" });
            var segments = (int)Math.Ceiling(payload.Length / 1400.0);
            var lines = new List<string>();
            for (var i = 0; i < segments; i++)
            {
                var chunk = payload.Substring(i * 1400, Math.Min(1400, payload.Length - i * 1400));
                lines.Add(Row(id, "start_process", "tool-detail", "info", new {
                    invocationId=id,tool="start_process",detailPhase="request",
                    detailSegment=i,detailSegments=segments,detailText=chunk,
                    detailState="complete",detailRedacted=false
                }));
            }
            File.WriteAllLines(Path.Combine(root, "runtime", "tracker", "activity.jsonl"), lines);
            var journal = new ActivityJournal(root);
            var offset = 0;
            var output = new System.Text.StringBuilder();
            for (var page = 0; page < 10; page++)
            {
                var part = journal.ReadDetail(id, "request", offset);
                output.Append(part.Text);
                if (part.NextOffset is not int next) break;
                offset = next;
            }
            var safe = output.ToString();
            Assert.True(safe.Length > 4096);
            using var parsed = JsonDocument.Parse(safe);
            var sanitizedCommand = parsed.RootElement.GetProperty("command").GetString() ?? string.Empty;
            Assert.Contains("Write-Output 'SAFE_FINAL_MARKER'", sanitizedCommand);
            Assert.Contains("Write-Output 'safe-after'", sanitizedCommand);
            Assert.Contains("Authorization: [REDACTED]", sanitizedCommand);
            Assert.DoesNotContain(secret, safe);
        }
        finally { Directory.Delete(root, recursive:true); }
    }
}
