import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/launcher/MainForm.cs', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/launcher/AgentCoreRuntime.cs', import.meta.url), 'utf8');

// Source-contract coverage only. WebView2/WinForms execution requires Windows.
describe('Workflows launcher boundary source contracts', () => {
  it('checks the exact trusted app source before parsing any native command', () => {
    const handler = main.slice(main.indexOf('private async void OnWebMessageReceivedAsync'));
    expect(handler.indexOf('if (!IsTrustedAppSource(e.Source)) return;')).toBeGreaterThan(0);
    expect(handler.indexOf('if (!IsTrustedAppSource(e.Source)) return;')).toBeLessThan(handler.indexOf('JsonDocument.Parse'));
    const guard = main.match(/private static bool IsTrustedAppSource\(string source\)[\s\S]*?\n    }/)?.[0] ?? '';
    expect(guard).toContain('Uri.UriSchemeHttps');
    expect(guard).toContain('uri.IsDefaultPort');
    expect(guard).toContain('uri.UserInfo.Length == 0');
    expect(guard).toContain('uri.Query.Length == 0');
    expect(guard).toContain('uri.Host.Equals("app.agentcore.local", StringComparison.OrdinalIgnoreCase)');
    expect(guard).toContain('uri.AbsolutePath.Equals("/index.html", StringComparison.Ordinal)');
    expect(main).toContain('if (!IsTrustedAppSource(args.Uri))');
    expect(main).not.toContain('FrameCreated +=');
  });

  it('uses the existing ephemeral token for a bounded read-only loopback fetch', () => {
    const get = runtime.match(/public async Task<JsonElement> GetWorkflowsAsync\(\)[\s\S]*?\n    }/)?.[0] ?? '';
    expect(get).toContain('CreateAgentChatRequest(HttpMethod.Get, "/agent/workflows")');
    expect(get).toContain('CancellationTokenSource(TimeSpan.FromSeconds(8))');
    expect(get).toContain('timeout.Token');
    expect(runtime).toContain('request.Headers.TryAddWithoutValidation("X-Agent-Core-UI-Token", _agentUiToken)');
    expect(main).toContain('type == "workflows-get"');
    expect(main).toContain('type = "workflows-result", requestId, result');
    expect(main).toContain('type = "workflows-error", requestId, error = error.Message');
  });

  it('does not inject the parent diagnostics bridge into child canvases', () => {
    expect(main).toContain('if (window !== window.top) return;');
  });

  it('bounds correlation IDs and response bytes before the canvas crosses the bridge', () => {
    const handler = main.slice(main.indexOf('if (type == "workflows-get")'), main.indexOf('if (type == "agent-chat-list")'));
    expect(handler).toContain('requestIdNode.ValueKind == JsonValueKind.String');
    expect(handler).toContain('string.IsNullOrWhiteSpace(requestId) || requestId.Length > 128');
    expect(handler.indexOf('requestId.Length > 128')).toBeLessThan(handler.indexOf('_runtime.GetWorkflowsAsync()'));
    const get = runtime.match(/public async Task<JsonElement> GetWorkflowsAsync\(\)[\s\S]*?\n    }/)?.[0] ?? '';
    expect(get).toContain('maxBytes = 4 * 1024 * 1024');
    expect(get).toContain('HttpCompletionOption.ResponseHeadersRead');
    expect(get).toContain('response.Content.Headers.ContentLength > maxBytes');
    expect(get).toContain('buffer.Length + read > maxBytes');
    expect(get).toContain('stream.ReadAsync(chunk, timeout.Token)');
  });

  it('drops late native results after shutdown instead of posting to a disposed webview', () => {
    const send = main.slice(main.indexOf('private void Send(object payload)'));
    expect(send).toContain('_shutdownStarted || IsDisposed || Disposing || _webView.IsDisposed');
  });
});
