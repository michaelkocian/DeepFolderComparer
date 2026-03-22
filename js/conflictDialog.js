/**
 * Conflict dialog — shows a popup when a destination file already exists.
 * Returns the user's choice: "overwrite", "rename", or "cancel".
 */

const DIALOG_ID = 'conflict-dialog';

/** @returns {Promise<"overwrite"|"rename"|"cancel">} */
export function showConflictDialog(fileName) {
  return new Promise((resolve) => {
    removeExisting();

    const backdrop = document.createElement('div');
    backdrop.id = DIALOG_ID;
    backdrop.className = 'conflict-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'conflict-dialog';

    dialog.innerHTML = `
      <div class="conflict-header">File already exists</div>
      <div class="conflict-body">
        <span class="conflict-filename">"${escapeHtml(fileName)}"</span> already exists in the destination folder.
      </div>
      <div class="conflict-actions">
        <button class="conflict-btn conflict-btn--cancel" data-action="cancel">Cancel</button>
        <button class="conflict-btn conflict-btn--rename" data-action="rename">Rename (add number)</button>
        <button class="conflict-btn conflict-btn--overwrite" data-action="overwrite">Overwrite</button>
      </div>
    `;

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // Focus the cancel button as a safe default
    dialog.querySelector('[data-action="cancel"]').focus();

    const cleanup = (action) => {
      backdrop.remove();
      resolve(action);
    };

    dialog.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) cleanup(action);
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup('cancel');
    });

    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        cleanup('cancel');
      }
    });
  });
}

function removeExisting() {
  document.getElementById(DIALOG_ID)?.remove();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
