namespace AgentCore.Launcher;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (NativeDumpDiagnostics.TryRunHelperMode(args)) return;

        // Own the single-instance boundary before any WinForms initialization can hang.
        // Helper mode is intentionally exempt because it is a launcher-owned child role.
        using var mutex = new Mutex(initiallyOwned: true, name: @"Local\AgentCoreDesktop", createdNew: out var createdNew);
        if (!createdNew) return;

        ApplicationConfiguration.Initialize();
        var root = RootLocator.Find();
        var journal = new ActivityJournal(root);
        NativeDumpDiagnostics? nativeDiagnostics = null;
        try
        {
            nativeDiagnostics = NativeDumpDiagnostics.Start(root, journal);
        }
        catch (Exception error)
        {
            journal.CaptureFailure("NATIVE", error, "native-diagnostics-startup");
        }
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, eventArgs) =>
            journal.CaptureFailure("LAUNCHER", eventArgs.Exception, "ui-thread-exception");
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
        {
            var error = eventArgs.ExceptionObject as Exception ??
                new Exception(eventArgs.ExceptionObject?.ToString() ?? "Unknown unhandled exception");
            journal.CaptureFailure("LAUNCHER", error, "unhandled-exception", new { eventArgs.IsTerminating });
            if (eventArgs.IsTerminating) nativeDiagnostics?.RequestCrashDump("managed-unhandled-exception");
        };
        TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
            journal.CaptureFailure("LAUNCHER", eventArgs.Exception, "unobserved-task-exception");

        try
        {
            Application.Run(new MainForm(root, nativeDiagnostics));
        }
        finally
        {
            nativeDiagnostics?.Dispose();
            GC.KeepAlive(mutex);
        }
    }
}
