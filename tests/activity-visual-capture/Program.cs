using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program
{
  [STAThread]
  private static int Main(string[] args)
  {
if (args.Length == 1 && args[0] == "--verify-journal") return ActivityJournalFixture.Verify();
if (args.Length != 2) { Console.Error.WriteLine("Usage: capture <fixture.html> <output.png>"); return 2; }
var input = Path.GetFullPath(args[0]);
var output = Path.GetFullPath(args[1]);
if (!File.Exists(input)) { Console.Error.WriteLine("Fixture missing"); return 3; }
Directory.CreateDirectory(Path.GetDirectoryName(output)!);
var succeeded = false;
Application.EnableVisualStyles();
using var form = new Form { Text = "Agent Core safe visual fixture",
  ShowInTaskbar = false, StartPosition = FormStartPosition.Manual,
  Location = new Point(-4000, -4000), ClientSize = new Size(1440, 900) };
using var view = new WebView2 { Dock = DockStyle.Fill };
form.Controls.Add(view);
using var timeout = new System.Windows.Forms.Timer { Interval = 20000 };
timeout.Tick += (_, _) => { Console.Error.WriteLine("Fixture capture timeout"); timeout.Stop(); form.Close(); };
form.Shown += async (_, _) => {
  try {
    var profile = Path.Combine(Path.GetDirectoryName(output)!, "activity-visual-profile");
    var env = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
    await view.EnsureCoreWebView2Async(env);
    view.CoreWebView2.NavigationCompleted += async (_, result) => {
      if (!result.IsSuccess) { Console.Error.WriteLine("Fixture navigation failed"); form.Close(); return; }
      try {
        await Task.Delay(900);
        await using var stream = new FileStream(output, FileMode.CreateNew, FileAccess.Write);
        await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        succeeded = new FileInfo(output).Length > 1_024;
      } catch (Exception e) { Console.Error.WriteLine(e.GetType().Name+": "+e.Message); }
      finally { form.Close(); }
    };
    view.CoreWebView2.Navigate(new Uri(input).AbsoluteUri);
  }
  catch (Exception e) { Console.Error.WriteLine(e.GetType().Name+": "+e.Message); form.Close(); }
};
timeout.Start();
Application.Run(form);
Console.WriteLine(succeeded ? "FIXTURE_SCREENSHOT_CREATED" : "FIXTURE_SCREENSHOT_FAILED");
return succeeded ? 0 : 1;
  }
}
