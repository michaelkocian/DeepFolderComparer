/**
 * Folder picker — lets user select source and destination folders.
 * Uses the File System Access API (showDirectoryPicker).
 */

import { getState, setState } from './state.js';
import { icons } from './icons.js';
import { showError } from './toast.js';

export function renderFolderPicker(container) {
  if (!('showDirectoryPicker' in window)) {
    container.innerHTML = `
      <div class="unsupported-warning">
        <h3>Browser Not Supported</h3>
        <p>This app requires the File System Access API, which is available in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.<br>
        Please open this page in one of those browsers.</p>
      </div>
    `;
    return;
  }

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
    if (state.sourceHandle && state.destHandle) {
      setState({ currentStage: 'scan' });
    }
  });

  async function pickFolder(which) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const state = getState();

      if (which === 'source') {
        setState({ sourceHandle: handle, sourceName: handle.name });
        updateSlot(slotSource, handle.name);
      } else {
        setState({ destHandle: handle, destName: handle.name });
        updateSlot(slotDest, handle.name);
      }

      const updated = getState();
      btnStartScan.disabled = !(updated.sourceHandle && updated.destHandle);
    } catch (err) {
      if (err.name !== 'AbortError') {
        showError(`Failed to select folder: ${err.message}`);
      }
    }
  }

  function updateSlot(slotElement, name) {
    slotElement.classList.add('selected');
    const pathElement = slotElement.querySelector('.slot-path');
    pathElement.textContent = name;
    pathElement.classList.remove('empty');
  }
}
