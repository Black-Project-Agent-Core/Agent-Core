using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class DpapiHelperTests
{
    [Fact]
    public void Protect_then_unprotect_round_trips_and_hides_the_plaintext()
    {
        var master = RandomNumberGenerator.GetBytes(32);

        using var protectedOut = new MemoryStream();
        DpapiHelper.Run(protect: true, new MemoryStream(master), protectedOut);
        var blob = protectedOut.ToArray();

        Assert.NotEmpty(blob);
        Assert.DoesNotContain(Convert.ToBase64String(master), Convert.ToBase64String(blob));
        Assert.True(blob.AsSpan().IndexOf(master) < 0);

        using var plainOut = new MemoryStream();
        DpapiHelper.Run(protect: false, new MemoryStream(blob), plainOut);
        Assert.Equal(master, plainOut.ToArray());
    }

    [Fact]
    public void Unprotect_rejects_a_blob_that_is_not_dpapi()
    {
        using var output = new MemoryStream();
        Assert.ThrowsAny<CryptographicException>(() =>
            DpapiHelper.Run(protect: false, new MemoryStream(Encoding.ASCII.GetBytes("not a dpapi blob")), output));
        Assert.Equal(0, output.Length);
    }

    [Fact]
    public void Empty_input_is_refused()
    {
        using var output = new MemoryStream();
        Assert.Throws<InvalidDataException>(() => DpapiHelper.Run(protect: true, new MemoryStream(), output));
    }

    [Fact]
    public void Helper_mode_only_answers_its_own_flags()
    {
        Assert.False(DpapiHelper.TryRunHelperMode(Array.Empty<string>()));
        Assert.False(DpapiHelper.TryRunHelperMode(new[] { "--browser-use-transport", "x" }));
    }
}
