/**
 * Comparison configuration UI.
 * Checkboxes for comparison methods + mode toggle (folder-by-folder vs deep scan).
 */

import { getState, setState } from './state.js';

const METHODS = [
  { key: 'nameCompare', label: 'Name', hint: 'Filename match', defaultOn: true },
  { key: 'sizeCompare', label: 'Size', hint: 'File size in bytes', defaultOn: true },
  { key: 'dateCompare', label: 'Date Modified', hint: 'Last modified timestamp', defaultOn: false },
  { key: 'pathCompare', label: 'Relative Path', hint: 'Full path within folder', defaultOn: false },
  { key: 'extensionCompare', label: 'Extension / MIME', hint: 'File type matching', defaultOn: false },
  { key: 'chunkProbe', label: 'Chunk Probe', hint: 'First, middle & last 4 KB', defaultOn: false },
  { key: 'hashCompare', label: 'SHA-256 Hash', hint: 'Full file hash (slow for large files)', defaultOn: false },
  { key: 'fullByteCompare', label: 'Full Byte Compare', hint: 'Bit-for-bit comparison (slowest)', defaultOn: false },
];

export function renderComparisonConfig(container, onStartCompare) {
  const state = getState();

  container.innerHTML = `
    <div class="comparison-config">
      <div class="config-section">
        <div class="section-title">Comparison Methods</div>
        <div class="section-description">Select how files should be matched between source and destination.</div>
        <div class="config-columns">
          ${METHODS.map(method => `
            <label class="checkbox-label">
              <input type="checkbox" data-method="${method.key}"
                ${state.comparisonConfig.methods[method.key] ? 'checked' : ''}>
              <span class="label-text">${method.label}</span>
              <span class="label-hint">${method.hint}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="config-section">
        <div class="section-title">Comparison Mode</div>
        <div class="section-description">Choose how to traverse the folder structure.</div>
        <div class="radio-group">
          <label class="radio-label ${state.comparisonConfig.mode === 'folderByFolder' ? 'selected' : ''}">
            <input type="radio" name="comparisonMode" value="folderByFolder"
              ${state.comparisonConfig.mode === 'folderByFolder' ? 'checked' : ''}>
            <div>
              <div class="label-text">Folder by Folder</div>
              <div class="label-hint" style="font-size:11px;color:var(--color-text-muted);">Compare files at matching relative paths</div>
            </div>
          </label>
          <label class="radio-label ${state.comparisonConfig.mode === 'deepScan' ? 'selected' : ''}">
            <input type="radio" name="comparisonMode" value="deepScan"
              ${state.comparisonConfig.mode === 'deepScan' ? 'checked' : ''}>
            <div>
              <div class="label-text">Deep Scan</div>
              <div class="label-hint" style="font-size:11px;color:var(--color-text-muted);">Match files across all folders</div>
            </div>
          </label>
        </div>
      </div>

      <div id="compareProgressRoot" style="display:none;"></div>

      <div class="config-actions">
        <button class="btn btn-primary btn-lg" id="btnStartCompare">Start Comparing</button>
      </div>
    </div>
  `;

  // Wire up checkboxes
  const checkboxes = container.querySelectorAll('input[type="checkbox"][data-method]');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const config = { ...getState().comparisonConfig };
      config.methods = { ...config.methods, [cb.dataset.method]: cb.checked };
      setState({ comparisonConfig: config });
      updateStartButton();
    });
  });

  // Wire up radio buttons
  const radios = container.querySelectorAll('input[type="radio"][name="comparisonMode"]');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      const config = { ...getState().comparisonConfig, mode: radio.value };
      setState({ comparisonConfig: config });
      // Update visual selection
      container.querySelectorAll('.radio-label').forEach(label => {
        label.classList.toggle('selected', label.querySelector('input').checked);
      });
    });
  });

  // Start button
  const btnStart = container.querySelector('#btnStartCompare');
  btnStart.addEventListener('click', () => {
    onStartCompare();
  });

  function updateStartButton() {
    const methods = getState().comparisonConfig.methods;
    const anySelected = Object.values(methods).some(Boolean);
    btnStart.disabled = !anySelected;
  }

  updateStartButton();
}
