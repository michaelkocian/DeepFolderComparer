/**
 * File preview modal — shows file content in a 95% screen overlay.
 * Supports images, video, audio, PDF, text/code, and fallback info view.
 * Uses backend /api/file endpoint for file content.
 */

import { getFileCategory, formatFileSize, formatDate } from './fileInfo.js';
import { fileUrl } from './apiClient.js';
import { icons } from './icons.js';

const MAX_TEXT_SIZE = 5 * 1024 * 1024; // 5 MB limit for text preview
const ZOOM_MIN = 1;
const ZOOM_MAX = 10;
const ZOOM_STEP = 0.15;

let currentFiles = [];
let currentIndex = 0;
let modal = null;

let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let currentZoomTarget = null;
let currentZoomWrapper = null;

/** Open the preview modal for a file within a list of files. */
export function openPreview(fileInfo, files) {
  currentFiles = files;
  currentIndex = files.indexOf(fileInfo);
  if (currentIndex === -1) currentIndex = 0;

  ensureModal();
  renderPreview(fileInfo);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/** Close the preview modal and clean up resources. */
export function closePreview() {
  if (!modal) return;
  resetZoom();
  stopMedia();
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function ensureModal() {
  if (modal) return;

  modal = document.createElement('div');
  modal.id = 'filePreviewModal';
  modal.className = 'preview-modal';
  modal.innerHTML = `
    <div class="preview-backdrop"></div>
    <div class="preview-container">
      <div class="preview-header">
        <div class="preview-title-area">
          <span class="preview-icon"></span>
          <span class="preview-filename"></span>
          <span class="preview-meta"></span>
        </div>
        <div class="preview-nav">
          <button class="btn-icon preview-prev" title="Previous file (←)">${icons.chevronRight}</button>
          <span class="preview-counter"></span>
          <button class="btn-icon preview-next" title="Next file (→)">${icons.chevronRight}</button>
        </div>
        <button class="btn-icon preview-close" title="Close (Esc)">${icons.close}</button>
      </div>
      <div class="preview-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.preview-backdrop').addEventListener('click', closePreview);
  modal.querySelector('.preview-close').addEventListener('click', closePreview);
  modal.querySelector('.preview-prev').addEventListener('click', () => navigate(-1));
  modal.querySelector('.preview-next').addEventListener('click', () => navigate(1));
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
  if (!modal?.classList.contains('active')) return;
  if (e.key === 'Escape') closePreview();
  if (e.key === 'ArrowLeft') navigate(-1);
  if (e.key === 'ArrowRight') navigate(1);
}

function stopMedia() {
  if (!modal) return;
  modal.querySelectorAll('video, audio').forEach(el => {
    el.pause();
    el.removeAttribute('src');
    el.load();
  });
}

function navigate(direction) {
  if (currentFiles.length <= 1) return;
  resetZoom();
  stopMedia();
  currentIndex = (currentIndex + direction + currentFiles.length) % currentFiles.length;
  renderPreview(currentFiles[currentIndex]);
}

async function renderPreview(fileInfo) {
  const category = getFileCategory(fileInfo);
  const header = modal.querySelector('.preview-header');
  const body = modal.querySelector('.preview-body');

  // Header info
  header.querySelector('.preview-icon').innerHTML = icons[category] || icons.file;
  header.querySelector('.preview-filename').textContent = fileInfo.name;
  header.querySelector('.preview-meta').textContent =
    `${formatFileSize(fileInfo.size)} · ${formatDate(fileInfo.lastModified)} · ${fileInfo.type || fileInfo.extension}`;

  // Counter
  const counter = header.querySelector('.preview-counter');
  counter.textContent = `${currentIndex + 1} / ${currentFiles.length}`;

  // Nav visibility
  const hasManyFiles = currentFiles.length > 1;
  header.querySelector('.preview-prev').style.display = hasManyFiles ? '' : 'none';
  header.querySelector('.preview-next').style.display = hasManyFiles ? '' : 'none';
  counter.style.display = hasManyFiles ? '' : 'none';

  // Body content
  body.innerHTML = '<div class="preview-loading">Loading preview…</div>';

  try {
    body.innerHTML = '';
    const content = await buildPreviewContent(fileInfo, category);
    body.appendChild(content);
  } catch (err) {
    body.innerHTML = `<div class="preview-error">Cannot preview this file.<br><small>${escapeHtml(err.message)}</small></div>`;
  }
}

async function buildPreviewContent(fileInfo, category) {
  switch (category) {
    case 'image': return buildImagePreview(fileInfo);
    case 'video': return buildVideoPreview(fileInfo);
    case 'audio': return buildAudioPreview(fileInfo);
    case 'pdf':   return buildPdfPreview(fileInfo);
    case 'code':  return buildTextPreview(fileInfo, true);
    case 'document': return buildDocumentPreview(fileInfo);
    default:      return buildFallbackPreview(fileInfo);
  }
}

function buildImagePreview(fileInfo) {
  const url = fileUrl(fileInfo.fullPath);
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-content preview-image';
  const img = document.createElement('img');
  img.src = url;
  img.alt = fileInfo.name;
  img.draggable = false;
  wrapper.appendChild(img);
  setupZoom(wrapper, img);
  return wrapper;
}

function buildVideoPreview(fileInfo) {
  const url = fileUrl(fileInfo.fullPath);
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-content preview-video';
  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  video.autoplay = true;
  wrapper.appendChild(video);
  setupZoom(wrapper, video);
  return wrapper;
}

function buildAudioPreview(fileInfo) {
  const url = fileUrl(fileInfo.fullPath);
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-content preview-audio';
  wrapper.innerHTML = `<div class="preview-audio-icon">${icons.audio}</div>`;
  const audio = document.createElement('audio');
  audio.src = url;
  audio.controls = true;
  audio.autoplay = true;
  wrapper.appendChild(audio);
  return wrapper;
}

function buildPdfPreview(fileInfo) {
  const url = fileUrl(fileInfo.fullPath);
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-content preview-pdf';
  const embed = document.createElement('embed');
  embed.src = url;
  embed.type = 'application/pdf';
  wrapper.appendChild(embed);
  return wrapper;
}

async function buildTextPreview(fileInfo, isCode) {
  if (fileInfo.size > MAX_TEXT_SIZE) {
    return buildFallbackPreview(fileInfo, 'File too large for text preview');
  }
  const url = fileUrl(fileInfo.fullPath);
  const response = await fetch(url);
  const text = await response.text();
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-content preview-text';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = text;
  if (isCode) code.className = `language-${fileInfo.extension}`;
  pre.appendChild(code);
  wrapper.appendChild(pre);
  return wrapper;
}

async function buildDocumentPreview(fileInfo) {
  const textExtensions = ['txt', 'md', 'csv', 'log', 'rtf', 'tex', 'ini', 'cfg', 'conf'];
  if (textExtensions.includes(fileInfo.extension) || fileInfo.type.startsWith('text/')) {
    return buildTextPreview(fileInfo, false);
  }
  return buildFallbackPreview(fileInfo, 'No native preview for this document type');
}

function buildFallbackPreview(fileInfo, message) {
  const category = getFileCategory(fileInfo);
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-content preview-fallback';
  wrapper.innerHTML = `
    <div class="preview-fallback-icon">${icons[category] || icons.file}</div>
    <div class="preview-fallback-name">${escapeHtml(fileInfo.name)}</div>
    <div class="preview-fallback-details">
      <div>Type: ${escapeHtml(fileInfo.type || 'Unknown')}</div>
      <div>Size: ${formatFileSize(fileInfo.size)}</div>
      <div>Modified: ${formatDate(fileInfo.lastModified)}</div>
      <div>Path: ${escapeHtml(fileInfo.relativePath)}</div>
    </div>
    ${message ? `<div class="preview-fallback-message">${escapeHtml(message)}</div>` : ''}
  `;
  return wrapper;
}

/** Attach mouse-wheel zoom and click-drag pan to a media element. */
function setupZoom(wrapper, mediaEl) {
  resetZoom();
  currentZoomWrapper = wrapper;
  currentZoomTarget = mediaEl;

  wrapper.addEventListener('wheel', onZoomWheel, { passive: false });
  wrapper.addEventListener('mousedown', onPanStart);
  wrapper.addEventListener('dblclick', onZoomReset);
}

function onZoomWheel(e) {
  e.preventDefault();
  const direction = e.deltaY < 0 ? 1 : -1;
  const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel * (1 + direction * ZOOM_STEP)));

  if (newZoom <= ZOOM_MIN) {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    applyTransform();
    return;
  }

  const rect = currentZoomWrapper.getBoundingClientRect();
  const cursorX = e.clientX - rect.left;
  const cursorY = e.clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const ratio = newZoom / zoomLevel;
  panX = cursorX - ratio * (cursorX - panX - centerX) - centerX;
  panY = cursorY - ratio * (cursorY - panY - centerY) - centerY;
  zoomLevel = newZoom;

  clampPan();
  applyTransform();
}

function onPanStart(e) {
  if (zoomLevel <= ZOOM_MIN || e.button !== 0) return;
  isPanning = true;
  panStartX = e.clientX - panX;
  panStartY = e.clientY - panY;
  currentZoomWrapper.classList.add('panning');

  const onMove = (ev) => {
    if (!isPanning) return;
    panX = ev.clientX - panStartX;
    panY = ev.clientY - panStartY;
    clampPan();
    applyTransform();
  };

  const onUp = () => {
    isPanning = false;
    currentZoomWrapper?.classList.remove('panning');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onZoomReset() {
  resetZoom();
  applyTransform();
}

function clampPan() {
  if (!currentZoomWrapper) return;
  const rect = currentZoomWrapper.getBoundingClientRect();
  const maxPanX = (rect.width * (zoomLevel - 1)) / 2;
  const maxPanY = (rect.height * (zoomLevel - 1)) / 2;
  panX = Math.min(maxPanX, Math.max(-maxPanX, panX));
  panY = Math.min(maxPanY, Math.max(-maxPanY, panY));
}

function applyTransform() {
  if (!currentZoomTarget) return;
  currentZoomTarget.style.transform =
    zoomLevel <= ZOOM_MIN
      ? ''
      : `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  currentZoomWrapper?.classList.toggle('zoomed', zoomLevel > ZOOM_MIN);
}

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  isPanning = false;
  if (currentZoomTarget) currentZoomTarget.style.transform = '';
  if (currentZoomWrapper) currentZoomWrapper.classList.remove('zoomed', 'panning');
  currentZoomTarget = null;
  currentZoomWrapper = null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
