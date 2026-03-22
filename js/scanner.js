/**
 * Directory scanner — uses the C# backend to scan directories.
 * The backend does the recursive scan; we just call the API and report progress.
 */

import { scanDirectory as apiScan } from './apiClient.js';
import { createFileInfoFromDto } from './fileInfo.js';
import { showWarning } from './toast.js';

/**
 * Scan a directory via the backend API.
 * @param {string} dirPath - absolute path to scan
 * @param {function} onProgress - Called with { processed, total, currentFile }
 * @returns {Promise<import('./fileInfo.js').FileInfo[]>}
 */
export async function scanDirectory(dirPath, onProgress) {
  onProgress({ processed: 0, total: 0, currentFile: 'Scanning…' });

  const result = await apiScan(dirPath);

  const files = result.files.map(dto => createFileInfoFromDto(dto));

  onProgress({ processed: files.length, total: files.length, currentFile: 'Done' });

  if (result.skipped && result.skipped.length > 0) {
    const preview = result.skipped.slice(0, 5).join(', ');
    const extra = result.skipped.length > 5 ? ` and ${result.skipped.length - 5} more` : '';
    showWarning(`Skipped ${result.skipped.length} inaccessible item(s): ${preview}${extra}`);
  }

  return files;
}
