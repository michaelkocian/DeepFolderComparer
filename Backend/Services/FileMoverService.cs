using DeepFolderComp.Backend.Models;

namespace DeepFolderComp.Backend.Services;

public class FileMoverService
{
    private readonly WindowsShellMover _shellMover = new();
    /// <summary>Moves a file to a destination directory using the Windows Shell API (same as Explorer).</summary>
    public MoveFileResponse MoveFile(string sourcePath, string destDir, string? fileName = null, string? conflictAction = null)
    {
        try
        {
            if (!File.Exists(sourcePath))
                return new MoveFileResponse { Success = false, Error = "Source file not found" };

            var sourceInfo = new FileInfo(sourcePath);
            var targetName = fileName ?? sourceInfo.Name;
            var destPath = Path.Combine(destDir, targetName);

            Console.WriteLine($"[FileMover] Request: \"{sourcePath}\" -> \"{destPath}\" (conflict: {conflictAction ?? "none"})");

            Directory.CreateDirectory(destDir);

            if (File.Exists(destPath))
            {
                if (string.IsNullOrEmpty(conflictAction))
                    return new MoveFileResponse { Success = false, Conflict = true, Error = "File already exists" };

                if (conflictAction == "overwrite")
                    File.Delete(destPath);
                else if (conflictAction == "rename")
                {
                    targetName = WindowsShellMover.GetNextAvailableName(destDir, targetName);
                    destPath = Path.Combine(destDir, targetName);
                }
            }

            _shellMover.Move(sourcePath, destPath);

            // Verify and return new file info
            var movedInfo = new FileInfo(destPath);
            var rootDir = destDir;
            var relativePath = Path.GetRelativePath(rootDir, destPath).Replace('\\', '/');

            return new MoveFileResponse
            {
                Success = true,
                NewFileInfo = new FileInfoDto
                {
                    Name = movedInfo.Name,
                    RelativePath = relativePath,
                    FullPath = movedInfo.FullName.Replace('\\', '/'),
                    ParentPath = Path.GetDirectoryName(relativePath)?.Replace('\\', '/') ?? "",
                    Size = movedInfo.Length,
                    LastModified = new DateTimeOffset(movedInfo.LastWriteTime).ToUnixTimeMilliseconds(),
                    CreatedAt = new DateTimeOffset(movedInfo.CreationTime).ToUnixTimeMilliseconds(),
                    Type = FileSystemService.GetMimeType(movedInfo.Name),
                    Extension = movedInfo.Extension.TrimStart('.').ToLowerInvariant(),
                    Depth = relativePath.Count(c => c == '/'),
                    IsHidden = movedInfo.Name.StartsWith('.') || movedInfo.Attributes.HasFlag(FileAttributes.Hidden)
                }
            };
        }
        catch (Exception ex)
        {
            return new MoveFileResponse { Success = false, Error = ex.Message };
        }
    }

    /// <summary>Move multiple files, returning results for each.</summary>
    public BatchMoveResponse MoveFiles(MoveFileRequest[] requests)
    {
        var moved = new List<FileInfoDto>();
        var failed = new List<string>();

        foreach (var req in requests)
        {
            var result = MoveFile(req.SourcePath, req.DestDir, req.FileName, req.ConflictAction);
            if (result.Success && result.NewFileInfo != null)
                moved.Add(result.NewFileInfo);
            else
                failed.Add(Path.GetFileName(req.SourcePath));
        }

        return new BatchMoveResponse { Moved = moved.ToArray(), Failed = failed.ToArray() };
    }

}
