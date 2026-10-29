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

public sealed class AgentChatReasoningTransportTests
{
    [Theory]
    [InlineData(null, null)]
    [InlineData("low", "fixture-opus")]
    [InlineData("high", " fixture-haiku ")]
    [InlineData(null, "")]
    public async Task PreservesExplicitEffortAndModelAndOmitsDefaults(string? effort, string? model)
    {
        var root = Path.Combine(Path.GetTempPath(), "agent-core-effort-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            using var runtime = new AgentCoreRuntime(root);
            var field = typeof(AgentCoreRuntime).GetField("_agentHttp", BindingFlags.Instance | BindingFlags.NonPublic)!;
            ((HttpClient)field.GetValue(runtime)!).Dispose();
            field.SetValue(runtime, new HttpClient(new Capture(effort, model)));
            var envelopes = 0;
            await runtime.RunAgentTurnStreamAsync("fixture", "request-1", "Hello", _ => envelopes++,
                providerId: "anthropic", reasoningEffort: effort, model: model);
            Assert.Equal(1, envelopes);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    private sealed class Capture(string? effort, string? model) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.True(request.Headers.Contains("X-Agent-Core-UI-Token"));
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            Assert.Equal("anthropic", json.RootElement.GetProperty("providerId").GetString());
            var present = json.RootElement.TryGetProperty("reasoningEffort", out var value);
            Assert.Equal(effort is not null, present);
            if (present) Assert.Equal(effort, value.GetString());
            var modelPresent = json.RootElement.TryGetProperty("model", out var modelValue);
            Assert.Equal(!string.IsNullOrWhiteSpace(model), modelPresent);
            if (modelPresent) Assert.Equal(model!.Trim(), modelValue.GetString());
            return new HttpResponseMessage(HttpStatusCode.OK) {
                Content = new StringContent("{\"type\":\"result\",\"result\":{\"status\":\"finalized\"}}\n", Encoding.UTF8, "application/x-ndjson")
            };
        }
    }
}
