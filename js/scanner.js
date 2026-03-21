/**
 * Deep recursive scanner for directory handles.
 * Two-pass: count total entries, then collect file metadata with progress.
 */

import { createFileInfo } from './fileInfo.js';

/**
 * Count total files in a directory tree (fast first pass).
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<number>}
 */
async function countFiles(dirHandle) {
  let count = 0;
  for await (const [, entryHandle] of dirHandle) {
    if (entryHandle.kind === 'file') {
      count++;
    } else {
      count += await countFiles(entryHandle);
    }
  }
  return count;
}

/**
 * Recursively collect all FileInfo objects from a directory.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} relativePath
 * @param {function} onProgress - Called with { processed, total, currentFile }
 * @param {object} counter - Shared mutable counter { processed, total }
 * @returns {Promise<import('./fileInfo.js').FileInfo[]>}
 */
async function collectFiles(dirHandle, relativePath, onProgress, counter) {
  const files = [];

  for await (const [name, entryHandle] of dirHandle) {
    const entryPath = relativePath ? `${relativePath}/${name}` : name;

    if (entryHandle.kind === 'directory') {
      const subFiles = await collectFiles(entryHandle, entryPath, onProgress, counter);
      files.push(...subFiles);
    } else {
      try {
        const file = await entryHandle.getFile();
        const fileInfo = createFileInfo(file, entryPath, entryHandle, dirHandle);
        files.push(fileInfo);
      } catch {
        // Skip files we can't access (permission errors)
      }
      counter.processed++;
      if (counter.processed % 20 === 0 || counter.processed === counter.total) {
        onProgress({
          processed: counter.processed,
          total: counter.total,
          currentFile: entryPath,
        });
      }
    }
  }

  return files;
}

/**
 * Scan a directory handle: count files, then collect all metadata.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {function} onProgress
 * @returns {Promise<import('./fileInfo.js').FileInfo[]>}
 */
export async function scanDirectory(dirHandle, onProgress) {
  // Pass 1: count
  onProgress({ processed: 0, total: 0, currentFile: 'Counting files…' });
  const total = await countFiles(dirHandle);

  // Pass 2: collect
  const counter = { processed: 0, total };
  onProgress({ processed: 0, total, currentFile: 'Starting scan…' });
  const files = await collectFiles(dirHandle, '', onProgress, counter);

  onProgress({ processed: total, total, currentFile: 'Done' });
  return files;
}
