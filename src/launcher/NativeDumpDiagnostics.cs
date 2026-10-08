using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AgentCore.Launcher;

public sealed class NativeDumpDiagnostics : IDisposable
{
    private const int ExceptionContinueSearch = 0;
    private const uint StatusAccessViolation = 0xC0000005;
    private const uint StatusIllegalInstruction = 0xC000001D;
    private const uint StatusStackOverflow = 0xC00000FD;
    private const uint StatusHeapCorruption = 0xC0000374;
    private const uint StatusStackBufferOverrun = 0xC0000409;
    private static readonly TimeSpan HangThreshold = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan DumpWait = TimeSpan.FromSeconds(10);
    private static NativeDumpDiagnostics? _current;
    private static readonly ExceptionFilter FilterDelegate = UnhandledFilter;
    private static readonly VectoredHandler VectoredDelegate = HandleVectored;

    private readonly string _root;
    private readonly ActivityJournal _journal;
    private readonly EventWaitHandle _crashRequest;
    private readonly EventWaitHandle _snapshotRequest;
    private readonly EventWaitHandle _completed;
    private readonly EventWaitHandle _stop;
    private readonly Process _helper;
    private readonly Thread _watchdogThread;
    private readonly object _dumpGate = new();
    private volatile bool _watchdogArmed;
    private volatile bool _disposed;
    private long _lastHeartbeatTicks = DateTime.UtcNow.Ticks;
    private long _lastWatchdogCheckTicks = DateTime.UtcNow.Ticks;
    private int _hangDumped;
    private int _crashRequested;
    private IntPtr _vectoredHandle;
    private IntPtr _previousFilter;

    private NativeDumpDiagnostics(string root, ActivityJournal journal)
    {
        _root = root;
        _journal = journal;
        var token = $"{Environment.ProcessId}_{Guid.NewGuid():N}";
        _crashRequest = new EventWaitHandle(false, EventResetMode.AutoReset, $"Local\\AgentCoreCrash_{token}");
        _snapshotRequest = new EventWaitHandle(false, EventResetMode.AutoReset, $"Local\\AgentCoreSnapshot_{token}");
        _completed = new EventWaitHandle(false, EventResetMode.AutoReset, $"Local\\AgentCoreDumpDone_{token}");
        _stop = new EventWaitHandle(false, EventResetMode.ManualReset, $"Local\\AgentCoreDumpStop_{token}");
        _helper = StartHelper(root, token);
        _previousFilter = SetUnhandledExceptionFilter(FilterDelegate);
        _vectoredHandle = AddVectoredExceptionHandler(1, VectoredDelegate);
        _current = this;
        _watchdogThread = new Thread(WatchdogLoop)
        {
            IsBackground = true,
            Name = "AgentCore.NativeDumpWatchdog"
        };
        _watchdogThread.Start();
    }

    public static NativeDumpDiagnostics Start(string root, ActivityJournal journal)
        => new(root, journal);

    public void ArmHangWatchdog()
    {
        TouchUiHeartbeat();
        _watchdogArmed = true;
    }

    public void DisarmHangWatchdog()
    {
        _watchdogArmed = false;
        TouchUiHeartbeat();
    }

    public void TouchUiHeartbeat()
    {
        Interlocked.Exchange(ref _lastHeartbeatTicks, DateTime.UtcNow.Ticks);
        Interlocked.Exchange(ref _hangDumped, 0);
    }

    public void RequestSnapshot(string reason)
    {
        if (_disposed) return;
        RequestDump(_snapshotRequest, reason, fatal: false);
    }
    public void RequestCrashDump(string reason)
    {
        if (_disposed || Interlocked.Exchange(ref _crashRequested, 1) != 0) return;
        RequestDump(_crashRequest, reason, fatal: true);
    }

