/**
 * API client — communicates with the C# backend.
 * All backend calls go through this module.
 */

const API_BASE = '';

async function post(endpoint, body = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `API error ${response.status}`);
  }
  return response.json();
}

async function get(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `API error ${response.status}`);
  }
  return response.json();
}

/** Open native folder browser dialog. Returns path string or null if cancelled. */
export async function browseFolder() {
  const result = await post('/api/browse');
  return result.cancelled ? null : result.path;
}

/** Scan a directory recursively. Returns { files: FileInfoDto[], skipped: string[] }. */
export async function scanDirectory(path) {
  return post('/api/scan', { path });
}

/** Move a single file. Returns { success, newFileInfo?, error?, conflict? }. */
export async function moveFile(sourcePath, destDir, fileName, conflictAction = null) {
  return post('/api/move', { sourcePath, destDir, fileName, conflictAction });
}

/** Move multiple files. Returns { moved: FileInfoDto[], failed: string[] }. */
export async function moveFiles(files) {
  return post('/api/move-batch', { files });
}

/** Create a folder at the given path. */
export async function createFolder(path) {
  return post('/api/create-folder', { path });
}

/** Compare two files by content method. Returns { match: boolean }. */
export async function comparePair(sourcePath, destPath, method) {
  return post('/api/compare-pair', { sourcePath, destPath, method });
}

/** Check if a file exists at a given path. */
export async function fileExists(path) {
  const result = await get('/api/file-exists', { path });
  return result.exists;
}

/** Build a URL for serving a file from the backend (for previews, thumbnails). */
export function fileUrl(fullPath) {
  return `/api/file?path=${encodeURIComponent(fullPath)}`;
}
