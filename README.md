# DeepFolderComp

A desktop folder comparison and delta-sync tool for Windows. Compare an unsorted source (phone dump, random folder) against a reliable backup destination — see what's missing, preview files, and move them where they belong with drag-and-drop.

![Setup Stage](screenshots/setup.png)

## Why

Backing up files from phones and scattered folders is error-prone. You never know if everything made it to your organized backup. DeepFolderComp gives you a clear visual overview of what's missing and lets you sort files into the right place without leaving the app.

## Features

- **Smart Comparison** — multiple comparison strategies from fast metadata checks to full byte-level verification
  - Size, name, date, extension, path matching
  - Chunk probe (samples first/middle/last 4 KB), SHA-256 hash, full byte compare
  - Deep scan across all subfolders or folder-by-folder matching
- **Split-Panel Results** — missing files on the left, destination on the right with resizable panels
- **Drag-and-Drop Filing** — drag files from source to any destination folder in the tree
- **File Previews** — images, video, audio, PDF, and text with zoom/pan support
- **Thumbnail Grid** — adjustable zoom level, lazy-loaded thumbnails via Intersection Observer
- **Folder Tree Navigation** — collapsible sidebar with file counts and breadcrumb path
- **Conflict Resolution** — overwrite, auto-rename, or cancel when a file already exists
- **Windows Shell Moves** — uses `SHFileOperation` to preserve metadata, timestamps, and security attributes
- **App Mode** — launches in a frameless browser window (Edge/Chrome/Brave), exits when closed

![Results Stage](screenshots/results.png)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | C# / ASP.NET Minimal API / .NET 10 |
| Frontend | Vanilla JS (ES Modules), HTML, CSS |
| File Ops | Windows Shell API (`SHFileOperation`) |
| Tests | xUnit + coverlet |
| Build | Zero tooling — no npm, no bundler |

## Getting Started

### Prerequisites

- Windows 10/11
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- A Chromium-based browser (Edge, Chrome, or Brave)

### Run

```bash
cd Backend
dotnet run
```

The app opens automatically at `http://localhost:5000` in app mode. Close the browser window to stop the server.

### Build a Release

```bash
dotnet publish Backend/DeepFolderComp.Backend.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o publish
```

The frontend (HTML/CSS/JS) is embedded in the exe — no extra files needed. Just run the single exe.

## API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/browse` | Open native folder picker |
| `POST` | `/api/scan` | Recursively scan a directory |
| `POST` | `/api/move` | Move a single file |
| `POST` | `/api/move-batch` | Move multiple files |
| `POST` | `/api/create-folder` | Create a directory |
| `POST` | `/api/compare-pair` | Compare two files by content |
| `GET` | `/api/file?path=` | Serve file content (previews/thumbnails) |
| `GET` | `/api/file-exists?path=` | Check if a file exists |

## Project Structure

```
DeepFolderComp/
├── index.html                 # App entry point
├── css/                       # 11 stylesheets (dark theme)
├── js/                        # 18 ES modules (zero dependencies)
├── Backend/
│   ├── Program.cs             # Minimal API routes + static file serving
│   ├── Models/Dtos.cs         # Request/response DTOs
│   └── Services/
│       ├── FileSystemService.cs      # Scan, compare, browse
│       ├── FileMoverService.cs       # Move with conflict handling
│       ├── WindowsShellMover.cs      # Shell API file operations
│       └── BrowserLauncher.cs        # App-mode browser launch
├── Tests/                     # xUnit tests
└── DeepFolderComp.slnx        # Solution file
```

## Screenshots

| Setup | Results |
|-------|---------|
| ![Setup](screenshots/setup.png) | ![Results](screenshots/results.png) |

| File Preview | Drag & Drop |
|-------------|-------------|
| ![Preview](screenshots/preview.png) | ![DragDrop](screenshots/dragdrop.png) |

## License

MIT
