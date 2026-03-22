using DeepFolderComp.Backend.Models;
using DeepFolderComp.Backend.Services;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.SetMinimumLevel(LogLevel.Warning);

builder.Services.AddSingleton<FileSystemService>();
builder.Services.AddSingleton<FileMoverService>();

var app = builder.Build();

// ─── Static file serving (physical in dev, embedded in published exe) ───
var frontendPath = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, ".."));
var hasPhysicalFrontend = File.Exists(Path.Combine(frontendPath, "index.html"));

IFileProvider fileProvider = hasPhysicalFrontend
    ? new PhysicalFileProvider(frontendPath)
    : new ManifestEmbeddedFileProvider(typeof(Program).Assembly, "wwwroot");

app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = fileProvider });
app.UseStaticFiles(new StaticFileOptions { FileProvider = fileProvider });

// ─── API: Browse for folder ───
app.MapPost("/api/browse", (FileSystemService fs) =>
{
    var path = fs.BrowseFolder();
    return Results.Ok(new BrowseResponse
    {
        Path = path,
        Cancelled = path == null
    });
});

// ─── API: Scan directory ───
app.MapPost("/api/scan", (ScanRequest request, FileSystemService fs) =>
{
    if (!Directory.Exists(request.Path))
        return Results.BadRequest(new { error = "Directory not found" });

    var result = fs.ScanDirectory(request.Path);
    return Results.Ok(result);
});

// ─── API: Move single file ───
app.MapPost("/api/move", (MoveFileRequest request, FileMoverService mover) =>
{
    var result = mover.MoveFile(request.SourcePath, request.DestDir, request.FileName, request.ConflictAction);
    return Results.Ok(result);
});

// ─── API: Move multiple files ───
app.MapPost("/api/move-batch", (BatchMoveRequest request, FileMoverService mover) =>
{
    var result = mover.MoveFiles(request.Files);
    return Results.Ok(result);
});

// ─── API: Create folder ───
app.MapPost("/api/create-folder", (CreateFolderRequest request, FileSystemService fs) =>
{
    try
    {
        fs.CreateFolder(request.Path);
        return Results.Ok(new { success = true });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// ─── API: Compare two files ───
app.MapPost("/api/compare-pair", (ComparePairRequest request, FileSystemService fs) =>
{
    var match = fs.CompareFiles(request.SourcePath, request.DestPath, request.Method);
    return Results.Ok(new ComparePairResponse { Match = match });
});

// ─── API: Serve a file by absolute path (for previews and thumbnails) ───
app.MapGet("/api/file", (string path) =>
{
    if (!File.Exists(path))
        return Results.NotFound(new { error = "File not found" });

    var contentType = FileSystemService.GetMimeType(path);
    return Results.File(path, contentType, enableRangeProcessing: true);
});

// ─── API: Check if file exists at destination ───
app.MapGet("/api/file-exists", (string path) =>
{
    return Results.Ok(new { exists = File.Exists(path) });
});

// ─── Launch browser in app mode, exit when it closes ───
var launcher = new BrowserLauncher();
var appUrl = "http://localhost:5000";

app.Lifetime.ApplicationStarted.Register(() =>
{
    if (launcher.Launch(appUrl))
    {
        Console.WriteLine($"App opened at {appUrl}");
        Task.Run(() =>
        {
            launcher.WaitForExit();
            Console.WriteLine("Browser closed — shutting down.");
            app.StopAsync();
        });
    }
    else
    {
        Console.WriteLine("No compatible browser found (Edge/Chrome/Brave required for app mode).");
    }
});

app.Run(appUrl);
