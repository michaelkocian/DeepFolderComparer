using DeepFolderComp.Backend.Services;

namespace DeepFolderComp.Tests;

public sealed class WindowsShellMoverTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), $"ShellMoverTests_{Guid.NewGuid():N}");
    private readonly WindowsShellMover _mover = new();

    public WindowsShellMoverTests()
    {
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }

    private string CreateTempFile(string relativePath, string content = "test content")
    {
        var fullPath = Path.Combine(_tempDir, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        File.WriteAllText(fullPath, content);
        return fullPath;
    }

    #region Move

    [Fact]
    public void Move_FileExists_MovesToDestination()
    {
        var source = CreateTempFile("source.txt", "hello");
        var dest = Path.Combine(_tempDir, "moved.txt");

        _mover.Move(source, dest);

        Assert.False(File.Exists(source));
        Assert.True(File.Exists(dest));
        Assert.Equal("hello", File.ReadAllText(dest));
    }

    [Fact]
    public void Move_PreservesFileContent()
    {
        var content = new string('X', 100_000);
        var source = CreateTempFile("big.bin", content);
        var dest = Path.Combine(_tempDir, "big_moved.bin");

        _mover.Move(source, dest);

        Assert.Equal(content, File.ReadAllText(dest));
    }

    [Fact]
    public void Move_PreservesTimestamps()
    {
        var source = CreateTempFile("timestamped.txt");
        var originalWrite = new DateTime(2020, 6, 15, 12, 0, 0);
        File.SetLastWriteTime(source, originalWrite);
        var dest = Path.Combine(_tempDir, "timestamped_moved.txt");

        _mover.Move(source, dest);

        Assert.Equal(originalWrite, File.GetLastWriteTime(dest));
    }

    [Fact]
    public void Move_SourceNotFound_ThrowsFileNotFoundException()
    {
        var source = Path.Combine(_tempDir, "nonexistent.txt");
        var dest = Path.Combine(_tempDir, "dest.txt");

        Assert.Throws<FileNotFoundException>(() => _mover.Move(source, dest));
    }

    [Fact]
    public void Move_DestinationAlreadyExists_DeletesDestAndMoves()
    {
        var source = CreateTempFile("src.txt", "new content");
        var dest = CreateTempFile("dst.txt", "old content");

        _mover.Move(source, dest);

        Assert.False(File.Exists(source));
        Assert.Equal("new content", File.ReadAllText(dest));
    }

    [Fact]
    public void Move_DestinationAlreadyExists_InSubdirectory_Succeeds()
    {
        var source = CreateTempFile("source/photo.jpg", "source data");
        var dest = CreateTempFile("dest/photo.jpg", "existing data");

        _mover.Move(source, dest);

        Assert.False(File.Exists(source));
        Assert.Equal("source data", File.ReadAllText(dest));
    }

    [Fact]
    public void Move_DestinationAlreadyExists_PreservesTimestamp()
    {
        var source = CreateTempFile("src_ts.txt", "newer");
        var originalWrite = new DateTime(2021, 3, 10, 8, 0, 0);
        File.SetLastWriteTime(source, originalWrite);
        var dest = CreateTempFile("dst_ts.txt", "older");

        _mover.Move(source, dest);

        Assert.Equal("newer", File.ReadAllText(dest));
        Assert.Equal(originalWrite, File.GetLastWriteTime(dest));
    }

    [Fact]
    public void Move_DestinationAlreadyExists_LargerFile_Succeeds()
    {
        var largeContent = new string('A', 50_000);
        var source = CreateTempFile("large_src.bin", largeContent);
        var dest = CreateTempFile("large_dst.bin", "small existing");

        _mover.Move(source, dest);

        Assert.False(File.Exists(source));
        Assert.Equal(largeContent, File.ReadAllText(dest));
    }

    [Fact]
    public void Move_DestinationSubdirectoryCreated()
    {
        var source = CreateTempFile("flat.txt", "nested move");
        var dest = Path.Combine(_tempDir, "sub", "dir", "flat.txt");

        _mover.Move(source, dest);

        Assert.True(File.Exists(dest));
        Assert.Equal("nested move", File.ReadAllText(dest));
    }

    [Fact]
    public void Move_EmptySourcePath_ThrowsArgumentException()
    {
        var dest = Path.Combine(_tempDir, "dest.txt");

        Assert.Throws<ArgumentException>(() => _mover.Move("", dest));
        Assert.Throws<ArgumentException>(() => _mover.Move("  ", dest));
    }

    [Fact]
    public void Move_EmptyDestinationPath_ThrowsArgumentException()
    {
        var source = CreateTempFile("src.txt");

        Assert.Throws<ArgumentException>(() => _mover.Move(source, ""));
        Assert.Throws<ArgumentException>(() => _mover.Move(source, "  "));
    }

    [Fact]
    public void Move_InvalidDestinationPath_ThrowsIOException()
    {
        var source = CreateTempFile("src.txt");
        var invalidDest = "Z:\\nonexistent_drive_xyz\\file.txt";

        Assert.Throws<IOException>(() => _mover.Move(source, invalidDest));
        Assert.True(File.Exists(source), "Source should remain after failed move");
    }

    [Fact]
    public void Move_FileWithSpecialCharactersInName()
    {
        var source = CreateTempFile("file with spaces & (parens).txt", "special");
        var dest = Path.Combine(_tempDir, "moved with spaces & (parens).txt");

        _mover.Move(source, dest);

        Assert.True(File.Exists(dest));
        Assert.Equal("special", File.ReadAllText(dest));
    }

    [Fact]
    public void Move_EmptyFile()
    {
        var source = CreateTempFile("empty.txt", "");
        var dest = Path.Combine(_tempDir, "empty_moved.txt");

        _mover.Move(source, dest);

        Assert.True(File.Exists(dest));
        Assert.Equal("", File.ReadAllText(dest));
    }

    #endregion

    #region GetNextAvailableName

    [Fact]
    public void GetNextAvailableName_NoConflict_ReturnsNumberTwo()
    {
        var name = WindowsShellMover.GetNextAvailableName(_tempDir, "photo.jpg");

        Assert.Equal("photo (2).jpg", name);
    }

    [Fact]
    public void GetNextAvailableName_OneConflict_ReturnsNumberThree()
    {
        CreateTempFile("photo (2).jpg");

        var name = WindowsShellMover.GetNextAvailableName(_tempDir, "photo.jpg");

        Assert.Equal("photo (3).jpg", name);
    }

    [Fact]
    public void GetNextAvailableName_MultipleConflicts_SkipsAllTaken()
    {
        CreateTempFile("photo (2).jpg");
        CreateTempFile("photo (3).jpg");
        CreateTempFile("photo (4).jpg");

        var name = WindowsShellMover.GetNextAvailableName(_tempDir, "photo.jpg");

        Assert.Equal("photo (5).jpg", name);
    }

    [Fact]
    public void GetNextAvailableName_FileWithoutExtension()
    {
        var name = WindowsShellMover.GetNextAvailableName(_tempDir, "README");

        Assert.Equal("README (2)", name);
    }

    [Fact]
    public void GetNextAvailableName_FileWithMultipleDots()
    {
        var name = WindowsShellMover.GetNextAvailableName(_tempDir, "archive.tar.gz");

        Assert.Equal("archive.tar (2).gz", name);
    }

    [Fact]
    public void GetNextAvailableName_EmptyDirectory_ThrowsArgumentException()
    {
        Assert.Throws<ArgumentException>(() => WindowsShellMover.GetNextAvailableName("", "file.txt"));
    }

    [Fact]
    public void GetNextAvailableName_EmptyFileName_ThrowsArgumentException()
    {
        Assert.Throws<ArgumentException>(() => WindowsShellMover.GetNextAvailableName(_tempDir, ""));
    }

    #endregion
}
