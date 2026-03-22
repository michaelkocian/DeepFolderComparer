/**
 * Reusable progress bar component.
 * Renders into a container and exposes update methods.
 */

export function createProgressComponent(container) {
  container.innerHTML = `
    <div class="progress-container">
      <div class="progress-header">
        <span class="progress-title"></span>
        <span class="progress-percentage">0%</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width: 0%"></div>
      </div>
      <div class="progress-details">
        <span class="progress-file-count">0 files</span>
        <span class="progress-current-file"></span>
        <span class="progress-elapsed">0s</span>
      </div>
      <div class="progress-comparing-against"></div>
    </div>
  `;

  const titleElement = container.querySelector('.progress-title');
  const percentageElement = container.querySelector('.progress-percentage');
  const fillElement = container.querySelector('.progress-bar-fill');
  const fileCountElement = container.querySelector('.progress-file-count');
  const currentFileElement = container.querySelector('.progress-current-file');
  const elapsedElement = container.querySelector('.progress-elapsed');
  const comparingAgainstElement = container.querySelector('.progress-comparing-against');

  let startTime = Date.now();
  let elapsedTimerId = null;

  function updateElapsed() {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    if (seconds < 60) {
      elapsedElement.textContent = `${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      elapsedElement.textContent = `${minutes}m ${remainingSeconds}s`;
    }
  }

  return {
    start(title) {
      titleElement.textContent = title;
      startTime = Date.now();
      elapsedTimerId = setInterval(updateElapsed, 1000);
    },

    update({ processed, total, currentFile, comparingAgainst }) {
      if (total > 0) {
        const percent = Math.round((processed / total) * 100);
        percentageElement.textContent = `${percent}%`;
        fillElement.style.width = `${percent}%`;
        fillElement.classList.remove('indeterminate');
        fileCountElement.textContent = `${processed.toLocaleString()} / ${total.toLocaleString()} files`;
      } else {
        percentageElement.textContent = '';
        fillElement.classList.add('indeterminate');
        fileCountElement.textContent = processed > 0
          ? `${processed.toLocaleString()} files counted`
          : '';
      }
      if (currentFile !== undefined) {
        currentFileElement.textContent = currentFile;
      }
      if (comparingAgainst !== undefined) {
        comparingAgainstElement.textContent = comparingAgainst
          ? `↔ ${comparingAgainst}`
          : '';
      }
      updateElapsed();
    },

    setIndeterminate(title) {
      titleElement.textContent = title;
      fillElement.classList.add('indeterminate');
      percentageElement.textContent = '';
    },

    finish(title) {
      titleElement.textContent = title || titleElement.textContent;
      percentageElement.textContent = '100%';
      fillElement.style.width = '100%';
      fillElement.classList.remove('indeterminate');
      comparingAgainstElement.textContent = '';
      clearInterval(elapsedTimerId);
      updateElapsed();
    },

    reset() {
      clearInterval(elapsedTimerId);
      percentageElement.textContent = '0%';
      fillElement.style.width = '0%';
      fillElement.classList.remove('indeterminate');
      fileCountElement.textContent = '0 files';
      currentFileElement.textContent = '';
      comparingAgainstElement.textContent = '';
      elapsedElement.textContent = '0s';
    },
  };
}
