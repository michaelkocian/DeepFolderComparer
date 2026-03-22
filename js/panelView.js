/**
 * Panel view — renders file grids with thumbnails, zoom control, breadcrumb.
 * Used for both left (missing files) and right (destination) panels.
 */

import { getFileCategory, formatFileSize, formatDate } from './fileInfo.js';
import { getFileIcon, createThumbnailObserver } from './thumbnailGenerator.js';
import { icons } from './icons.js';
import { getState, setState } from './state.js';
import { buildFolderTree, renderTree, getFilesAtPath, getAllFilesUnderPath, createExpandedState } from './treeView.js';
import { openPreview } from './filePreview.js';
import { createFolder } from './apiClient.js';

/**
 * Render files into a grid.
 */
export function renderFileGrid(gridElement, files, options = {}) {
  const { draggable = false, zoom = 5 } = options;

  gridElement.style.gridTemplateColumns = `repeat(${zoom}, 1fr)`;
  gridElement.innerHTML = '';

  if (files.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.style.gridColumn = `1 / -1`;
    emptyState.innerHTML = `
      ${icons.folder}
      <div class="empty-title">No files here</div>
      <div class="empty-hint">This folder is empty</div>
    `;
    gridElement.appendChild(emptyState);
    return { observer: null };
  }

  const fileInfoMap = new Map();
  files.forEach(f => fileInfoMap.set(f.relativePath, f));

  const observer = createThumbnailObserver(fileInfoMap);

  for (const fileInfo of files) {
    const tile = createFileTile(fileInfo, draggable);
    tile.dataset.filePath = fileInfo.relativePath;
    tile.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openPreview(fileInfo, files);
    });
    gridElement.appendChild(tile);
    observer.observe(tile);
  }

  return { observer };
}

function createFileTile(fileInfo, draggable) {
  const category = getFileCategory(fileInfo);
  const tile = document.createElement('div');
  tile.className = 'file-tile';
  if (draggable) tile.draggable = true;

  const iconHtml = getFileIcon(fileInfo);
  const videoIndicator = category === 'video'
    ? `<div class="video-indicator">${icons.play}</div>`
    : '';

  const selectionCheck = draggable
    ? `<div class="selection-checkbox">${icons.check}</div>`
    : '';

  tile.innerHTML = `
    ${selectionCheck}
    <div class="tile-thumbnail">
      <div class="file-type-icon">${iconHtml}</div>
      ${videoIndicator}
    </div>
    <div class="tile-info">
      <div class="tile-name" title="${escapeAttr(fileInfo.relativePath)}">${escapeHtml(fileInfo.name)}</div>
      <div class="tile-meta">${formatFileSize(fileInfo.size)} · ${formatDate(fileInfo.lastModified)}</div>
    </div>
  `;

  if (draggable) {
    tile.addEventListener('click', (e) => {
      const state = getState();
      const selected = new Set(state.selectedFiles);

      if (e.ctrlKey || e.metaKey) {
        if (selected.has(fileInfo.relativePath)) {
          selected.delete(fileInfo.relativePath);
        } else {
          selected.add(fileInfo.relativePath);
        }
      } else if (e.shiftKey) {
        selected.add(fileInfo.relativePath);
      } else {
        selected.clear();
        selected.add(fileInfo.relativePath);
      }

      setState({ selectedFiles: selected });
      updateSelectionVisuals();
    });
  }

  return tile;
}

function updateSelectionVisuals() {
  const state = getState();
  const tiles = document.querySelectorAll('#fileGridLeft .file-tile');
  tiles.forEach(tile => {
    const path = tile.dataset.filePath;
    tile.classList.toggle('selected', state.selectedFiles.has(path));
  });
}

export function renderBreadcrumb(container, folderPath, onNavigate) {
  container.innerHTML = '';

  const rootSpan = document.createElement('span');
  rootSpan.textContent = '(root)';
  rootSpan.addEventListener('click', () => onNavigate(''));
  container.appendChild(rootSpan);

  if (folderPath) {
    const parts = folderPath.split('/');
    for (let i = 0; i < parts.length; i++) {
      const sep = document.createElement('span');
      sep.className = 'separator';
      sep.textContent = ' / ';
      container.appendChild(sep);

      const partSpan = document.createElement('span');
      partSpan.textContent = parts[i];
      const partPath = parts.slice(0, i + 1).join('/');
      partSpan.addEventListener('click', () => onNavigate(partPath));
      container.appendChild(partSpan);
    }
  }
}

function renderPanelHeaderControls(containerId, options) {
  const container = document.getElementById(containerId);
  const { zoom, onZoom, onToggleSubfolders, onToggleShowAll } = options;

  const showAllHtml = onToggleShowAll ? `
    <select class="show-all-select compact-select" title="Filter source files">
      <option value="missing">Missing files</option>
      <option value="all">All source files</option>
    </select>
    <span class="panel-separator"></span>
  ` : '';

  container.innerHTML = `
    ${showAllHtml}
    <button class="btn-icon subfolder-toggle has-label" title="Include subfolders">
      ${icons.layers}
      <span class="btn-icon-label">Show subfolder files</span>
    </button>
    <div class="zoom-control compact">
      <input type="range" min="1" max="10" value="${zoom}">
      <span class="zoom-value">${zoom}</span>
    </div>
  `;

  if (onToggleShowAll) {
    const showAllSelect = container.querySelector('.show-all-select');
    showAllSelect.addEventListener('change', () => onToggleShowAll(showAllSelect.value === 'all'));
  }

  let subfolderActive = false;
  const toggleBtn = container.querySelector('.subfolder-toggle');
  toggleBtn.addEventListener('click', () => {
    subfolderActive = !subfolderActive;
    toggleBtn.classList.toggle('active', subfolderActive);
    onToggleSubfolders(subfolderActive);
  });

  const slider = container.querySelector('input[type="range"]');
  const valueSpan = container.querySelector('.zoom-value');
  slider.addEventListener('input', (e) => {
    const z = parseInt(e.target.value, 10);
    valueSpan.textContent = z;
    onZoom(z);
  });
}

