using System.Diagnostics;
using Microsoft.Win32;

namespace DeepFolderComp.Backend.Services;

/// <summary>
/// Launches the default browser in app mode and monitors the process for exit.
/// </summary>
public class BrowserLauncher
{
    private Process? _browserProcess;
    private string? _userDataDir;

    public bool Launch(string url)
    {
        var browserPath = FindAppModeBrowser();
        if (browserPath == null)
            return false;

        // Dedicated user-data-dir prevents the process from delegating to an
        // already-running browser instance and exiting immediately.
        _userDataDir = Path.Combine(Path.GetTempPath(), "DeepFolderComp_browser");
        Directory.CreateDirectory(_userDataDir);

        _browserProcess = Process.Start(new ProcessStartInfo
        {
            FileName = browserPath,
            Arguments = $"--app={url} --user-data-dir=\"{_userDataDir}\" --no-first-run --disable-default-apps",
            UseShellExecute = false
        });

        return _browserProcess != null;
    }

    public void WaitForExit()
    {
        _browserProcess?.WaitForExit();
        CleanupUserDataDir();
    }

    private void CleanupUserDataDir()
    {
        if (_userDataDir == null || !Directory.Exists(_userDataDir))
            return;

        try { Directory.Delete(_userDataDir, recursive: true); }
        catch { /* best effort — files may still be locked briefly */ }
    }

    /// <summary>
    /// Finds a Chromium-based browser that supports --app mode (Edge, Chrome, Brave).
    /// </summary>
    private static string? FindAppModeBrowser()
    {
        var candidates = new[]
        {
            GetRegisteredDefaultBrowserPath(),
            FindInProgramFiles("Microsoft\\Edge\\Application\\msedge.exe"),
            FindInProgramFiles("Google\\Chrome\\Application\\chrome.exe"),
            FindInProgramFiles("BraveSoftware\\Brave-Browser\\Application\\brave.exe")
        };

        return candidates.FirstOrDefault(p => p != null && File.Exists(p));
    }

    /// <summary>
    /// Reads the default browser path from the Windows registry (only if it's Chromium-based).
    /// </summary>
    private static string? GetRegisteredDefaultBrowserPath()
    {
        try
        {
            var progId = Registry.GetValue(
                @"HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice",
                "ProgId", null) as string;

            if (progId == null)
                return null;

            var chromiumProgIds = new[] { "ChromeHTML", "MSEdgeHTM", "BraveHTML" };
            if (!chromiumProgIds.Any(id => progId.Contains(id, StringComparison.OrdinalIgnoreCase)))
                return null;

            var command = Registry.GetValue(
                $@"HKEY_CLASSES_ROOT\{progId}\shell\open\command", null, null) as string;

            if (command == null)
                return null;

            // Extract path from command like: "C:\...\chrome.exe" --single-argument %1
            var path = command.Split('"', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            return path != null && File.Exists(path) ? path : null;
        }
        catch
        {
            return null;
        }
    }

    private static string? FindInProgramFiles(string relativePath)
    {
        var roots = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData))
        };

        return roots
            .Select(root => Path.Combine(root, relativePath))
            .FirstOrDefault(File.Exists);
    }
}
