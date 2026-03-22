using System.Security.Cryptography;
using DeepFolderComp.Backend.Models;
using Microsoft.AspNetCore.StaticFiles;

namespace DeepFolderComp.Backend.Services;

public class FileSystemService
{
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    /// <summary>Opens a native folder browser dialog on an STA thread.</summary>
    public string? BrowseFolder()
    {
        string? selectedPath = null;
        var thread = new Thread(() =>
        {
            using var dialog = new FolderBrowserDialog
            {
                Description = "Select a folder",
                UseDescriptionForTitle = true,
                ShowNewFolderButton = true
            };
            if (dialog.ShowDialog() == DialogResult.OK)
                selectedPath = dialog.SelectedPath;
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        return selectedPath;
    }

    /// <summary>Recursively scan a directory and return file metadata.</summary>
    public ScanResponse ScanDirectory(string rootPath)
    {
        var files = new List<FileInfoDto>();
        var skipped = new List<string>();

        ScanRecursive(rootPath, rootPath, files, skipped);

        return new ScanResponse { Files = files.ToArray(), Skipped = skipped.ToArray() };
    }

    private void ScanRecursive(string rootPath, string currentPath, List<FileInfoDto> files, List<string> skipped)
    {
        try
        {
            foreach (var filePath in Directory.GetFiles(currentPath))
            {
                try
                {
                    var info = new FileInfo(filePath);
                    var relativePath = Path.GetRelativePath(rootPath, filePath).Replace('\\', '/');
                    var parentPath = Path.GetDirectoryName(relativePath)?.Replace('\\', '/') ?? "";

                    files.Add(new FileInfoDto
                    {
                        Name = info.Name,
                        RelativePath = relativePath,
                        FullPath = info.FullName.Replace('\\', '/'),
                        ParentPath = parentPath,
                        Size = info.Length,
                        LastModified = new DateTimeOffset(info.LastWriteTime).ToUnixTimeMilliseconds(),
                        CreatedAt = new DateTimeOffset(info.CreationTime).ToUnixTimeMilliseconds(),
                        Type = GetMimeType(info.Name),
                        Extension = info.Extension.TrimStart('.').ToLowerInvariant(),
                        Depth = relativePath.Count(c => c == '/'),
                        IsHidden = info.Name.StartsWith('.') || info.Attributes.HasFlag(FileAttributes.Hidden)
                    });
                }
                catch
                {
                    skipped.Add(Path.GetRelativePath(rootPath, filePath));
                }
            }

            foreach (var dirPath in Directory.GetDirectories(currentPath))
            {
                try
                {
                    ScanRecursive(rootPath, dirPath, files, skipped);
                }
                catch
                {
                    skipped.Add(Path.GetRelativePath(rootPath, dirPath));
                }
            }
        }
        catch
        {
            skipped.Add(Path.GetRelativePath(rootPath, currentPath));
        }
    }

    /// <summary>Create a directory if it doesn't exist.</summary>
    public bool CreateFolder(string path)
    {
        Directory.CreateDirectory(path);
        return true;
    }

    /// <summary>Compare two files using the specified method.</summary>
    public bool CompareFiles(string sourcePath, string destPath, string method)
    {
        if (!File.Exists(sourcePath) || !File.Exists(destPath))
            return false;

        return method switch
        {
            "chunkProbe" => ChunkProbeCompare(sourcePath, destPath),
            "hash" => HashCompare(sourcePath, destPath),
            "fullByteCompare" => FullByteCompare(sourcePath, destPath),
            _ => false
        };
    }

    /// <summary>Compare first, middle, and last 4KB chunks of two files.</summary>
    private static bool ChunkProbeCompare(string path1, string path2)
    {
        const int chunkSize = 4096;
        var info1 = new FileInfo(path1);
        var info2 = new FileInfo(path2);

        if (info1.Length != info2.Length)
            return false;

        var fileSize = info1.Length;
        if (fileSize == 0)
            return true;

        long[] offsets = fileSize <= chunkSize
            ? [0]
            : [0, Math.Max(0, fileSize / 2 - chunkSize / 2), Math.Max(0, fileSize - chunkSize)];

        var buf1 = new byte[chunkSize];
        var buf2 = new byte[chunkSize];

        using var fs1 = File.OpenRead(path1);
        using var fs2 = File.OpenRead(path2);

        foreach (var offset in offsets)
        {
            fs1.Seek(offset, SeekOrigin.Begin);
            fs2.Seek(offset, SeekOrigin.Begin);

            var read1 = fs1.Read(buf1, 0, chunkSize);
            var read2 = fs2.Read(buf2, 0, chunkSize);

            if (read1 != read2)
                return false;

            if (!buf1.AsSpan(0, read1).SequenceEqual(buf2.AsSpan(0, read2)))
                return false;
        }

        return true;
    }

    /// <summary>Compare files by SHA-256 hash.</summary>
    private static bool HashCompare(string path1, string path2)
    {
        using var sha = SHA256.Create();

        using var fs1 = File.OpenRead(path1);
        var hash1 = sha.ComputeHash(fs1);

        using var fs2 = File.OpenRead(path2);
        var hash2 = sha.ComputeHash(fs2);

        return hash1.AsSpan().SequenceEqual(hash2);
    }

    /// <summary>Full byte-for-byte comparison.</summary>
    private static bool FullByteCompare(string path1, string path2)
    {
        var info1 = new FileInfo(path1);
        var info2 = new FileInfo(path2);

        if (info1.Length != info2.Length)
            return false;

        const int bufferSize = 65536;
        var buf1 = new byte[bufferSize];
        var buf2 = new byte[bufferSize];

        using var fs1 = File.OpenRead(path1);
        using var fs2 = File.OpenRead(path2);

        int read1;
        while ((read1 = fs1.Read(buf1, 0, bufferSize)) > 0)
        {
            var read2 = fs2.Read(buf2, 0, bufferSize);
            if (read1 != read2)
                return false;
            if (!buf1.AsSpan(0, read1).SequenceEqual(buf2.AsSpan(0, read2)))
                return false;
        }

        return true;
    }

    public static string GetMimeType(string fileName)
    {
        if (ContentTypeProvider.TryGetContentType(fileName, out var contentType))
            return contentType;
        return "application/octet-stream";
    }
}
