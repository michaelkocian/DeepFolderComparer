/**
 * Folder picker — lets user select source and destination folders.
 * Uses the C# backend to open native folder browser dialogs.
 */

import { getState, setState } from './state.js';
import { browseFolder } from './apiClient.js';
import { icons } from './icons.js';
import { showError } from './toast.js';

export function renderFolderPicker(container, { onStartScan, onFolderChange } = {}) {
  container.innerHTML = `
    <div class="folder-picker">
      <div class="picker-intro">
        <h2>Select Folders to Compare</h2>
        <p>Choose a source folder and a destination (backup) folder to find missing files.</p>
      </div>

      <div class="folder-slot" id="slotSource">
        <div class="slot-icon">${icons.folder}</div>
        <div class="slot-info">
          <div class="slot-label">Source Folder</div>
          <div class="slot-path empty">Click to select…</div>
        </div>
        <button class="btn btn-secondary btn-sm">Browse</button>
      </div>

      <div class="folder-slot" id="slotDest">
        <div class="slot-icon">${icons.folder}</div>
        <div class="slot-info">
          <div class="slot-label">Destination Folder</div>
          <div class="slot-path empty">Click to select…</div>
        </div>
        <button class="btn btn-secondary btn-sm">Browse</button>
      </div>

      <div class="picker-actions">
        <button class="btn btn-primary btn-lg" id="btnStartScan" disabled>Start Scanning</button>
      </div>
    </div>
  `;

  const slotSource = container.querySelector('#slotSource');
  const slotDest = container.querySelector('#slotDest');
  const btnStartScan = container.querySelector('#btnStartScan');

  slotSource.addEventListener('click', () => pickFolder('source'));
  slotDest.addEventListener('click', () => pickFolder('dest'));

  btnStartScan.addEventListener('click', () => {
    const state = getState();
    if (state.sourcePath && state.destPath) {
      if (onStartScan) onStartScan();
    }
  });

  async function pickFolder(which) {
    try {
      const path = await browseFolder();
      if (!path) return; // User cancelled

      const folderName = path.split(/[\\/]/).pop() || path;

      if (which === 'source') {
        setState({ sourcePath: path, sourceName: folderName });
        updateSlot(slotSource, folderName, path);
      } else {
        setState({ destPath: path, destName: folderName });
        updateSlot(slotDest, folderName, path);
      }

      const updated = getState();
      btnStartScan.disabled = !(updated.sourcePath && updated.destPath);
      if (onFolderChange) onFolderChange();
    } catch (err) {
      showError(`Failed to select folder: ${err.message}`);
    }
  }

  function updateSlot(slotElement, name, fullPath) {
    slotElement.classList.add('selected');
    const pathElement = slotElement.querySelector('.slot-path');
    pathElement.textContent = fullPath || name;
    pathElement.classList.remove('empty');
    pathElement.title = fullPath || '';
  }
}
