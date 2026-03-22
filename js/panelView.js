/**
 * Panel view — renders file grids with thumbnails, zoom control, breadcrumb.
 * Used for both left (missing files) and right (destination) panels.
 */

import { getFileCategory, formatFileSize, formatDate } from './fileInfo.js';
import { getFileIcon, createThumbnailObserver } from './thumbnailGenerator.js';
import { icons } from './icons.js';
import { getState, setState } from './state.js';
import { buildFolderTree, renderTree, getFilesAtPath, getAllFilesUnderPath, createExpandedState } from './treeView.js';

/**
 * Render files into a grid.
 * @param {HTMLElement} gridElement - the .file-grid element
 * @param {import('./fileInfo.js').FileInfo[]} files
 * @param {object} options - { draggable, zoom, onFileSelect }
 * @returns {{ observer: object }} cleanup handle
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

  // Build a FileInfo map for thumbnail observer
  const fileInfoMap = new Map();
  files.forEach(f => fileInfoMap.set(f.relativePath, f));

  const observer = createThumbnailObserver(fileInfoMap);

  for (const fileInfo of files) {
    const tile = createFileTile(fileInfo, draggable);
    tile.dataset.filePath = fileInfo.relativePath;
    gridElement.appendChild(tile);
    observer.observe(tile);
  }

  return { observer };
}

/**
 * Create a single file tile element.
 */
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

  // Selection toggle
  if (draggable) {
    tile.addEventListener('click', (e) => {
      const state = getState();
      const selected = new Set(state.selectedFiles);

      if (e.ctrlKey || e.metaKey) {
        // Toggle selection
        if (selected.has(fileInfo.relativePath)) {
          selected.delete(fileInfo.relativePath);
        } else {
          selected.add(fileInfo.relativePath);
        }
      } else if (e.shiftKey) {
        // Range select — add to selection
        selected.add(fileInfo.relativePath);
      } else {
        // Single select
        selected.clear();
        selected.add(fileInfo.relativePath);
      }

      setState({ selectedFiles: selected });
      updateSelectionVisuals();
    });
  }

  return tile;
}

/**
 * Update visual selection state on all tiles.
 */
function updateSelectionVisuals() {
  const state = getState();
  const tiles = document.querySelectorAll('#fileGridLeft .file-tile');
  tiles.forEach(tile => {
    const path = tile.dataset.filePath;
    tile.classList.toggle('selected', state.selectedFiles.has(path));
  });
}

/**
 * Render breadcrumb for a folder path.
 */
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

/**
 * Render zoom + subfolder toggle controls into a panel header.
 */
function renderPanelHeaderControls(containerId, options) {
  const container = document.getElementById(containerId);
  const { zoom, onZoom, onToggleSubfolders, onToggleShowAll } = options;

  const showAllHtml = onToggleShowAll ? `
    <label class="checkbox-label compact" title="Show all source files, not just missing">
      <input type="checkbox" class="show-all-toggle">
      <span class="label-text">All</span>
    </label>
    <span class="panel-separator"></span>
  ` : '';

  container.innerHTML = `
    ${showAllHtml}
    <button class="btn-icon subfolder-toggle" title="Show all files in subfolders">
      ${icons.layers}
    </button>
    <div class="zoom-control compact">
      <input type="range" min="1" max="10" value="${zoom}">
      <span class="zoom-value">${zoom}</span>
    </div>
  `;

  if (onToggleShowAll) {
    const showAllCb = container.querySelector('.show-all-toggle');
    showAllCb.addEventListener('change', () => onToggleShowAll(showAllCb.checked));
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

  // Render panel header controls
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

    // Update panel title
    const titleEl = document.querySelector('#panelLeft .panel-title');
    if (titleEl) {
      titleEl.textContent = showAllFiles ? 'All Source Files' : 'Missing Files (Source)';
    }

    // Tree
    renderTree(
      document.getElementById('treeLeft'),
      tree,
      (path) => { currentPath = path; setState({ leftSelectedPath: path }); refresh(); },
      currentPath,
      { expandedPaths }
    );

    // Breadcrumb
    renderBreadcrumb(
      document.getElementById('breadcrumbLeft'),
      currentPath,
      (path) => { currentPath = path; setState({ leftSelectedPath: path }); refresh(); }
    );

    // Grid
    if (currentObserver) currentObserver.disconnect();
    const result = renderFileGrid(
      document.getElementById('fileGridLeft'),
      files,
      { draggable: !showAllFiles, zoom: currentZoom }
    );
    currentObserver = result.observer;

    // Badge
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
export function initRightPanel(destFiles, destHandle) {
  const state = getState();
  const expandedPaths = createExpandedState();
  let tree = buildFolderTree(destFiles);
  let currentPath = state.rightSelectedPath;
  let currentObserver = null;
  let currentZoom = state.zoomRight;
  let allDestFiles = [...destFiles];
  let showSubfolders = false;

  // Render panel header controls
  renderPanelHeaderControls('panelControlsRight', {
    zoom: currentZoom,
    onZoom(z) { currentZoom = z; setState({ zoomRight: z }); refresh(); },
    onToggleSubfolders(active) { showSubfolders = active; refresh(); },
  });

  async function refresh() {
    const files = showSubfolders
      ? getAllFilesUnderPath(tree, currentPath)
      : getFilesAtPath(tree, currentPath);

    // Tree with new folder support
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

    // Breadcrumb
    renderBreadcrumb(
      document.getElementById('breadcrumbRight'),
      currentPath,
      (path) => { currentPath = path; setState({ rightSelectedPath: path }); refresh(); }
    );

    // Grid
    if (currentObserver) currentObserver.disconnect();
    const result = renderFileGrid(
      document.getElementById('fileGridRight'),
      files,
      { draggable: false, zoom: currentZoom }
    );
    currentObserver = result.observer;

    // Badge
    document.getElementById('destCount').textContent = allDestFiles.length;
  }

  async function handleNewFolder(parentPath) {
    const folderName = prompt('New folder name:');
    if (!folderName || !folderName.trim()) return;

    const sanitizedName = folderName.trim();
    try {
      // Navigate to parent directory handle
      let targetDirHandle = destHandle;
      if (parentPath) {
        const parts = parentPath.split('/');
        for (const part of parts) {
          targetDirHandle = await targetDirHandle.getDirectoryHandle(part);
        }
      }

      // Create the new folder on disk
      await targetDirHandle.getDirectoryHandle(sanitizedName, { create: true });

      // Rebuild tree (rescan would be expensive — just add the node)
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
    getDestHandle() { return destHandle; },
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