    private void RequestDump(EventWaitHandle request, string reason, bool fatal)
    {
        lock (_dumpGate)
        {
            try
            {
                request.Set();
                if (!_completed.WaitOne(DumpWait))
                {
                    _journal.Append(new ActivityEntry(
                        Guid.NewGuid().ToString("N"), DateTime.Now.ToString("HH:mm:ss"),
                        "NATIVE", fatal ? "error" : "warn",
                        $"Native dump helper timed out ({reason})"),
                        kind: "native-dump-timeout");
                }
            }
            catch (Exception error)
            {
                _journal.CaptureFailure("NATIVE", error, "native-dump-request", new { reason, fatal });
            }
        }
    }
    private void WatchdogLoop()
    {
        while (!_disposed)
        {
            Thread.Sleep(2_000);
            var nowTicks = DateTime.UtcNow.Ticks;
            var previousCheck = Interlocked.Exchange(ref _lastWatchdogCheckTicks, nowTicks);
            if (nowTicks - previousCheck > TimeSpan.FromSeconds(8).Ticks)
            {
                Interlocked.Exchange(ref _lastHeartbeatTicks, nowTicks);
                Interlocked.Exchange(ref _hangDumped, 0);
                continue;
            }
            if (!_watchdogArmed) continue;
            var last = new DateTime(Interlocked.Read(ref _lastHeartbeatTicks), DateTimeKind.Utc);
            if (DateTime.UtcNow - last < HangThreshold) continue;
            if (Interlocked.Exchange(ref _hangDumped, 1) != 0) continue;

            _journal.Append(new ActivityEntry(
                Guid.NewGuid().ToString("N"), DateTime.Now.ToString("HH:mm:ss"),
                "NATIVE", "error", "UI heartbeat stalled; capturing hang snapshot"),
                kind: "ui-hang-detected");
            RequestSnapshot("ui-hang");
        }
    }

    private static int UnhandledFilter(IntPtr exceptionPointers)
    {
        _current?.SignalFatalDump();
        return ExceptionContinueSearch;
    }
    private void SignalFatalDump()
    {
        if (_disposed || Interlocked.Exchange(ref _crashRequested, 1) != 0) return;
        try
        {
            _crashRequest.Set();
            _completed.WaitOne(DumpWait);
        }
        catch { }
    }

    private static int HandleVectored(IntPtr exceptionPointers)
    {
        try
        {
            var record = Marshal.ReadIntPtr(exceptionPointers);
            if (record != IntPtr.Zero)
            {
                var code = unchecked((uint)Marshal.ReadInt32(record));
                if (code is StatusAccessViolation or StatusIllegalInstruction or StatusStackOverflow or StatusHeapCorruption or StatusStackBufferOverrun)
                    _current?.SignalFatalDump();
            }
        }
        catch { }
        return ExceptionContinueSearch;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _watchdogArmed = false;
        _stop.Set();
        try
        {
            if (!_helper.HasExited && !_helper.WaitForExit(1_500))
            {
                try { _helper.Kill(entireProcessTree: true); } catch { }
                try { if (!_helper.HasExited) _helper.WaitForExit(1_500); } catch { }
            }
        }
        catch { }
        if (_vectoredHandle != IntPtr.Zero)
        {
            try { RemoveVectoredExceptionHandler(_vectoredHandle); } catch { }
            _vectoredHandle = IntPtr.Zero;
        }
        try { SetUnhandledExceptionFilterPointer(_previousFilter); } catch { }
        _current = null;
        _crashRequest.Dispose();
        _snapshotRequest.Dispose();
        _completed.Dispose();
        _stop.Dispose();
        _helper.Dispose();
    }