/**
 * Initialize the full left panel (missing files).
 */
export function initLeftPanel(missingFiles, sourceFiles) {
  const state = getState();
  const expandedPaths = createExpandedState();
  let showAllFiles = false;
  let activeFiles = missingFiles;
  let tree = buildFolderTree(activeFiles);
  let currentPath = state.leftSelectedPath;
  let currentObserver = null;
  let currentZoom = state.zoomLeft;
  let showSubfolders = false;

  renderPanelHeaderControls('panelControlsLeft', {
    zoom: currentZoom,
    onZoom(z) { currentZoom = z; setState({ zoomLeft: z }); refresh(); },
    onToggleSubfolders(active) { showSubfolders = active; refresh(); },
    onToggleShowAll(showAll) {
      showAllFiles = showAll;
      activeFiles = showAll ? sourceFiles : missingFiles;
      tree = buildFolderTree(activeFiles);
      currentPath = '';
      setState({ leftSelectedPath: '' });
      refresh();
    },
  });

  function refresh() {
    const files = showSubfolders
      ? getAllFilesUnderPath(tree, currentPath)
      : getFilesAtPath(tree, currentPath);

    const titleEl = document.querySelector('#panelLeft .panel-title');
    if (titleEl) {
      titleEl.textContent = showAllFiles ? 'All Source Files' : 'Missing Files (Source)';
    }

    renderTree(
      document.getElementById('treeLeft'),
      tree,
      (path) => { currentPath = path; setState({ leftSelectedPath: path }); refresh(); },
      currentPath,
      { expandedPaths }
    );

    renderBreadcrumb(
      document.getElementById('breadcrumbLeft'),
      currentPath,
      (path) => { currentPath = path; setState({ leftSelectedPath: path }); refresh(); }
    );

    if (currentObserver) currentObserver.disconnect();
    const result = renderFileGrid(
      document.getElementById('fileGridLeft'),
      files,
      { draggable: !showAllFiles, zoom: currentZoom }
    );
    currentObserver = result.observer;

    document.getElementById('missingCount').textContent = activeFiles.length;
  }

  refresh();

  return {
    refresh,
    setZoom(z) { currentZoom = z; setState({ zoomLeft: z }); refresh(); },
    getTree() { return tree; },
  };
}

/**
 * Initialize the full right panel (destination folder).
 */
export function initRightPanel(destFiles) {
  const state = getState();
  const expandedPaths = createExpandedState();
  let tree = buildFolderTree(destFiles);
  let currentPath = state.rightSelectedPath;
  let currentObserver = null;
  let currentZoom = state.zoomRight;
  let allDestFiles = [...destFiles];
  let showSubfolders = false;

  renderPanelHeaderControls('panelControlsRight', {
    zoom: currentZoom,
    onZoom(z) { currentZoom = z; setState({ zoomRight: z }); refresh(); },
    onToggleSubfolders(active) { showSubfolders = active; refresh(); },
  });

  async function refresh() {
    const files = showSubfolders
      ? getAllFilesUnderPath(tree, currentPath)
      : getFilesAtPath(tree, currentPath);

    renderTree(
      document.getElementById('treeRight'),
      tree,
      (path) => { currentPath = path; setState({ rightSelectedPath: path }); refresh(); },
      currentPath,
      {
        allowNewFolder: true,
        onNewFolder: handleNewFolder,
        expandedPaths,
      }
    );

    renderBreadcrumb(
      document.getElementById('breadcrumbRight'),
      currentPath,
      (path) => { currentPath = path; setState({ rightSelectedPath: path }); refresh(); }
    );

    if (currentObserver) currentObserver.disconnect();
    const result = renderFileGrid(
      document.getElementById('fileGridRight'),
      files,
      { draggable: false, zoom: currentZoom }
    );
    currentObserver = result.observer;

    document.getElementById('destCount').textContent = allDestFiles.length;
  }

  async function handleNewFolder(parentPath) {
    const folderName = prompt('New folder name:');
    if (!folderName || !folderName.trim()) return;

    const sanitizedName = folderName.trim();
    try {
      // Build full path and create via backend
      const destRoot = state.destPath;
      const fullPath = parentPath
        ? `${destRoot}/${parentPath}/${sanitizedName}`
        : `${destRoot}/${sanitizedName}`;

      await createFolder(fullPath);

      const newPath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName;
      addEmptyFolderToTree(tree, newPath);
      refresh();
    } catch (err) {
      const { showError } = await import('./toast.js');
      showError(`Failed to create folder: ${err.message}`);
    }
  }

  refresh();

  return {
    refresh,
    setZoom(z) { currentZoom = z; setState({ zoomRight: z }); refresh(); },
    getTree() { return tree; },
    getCurrentPath() { return currentPath; },
    addFile(fileInfo) {
      allDestFiles.push(fileInfo);
      tree = buildFolderTree(allDestFiles);
      refresh();
    },
  };
}

function addEmptyFolderToTree(tree, folderPath) {
  const parts = folderPath.split('/');
  let current = tree;
  for (const part of parts) {
    if (!current.children.has(part)) {
      const pathSoFar = current.path ? `${current.path}/${part}` : part;
      current.children.set(part, {
        name: part,
        path: pathSoFar,
        children: new Map(),
        files: [],
        fileCount: 0,
      });
    }
    current = current.children.get(part);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
