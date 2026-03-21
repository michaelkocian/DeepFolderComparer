/**
 * Drag and drop handler.
 * Makes left panel tiles draggable, right panel + tree folders droppable.
 * On drop, moves files on disk via fileMover.
 */

import { getState, setState } from './state.js';
import { moveFiles } from './fileMover.js';
import { showWarning } from './toast.js';

let leftPanelRef = null;
let rightPanelRef = null;
let destHandleRef = null;

/**
 * Initialize drag-and-drop for the results panels.
 * @param {object} leftPanel - from initLeftPanel
 * @param {object} rightPanel - from initRightPanel
 */
export function initDragDrop(leftPanel, rightPanel) {
  leftPanelRef = leftPanel;
  rightPanelRef = rightPanel;
  destHandleRef = rightPanel.getDestHandle();

  const leftGrid = document.getElementById('fileGridLeft');
  const rightGridWrapper = document.getElementById('gridWrapperRight');
  const panelRight = document.getElementById('panelRight');

  // ─── Drag start (left panel) ───
  leftGrid.addEventListener('dragstart', (e) => {
    const tile = e.target.closest('.file-tile');
    if (!tile) return;

    const filePath = tile.dataset.filePath;
    const state = getState();

    // If dragged tile is not in selection, make it the only selection
    if (!state.selectedFiles.has(filePath)) {
      const selected = new Set([filePath]);
      setState({ selectedFiles: selected });
      updateSelectionVisuals();
    }

    // Set drag data
    const selectedPaths = [...state.selectedFiles];
    if (!selectedPaths.includes(filePath)) {
      selectedPaths.push(filePath);
    }
    e.dataTransfer.setData('application/x-deepfoldercomp', JSON.stringify(selectedPaths));
    e.dataTransfer.effectAllowed = 'move';

    // Custom drag ghost
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      padding: 6px 12px;
      background: var(--color-accent);
      color: white;
      border-radius: 4px;
      font-size: 13px;
      font-family: -apple-system, sans-serif;
      position: absolute;
      top: -1000px;
      white-space: nowrap;
    `;
    ghost.textContent = selectedPaths.length === 1
      ? selectedPaths[0].split('/').pop()
      : `${selectedPaths.length} files`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);

    // Mark dragging tiles
    document.querySelectorAll('#fileGridLeft .file-tile.selected').forEach(t => t.classList.add('dragging'));
  });

  leftGrid.addEventListener('dragend', () => {
    document.querySelectorAll('#fileGridLeft .file-tile.dragging').forEach(t => t.classList.remove('dragging'));
    panelRight.classList.remove('drop-active', 'drop-invalid');
  });

  // ─── Drop target: right panel grid ───
  rightGridWrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    panelRight.classList.add('drop-active');
  });

  rightGridWrapper.addEventListener('dragleave', (e) => {
    if (!rightGridWrapper.contains(e.relatedTarget)) {
      panelRight.classList.remove('drop-active');
    }
  });

  rightGridWrapper.addEventListener('drop', async (e) => {
    e.preventDefault();
    panelRight.classList.remove('drop-active');

    const rawData = e.dataTransfer.getData('application/x-deepfoldercomp');
    if (!rawData) return;

    let paths;
    try {
      paths = JSON.parse(rawData);
    } catch {
      return;
    }
    if (!Array.isArray(paths) || paths.length === 0) return;

    await handleDrop(paths);
  });

  // ─── Drop target: right panel tree folders ───
  const treeRight = document.getElementById('treeRight');
  treeRight.addEventListener('dragover', (e) => {
    const row = e.target.closest('.tree-item-row');
    if (row) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Remove previous highlight
      treeRight.querySelectorAll('.tree-item-row.drop-target').forEach(r => r.classList.remove('drop-target'));
      row.classList.add('drop-target');
    }
  });

  treeRight.addEventListener('dragleave', (e) => {
    const row = e.target.closest('.tree-item-row');
    if (row && !row.contains(e.relatedTarget)) {
      row.classList.remove('drop-target');
    }
  });

  treeRight.addEventListener('drop', async (e) => {
    e.preventDefault();
    treeRight.querySelectorAll('.tree-item-row.drop-target').forEach(r => r.classList.remove('drop-target'));

    const row = e.target.closest('.tree-item-row');
    if (!row) return;

    const targetPath = row.dataset.folderPath || '';

    const rawData = e.dataTransfer.getData('application/x-deepfoldercomp');
    if (!rawData) return;

    let paths;
    try {
      paths = JSON.parse(rawData);
    } catch {
      return;
    }
    if (!Array.isArray(paths) || paths.length === 0) return;

    await handleDrop(paths, targetPath);
  });
}

/**
 * Handle a drop operation — move files to the destination folder.
 * @param {string[]} sourcePaths - relative paths of files to move
 * @param {string} [targetPath] - destination folder path (default: current right panel path)
 */
async function handleDrop(sourcePaths, targetPath) {
  const state = getState();

  // Resolve target path
  const destPath = targetPath !== undefined ? targetPath : rightPanelRef.getCurrentPath();

  // Navigate to the target directory handle
  let targetDirHandle = destHandleRef;
  if (destPath) {
    try {
      const parts = destPath.split('/');
      for (const part of parts) {
        targetDirHandle = await targetDirHandle.getDirectoryHandle(part);
      }
    } catch (err) {
      showWarning(`Cannot access destination folder: ${err.message}`);
      return;
    }
  }

  // Find FileInfo objects for the source paths
  const missingFiles = state.missingFiles;
  const filesToMove = sourcePaths
    .map(path => missingFiles.find(f => f.relativePath === path))
    .filter(Boolean);

  if (filesToMove.length === 0) {
    showWarning('No valid files to move');
    return;
  }

  // Perform move
  const { moved } = await moveFiles(filesToMove, targetDirHandle, destPath);

  if (moved.length > 0) {
    // Build a set of source paths that were successfully moved
    const movedNames = new Set(moved.map(m => m.name));
    const movedSourcePaths = new Set(
      filesToMove
        .filter(f => movedNames.has(f.name))
        .map(f => f.relativePath)
    );
    const remainingMissing = state.missingFiles.filter(f => !movedSourcePaths.has(f.relativePath));

    setState({ missingFiles: remainingMissing, selectedFiles: new Set() });

    // Add moved files to right panel
    for (const newFileInfo of moved) {
      rightPanelRef.addFile(newFileInfo);
    }

    // Refresh left panel
    leftPanelRef.refresh();

    // Rebuild left panel with updated missing files
    // Re-import and reinitialize would be complex; instead we reinit inline
    const { initLeftPanel } = await import('./panelView.js');
    const newLeftPanel = initLeftPanel(remainingMissing);
    leftPanelRef = newLeftPanel;

    // Reinitialize drag-drop on new content
    // (Event listeners on grid persist since they're on the container)
  }
}

function updateSelectionVisuals() {
  const state = getState();
  document.querySelectorAll('#fileGridLeft .file-tile').forEach(tile => {
    const path = tile.dataset.filePath;
    tile.classList.toggle('selected', state.selectedFiles.has(path));
  });
}
