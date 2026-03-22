namespace DeepFolderComp.Backend.Models;

public class FileInfoDto
{
    public string Name { get; set; } = "";
    public string RelativePath { get; set; } = "";
    public string FullPath { get; set; } = "";
    public string ParentPath { get; set; } = "";
    public long Size { get; set; }
    public long LastModified { get; set; }
    public long CreatedAt { get; set; }
    public string Type { get; set; } = "";
    public string Extension { get; set; } = "";
    public int Depth { get; set; }
    public bool IsHidden { get; set; }
}

public class ScanRequest
{
    public string Path { get; set; } = "";
}

public class ScanResponse
{
    public FileInfoDto[] Files { get; set; } = [];
    public string[] Skipped { get; set; } = [];
}

public class MoveFileRequest
{
    public string SourcePath { get; set; } = "";
    public string DestDir { get; set; } = "";
    public string? FileName { get; set; }
    /// <summary>null = detect conflict, "overwrite" = replace existing, "rename" = add (2), (3)… suffix</summary>
    public string? ConflictAction { get; set; }
}

public class MoveFileResponse
{
    public bool Success { get; set; }
    public FileInfoDto? NewFileInfo { get; set; }
    public string? Error { get; set; }
    /// <summary>True when destination file already exists and no ConflictAction was specified.</summary>
    public bool Conflict { get; set; }
}

public class BatchMoveRequest
{
    public MoveFileRequest[] Files { get; set; } = [];
}

public class BatchMoveResponse
{
    public FileInfoDto[] Moved { get; set; } = [];
    public string[] Failed { get; set; } = [];
}

public class CreateFolderRequest
{
    public string Path { get; set; } = "";
}

public class ComparePairRequest
{
    public string SourcePath { get; set; } = "";
    public string DestPath { get; set; } = "";
    public string Method { get; set; } = "chunkProbe";
}

public class ComparePairResponse
{
    public bool Match { get; set; }
}

public class BrowseResponse
{
    public string? Path { get; set; }
    public bool Cancelled { get; set; }
}
