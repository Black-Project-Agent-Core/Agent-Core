using System.Text.Json;
using System.Text.Json.Nodes;

namespace AgentCore.Launcher;

public sealed record OAuthResetFileResult(string? BackupPath, int ClientsPreserved, bool GrantsCleared);

public static class OAuthStateResetter
{
    public static OAuthResetFileResult Reset(string dataDirectory)
    {
        Directory.CreateDirectory(dataDirectory);
        var oauthPath = Path.Combine(dataDirectory, "oauth.json");
        if (!File.Exists(oauthPath))
            return new OAuthResetFileResult(null, 0, true);

        var parsed = JsonNode.Parse(File.ReadAllText(oauthPath))?.AsObject()
            ?? throw new InvalidDataException("OAuth store is empty or invalid JSON.");
        if (parsed["version"]?.GetValue<int>() != 1)
            throw new InvalidDataException("Unsupported OAuth store format.");

        var clients = parsed["clients"]?.DeepClone() ?? new JsonArray();
        var clientCount = clients.AsArray().Count;
        var backupPath = Path.Combine(dataDirectory, $"oauth.reset.{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.json");
        File.Copy(oauthPath, backupPath, true);
        var reset = new JsonObject
        {
            ["version"] = 1,
            ["clients"] = clients,
            ["codes"] = new JsonArray(),
            ["accessTokens"] = new JsonArray(),
            ["refreshTokens"] = new JsonArray(),
        };
        var serialized = reset.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + Environment.NewLine;
        var tempPath = $"{oauthPath}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(tempPath, serialized);
        File.Move(tempPath, oauthPath, true);
        return new OAuthResetFileResult(backupPath, clientCount, true);
    }
}
