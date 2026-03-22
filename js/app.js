/**
 * DeepFolderComp — Main application orchestrator.
 * Two-stage flow: setup (folder select + scan + compare config) → results.
 */

import { getState, setState } from './state.js';
import { renderFolderPicker } from './folderPicker.js';
import { scanDirectory } from './scanner.js';
import { createProgressComponent } from './progress.js';
import { renderComparisonConfig, setConfigLocked } from './comparisonConfig.js';
import { compareFiles, terminateWorker, cancelComparison } from './comparator.js';
import { initLeftPanel, initRightPanel } from './panelView.js';
import { initDragDrop } from './dragDrop.js';
import { showError, showSuccess, showInfo } from './toast.js';
import { icons } from './icons.js';

// ─── Stage elements ───
const stages = {
  setup: document.getElementById('stageSetup'),
  results: document.getElementById('stageResults'),
};

const setupTop = document.getElementById('setupTop');
const setupRight = document.getElementById('setupRight');
const setupBottom = document.getElementById('setupBottom');

// ─── Initialize ───
function init() {
  renderFolderPicker(document.getElementById('folderPickerRoot'), {
    onStartScan: () => runScan(),
  });
}

// ─── Stage visibility ───
function showStage(name) {
  for (const [key, element] of Object.entries(stages)) {
    element.classList.toggle('active', key === name);
  }
}

// ─── Scanning Phase ───
let scanRunning = false;

async function runScan() {
  if (scanRunning) return;
  scanRunning = true;

  // Reveal scan area with animation
  setupTop.classList.add('expanded');
  setupRight.classList.add('visible');

  // Hide comparison config from previous run
  setupBottom.classList.remove('visible');

  const state = getState();
  const scanRoot = document.getElementById('scanProgressRoot');

  scanRoot.innerHTML = `
    <div class="scan-status active">
      <div class="scan-folder-status">
        <span class="scan-folder-label">Source:</span>
        <span class="scan-folder-name scanning" id="scanSourceLabel">${escapeHtml(state.sourceName)}</span>
      </div>
      <div id="scanProgress1"></div>
      <div class="scan-folder-status" style="margin-top:12px">
        <span class="scan-folder-label">Destination:</span>
        <span class="scan-folder-name" id="scanDestLabel">${escapeHtml(state.destName)}</span>
      </div>
      <div id="scanProgress2"></div>
    </div>
  `;

  const progress1 = createProgressComponent(document.getElementById('scanProgress1'));
  const progress2 = createProgressComponent(document.getElementById('scanProgress2'));

  try {
    // Scan source
    progress1.start('Scanning source folder…');
    const sourceFiles = await scanDirectory(state.sourceHandle, (p) => progress1.update(p));
    progress1.finish('Source scan complete');
    document.getElementById('scanSourceLabel').className = 'scan-folder-name completed';
    document.getElementById('scanSourceLabel').textContent = `${state.sourceName} (${sourceFiles.length} files)`;

    // Scan destination
    document.getElementById('scanDestLabel').className = 'scan-folder-name scanning';
    progress2.start('Scanning destination folder…');
    const destFiles = await scanDirectory(state.destHandle, (p) => progress2.update(p));
    progress2.finish('Destination scan complete');
    document.getElementById('scanDestLabel').className = 'scan-folder-name completed';
    document.getElementById('scanDestLabel').textContent = `${state.destName} (${destFiles.length} files)`;

    // Remove scan pulse, show completed state
    scanRoot.querySelector('.scan-status').classList.remove('active');
    scanRoot.querySelector('.scan-status').classList.add('completed');

    setState({ sourceFiles, destFiles });

    showSuccess(`Scanned ${sourceFiles.length + destFiles.length} files total`);

    // Update scan button to "Rescan"
    const btnScan = document.querySelector('#btnStartScan');
    if (btnScan) {
      btnScan.textContent = 'Rescan';
    }

    // Reveal comparison config with animation
    await delay(400);
    setupBottom.classList.add('visible');
    renderComparisonConfig(
      document.getElementById('comparisonConfigRoot'),
      () => runComparison()
    );
  } catch (err) {
    showError(`Scan failed: ${err.message}`);
  } finally {
    scanRunning = false;
  }
}

