/**
 * Web Worker for heavy comparison operations.
 * Receives file ArrayBuffers and performs:
 * - SHA-256 hashing
 * - Chunk probe (first, middle, last 4KB)
 * - Full byte-by-byte comparison
 */

self.addEventListener('message', async (event) => {
  const { type, id, data } = event.data;

  try {
    let result;

    switch (type) {
      case 'hash':
        result = await computeHash(data.buffer);
        break;

      case 'chunkProbe':
        result = compareChunks(data.buffer1, data.buffer2, data.size1, data.size2);
        break;

      case 'fullCompare':
        result = fullByteCompare(data.buffer1, data.buffer2);
        break;

      default:
        throw new Error(`Unknown comparison type: ${type}`);
    }

    self.postMessage({ id, result, error: null });
  } catch (error) {
    self.postMessage({ id, result: null, error: error.message });
  }
});

async function computeHash(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function compareChunks(buffer1, buffer2, size1, size2) {
  if (size1 !== size2) return false;

  const PROBE_SIZE = 4096;
  const view1 = new Uint8Array(buffer1);
  const view2 = new Uint8Array(buffer2);

  // Compare first chunk
  const firstEnd = Math.min(PROBE_SIZE, view1.length);
  for (let i = 0; i < firstEnd; i++) {
    if (view1[i] !== view2[i]) return false;
  }

  // Compare middle chunk
  if (view1.length > PROBE_SIZE * 2) {
    const midStart = Math.floor(view1.length / 2) - Math.floor(PROBE_SIZE / 2);
    const midEnd = Math.min(midStart + PROBE_SIZE, view1.length);
    for (let i = midStart; i < midEnd; i++) {
      if (view1[i] !== view2[i]) return false;
    }
  }

  // Compare last chunk
  const lastStart = Math.max(0, view1.length - PROBE_SIZE);
  for (let i = lastStart; i < view1.length; i++) {
    if (view1[i] !== view2[i]) return false;
  }

  return true;
}

function fullByteCompare(buffer1, buffer2) {
  if (buffer1.byteLength !== buffer2.byteLength) return false;

  const view1 = new Uint8Array(buffer1);
  const view2 = new Uint8Array(buffer2);

  for (let i = 0; i < view1.length; i++) {
    if (view1[i] !== view2[i]) return false;
  }

  return true;
}
