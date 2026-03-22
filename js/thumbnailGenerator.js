/**
 * Thumbnail / icon generator for file tiles.
 * - Images: real thumbnail via backend file URL + canvas
 * - Videos: first-frame capture via backend file URL
 * - Others: SVG file-type icon
 * Uses IntersectionObserver for lazy loading.
 */

import { getFileCategory } from './fileInfo.js';
import { fileUrl } from './apiClient.js';
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
 * Generate a real thumbnail for an image file via backend URL.
 */
async function generateImageThumbnail(fileInfo, maxSize = 200) {
  try {
    const url = fileUrl(fileInfo.fullPath);
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: maxSize,
      resizeHeight: maxSize,
      resizeQuality: 'low',
    });

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const thumbBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return URL.createObjectURL(thumbBlob);
  } catch {
    return null;
  }
}

/**
 * Generate a thumbnail from a video file's first frame via backend URL.
 */
function generateVideoThumbnail(fileInfo) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000);

    try {
      const url = fileUrl(fileInfo.fullPath);
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';

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
          clearTimeout(timeout);
          resolve(dataUrl);
        } catch {
          clearTimeout(timeout);
          resolve(null);
        }
      });

      video.addEventListener('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });

      video.src = url;
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
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
  img.addEventListener('error', () => img.remove());
  const iconEl = thumbArea.querySelector('.file-type-icon');
  if (iconEl) iconEl.style.display = 'none';
  thumbArea.prepend(img);
}

/**
 * Setup lazy loading observer for file tiles.
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
