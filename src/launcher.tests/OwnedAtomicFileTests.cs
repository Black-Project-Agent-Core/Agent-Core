using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class OwnedAtomicFileTests
{
    [Fact]
    public async Task Concurrent_writes_are_whole_and_leave_no_temp_files()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-owned-atomic-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var destination = Path.Combine(root, "state.txt");
        var payloads = Enumerable.Range(0, 16).Select(i => $"payload-{i}-{new string('x', i + 1)}").ToArray();
        try
        {
            await Task.WhenAll(payloads.Select(payload => Task.Run(() =>
                OwnedAtomicFile.WriteAllText(destination, payload, new UTF8Encoding(false)))));

            var final = File.ReadAllText(destination, Encoding.UTF8);
            Assert.Contains(final, payloads);
            Assert.Empty(Directory.GetFiles(root, "*.tmp-*"));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Fact]
    public void Activity_clear_marker_uses_atomic_owned_file_semantics()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-activity-atomic-{Guid.NewGuid():N}");
        try
        {
            var journal = new ActivityJournal(root);
            journal.Append(new ActivityEntry("1", "00:00:00", "TEST", "info", "before"));
            var cutoff = journal.MarkCleared();
            var marker = Path.Combine(root, "runtime", "tracker", "activity.clear");

            Assert.True(File.Exists(marker));
            Assert.True(DateTimeOffset.TryParse(File.ReadAllText(marker, Encoding.UTF8), out var parsed));
            Assert.True(parsed >= cutoff.AddSeconds(-1));
            Assert.Empty(Directory.GetFiles(Path.GetDirectoryName(marker)!, ".activity.clear.tmp-*"));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}