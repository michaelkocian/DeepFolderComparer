/**
 * File mover — handles the actual disk move operation.
 * Strategy 1 (preferred): fileHandle.move() — preserves metadata
 * Strategy 2 (fallback): read → write → delete (loses creation date)
 */

import { showSuccess, showError, showWarning } from './toast.js';
import { createFileInfo } from './fileInfo.js';

/**
 * Move a file from source to destination directory.
 * @param {import('./fileInfo.js').FileInfo} fileInfo - source file
 * @param {FileSystemDirectoryHandle} destDirHandle - destination directory handle
 * @param {string} destPath - destination folder relative path (for display)
 * @returns {Promise<{ success: boolean, newFileInfo?: import('./fileInfo.js').FileInfo }>}
 */
export async function moveFile(fileInfo, destDirHandle, destPath, { silent = false } = {}) {
  const fileName = fileInfo.name;

  try {
    // Check if file already exists in destination
    try {
      await destDirHandle.getFileHandle(fileName);
      // File exists — ask user
      const overwrite = confirm(`"${fileName}" already exists in the destination. Overwrite?`);
      if (!overwrite) {
        return { success: false };
      }
    } catch {
      // File doesn't exist — good
    }

    // Strategy 1: Try native move (preserves metadata)
    let moved = false;
    if (typeof fileInfo.fileHandle.move === 'function') {
      try {
        await fileInfo.fileHandle.move(destDirHandle, fileName);
        moved = true;
      } catch {
        // Native move not supported or failed — fall through to strategy 2
      }
    }

    // Strategy 2: Copy + delete (fallback)
    if (!moved) {
      const sourceFile = await fileInfo.fileHandle.getFile();
      const sourceBuffer = await sourceFile.arrayBuffer();

      // Write to destination
      const newHandle = await destDirHandle.getFileHandle(fileName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(sourceBuffer);
      await writable.close();

      // Delete source
      await fileInfo.directoryHandle.removeEntry(fileName);
    }

    // Build new FileInfo for the moved file
    const newHandle = await destDirHandle.getFileHandle(fileName);
    const newFile = await newHandle.getFile();
    const newRelativePath = destPath ? `${destPath}/${fileName}` : fileName;
    const newFileInfo = createFileInfo(newFile, newRelativePath, newHandle, destDirHandle);

    if (!silent) showSuccess(`Moved "${fileName}" to ${destPath || '(root)'}`);
    return { success: true, newFileInfo };
  } catch (err) {
    if (!silent) showError(`Failed to move "${fileName}": ${err.message}`);
    return { success: false };
  }
}

/**
 * Move multiple files.
 * @param {import('./fileInfo.js').FileInfo[]} fileInfos
 * @param {FileSystemDirectoryHandle} destDirHandle
 * @param {string} destPath
 * @returns {Promise<{ moved: import('./fileInfo.js').FileInfo[], failed: string[] }>}
 */
export async function moveFiles(fileInfos, destDirHandle, destPath) {
  const moved = [];
  const failed = [];

  const isBatch = fileInfos.length > 1;
  for (const fileInfo of fileInfos) {
    const result = await moveFile(fileInfo, destDirHandle, destPath, { silent: isBatch });
    if (result.success && result.newFileInfo) {
      moved.push(result.newFileInfo);
    } else {
      failed.push(fileInfo.name);
    }
  }

  if (isBatch) {
    if (moved.length > 0 && failed.length === 0) {
      showSuccess(`Moved ${moved.length} files to ${destPath || '(root)'}`);
    } else if (failed.length > 0 && moved.length > 0) {
      showWarning(`Moved ${moved.length} files, ${failed.length} failed`);
    } else if (failed.length > 0) {
      showError(`Failed to move ${failed.length} file(s)`);
    }
  }

  return { moved, failed };
}
