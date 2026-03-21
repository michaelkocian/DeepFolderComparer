/**
 * Comparison engine.
 * Compares source files against destination files using selected methods.
 * Returns files that exist in source but are missing from destination.
 */

let worker = null;
let workerRequestId = 0;
const pendingWorkerRequests = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./workers/compareWorker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => {
      const { id, result, error } = event.data;
      const pending = pendingWorkerRequests.get(id);
      if (pending) {
        pendingWorkerRequests.delete(id);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
      }
    });
  }
  return worker;
}

function workerRequest(type, data) {
  return new Promise((resolve, reject) => {
    const id = ++workerRequestId;
    pendingWorkerRequests.set(id, { resolve, reject });
    getWorker().postMessage({ type, id, data });
  });
}

/**
 * Compare two files using the selected comparison methods.
 * Returns true if the files are considered "the same" (i.e., file IS present in dest).
 * Short-circuits on first method that says they differ.
 */
async function areFilesEqual(sourceFile, destFile, methods) {
  // Name compare
  if (methods.nameCompare) {
    if (sourceFile.name !== destFile.name) return false;
  }

  // Extension / MIME compare
  if (methods.extensionCompare) {
    if (sourceFile.extension !== destFile.extension) return false;
    if (sourceFile.type !== destFile.type) return false;
  }

  // Size compare
  if (methods.sizeCompare) {
    if (sourceFile.size !== destFile.size) return false;
  }

  // Date compare
  if (methods.dateCompare) {
    if (sourceFile.lastModified !== destFile.lastModified) return false;
  }

  // Path compare
  if (methods.pathCompare) {
    if (sourceFile.relativePath !== destFile.relativePath) return false;
  }

  // Chunk probe (needs file content)
  if (methods.chunkProbe) {
    try {
      const [srcFileObj, destFileObj] = await Promise.all([
        sourceFile.fileHandle.getFile(),
        destFile.fileHandle.getFile(),
      ]);
      const [srcBuf, destBuf] = await Promise.all([
        srcFileObj.arrayBuffer(),
        destFileObj.arrayBuffer(),
      ]);
      const match = await workerRequest('chunkProbe', {
        buffer1: srcBuf,
        buffer2: destBuf,
        size1: srcFileObj.size,
        size2: destFileObj.size,
      });
      if (!match) return false;
    } catch {
      return false;
    }
  }

  // SHA-256 hash compare
  if (methods.hashCompare) {
    try {
      const [srcFileObj, destFileObj] = await Promise.all([
        sourceFile.fileHandle.getFile(),
        destFile.fileHandle.getFile(),
      ]);
      const [srcBuf, destBuf] = await Promise.all([
        srcFileObj.arrayBuffer(),
        destFileObj.arrayBuffer(),
      ]);
      const [hash1, hash2] = await Promise.all([
        workerRequest('hash', { buffer: srcBuf }),
        workerRequest('hash', { buffer: destBuf }),
      ]);
      if (hash1 !== hash2) return false;
    } catch {
      return false;
    }
  }

  // Full byte compare
  if (methods.fullByteCompare) {
    try {
      const [srcFileObj, destFileObj] = await Promise.all([
        sourceFile.fileHandle.getFile(),
        destFile.fileHandle.getFile(),
      ]);
      const [srcBuf, destBuf] = await Promise.all([
        srcFileObj.arrayBuffer(),
        destFileObj.arrayBuffer(),
      ]);
      const match = await workerRequest('fullCompare', {
        buffer1: srcBuf,
        buffer2: destBuf,
      });
      if (!match) return false;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Build a lookup map for quick candidate finding.
 * Groups dest files by name for fast access.
 */
function buildDestLookup(destFiles) {
  const byName = new Map();
  const byPath = new Map();

  for (const file of destFiles) {
    // By name
    if (!byName.has(file.name)) {
      byName.set(file.name, []);
    }
    byName.get(file.name).push(file);

    // By relative path
    byPath.set(file.relativePath, file);
  }

  return { byName, byPath };
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

  for (let i = 0; i < sourceFiles.length; i++) {
    const sourceFile = sourceFiles[i];

    if (i % 10 === 0 || i === total - 1) {
      onProgress({
        processed: i + 1,
        total,
        currentFile: sourceFile.relativePath,
      });
    }

    let found = false;

    if (mode === 'folderByFolder') {
      // Look for exact path match first, then fall back to name match in same folder
      const exactMatch = lookup.byPath.get(sourceFile.relativePath);
      if (exactMatch) {
        found = await areFilesEqual(sourceFile, exactMatch, methods);
      } else {
        // Check same folder by name
        const candidates = lookup.byName.get(sourceFile.name) || [];
        for (const candidate of candidates) {
          if (candidate.parentPath === sourceFile.parentPath) {
            if (await areFilesEqual(sourceFile, candidate, methods)) {
              found = true;
              break;
            }
          }
        }
      }
    } else {
      // Deep scan: search all dest files for a match
      const candidates = lookup.byName.get(sourceFile.name) || [];

      if (candidates.length > 0) {
        for (const candidate of candidates) {
          if (await areFilesEqual(sourceFile, candidate, methods)) {
            found = true;
            break;
          }
        }
      }

      // If name compare is off, we need to check all files
      if (!found && !methods.nameCompare) {
        for (const destFile of destFiles) {
          if (await areFilesEqual(sourceFile, destFile, methods)) {
            found = true;
            break;
          }
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

/**
 * Cleanup the worker when done.
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    pendingWorkerRequests.clear();
  }
}
