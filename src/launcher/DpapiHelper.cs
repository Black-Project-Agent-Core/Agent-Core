using System.Security.Cryptography;

namespace AgentCore.Launcher;

/// <summary>
/// Helper mode for Core's credential vault: <c>--dpapi-protect</c> / <c>--dpapi-unprotect</c> read stdin, apply
/// Windows DPAPI in user scope and write the result to stdout. Core calls it with execFileSync whoever started Core,
/// so the vault master key never depends on PowerShell being allowed to load ProtectedData.
/// </summary>
public static class DpapiHelper
{
    public const string ProtectFlag = "--dpapi-protect";
    public const string UnprotectFlag = "--dpapi-unprotect";
    // A master key is 32 bytes; anything far above that is not this helper's job.
    private const int MaxInput = 64 * 1024;

    public static bool TryRunHelperMode(string[] args)
    {
        if (args.Length == 0 || args[0] is not (ProtectFlag or UnprotectFlag)) return false;
        try
        {
            if (args.Length != 1) throw new InvalidDataException("DPAPI_HELPER_ARGUMENTS_REFUSED");
            using var input = Console.OpenStandardInput();
            using var output = Console.OpenStandardOutput();
            Run(args[0] == ProtectFlag, input, output);
        }
        catch { Console.Error.WriteLine("DPAPI_HELPER_FAILED"); Environment.ExitCode = 1; }
        return true;
    }

    public static void Run(bool protect, Stream input, Stream output)
    {
        var data = ReadBounded(input);
        if (data.Length == 0) throw new InvalidDataException("DPAPI_HELPER_EMPTY_INPUT");
        var result = protect
            ? ProtectedData.Protect(data, null, DataProtectionScope.CurrentUser)
            : ProtectedData.Unprotect(data, null, DataProtectionScope.CurrentUser);
        output.Write(result, 0, result.Length);
        output.Flush();
    }

    private static byte[] ReadBounded(Stream input)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        while (true)
        {
            var count = input.Read(chunk, 0, chunk.Length);
            if (count <= 0) return buffer.ToArray();
            if (buffer.Length + count > MaxInput) throw new InvalidDataException("DPAPI_HELPER_INPUT_TOO_LARGE");
            buffer.Write(chunk, 0, count);
        }
    }
}