// ─── Comparison Phase ───
let compareRunning = false;

async function runComparison() {
  if (compareRunning) return;
  compareRunning = true;

  const state = getState();
  const configRoot = document.getElementById('comparisonConfigRoot');
  const progressRoot = configRoot.querySelector('#compareProgressRoot');

  // Build progress area with cancel button
  progressRoot.style.display = 'block';
  progressRoot.innerHTML = `
    <div class="compare-progress-row">
      <div class="compare-progress-inner"></div>
      <button class="btn-icon cancel-compare-btn" title="Cancel comparison">${icons.close}</button>
    </div>
  `;

  const progressInner = progressRoot.querySelector('.compare-progress-inner');
  progressRoot.querySelector('.cancel-compare-btn')
    .addEventListener('click', () => cancelComparison());

  // Disable the start button
  const btnStart = configRoot.querySelector('#btnStartCompare');
  btnStart.disabled = true;
  btnStart.textContent = 'Comparing…';

  // Lock config inputs during comparison
  setConfigLocked(true);

  const progress = createProgressComponent(progressInner);
  progress.start('Comparing files…');

  try {
    const missingFiles = await compareFiles(
      state.sourceFiles,
      state.destFiles,
      state.comparisonConfig,
      (p) => progress.update(p)
    );

    progress.finish('Comparison complete');
    terminateWorker();

    setState({ missingFiles });

    if (missingFiles.length === 0) {
      showSuccess('All files are present in the destination! Nothing is missing.');
      btnStart.disabled = false;
      btnStart.textContent = 'Start Comparing';
      progressRoot.style.display = 'none';
      setConfigLocked(false);
      return;
    }

    showInfo(`Found ${missingFiles.length} missing file(s) in destination`);

    await delay(600);
    showStage('results');
    initResultsView();
  } catch (err) {
    terminateWorker();
    if (err.message === 'Comparison cancelled') {
      showInfo('Comparison cancelled');
    } else {
      showError(`Comparison failed: ${err.message}`);
    }
    btnStart.disabled = false;
    btnStart.textContent = 'Start Comparing';
    progressRoot.style.display = 'none';
    setConfigLocked(false);
  } finally {
    compareRunning = false;
  }
}

// ─── Results View ───
function initResultsView() {
  const state = getState();

  // Simplified toolbar (zoom moved to panel headers)
  renderToolbar(state);

  // Init panels
  const leftPanel = initLeftPanel(state.missingFiles, state.sourceFiles);
  const rightPanel = initRightPanel(state.destFiles, state.destHandle);

  // Init drag-and-drop
  initDragDrop(leftPanel, rightPanel);

  // Init panel divider resize
  initPanelDivider();

  // Store refs for drag-drop
  window._deepFolderComp = { leftPanel, rightPanel };
}

function renderToolbar(state) {
  const toolbar = document.getElementById('resultsToolbar');

  toolbar.innerHTML = `
    <div class="toolbar-left">
      <button class="btn btn-secondary btn-sm" id="btnBackToSetup">${icons.back} Back</button>
      <span class="results-summary">
        <strong>${state.missingFiles.length}</strong> missing files from
        <strong>${state.sourceName}</strong>
      </span>
    </div>
  `;

  // Back button
  toolbar.querySelector('#btnBackToSetup').addEventListener('click', () => {
    showStage('setup');
    // Re-render comparison config so the button and progress are reset
    renderComparisonConfig(
      document.getElementById('comparisonConfigRoot'),
      () => runComparison()
    );
  });
}

// ─── Panel Divider Resize ───
function initPanelDivider() {
  const divider = document.getElementById('panelDivider');
  const panelLeft = document.getElementById('panelLeft');
  const panelRight = document.getElementById('panelRight');
  const splitLayout = document.getElementById('splitLayout');

  let isDragging = false;

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = splitLayout.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const totalWidth = rect.width;
    const leftPercent = Math.max(20, Math.min(80, (offsetX / totalWidth) * 100));

    panelLeft.style.flex = `0 0 ${leftPercent}%`;
    panelRight.style.flex = `0 0 ${100 - leftPercent}%`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      divider.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// ─── Utilities ───
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Start ───
init();
