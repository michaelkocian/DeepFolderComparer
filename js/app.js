/**
 * DeepFolderComp — Main application orchestrator.
 * Manages stage transitions: select → scan → compare → results.
 */

import { getState, setState, subscribe } from './state.js';
import { renderFolderPicker } from './folderPicker.js';
import { scanDirectory } from './scanner.js';
import { createProgressComponent } from './progress.js';
import { renderComparisonConfig } from './comparisonConfig.js';
import { compareFiles, terminateWorker } from './comparator.js';
import { initLeftPanel, initRightPanel } from './panelView.js';
import { initDragDrop } from './dragDrop.js';
import { showError, showSuccess, showInfo } from './toast.js';
import { icons } from './icons.js';

// ─── Stage elements ───
const stages = {
  select: document.getElementById('stageSelect'),
  scan: document.getElementById('stageScan'),
  compare: document.getElementById('stageCompare'),
  results: document.getElementById('stageResults'),
};

const headerControls = document.getElementById('headerControls');

// ─── Initialize ───
function init() {
  renderFolderPicker(document.getElementById('folderPickerRoot'));

  subscribe((state) => {
    updateStageVisibility(state.currentStage);
  });

  subscribe((state) => {
    if (state.currentStage === 'scan') {
      runScan();
    }
  });
}

// ─── Stage visibility ───
function updateStageVisibility(activeStage) {
  for (const [name, element] of Object.entries(stages)) {
    element.classList.toggle('active', name === activeStage);
  }
}

// ─── Scanning Phase ───
let scanRunning = false;

async function runScan() {
  if (scanRunning) return;
  scanRunning = true;

  const state = getState();
  const scanRoot = document.getElementById('scanProgressRoot');

  scanRoot.innerHTML = `
    <div class="scan-status">
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

    setState({ sourceFiles, destFiles });

    showSuccess(`Scanned ${sourceFiles.length + destFiles.length} files total`);

    // Auto-advance to comparison config after a short pause
    await delay(800);
    setState({ currentStage: 'compare' });
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
  progressRoot.style.display = 'block';

  // Disable the start button
  const btnStart = configRoot.querySelector('#btnStartCompare');
  btnStart.disabled = true;
  btnStart.textContent = 'Comparing…';

  const progress = createProgressComponent(progressRoot);
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
      compareRunning = false;
      return;
    }

    showInfo(`Found ${missingFiles.length} missing file(s) in destination`);

    await delay(800);
    setState({ currentStage: 'results' });
    initResultsView();
  } catch (err) {
    showError(`Comparison failed: ${err.message}`);
    btnStart.disabled = false;
    btnStart.textContent = 'Start Comparing';
    progressRoot.style.display = 'none';
  } finally {
    compareRunning = false;
  }
}

// ─── Results View ───
function initResultsView() {
  const state = getState();

  // Toolbar
  renderToolbar(state);

  // Init panels
  const leftPanel = initLeftPanel(state.missingFiles);
  const rightPanel = initRightPanel(state.destFiles, state.destHandle);

  // Init drag-and-drop
  initDragDrop(leftPanel, rightPanel);

  // Init panel divider resize
  initPanelDivider(leftPanel, rightPanel);

  // Store refs for zoom controls
  window._deepFolderComp = { leftPanel, rightPanel };
}

function renderToolbar(state) {
  const toolbar = document.getElementById('resultsToolbar');

  toolbar.innerHTML = `
    <div class="toolbar-left">
      <button class="btn btn-secondary btn-sm" id="btnBackToCompare">${icons.back} Back</button>
      <span class="results-summary">
        <strong>${state.missingFiles.length}</strong> missing files from
        <strong>${state.sourceName}</strong>
      </span>
    </div>
    <div class="toolbar-right">
      <div class="zoom-control">
        <label>Left zoom:</label>
        <input type="range" min="1" max="10" value="${state.zoomLeft}" id="zoomSliderLeft">
        <span class="zoom-value" id="zoomValueLeft">${state.zoomLeft}</span>
      </div>
      <div class="zoom-control">
        <label>Right zoom:</label>
        <input type="range" min="1" max="10" value="${state.zoomRight}" id="zoomSliderRight">
        <span class="zoom-value" id="zoomValueRight">${state.zoomRight}</span>
      </div>
    </div>
  `;

  // Back button
  toolbar.querySelector('#btnBackToCompare').addEventListener('click', () => {
    setState({ currentStage: 'compare' });
    renderComparisonConfig(
      document.getElementById('comparisonConfigRoot'),
      () => runComparison()
    );
  });

  // Zoom sliders
  toolbar.querySelector('#zoomSliderLeft').addEventListener('input', (e) => {
    const zoom = parseInt(e.target.value, 10);
    toolbar.querySelector('#zoomValueLeft').textContent = zoom;
    if (window._deepFolderComp) window._deepFolderComp.leftPanel.setZoom(zoom);
  });

  toolbar.querySelector('#zoomSliderRight').addEventListener('input', (e) => {
    const zoom = parseInt(e.target.value, 10);
    toolbar.querySelector('#zoomValueRight').textContent = zoom;
    if (window._deepFolderComp) window._deepFolderComp.rightPanel.setZoom(zoom);
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
