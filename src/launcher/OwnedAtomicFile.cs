using System.Text;

namespace AgentCore.Launcher;

public static class OwnedAtomicFile
{
    private const int DefaultReplaceAttempts = 10;
    private const int DefaultRetryDelayMs = 50;

    public static void WriteAllText(
        string destination,
        string content,
        Encoding encoding,
        int replaceAttempts = DefaultReplaceAttempts,
        int retryDelayMs = DefaultRetryDelayMs)
    {
        var fullPath = Path.GetFullPath(destination);
        var directory = Path.GetDirectoryName(fullPath)
            ?? throw new InvalidOperationException("Destination has no parent directory.");
        Directory.CreateDirectory(directory);

        if (File.Exists(fullPath))
        {
            var attrs = File.GetAttributes(fullPath);
            if ((attrs & FileAttributes.ReparsePoint) != 0)
                throw new IOException($"ATOMIC_OWNED_FILE_REPARSE_REFUSED: {fullPath}");
        }

        replaceAttempts = Math.Max(1, replaceAttempts);
        retryDelayMs = Math.Max(0, retryDelayMs);
        var temporary = Path.Combine(
            directory,
            $".{Path.GetFileName(fullPath)}.tmp-{Environment.ProcessId}-{Guid.NewGuid():N}");

        try
        {
            var bytes = encoding.GetBytes(content);
            using (var stream = new FileStream(
                temporary,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                4096,
                FileOptions.WriteThrough))
            {
                stream.Write(bytes);
                stream.Flush(flushToDisk: true);
            }

            for (var attempt = 0; ; attempt++)
            {
                try
                {
                    File.Move(temporary, fullPath, overwrite: true);
                    break;
                }
                catch (Exception error) when (
                    (error is IOException || error is UnauthorizedAccessException)
                    && attempt < replaceAttempts - 1)
                {
                    if (retryDelayMs > 0) Thread.Sleep(retryDelayMs);
                }
            }
        }
        finally
        {
            try
            {
                if (File.Exists(temporary)) File.Delete(temporary);
            }
            catch
            {
                // Best-effort temp cleanup; the destination commit boundary is File.Move.
            }
        }
    }
}