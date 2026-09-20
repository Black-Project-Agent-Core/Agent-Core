using System;
using System.IO;
using System.Text.Json;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class OAuthStateResetterTests
{
    [Fact]
    public void Preserves_clients_and_clears_grants()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-oauth-reset-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var oauth = Path.Combine(root, "oauth.json");
        File.WriteAllText(oauth, """
        {
          "version": 1,
          "clients": [{"clientId":"client-1","clientName":"ChatGPT","redirectUris":["https://chatgpt.com/connector/oauth/test"],"grantTypes":["authorization_code"],"responseTypes":["code"],"tokenEndpointAuthMethod":"client_secret_post","secretHash":"hash","createdAt":"2026-09-17T00:00:00Z"}],
          "codes": [{"hash":"code"}],
          "accessTokens": [{"hash":"access"}],
          "refreshTokens": [{"hash":"refresh"}]
        }
        """);
        try
        {
            var result = OAuthStateResetter.Reset(root);
            Assert.Equal(1, result.ClientsPreserved);
            Assert.True(result.GrantsCleared);
            Assert.NotNull(result.BackupPath);
            Assert.True(File.Exists(result.BackupPath));

            using var document = JsonDocument.Parse(File.ReadAllText(oauth));
            var rootElement = document.RootElement;
            Assert.Equal(1, rootElement.GetProperty("clients").GetArrayLength());
            Assert.Equal(0, rootElement.GetProperty("codes").GetArrayLength());
            Assert.Equal(0, rootElement.GetProperty("accessTokens").GetArrayLength());
            Assert.Equal(0, rootElement.GetProperty("refreshTokens").GetArrayLength());
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void Missing_store_is_safe_noop()
    {
        var root = Path.Combine(Path.GetTempPath(), $"agent-core-oauth-reset-{Guid.NewGuid():N}");
        try
        {
            var result = OAuthStateResetter.Reset(root);
            Assert.Null(result.BackupPath);
            Assert.Equal(0, result.ClientsPreserved);
            Assert.True(result.GrantsCleared);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
