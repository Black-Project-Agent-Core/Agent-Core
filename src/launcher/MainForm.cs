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
    private bool _shutdownStarted;
    private bool _shutdownComplete;
    private int _statusRefreshInFlight;
    private NotifyIcon? _tray;
    private readonly List<(EventWaitHandle Signal, RegisteredWaitHandle Wait)> _signals = new();
    private bool _exitRequested;
    private bool _trayHintShown;
    private bool _trayReleased;
    private LauncherWindowSize? _lastSavedWindowSize;
    private string? _windowSizeWarning;

    // A second launch signals the show event so a launcher hidden in the tray shows its window.
    // The official restart signals the exit event because a hidden launcher has no window to close.
    internal const string ShowSignalName = @"Local\AgentCoreDesktop.Show";
    internal const string ExitSignalName = @"Local\AgentCoreDesktop.Exit";

    public MainForm(string root, NativeDumpDiagnostics? nativeDiagnostics)
    {
        _root = root;
        _runtime = new AgentCoreRuntime(root);
        _nativeDiagnostics = nativeDiagnostics;
        Text = "Agent Core";
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        LauncherWindowSize initialSize;
        try { initialSize = LauncherWindowSizeStore.Load(root); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidDataException)
        {
            _runtime.CaptureFailure("LAUNCHER", error, "window-size-load");
            _windowSizeWarning = "Saved window size could not be read; the default is in use.";
            initialSize = LauncherWindowSizeStore.Default;
        }
        MinimumSize = SystemInformation.MinimumWindowSize;
        Size = new Size(initialSize.Width, initialSize.Height);
        _lastSavedWindowSize = initialSize;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(6, 16, 27);
        HandleCreated += (_, _) => ApplyDarkTitleBar();
        Controls.Add(_webView);
        CreateTray();
        ListenForSignal(ShowSignalName, ShowFromTray);
        ListenForSignal(ExitSignalName, ExitFromTray);

        Shown += OnShownAsync;
        ResizeEnd += (_, _) => SaveManualWindowSize();
        FormClosing += OnFormClosingAsync;
        FormClosed += (_, _) =>
        {
            _statusTimer.Stop();
            ReleaseTray();
            _runtime.Dispose();
        };
        _statusTimer.Tick += async (_, _) =>
        {
            if (_shutdownStarted) return;
            _nativeDiagnostics?.TouchUiHeartbeat();
            if (Interlocked.Exchange(ref _statusRefreshInFlight, 1) != 0) return;
            try
            {
                await PushStatusAsync();
            }
            catch (Exception error)
            {
                if (!_shutdownStarted)
                    _runtime.CaptureFailure("LAUNCHER", error, "status-refresh");
            }
            finally
            {
                Interlocked.Exchange(ref _statusRefreshInFlight, 0);
                _nativeDiagnostics?.TouchUiHeartbeat();
            }
        };
        _runtime.LogAdded += entry =>
        {
            if (_shutdownStarted || IsDisposed || Disposing || !IsHandleCreated) return;
            try
            {
                BeginInvoke(() =>
                {
                    if (!IsDisposed && !Disposing) Send(new { type = "log", entry });
                });
            }
            catch (InvalidOperationException) when (!IsHandleCreated || IsDisposed || Disposing)
            {
                // The durable activity journal already captured the entry; only
                // the realtime WebView mirror is skipped during handle teardown/setup.
            }
        };
    }

    private async void OnFormClosingAsync(object? sender, FormClosingEventArgs e)
    {
        if (_shutdownComplete) return;

        // The window close button only hides the launcher; Agent Core keeps running in the
        // tray until the tray menu's Exit item (or a Windows shutdown) ends it.
        if (e.CloseReason == CloseReason.UserClosing && !_exitRequested && !_shutdownStarted)
        {
            e.Cancel = true;
            Hide();
            ShowTrayHint();
            return;
        }

        _statusTimer.Stop();
        _nativeDiagnostics?.DisarmHangWatchdog();

        if (e.CloseReason is CloseReason.WindowsShutDown or CloseReason.TaskManagerClosing)
        {
            _shutdownComplete = true;
            ReleaseTray();
            _nativeDiagnostics?.Dispose();
            _runtime.Dispose();
            return;
        }

        e.Cancel = true;
        if (_shutdownStarted) return;
        _shutdownStarted = true;
        Hide();

        try
        {
            await _runtime.ShutdownAsync();
        }
        catch (Exception error)
        {
            _runtime.CaptureFailure("LAUNCHER", error, "shutdown-on-close");
        }
        finally
        {
            ReleaseTray();
            _nativeDiagnostics?.Dispose();
            _shutdownComplete = true;
            if (!IsDisposed) Close();
        }
    }

    private void CreateTray()
    {
        var show = new ToolStripMenuItem("Show App") { Font = new Font(SystemFonts.MenuFont ?? Font, FontStyle.Bold) };
        show.Click += (_, _) => ShowFromTray();
        var exit = new ToolStripMenuItem("Exit");
        exit.Click += (_, _) => ExitFromTray();
        var menu = new ContextMenuStrip();
        menu.Items.Add(show);
        menu.Items.Add(exit);

        _tray = new NotifyIcon { Icon = Icon, Text = "Agent Core", ContextMenuStrip = menu, Visible = true };
        _tray.MouseClick += (_, args) =>
        {
            if (args.Button == MouseButtons.Left) ShowFromTray();
        };
    }

    private void ShowFromTray()
    {
        if (_shutdownStarted || IsDisposed || Disposing) return;
        if (!Visible) Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
    }

    private void ExitFromTray()
    {
        if (_shutdownStarted || IsDisposed || Disposing) return;
        _exitRequested = true;
        Close();
    }

    private void ShowTrayHint()
    {
        if (_trayHintShown || _tray is null) return;
        _trayHintShown = true;
        _tray.ShowBalloonTip(2500, "Agent Core", "Still running in the tray. Right-click the icon for Show App or Exit.", ToolTipIcon.Info);
    }

    private void ListenForSignal(string name, Action onSignal)
    {
        try
        {
            var signal = new EventWaitHandle(false, EventResetMode.AutoReset, name);
            var wait = ThreadPool.RegisterWaitForSingleObject(signal, (_, timedOut) =>
            {
                if (timedOut || _shutdownStarted || IsDisposed || !IsHandleCreated) return;
                try
                {
                    BeginInvoke(onSignal);
                }
                catch (InvalidOperationException)
                {
                    // The window handle is being created or destroyed; the sender can signal again.
                }
            }, null, Timeout.Infinite, executeOnlyOnce: false);
            _signals.Add((signal, wait));
        }
        catch (Exception error)
        {
            _runtime.CaptureFailure("LAUNCHER", error, "tray-signal");
        }
    }

    private void ReleaseTray()
    {
        if (_trayReleased) return;
        _trayReleased = true;
        foreach (var (signal, wait) in _signals)
        {
            wait.Unregister(null);
            signal.Dispose();
        }
        _signals.Clear();
        if (_tray is null) return;
        _tray.Visible = false;
        _tray.ContextMenuStrip?.Dispose();
        _tray.Dispose();
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
  if (window !== window.top) return;
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
            if (!IsTrustedAppSource(args.Uri))
                args.Cancel = true;
        };
        core.NavigationCompleted += (_, args) =>
        {
            if (_shutdownStarted || _shutdownComplete) return;
            if (!args.IsSuccess)
                _runtime.CaptureFailure(
                    "WEBVIEW2",
                    new InvalidOperationException($"Navigation failed: {args.WebErrorStatus}"),
                    "navigation-failed");
        };
        core.ProcessFailed += (_, args) =>
        {
            if (_shutdownStarted || _shutdownComplete) return;
            var kind = args.ProcessFailedKind.ToString();
            _runtime.CaptureFailure(
                "WEBVIEW2",
                new InvalidOperationException($"WebView2 process failed: {kind}"),
                "webview2-process-failed",
                new { kind });
            _nativeDiagnostics?.RequestSnapshot("webview2-process-failed");
        };
        core.WebMessageReceived += OnWebMessageReceivedAsync;
        core.Navigate("https://app.agentcore.local/index.html");
    }

    private static bool IsTrustedAppSource(string source)
    {
        return Uri.TryCreate(source, UriKind.Absolute, out var uri)
            && uri.Scheme == Uri.UriSchemeHttps
            && uri.IsDefaultPort
            && uri.UserInfo.Length == 0
            && uri.Query.Length == 0
            && uri.Host.Equals("app.agentcore.local", StringComparison.OrdinalIgnoreCase)
            && uri.AbsolutePath.Equals("/index.html", StringComparison.Ordinal);
    }

    private async void OnWebMessageReceivedAsync(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Only the top-level application document owns native commands. Child-frame
        // messages are not subscribed; sandboxed srcdoc canvases have opaque origins.
        if (!IsTrustedAppSource(e.Source)) return;
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement;
            var type = root.GetProperty("type").GetString();
            if (type is "window-size-get" or "window-size-set")
            {
                var requestId = root.TryGetProperty("requestId", out var requestNode)
                    && requestNode.ValueKind == JsonValueKind.String ? requestNode.GetString() : null;
                if (string.IsNullOrWhiteSpace(requestId) || requestId.Length > 128) return;
                try
                {
                    if (type == "window-size-set")
                    {
                        if (!root.TryGetProperty("width", out var widthNode) || widthNode.ValueKind != JsonValueKind.Number || !widthNode.TryGetInt32(out var width)
                            || !root.TryGetProperty("height", out var heightNode) || heightNode.ValueKind != JsonValueKind.Number || !heightNode.TryGetInt32(out var height)
                            || !LauncherWindowSizeStore.IsValid(width, height))
                            throw new ArgumentOutOfRangeException("size", "WINDOW_SIZE_INVALID");
                        if (WindowState != FormWindowState.Normal) WindowState = FormWindowState.Normal;
                        Size = new Size(width, height);
                        var actual = new LauncherWindowSize(Width, Height);
                        LauncherWindowSizeStore.Save(_root, actual);
                        _lastSavedWindowSize = actual;
                        _windowSizeWarning = null;
                    }
                    SendWindowSize(requestId);
                }
                catch (Exception error)
                {
                    _runtime.CaptureFailure("LAUNCHER", error, "window-size-command");
                    if (error is not ArgumentOutOfRangeException) _windowSizeWarning = "The current window size could not be saved.";
                    Send(new { type = "window-size-error", requestId, error = error is ArgumentOutOfRangeException ? "Invalid window size." : "Could not save window size.", size = CurrentWindowSize() });
                }
                return;
            }
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
            if (type == "activity-detail-get")
            {
                var id = root.TryGetProperty("invocationId", out var idNode) && idNode.ValueKind == JsonValueKind.String
                    ? idNode.GetString() ?? string.Empty : string.Empty;
                var phase = root.TryGetProperty("phase", out var phaseNode) && phaseNode.ValueKind == JsonValueKind.String
                    ? phaseNode.GetString() ?? string.Empty : string.Empty;
                var offset = root.TryGetProperty("offset", out var offsetNode) && offsetNode.TryGetInt32(out var value) ? value : 0;
                var result = _runtime.GetActivityDetail(id, phase, offset);
                Send(new { type = "activity-detail-result", result });
                return;
            }
            if (type == "workflows-get")
            {
                var requestId = root.TryGetProperty("requestId", out var requestIdNode)
                    && requestIdNode.ValueKind == JsonValueKind.String ? requestIdNode.GetString() : null;
                if (string.IsNullOrWhiteSpace(requestId) || requestId.Length > 128) return;
                try
                {
                    var result = await _runtime.GetWorkflowsAsync();
                    Send(new { type = "workflows-result", requestId, result });
                }
                catch (Exception error)
                {
                    Send(new { type = "workflows-error", requestId, error = error.Message });
                }
                return;
            }
            if (type == "task-changes-get")
            {
                var changesRequestId = root.TryGetProperty("requestId", out var changesRequestIdNode)
                    && changesRequestIdNode.ValueKind == JsonValueKind.String ? changesRequestIdNode.GetString() : null;
                if (string.IsNullOrWhiteSpace(changesRequestId) || changesRequestId.Length > 128) return;
                try
                {
                    var changesTaskId = root.TryGetProperty("taskId", out var changesTaskIdNode)
                        && changesTaskIdNode.ValueKind == JsonValueKind.String ? changesTaskIdNode.GetString() : null;
                    var result = await _runtime.GetTaskChangesAsync(changesTaskId ?? string.Empty);
                    Send(new { type = "task-changes-result", requestId = changesRequestId, result });
                }
                catch (Exception error)
                {
                    Send(new { type = "task-changes-error", requestId = changesRequestId, error = error.Message });
                }
                return;
            }
            if (type == "proposals-get" || type == "proposal-read")
            {
                var requestId = root.TryGetProperty("requestId", out var proposalRequestId)
                    && proposalRequestId.ValueKind == JsonValueKind.String ? proposalRequestId.GetString() : null;
                if (string.IsNullOrWhiteSpace(requestId) || requestId.Length > 128) return;
                try
                {
                    JsonElement result;
                    if (type == "proposals-get") result = await _runtime.GetProposalDocumentsAsync();
                    else
                    {
                        string ReadProposalField(string name) => root.TryGetProperty(name, out var value)
                            && value.ValueKind == JsonValueKind.String && value.GetString() is string text && text.Length <= 128
                                ? text : throw new InvalidOperationException("PROPOSAL_DOCUMENT_INPUT_INVALID");
                        result = await _runtime.ReadProposalDocumentAsync(ReadProposalField("id"), ReadProposalField("revisionDigest"), ReadProposalField("documentDigest"));
                    }
                    Send(new { type = type == "proposals-get" ? "proposals-result" : "proposal-read-result", requestId, result });
                }
                catch (Exception error)
                {
                    Send(new { type = type == "proposals-get" ? "proposals-error" : "proposal-read-error", requestId, error = error.Message });
                }
                return;
            }
            if (type == "agent-chat-list")
            {
                try
                {
                    var result = await _runtime.ListAgentConversationsAsync();
                    Send(new { type = "agent-chat-list-result", result });
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-chat-error", error = error.Message });
                }
                return;
            }
            if (type == "agent-chat-providers")
            {
                try
                {
                    var result = await _runtime.ListAgentProvidersAsync();
                    Send(new { type = "agent-chat-providers-result", result });
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-chat-error", error = error.Message });
                }
                return;
            }
            if (type == "agent-chat-slash-commands")
            {
                try
                {
                    var result = await _runtime.ListSlashCommandsAsync();
                    Send(new { type = "agent-chat-slash-commands-result", result });
                }
                catch (Exception)
                {
                    // A missing menu must never raise a chat error: answer with an empty list instead.
                    Send(new { type = "agent-chat-slash-commands-result", result = new { commands = Array.Empty<object>() } });
                }
                return;
            }
            if (type == "agent-skills-list")
            {
                try
                {
                    var skillsResult = await _runtime.ListNativeSkillsAsync();
                    Send(new { type = "agent-skills-result", result = skillsResult });
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-skills-error", error = error.Message });
                }
                return;
            }
            if (type == "agent-skill-set")
            {
                var skillName = root.TryGetProperty("name", out var skillNameNode)
                    ? skillNameNode.GetString() ?? string.Empty
                    : string.Empty;
                var skillEnabled = root.TryGetProperty("enabled", out var skillEnabledNode)
                    && skillEnabledNode.ValueKind == JsonValueKind.True;
                try
                {
                    await _runtime.SetNativeSkillEnabledAsync(skillName, skillEnabled);
                    Send(new { type = "agent-skill-set-result", name = skillName, enabled = skillEnabled, ok = true });
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-skill-set-result", name = skillName, enabled = skillEnabled, ok = false, error = error.Message });
                }
                return;
            }
            if (type == "agent-chat-create")
            {
                var requestId = root.TryGetProperty("requestId", out var requestNode)
                    ? requestNode.GetString() : null;
                var workspace = root.TryGetProperty("workspace", out var workspaceNode)
                    && workspaceNode.ValueKind == JsonValueKind.String
                    ? workspaceNode.GetString()
                    : null;
                try
                {
                    var result = await _runtime.CreateAgentConversationAsync(workspace);
                    Send(new { type = "agent-chat-state", requestId, result });
                    await PushStatusAsync();
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-chat-error", requestId, error = error.Message });
                }
                return;
            }
            if (type == "agent-chat-open")
            {
                var conversationId = root.TryGetProperty("conversationId", out var conversationNode)
                    ? conversationNode.GetString() ?? string.Empty
                    : string.Empty;
                try
                {
                    var result = await _runtime.ReadAgentConversationAsync(conversationId);
                    Send(new { type = "agent-chat-state", result });
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-chat-error", conversationId, error = error.Message });
                }
                return;
            }
            if (type == "agent-chat-select")
            {
                string ReadSelectionField(string name) => root.TryGetProperty(name, out var node)
                    && node.ValueKind == JsonValueKind.String ? node.GetString() ?? string.Empty : string.Empty;
                try
                {
                    await _runtime.SelectAgentChatAsync(
                        ReadSelectionField("providerId"), ReadSelectionField("model"), ReadSelectionField("reasoningEffort"));
                }
                catch (Exception error)
                {
                    // Complementary persistence only; the UI's localStorage keeps the selection.
                    System.Diagnostics.Debug.WriteLine("agent-chat-select failed: " + error.Message);
                }
                return;
            }
            if (type == "agent-chat-step")
            {
                var requestId = root.TryGetProperty("requestId", out var stepRequestNode)
                    && stepRequestNode.ValueKind == JsonValueKind.String ? stepRequestNode.GetString() : null;
                var turnId = root.TryGetProperty("turnId", out var turnNode)
                    && turnNode.ValueKind == JsonValueKind.String ? turnNode.GetString() ?? string.Empty : string.Empty;
                var seq = root.TryGetProperty("seq", out var seqNode)
                    && seqNode.ValueKind == JsonValueKind.Number && seqNode.TryGetInt32(out var seqValue) ? seqValue : -1;
                try
                {
                    var result = await _runtime.ReadAgentStepAsync(turnId, seq);
                    Send(new { type = "agent-chat-step-result", requestId, turnId, seq, result });
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-chat-error", requestId, error = error.Message });
                }
                return;
            }
            if (type is "agent-chat-send" or "agent-chat-resume")
            {
                var requestId = root.TryGetProperty("requestId", out var requestNode)
                    ? requestNode.GetString() ?? Guid.NewGuid().ToString("N")
                    : Guid.NewGuid().ToString("N");
                var conversationId = root.TryGetProperty("conversationId", out var conversationNode)
                    ? conversationNode.GetString() ?? string.Empty
                    : string.Empty;
                var clientRequestId = root.TryGetProperty("clientRequestId", out var clientNode)
                    ? clientNode.GetString() ?? requestId
                    : requestId;
                var prompt = root.TryGetProperty("prompt", out var promptNode)
                    ? promptNode.GetString() ?? string.Empty
                    : string.Empty;
                var providerId = root.TryGetProperty("providerId", out var providerNode)
                    && providerNode.ValueKind == JsonValueKind.String
                    ? providerNode.GetString()
                    : null;
                var reasoningEffort = root.TryGetProperty("reasoningEffort", out var effortNode)
                    && effortNode.ValueKind == JsonValueKind.String ? effortNode.GetString() : null;
                var model = root.TryGetProperty("model", out var modelNode)
                    && modelNode.ValueKind == JsonValueKind.String ? modelNode.GetString() : null;
                try
                {
                    Action<JsonElement> onEnvelope = envelope => Send(new {
                        type = "agent-chat-event", requestId, conversationId, envelope
                    });
                    var goalMode = root.TryGetProperty("goalMode", out var goalNode) && goalNode.GetBoolean();
                    // Files picked in the composer travel inline as base64; Core validates them, the launcher only forwards.
                    JsonElement? attachments = root.TryGetProperty("attachments", out var attachmentsNode)
                        && attachmentsNode.ValueKind == JsonValueKind.Array ? attachmentsNode : null;
                    if (type == "agent-chat-resume")
                    {
                        var turnId = root.GetProperty("turnId").GetString() ?? string.Empty;
                        await _runtime.ResumeAgentTurnStreamAsync(turnId, onEnvelope);
                    }
                    else await _runtime.RunAgentTurnStreamAsync(
                        conversationId,
                        clientRequestId,
                        prompt,
                        onEnvelope,
                        providerId: providerId, reasoningEffort: reasoningEffort, model: model, goalMode: goalMode,
                        attachments: attachments);
                    var result = await _runtime.ReadAgentConversationAsync(conversationId);
                    Send(new { type = "agent-chat-state", requestId, result });
                    await PushStatusAsync();
                }
                catch (Exception error)
                {
                    _runtime.CaptureFailure("AGENT_RUNTIME", error, "native-agent-chat-turn");
                    Send(new { type = "agent-chat-error", requestId, conversationId, error = error.Message });
                    try
                    {
                        var state = await _runtime.ReadAgentConversationAsync(conversationId);
                        Send(new { type = "agent-chat-state", requestId, result = state });
                        await PushStatusAsync();
                    }
                    catch { }
                }
                return;
            }
            if (type is "agent-chat-cancel" or "agent-chat-pause")
            {
                var turnId = root.TryGetProperty("turnId", out var turnNode)
                    ? turnNode.GetString() ?? string.Empty
                    : string.Empty;
                var conversationId = root.TryGetProperty("conversationId", out var conversationNode)
                    ? conversationNode.GetString() ?? string.Empty : string.Empty;
                var requestId = root.TryGetProperty("requestId", out var requestNode)
                    ? requestNode.GetString() : null;
                try
                {
                    if (type == "agent-chat-pause")
                    {
                        var paused = await _runtime.PauseAgentTurnAsync(turnId);
                        Send(new { type = "agent-chat-pause-result", turnId, paused });
                    }
                    else
                    {
                        var stopped = await _runtime.CancelAgentTurnAsync(turnId);
                        Send(new { type = "agent-chat-cancel-result", turnId, stopped });
                    }
                    if (!string.IsNullOrWhiteSpace(conversationId))
                    {
                        var result = await _runtime.ReadAgentConversationAsync(conversationId);
                        Send(new { type = "agent-chat-state", requestId, result });
                    }
                }
                catch (Exception error) { Send(new { type = "agent-chat-error", requestId, conversationId, error = error.Message }); }
                return;
            }
            if (type == "agent-chat-compact")
            {
                var turnId = root.TryGetProperty("turnId", out var turnNode)
                    ? turnNode.GetString() ?? string.Empty
                    : string.Empty;
                string status;
                try
                {
                    status = await _runtime.CompactAgentTurnAsync(turnId);
                }
                catch
                {
                    status = "unavailable";
                }
                Send(new { type = "agent-chat-compact-result", turnId, status });
                return;
            }
            if (type == "agent-chat-archive")
            {
                var conversationId = root.TryGetProperty("conversationId", out var conversationNode)
                    ? conversationNode.GetString() ?? string.Empty
                    : string.Empty;
                try
                {
                    await _runtime.ArchiveAgentConversationAsync(conversationId);
                    var result = await _runtime.ListAgentConversationsAsync();
                    Send(new { type = "agent-chat-list-result", result });
                    await PushStatusAsync();
                }
                catch (Exception error)
                {
                    Send(new { type = "agent-chat-error", error = error.Message });
                }
                return;
            }
            if (type == "agent-run")
            {
                var requestId = root.TryGetProperty("requestId", out var requestIdNode)
                    ? requestIdNode.GetString() ?? Guid.NewGuid().ToString("N")
                    : Guid.NewGuid().ToString("N");
                var prompt = root.TryGetProperty("prompt", out var promptNode) ? promptNode.GetString() ?? string.Empty : string.Empty;
                var workspace = root.TryGetProperty("workspace", out var workspaceNode) && workspaceNode.ValueKind == JsonValueKind.String
                    ? workspaceNode.GetString()
                    : null;
                try
                {
                    var result = await _runtime.RunAgentAsync(prompt, workspace);
                    Send(new { type = "agent-result", requestId, result });
                    await PushStatusAsync();
                }
                catch (Exception error)
                {
                    _runtime.CaptureFailure("AGENT_RUNTIME", error, "native-agent-ui-run");
                    Send(new { type = "agent-result", requestId, error = error.Message });
                }
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

    private object CurrentWindowSize()
    {
        var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        return new { width = bounds.Width, height = bounds.Height, defaultWidth = LauncherWindowSizeStore.DefaultWidth,
            defaultHeight = LauncherWindowSizeStore.DefaultHeight, minWidth = Math.Max(1, MinimumSize.Width),
            minHeight = Math.Max(1, MinimumSize.Height), maxDimension = LauncherWindowSizeStore.MaximumDimension };
    }

    private void SendWindowSize(string requestId) => Send(new { type = "window-size-state", requestId, size = CurrentWindowSize(), warning = _windowSizeWarning });

    private void SaveManualWindowSize()
    {
        if (_shutdownStarted || WindowState != FormWindowState.Normal) return;
        var size = new LauncherWindowSize(Width, Height);
        if (size == _lastSavedWindowSize || !LauncherWindowSizeStore.IsValid(size.Width, size.Height)) return;
        try { LauncherWindowSizeStore.Save(_root, size); _lastSavedWindowSize = size; _windowSizeWarning = null; }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            _runtime.CaptureFailure("LAUNCHER", error, "window-size-save");
            _windowSizeWarning = "The current window size could not be saved.";
        }
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
        if (_shutdownStarted || IsDisposed || Disposing || _webView.IsDisposed || _webView.CoreWebView2 is null) return;
        _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload, _json));
    }
}
