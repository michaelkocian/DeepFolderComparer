/**
 * Comparison engine.
 * Metadata comparisons run locally. Content comparisons delegate to the C# backend.
 * Returns files that exist in source but are missing from destination.
 */

import { comparePair } from './apiClient.js';

let cancelRequested = false;

/** Signal the comparison loop to stop. */
export function cancelComparison() {
  cancelRequested = true;
}

/** No-op — workers are no longer used; backend handles content comparison. */
export function terminateWorker() {}

/**
 * Compare two files using the selected comparison methods.
 * Returns true if the files are considered "the same" (i.e., file IS present in dest).
 * Short-circuits on first method that says they differ.
 */
async function areFilesEqual(sourceFile, destFile, methods) {
  // Size compare — first priority (fastest metadata filter)
  if (methods.sizeCompare) {
    if (sourceFile.size !== destFile.size) return false;
  }

  // Name compare
  if (methods.nameCompare) {
    if (sourceFile.name !== destFile.name) return false;
  }

  // Extension / MIME compare
  if (methods.extensionCompare) {
    if (sourceFile.extension !== destFile.extension) return false;
    if (sourceFile.type !== destFile.type) return false;
  }

  // Date compare
  if (methods.dateCompare) {
    if (sourceFile.lastModified !== destFile.lastModified) return false;
  }

  // Path compare
  if (methods.pathCompare) {
    if (sourceFile.relativePath !== destFile.relativePath) return false;
  }

  // Content-based comparisons — delegated to C# backend
  if (methods.chunkProbe) {
    try {
      const result = await comparePair(sourceFile.fullPath, destFile.fullPath, 'chunkProbe');
      if (!result.match) return false;
    } catch {
      return false;
    }
  }

  if (methods.hashCompare) {
    try {
      const result = await comparePair(sourceFile.fullPath, destFile.fullPath, 'hash');
      if (!result.match) return false;
    } catch {
      return false;
    }
  }

  if (methods.fullByteCompare) {
    try {
      const result = await comparePair(sourceFile.fullPath, destFile.fullPath, 'fullByteCompare');
      if (!result.match) return false;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Build a lookup map for quick candidate finding.
 */
function buildDestLookup(destFiles) {
  const byName = new Map();
  const byPath = new Map();
  const bySize = new Map();

  for (const file of destFiles) {
    if (!byName.has(file.name)) {
      byName.set(file.name, []);
    }
    byName.get(file.name).push(file);

    byPath.set(file.relativePath, file);

    if (!bySize.has(file.size)) {
      bySize.set(file.size, []);
    }
    bySize.get(file.size).push(file);
  }

  return { byName, byPath, bySize };
}

/**
 * Run comparison: find files in source that are missing from destination.
 * @param {import('./fileInfo.js').FileInfo[]} sourceFiles
 * @param {import('./fileInfo.js').FileInfo[]} destFiles
 * @param {object} config - { methods, mode }
 * @param {function} onProgress - { processed, total, currentFile }
 * @returns {Promise<import('./fileInfo.js').FileInfo[]>} missing files
 */
export async function compareFiles(sourceFiles, destFiles, config, onProgress) {
  const { methods, mode } = config;
  const missing = [];
  const total = sourceFiles.length;
  const lookup = buildDestLookup(destFiles);
  cancelRequested = false;

  const needsContent = methods.chunkProbe || methods.hashCompare || methods.fullByteCompare;

  for (let i = 0; i < sourceFiles.length; i++) {
    if (cancelRequested) {
      cancelRequested = false;
      throw new Error('Comparison cancelled');
    }

    const sourceFile = sourceFiles[i];

    onProgress({
      processed: i + 1,
      total,
      currentFile: sourceFile.relativePath,
      comparingAgainst: null,
    });

    // Yield to event loop periodically to keep UI responsive
    if (i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    function reportCandidate(candidate) {
      if (needsContent) {
        onProgress({
          processed: i + 1,
          total,
          currentFile: sourceFile.relativePath,
          comparingAgainst: candidate.relativePath,
        });
      }
    }

    let found = false;

    if (mode === 'folderByFolder') {
      const exactMatch = lookup.byPath.get(sourceFile.relativePath);
      if (exactMatch) {
        reportCandidate(exactMatch);
        found = await areFilesEqual(sourceFile, exactMatch, methods);
      }
      if (!found) {
        const pool = methods.nameCompare
          ? lookup.byName.get(sourceFile.name) || []
          : lookup.bySize.get(sourceFile.size) || [];
        for (const candidate of pool) {
          if (candidate.parentPath === sourceFile.parentPath) {
            reportCandidate(candidate);
            if (await areFilesEqual(sourceFile, candidate, methods)) {
              found = true;
              break;
            }
          }
        }
      }
    } else {
      const candidates = methods.nameCompare
        ? lookup.byName.get(sourceFile.name) || []
        : lookup.bySize.get(sourceFile.size) || [];

      for (const candidate of candidates) {
        reportCandidate(candidate);
        if (await areFilesEqual(sourceFile, candidate, methods)) {
          found = true;
          break;
        }
      }
    }

    if (!found) {
      missing.push(sourceFile);
    }
  }

  onProgress({ processed: total, total, currentFile: 'Done' });

  return missing;
}
