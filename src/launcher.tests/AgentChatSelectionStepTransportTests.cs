using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

public sealed class AgentChatSelectionStepTransportTests
{
    [Fact]
    public async Task SelectAgentChatSendsPutWithJsonBodyAndUiToken()
    {
        var capture = new Capture("{\"selection\":{\"providerId\":\"anthropic\"}}");
        var result = await WithRuntime(capture, runtime => runtime.SelectAgentChatAsync("anthropic", "fixture-opus", "high"));
        Assert.Equal(HttpMethod.Put, capture.Method);
        Assert.Equal("/agent/chat/selection", capture.PathAndQuery);
        Assert.True(capture.HasUiToken);
        Assert.False(capture.HasExternalControllerOrigin);
        using var body = JsonDocument.Parse(capture.Body!);
        Assert.Equal("anthropic", body.RootElement.GetProperty("providerId").GetString());
        Assert.Equal("fixture-opus", body.RootElement.GetProperty("model").GetString());
        Assert.Equal("high", body.RootElement.GetProperty("reasoningEffort").GetString());
        Assert.Equal("anthropic", result.GetProperty("selection").GetProperty("providerId").GetString());
    }

    [Fact]
    public async Task ReadAgentStepEscapesTurnIdAndUsesGet()
    {
        var capture = new Capture("{\"inputText\":\"in\",\"outputText\":\"out\",\"inputTruncated\":false,\"outputTruncated\":false}");
        var result = await WithRuntime(capture, runtime => runtime.ReadAgentStepAsync("turn/a b?c#d", 7));
        Assert.Equal(HttpMethod.Get, capture.Method);
        Assert.Equal("/agent/chat/steps/turn%2Fa%20b%3Fc%23d/7", capture.RawPath);
        Assert.True(capture.HasUiToken);
        Assert.False(capture.HasExternalControllerOrigin);
        Assert.Equal("out", result.GetProperty("outputText").GetString());
    }

    private static async Task<JsonElement> WithRuntime(Capture capture, Func<AgentCoreRuntime, Task<JsonElement>> action)
    {
        var root = Path.Combine(Path.GetTempPath(), "agent-core-selstep-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            using var runtime = new AgentCoreRuntime(root);
            var field = typeof(AgentCoreRuntime).GetField("_agentHttp", BindingFlags.Instance | BindingFlags.NonPublic)!;
            ((HttpClient)field.GetValue(runtime)!).Dispose();
            field.SetValue(runtime, new HttpClient(capture));
            return await action(runtime);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    private sealed class Capture(string responseJson) : HttpMessageHandler
    {
        public HttpMethod? Method;
        public string? PathAndQuery;
        public string? RawPath;
        public string? Body;
        public bool HasUiToken;
        public bool HasExternalControllerOrigin;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Method = request.Method;
            PathAndQuery = request.RequestUri!.AbsolutePath;
            RawPath = request.RequestUri!.AbsoluteUri.Substring(request.RequestUri.GetLeftPart(UriPartial.Authority).Length);
            HasUiToken = request.Headers.Contains("X-Agent-Core-UI-Token");
            HasExternalControllerOrigin = request.Headers.TryGetValues("x-agent-core-chat-origin", out var origin)
                && string.Join(",", origin).Contains("external-controller", StringComparison.OrdinalIgnoreCase);
            if (request.Content is not null) Body = await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseJson, Encoding.UTF8, "application/json")
            };
        }
    }
}
