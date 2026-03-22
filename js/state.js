/**
 * Centralized application state.
 * Simple observable store — modules import and subscribe to changes.
 */

const listeners = new Set();

const state = {
  /** @type {'select' | 'scan' | 'compare' | 'results'} */
  currentStage: 'select',

  /** @type {FileSystemDirectoryHandle | null} */
  sourceHandle: null,
  /** @type {FileSystemDirectoryHandle | null} */
  destHandle: null,

  /** @type {string} */
  sourceName: '',
  /** @type {string} */
  destName: '',

  /** @type {import('./fileInfo.js').FileInfo[]} */
  sourceFiles: [],
  /** @type {import('./fileInfo.js').FileInfo[]} */
  destFiles: [],

  /** @type {Object} comparison configuration */
  comparisonConfig: {
    methods: {
      nameCompare: false,
      pathCompare: false,
      sizeCompare: true,
      dateCompare: false,
      extensionCompare: false,
      chunkProbe: true,
      hashCompare: false,
      fullByteCompare: false,
    },
    /** @type {'folderByFolder' | 'deepScan'} */
    mode: 'deepScan',
  },

  /** @type {import('./fileInfo.js').FileInfo[]} */
  missingFiles: [],

  /** Left panel: currently selected folder path in tree */
  leftSelectedPath: '',
  /** Right panel: currently selected folder path in tree */
  rightSelectedPath: '',

  /** Zoom level: items per row (1–10) */
  zoomLeft: 5,
  zoomRight: 5,

  /** @type {Set<string>} selected file paths for multi-drag */
  selectedFiles: new Set(),
};

export function getState() {
  return state;
}

export function setState(partial) {
  Object.assign(state, partial);
  notifyListeners();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.error('State listener error:', err);
    }
  }
}