    private static Process StartHelper(string root, string token)
    {
        var info = new ProcessStartInfo(Application.ExecutablePath)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = root,
        };
        info.ArgumentList.Add("--native-dump-helper");
        info.ArgumentList.Add(Environment.ProcessId.ToString());
        info.ArgumentList.Add(root);
        info.ArgumentList.Add(token);
        return Process.Start(info) ?? throw new InvalidOperationException("Failed to start native dump helper.");
    }
    public static bool TryRunHelperMode(string[] args)
    {
        if (args.Length < 4 || !args[0].Equals("--native-dump-helper", StringComparison.Ordinal)) return false;
        if (!int.TryParse(args[1], out var parentPid)) return true;
        RunHelper(parentPid, args[2], args[3]);
        return true;
    }

    private static void RunHelper(int parentPid, string root, string token)
    {
        using var crash = EventWaitHandle.OpenExisting($"Local\\AgentCoreCrash_{token}");
        using var snapshot = EventWaitHandle.OpenExisting($"Local\\AgentCoreSnapshot_{token}");
        using var completed = EventWaitHandle.OpenExisting($"Local\\AgentCoreDumpDone_{token}");
        using var stop = EventWaitHandle.OpenExisting($"Local\\AgentCoreDumpStop_{token}");
        using var parent = Process.GetProcessById(parentPid);
        var waits = new WaitHandle[] { crash, snapshot, stop };

        while (true)
        {
            if (parent.HasExited) break;
            var index = WaitHandle.WaitAny(waits, 500);
            if (index == WaitHandle.WaitTimeout) continue;
            if (index == 2) break;
            var reason = index == 0 ? "native-crash" : "hang-snapshot";
            CaptureTargetDump(parent, root, reason);
            completed.Set();
        }
    }
    private static void CaptureTargetDump(Process target, string root, string reason)
    {
        var dumpDir = Path.Combine(root, "runtime", "tracker", "dumps");
        Directory.CreateDirectory(dumpDir);
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddTHHmmssfffZ");
        var dumpPath = Path.Combine(dumpDir, $"{stamp}-{reason}-pid{target.Id}.dmp");

        try
        {
            using var stream = new FileStream(dumpPath, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
            var ok = MiniDumpWriteDump(
                target.Handle,
                unchecked((uint)target.Id),
                stream.SafeFileHandle.DangerousGetHandle(),
                MiniDumpType.MiniDumpWithHandleData |
                MiniDumpType.MiniDumpWithUnloadedModules |
                MiniDumpType.MiniDumpWithFullMemoryInfo |
                MiniDumpType.MiniDumpWithThreadInfo,
                IntPtr.Zero,
                IntPtr.Zero,
                IntPtr.Zero);
            if (!ok) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            stream.Flush(true);
            LogDumpResult(root, reason, dumpPath, null);
        }
        catch (Exception error)
        {
            try { if (File.Exists(dumpPath)) File.Delete(dumpPath); } catch { }
            LogDumpResult(root, reason, dumpPath, error);
        }
        finally { PruneDumps(dumpDir); }
    }
    private static void LogDumpResult(string root, string reason, string dumpPath, Exception? error)
    {
        try
        {
            var journal = new ActivityJournal(root);
            if (error is null)
            {
                journal.Append(new ActivityEntry(
                    Guid.NewGuid().ToString("N"), DateTime.Now.ToString("HH:mm:ss"),
                    "NATIVE", "success", $"Diagnostic dump captured: {Path.GetFileName(dumpPath)}"),
                    source: "launcher", kind: reason,
                    context: new { dumpPath, reason });
            }
            else
            {
                journal.CaptureFailure("NATIVE", error, "dump-write-failure", new { dumpPath, reason });
            }
        }
        catch { }
    }

    private static void PruneDumps(string dumpDir)
    {
        try
        {
            const long maxBytes = 128L * 1024L * 1024L;
            var maxAge = TimeSpan.FromDays(365);
            var now = DateTime.UtcNow;
            long retained = 0;
            foreach (var file in new DirectoryInfo(dumpDir).EnumerateFiles("*.dmp").OrderByDescending(f => f.LastWriteTimeUtc))
            {
                if (now - file.LastWriteTimeUtc > maxAge || retained + file.Length > maxBytes) file.Delete();
                else retained += file.Length;
            }
        }
        catch { }
    }
    [Flags]
    private enum MiniDumpType : uint
    {
        MiniDumpWithHandleData = 0x00000004,
        MiniDumpWithUnloadedModules = 0x00000020,
        MiniDumpWithFullMemoryInfo = 0x00000800,
        MiniDumpWithThreadInfo = 0x00001000,
    }

    private delegate int ExceptionFilter(IntPtr exceptionPointers);
    private delegate int VectoredHandler(IntPtr exceptionPointers);

    [DllImport("kernel32.dll", EntryPoint = "SetUnhandledExceptionFilter")]
    private static extern IntPtr SetUnhandledExceptionFilter(ExceptionFilter filter);

    [DllImport("kernel32.dll", EntryPoint = "SetUnhandledExceptionFilter")]
    private static extern IntPtr SetUnhandledExceptionFilterPointer(IntPtr filter);

    [DllImport("kernel32.dll")]
    private static extern IntPtr AddVectoredExceptionHandler(uint first, VectoredHandler handler);

    [DllImport("kernel32.dll")]
    private static extern uint RemoveVectoredExceptionHandler(IntPtr handle);

    [DllImport("Dbghelp.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MiniDumpWriteDump(
        IntPtr process,
        uint processId,
        IntPtr file,
        MiniDumpType dumpType,
        IntPtr exceptionParam,
        IntPtr userStreamParam,
        IntPtr callbackParam);
}
