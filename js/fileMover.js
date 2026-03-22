/**
 * File mover — delegates to C# backend for reliable moves with metadata preservation.
 */

import { showSuccess, showError, showWarning } from './toast.js';
import { moveFile as apiMoveFile } from './apiClient.js';
import { createFileInfoFromDto } from './fileInfo.js';
import { showConflictDialog } from './conflictDialog.js';

/**
 * Move a file from source to destination directory via the backend.
 * @param {import('./fileInfo.js').FileInfo} fileInfo - source file
 * @param {string} destDir - absolute path to destination directory
 * @param {string} destRelativePath - destination folder relative path (for display)
 * @returns {Promise<{ success: boolean, newFileInfo?: import('./fileInfo.js').FileInfo }>}
 */
export async function moveFile(fileInfo, destDir, destRelativePath, { silent = false } = {}) {
  const fileName = fileInfo.name;

  try {
    // First attempt without conflict action — backend will report conflict if file exists
    let result = await apiMoveFile(fileInfo.fullPath, destDir, fileName);

    if (!result.success && result.conflict) {
      if (silent) {
        // In batch mode, auto-rename to avoid blocking on each file
        result = await apiMoveFile(fileInfo.fullPath, destDir, fileName, 'rename');
      } else {
        const choice = await showConflictDialog(fileName);
        if (choice === 'cancel') return { success: false };
        result = await apiMoveFile(fileInfo.fullPath, destDir, fileName, choice);
      }
    }

    if (!result.success) {
      if (!silent) showError(`Failed to move "${fileName}": ${result.error}`);
      return { success: false };
    }

    const newFileInfo = createFileInfoFromDto(result.newFileInfo);
    const actualName = newFileInfo.name;
    newFileInfo.relativePath = destRelativePath ? `${destRelativePath}/${actualName}` : actualName;
    newFileInfo.parentPath = destRelativePath;
    newFileInfo.depth = newFileInfo.relativePath.split('/').length - 1;

    if (!silent) showSuccess(`Moved "${fileName}" to ${destRelativePath || '(root)'}`);
    return { success: true, newFileInfo };
  } catch (err) {
    if (!silent) showError(`Failed to move "${fileName}": ${err.message}`);
    return { success: false };
  }
}

/**
 * Move multiple files.
 * @param {import('./fileInfo.js').FileInfo[]} fileInfos
 * @param {string} destDir - absolute path to destination directory
 * @param {string} destRelativePath - destination relative path for display
 * @returns {Promise<{ moved: import('./fileInfo.js').FileInfo[], failed: string[] }>}
 */
export async function moveFiles(fileInfos, destDir, destRelativePath) {
  const moved = [];
  const failed = [];

  const isBatch = fileInfos.length > 1;
  for (const fileInfo of fileInfos) {
    const result = await moveFile(fileInfo, destDir, destRelativePath, { silent: isBatch });
    if (result.success && result.newFileInfo) {
      moved.push(result.newFileInfo);
    } else {
      failed.push(fileInfo.name);
    }
  }

  if (isBatch) {
    if (moved.length > 0 && failed.length === 0) {
      showSuccess(`Moved ${moved.length} files to ${destRelativePath || '(root)'}`);
    } else if (failed.length > 0 && moved.length > 0) {
      showWarning(`Moved ${moved.length} files, ${failed.length} failed`);
    } else if (failed.length > 0) {
      showError(`Failed to move ${failed.length} file(s)`);
    }
  }

  return { moved, failed };
}
