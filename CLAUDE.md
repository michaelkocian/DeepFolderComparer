# CLAUDE.md

## PROJECT INFO
This is a tool that can compare two folders.
The first folder represents unsorted storage, such as a phone or a random folder on a PC.
The second folder is the real backup that must be reliable.
This tool helps to show what is not backed up yet and should be.
Also helps to do quick and easy back-ups to the appropriate folder as the user wishes.
We always want to double-check if every file in the first folder is reliably backed up or should be left for eradication.
The more overview that nothing has been missed the better

## ARCHITECTURE
- **Frontend**: HTML/CSS/JS ES modules served by the backend
- **Backend**: C# ASP.NET minimal API in `Backend/` folder (.NET 10, Windows)
- Run with: `cd Backend && dotnet run` → serves app at http://localhost:5000

## BACKEND API
- `POST /api/browse` — opens native folder dialog, returns path
- `POST /api/scan` — recursively scans a directory, returns file metadata
- `POST /api/move` — moves a single file via OS-level move (no cross-volume fallback)
- `POST /api/move-batch` — moves multiple files
- `POST /api/create-folder` — creates a directory
- `POST /api/compare-pair` — compares two files by content (chunkProbe, hash, fullByteCompare)
- `GET /api/file?path=` — serves file content for previews and thumbnails
- `GET /api/file-exists?path=` — checks if a file exists at a path

## KEY DESIGN DECISIONS
- File moving uses OS-level `File.Move` only — no cross-volume copy fallback; errors are returned to the user
- Content comparisons (chunk probe, hash, byte compare) run server-side for direct file access
- Frontend uses `fullPath` strings instead of browser File System Access API handles
