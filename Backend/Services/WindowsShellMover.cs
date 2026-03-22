using System.Runtime.InteropServices;

namespace DeepFolderComp.Backend.Services;

/// <summary>Moves files using the Windows Shell API (SHFileOperation), preserving all metadata.</summary>
public sealed class WindowsShellMover
{
    /// <summary>Moves a file from source to destination, preserving timestamps, streams, and security.</summary>
    public void Move(string source, string destination)
    {
        if (string.IsNullOrWhiteSpace(source))
            throw new ArgumentException("Source path must not be empty.", nameof(source));

        if (string.IsNullOrWhiteSpace(destination))
            throw new ArgumentException("Destination path must not be empty.", nameof(destination));

        if (!File.Exists(source))
            throw new FileNotFoundException("Source file not found.", source);

        var op = new SHFILEOPSTRUCT
        {
            wFunc = FO_MOVE,
            pFrom = source + '\0' + '\0',
            pTo = destination + '\0' + '\0',
            fFlags = FOF_SILENT | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_NOCONFIRMMKDIR
        };

        int result = SHFileOperation(ref op);
        if (result != 0)
            throw new IOException($"Shell move failed with code 0x{result:X}");

        if (op.fAnyOperationsAborted)
            throw new OperationCanceledException("Shell move was aborted");
    }

    /// <summary>Returns "photo (2).jpg", "photo (3).jpg", … until a free name is found.</summary>
    public static string GetNextAvailableName(string directory, string fileName)
    {
        if (string.IsNullOrWhiteSpace(directory))
            throw new ArgumentException("Directory must not be empty.", nameof(directory));

        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name must not be empty.", nameof(fileName));

        var nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
        var ext = Path.GetExtension(fileName);
        var counter = 2;

        string candidate;
        do
        {
            candidate = $"{nameWithoutExt} ({counter}){ext}";
            counter++;
        } while (File.Exists(Path.Combine(directory, candidate)));

        return candidate;
    }

    #region Windows Shell API

    private const uint FO_MOVE = 0x0001;
    private const ushort FOF_SILENT = 0x0004;
    private const ushort FOF_NOCONFIRMATION = 0x0010;
    private const ushort FOF_NOERRORUI = 0x0400;
    private const ushort FOF_NOCONFIRMMKDIR = 0x0200;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEOPSTRUCT
    {
        public nint hwnd;
        public uint wFunc;
        [MarshalAs(UnmanagedType.LPWStr)] public string pFrom;
        [MarshalAs(UnmanagedType.LPWStr)] public string pTo;
        public ushort fFlags;
        [MarshalAs(UnmanagedType.Bool)] public bool fAnyOperationsAborted;
        public nint hNameMappings;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszProgressTitle;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHFileOperation(ref SHFILEOPSTRUCT lpFileOp);

    #endregion
}
