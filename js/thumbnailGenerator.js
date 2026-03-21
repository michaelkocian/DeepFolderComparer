/**
 * Thumbnail / icon generator for file tiles.
 * - Images: real thumbnail via createImageBitmap + canvas
 * - Videos: first-frame capture
 * - Others: SVG file-type icon
 * Uses IntersectionObserver for lazy loading.
 */

import { getFileCategory } from './fileInfo.js';
import { icons } from './icons.js';

const thumbnailCache = new Map();
const MAX_CACHE = 500;

const categoryIconMap = {
  image: icons.image,
  video: icons.video,
  audio: icons.audio,
  pdf: icons.pdf,
  archive: icons.archive,
  code: icons.code,
  document: icons.document,
  file: icons.file,
};

/**
 * Get the placeholder icon HTML for a file category.
 */
export function getFileIcon(fileInfo) {
  const category = getFileCategory(fileInfo);
  return categoryIconMap[category] || categoryIconMap.file;
}

/**
 * Generate a real thumbnail for an image file.
 * Returns a data URL or null if not possible.
 */
async function generateImageThumbnail(fileInfo, maxSize = 200) {
  try {
    const file = await fileInfo.fileHandle.getFile();
    const bitmap = await createImageBitmap(file, {
      resizeWidth: maxSize,
      resizeHeight: maxSize,
      resizeQuality: 'low',
    });

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Generate a thumbnail from a video file's first frame.
 * Returns a data URL or null.
 */
function generateVideoThumbnail(fileInfo) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000);

    (async () => {
      try {
        const file = await fileInfo.fileHandle.getFile();
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';

        video.addEventListener('loadeddata', () => {
          video.currentTime = 0.1;
        });

        video.addEventListener('seeked', () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(video.videoWidth, 200);
            canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(url);
            clearTimeout(timeout);
            resolve(dataUrl);
          } catch {
            URL.revokeObjectURL(url);
            clearTimeout(timeout);
            resolve(null);
          }
        });

        video.addEventListener('error', () => {
          URL.revokeObjectURL(url);
          clearTimeout(timeout);
          resolve(null);
        });

        video.src = url;
      } catch {
        clearTimeout(timeout);
        resolve(null);
      }
    })();
  });
}

/**
 * Load thumbnail for a file tile element.
 * Called by IntersectionObserver when tile becomes visible.
 */
export async function loadThumbnail(tileElement, fileInfo) {
  const category = getFileCategory(fileInfo);
  const cacheKey = fileInfo.relativePath;

  // Check cache
  if (thumbnailCache.has(cacheKey)) {
    applyThumbnail(tileElement, thumbnailCache.get(cacheKey));
    return;
  }

  let thumbnailUrl = null;

  if (category === 'image') {
    thumbnailUrl = await generateImageThumbnail(fileInfo);
  } else if (category === 'video') {
    thumbnailUrl = await generateVideoThumbnail(fileInfo);
  }

  if (thumbnailUrl) {
    // Manage cache size
    if (thumbnailCache.size >= MAX_CACHE) {
      const firstKey = thumbnailCache.keys().next().value;
      const oldUrl = thumbnailCache.get(firstKey);
      if (oldUrl && oldUrl.startsWith('blob:')) {
        URL.revokeObjectURL(oldUrl);
      }
      thumbnailCache.delete(firstKey);
    }
    thumbnailCache.set(cacheKey, thumbnailUrl);
    applyThumbnail(tileElement, thumbnailUrl);
  }
}

function applyThumbnail(tileElement, url) {
  const thumbArea = tileElement.querySelector('.tile-thumbnail');
  if (!thumbArea) return;
  const img = document.createElement('img');
  img.src = url;
  img.loading = 'lazy';
  img.alt = '';
  // Keep the icon as fallback in case image fails
  img.addEventListener('error', () => img.remove());
  // Clear the icon and insert image
  const iconEl = thumbArea.querySelector('.file-type-icon');
  if (iconEl) iconEl.style.display = 'none';
  thumbArea.prepend(img);
}

/**
 * Setup lazy loading observer for file tiles.
 * Returns a function to observe new tiles.
 */
export function createThumbnailObserver(fileInfoMap) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const path = entry.target.dataset.filePath;
          const fileInfo = fileInfoMap.get(path);
          if (fileInfo) {
            loadThumbnail(entry.target, fileInfo);
          }
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '100px' }
  );

  return {
    observe(tileElement) {
      observer.observe(tileElement);
    },
    disconnect() {
      observer.disconnect();
    },
  };
}

/**
 * Cleanup cached thumbnails.
 */
export function clearThumbnailCache() {
  for (const url of thumbnailCache.values()) {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
  thumbnailCache.clear();
}
