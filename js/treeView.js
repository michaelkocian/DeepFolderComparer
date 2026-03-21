/**
 * Collapsible folder tree component.
 * Builds a tree from a flat file list, supports expand/collapse, selection.
 * Right panel tree supports "New Folder" creation on disk.
 */

import { icons } from './icons.js';

/**
 * Build a tree structure from a flat list of file info objects.
 * @param {import('./fileInfo.js').FileInfo[]} files
 * @returns {object} tree root { name, children: Map<string, node>, files: FileInfo[], fileCount }
 */
export function buildFolderTree(files) {
  const root = { name: '', path: '', children: new Map(), files: [], fileCount: 0 };

  for (const file of files) {
    const parts = file.relativePath.split('/');
    let current = root;

    // Walk/create folder nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      if (!current.children.has(folderName)) {
        const folderPath = parts.slice(0, i + 1).join('/');
        current.children.set(folderName, {
          name: folderName,
          path: folderPath,
          children: new Map(),
          files: [],
          fileCount: 0,
        });
      }
      current = current.children.get(folderName);
    }

    current.files.push(file);
  }

  // Compute fileCount recursively
  computeFileCount(root);
  return root;
}

function computeFileCount(node) {
  node.fileCount = node.files.length;
  for (const child of node.children.values()) {
    computeFileCount(child);
    node.fileCount += child.fileCount;
  }
}

/**
 * Render a tree into a container element.
 * @param {HTMLElement} container
 * @param {object} tree - root node from buildFolderTree
 * @param {function} onSelectFolder - callback(path)
 * @param {string} selectedPath - currently selected folder path
 * @param {object} options - { allowNewFolder, directoryHandle }
 */
export function renderTree(container, tree, onSelectFolder, selectedPath, options = {}) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'tree-sidebar-header';
  header.innerHTML = `<span class="tree-title">Folders</span>`;

  if (options.allowNewFolder) {
    const addButton = document.createElement('button');
    addButton.className = 'btn-icon';
    addButton.title = 'New Folder';
    addButton.innerHTML = icons.add;
    addButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (options.onNewFolder) {
        options.onNewFolder(selectedPath);
      }
    });
    header.appendChild(addButton);
  }

  container.appendChild(header);

  const treeListContainer = document.createElement('div');
  treeListContainer.className = 'scrollable';
  treeListContainer.style.flex = '1';
  container.appendChild(treeListContainer);

  const rootList = document.createElement('ul');
  rootList.className = 'tree-list';

  // Root item
  const rootItem = createTreeItem(tree, '(root)', onSelectFolder, selectedPath === '', options);
  rootList.appendChild(rootItem);

  // Sort children alphabetically
  const sortedChildren = [...tree.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, child] of sortedChildren) {
    renderTreeNode(rootList, child, onSelectFolder, selectedPath, options);
  }

  treeListContainer.appendChild(rootList);
}

function renderTreeNode(parentList, node, onSelectFolder, selectedPath, options) {
  const item = createTreeItem(node, node.name, onSelectFolder, selectedPath === node.path, options);
  parentList.appendChild(item);

  if (node.children.size > 0) {
    const childList = document.createElement('ul');
    childList.className = 'tree-list tree-children';

    const sortedChildren = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, child] of sortedChildren) {
      renderTreeNode(childList, child, onSelectFolder, selectedPath, options);
    }

    item.appendChild(childList);
  }
}

function createTreeItem(node, displayName, onSelectFolder, isSelected, options) {
  const li = document.createElement('li');
  li.className = 'tree-item';
  if (isSelected) li.classList.add('expanded');

  const row = document.createElement('div');
  row.className = 'tree-item-row';
  if (isSelected) row.classList.add('selected');
  row.dataset.folderPath = node.path;

  const hasChildren = node.children.size > 0;

  const expandIcon = document.createElement('span');
  expandIcon.className = `tree-expand ${hasChildren ? '' : 'empty'}`;
  expandIcon.innerHTML = icons.chevronRight;

  const folderIcon = document.createElement('span');
  folderIcon.className = 'tree-folder-icon';
  folderIcon.innerHTML = icons.folder;

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = displayName;

  const badge = document.createElement('span');
  badge.className = 'tree-badge';
  badge.textContent = node.fileCount;

  row.appendChild(expandIcon);
  row.appendChild(folderIcon);
  row.appendChild(label);
  row.appendChild(badge);

  // Click to select
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectFolder(node.path);
  });

  // Click expand chevron to toggle
  expandIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hasChildren) {
      li.classList.toggle('expanded');
      expandIcon.classList.toggle('expanded');
    }
    onSelectFolder(node.path);
  });

  // Double-click to expand
  row.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (hasChildren) {
      li.classList.toggle('expanded');
      expandIcon.classList.toggle('expanded');
    }
  });

  li.appendChild(row);

  // If this node's path is a prefix of selectedPath, auto-expand
  if (!isSelected && options._selectedPath && options._selectedPath.startsWith(node.path + '/')) {
    li.classList.add('expanded');
    expandIcon.classList.add('expanded');
  }

  return li;
}

/**
 * Get all files recursively under a given folder path.
 * @param {object} tree - root node
 * @param {string} folderPath - '' for root, or 'folder/subfolder'
 * @returns {import('./fileInfo.js').FileInfo[]}
 */
export function getAllFilesUnderPath(tree, folderPath) {
  const node = folderPath === '' ? tree : getNodeAtPath(tree, folderPath);
  if (!node) return [];
  const files = [];
  collectAllFiles(node, files);
  return files;
}

function collectAllFiles(node, files) {
  files.push(...node.files);
  for (const child of node.children.values()) {
    collectAllFiles(child, files);
  }
}

/**
 * Get files for a given folder path from the tree.
 * @param {object} tree - root node
 * @param {string} folderPath - '' for root, or 'folder/subfolder'
 * @returns {import('./fileInfo.js').FileInfo[]}
 */
export function getFilesAtPath(tree, folderPath) {
  if (folderPath === '') return tree.files;

  const parts = folderPath.split('/');
  let current = tree;

  for (const part of parts) {
    if (current.children.has(part)) {
      current = current.children.get(part);
    } else {
      return [];
    }
  }

  return current.files;
}

/**
 * Get a tree node at the given path.
 */
export function getNodeAtPath(tree, folderPath) {
  if (folderPath === '') return tree;

  const parts = folderPath.split('/');
  let current = tree;

  for (const part of parts) {
    if (current.children.has(part)) {
      current = current.children.get(part);
    } else {
      return null;
    }
  }

  return current;
}
