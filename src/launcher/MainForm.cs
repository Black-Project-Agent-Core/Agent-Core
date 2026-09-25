using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AgentCore.Launcher;

public sealed class MainForm : Form
{
    private readonly string _root;
    private readonly AgentCoreRuntime _runtime;
    private readonly NativeDumpDiagnostics? _nativeDiagnostics;
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer _statusTimer = new() { Interval = 3000 };
    private readonly JsonSerializerOptions _json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public MainForm(string root, NativeDumpDiagnostics? nativeDiagnostics)
    {
        _root = root;
        _runtime = new AgentCoreRuntime(root);
        _nativeDiagnostics = nativeDiagnostics;
        Text = "Agent Core";
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        var workingArea = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1536, 1024);
        ClientSize = new Size(
            Math.Min(1536, Math.Max(1120, workingArea.Width - 56)),
            Math.Min(960, Math.Max(680, workingArea.Height - 72)));
        MinimumSize = new Size(940, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(6, 16, 27);
        HandleCreated += (_, _) => ApplyDarkTitleBar();
        Controls.Add(_webView);

        Shown += OnShownAsync;
        FormClosed += (_, _) =>
        {
            _statusTimer.Stop();
            _runtime.ClearLogs();
            _runtime.Dispose();
        };
        _statusTimer.Tick += async (_, _) =>
        {
            _nativeDiagnostics?.TouchUiHeartbeat();
            await PushStatusAsync();
            _nativeDiagnostics?.TouchUiHeartbeat();
        };
        _runtime.LogAdded += entry => BeginInvoke(() => Send(new { type = "log", entry }));
    }
    private async void OnShownAsync(object? sender, EventArgs e)
    {
        try
        {
            await InitializeWebViewAsync();
            _nativeDiagnostics?.ArmHangWatchdog();
            _statusTimer.Start();

            try
            {
                await _runtime.InitializeAsync();
            }
            catch (Exception error)
            {
                _runtime.CaptureFailure("LAUNCHER", error, "runtime-startup");
                Send(new { type = "error", message = error.Message });
            }

            await PushStatusAsync();
        }
        catch (Exception error)
        {
            _runtime.CaptureFailure("LAUNCHER", error, "window-startup");
            Send(new { type = "error", message = error.Message });
        }
    }

    private async Task InitializeWebViewAsync()
    {
        var uiRoot = Path.Combine(_root, "dist", "ui");
        if (!File.Exists(Path.Combine(uiRoot, "index.html")))
            throw new FileNotFoundException("Agent Core UI is not built.", Path.Combine(uiRoot, "index.html"));

        var userData = Path.Combine(_root, "runtime", "webview2");
        Directory.CreateDirectory(userData);
        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userData);
        await _webView.EnsureCoreWebView2Async(environment);
        var core = _webView.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        await core.AddScriptToExecuteOnDocumentCreatedAsync(@"
(() => {
  const report = (kind, message) => {
    try { chrome.webview.postMessage({ type: 'ui-diagnostic-error', kind, message: String(message || '') }); } catch {}
  };
  window.addEventListener('error', e => report('javascript-error', e.message || e.error?.message || 'Unknown JavaScript error'));
  window.addEventListener('unhandledrejection', e => report('unhandled-rejection', e.reason?.stack || e.reason?.message || e.reason || 'Unknown rejected promise'));
  window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    const root = document.getElementById('root');
    if (!root || root.childElementCount === 0) report('react-root-empty', `href=${location.href}; readyState=${document.readyState}; rootLength=${root?.innerHTML.length ?? -1}`);
  }, 2000));
})();");
        core.SetVirtualHostNameToFolderMapping(
            "app.agentcore.local",
            uiRoot,
            CoreWebView2HostResourceAccessKind.Allow);
        core.NewWindowRequested += (_, args) => args.Handled = true;
        core.NavigationStarting += (_, args) => {
            if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) || !uri.Host.Equals("app.agentcore.local", StringComparison.OrdinalIgnoreCase))
                args.Cancel = true;
        };
        core.NavigationCompleted += (_, args) =>
        {
            if (!args.IsSuccess)
                _runtime.CaptureFailure("WEBVIEW2", new InvalidOperationException($"Navigation failed: {args.WebErrorStatus}"), "navigation-failed");
        };
        core.ProcessFailed += (_, args) =>
        {
            var kind = args.ProcessFailedKind.ToString();
            _runtime.CaptureFailure("WEBVIEW2", new InvalidOperationException($"WebView2 process failed: {kind}"), "webview2-process-failed", new { kind });
            _nativeDiagnostics?.RequestSnapshot("webview2-process-failed");
        };
        core.WebMessageReceived += OnWebMessageReceivedAsync;
        core.Navigate("https://app.agentcore.local/index.html");
    }

    private async void OnWebMessageReceivedAsync(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement;
            var type = root.GetProperty("type").GetString();
            if (type == "ui-diagnostic-error")
            {
                var kind = root.TryGetProperty("kind", out var kindNode) ? kindNode.GetString() ?? "ui-runtime" : "ui-runtime";
                var message = root.TryGetProperty("message", out var messageNode) ? messageNode.GetString() ?? "Unknown UI runtime failure" : "Unknown UI runtime failure";
                _runtime.CaptureFailure("UI", new InvalidOperationException(message), kind);
                return;
            }
            if (type == "ready")
            {
                await PushStatusAsync();
                Send(new { type = "logs", entries = _runtime.Logs });
                return;
            }
            if (type != "action") return;
            var action = root.GetProperty("action").GetString() ?? string.Empty;
            await _runtime.ExecuteActionAsync(action);
            await PushStatusAsync();
            if (action == "clear-logs") Send(new { type = "logs", entries = _runtime.Logs });
        }
        catch (Exception error)
        {
            _runtime.CaptureFailure("UI", error, "ui-action");
            Send(new { type = "error", message = error.Message });
        }
    }
    private async Task PushStatusAsync()
    {
        var snapshot = await _runtime.GetSnapshotAsync();
        Send(new { type = "status", status = snapshot.Status });
        Send(new { type = "snapshot", snapshot });
        Send(new { type = "logs", entries = _runtime.Logs });
    }

    private void ApplyDarkTitleBar()
    {
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            var enabled = 1;
            _ = DwmSetWindowAttribute(Handle, 20, ref enabled, sizeof(int));
        }
        catch
        {
            // Dark chrome is visual-only; launcher/runtime ownership must stay available if DWM rejects it.
        }
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int attributeValue, int attributeSize);

    private void Send(object payload)
    {
        if (_webView.CoreWebView2 is null) return;
        _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload, _json));
    }
}
