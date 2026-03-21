/**
 * Toast notification system.
 * Provides success, error, warning, info toasts with auto-dismiss.
 */

import { icons } from './icons.js';

const TOAST_DURATION = 4000;
const container = document.getElementById('toastContainer');

const iconMap = {
  success: icons.success,
  error: icons.error,
  warning: icons.warning,
  info: icons.info,
};

function createToast(type, message) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type]}</span>
    <div class="toast-content">
      <span class="toast-message">${escapeHtml(message)}</span>
    </div>
    <button class="toast-close" aria-label="Dismiss">${icons.close}</button>
  `;

  const closeButton = toast.querySelector('.toast-close');
  closeButton.addEventListener('click', () => dismissToast(toast));

  container.appendChild(toast);

  const timerId = setTimeout(() => dismissToast(toast), TOAST_DURATION);
  toast._timerId = timerId;

  return toast;
}

function dismissToast(toast) {
  if (toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._timerId);
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove());
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function showSuccess(message) {
  return createToast('success', message);
}

export function showError(message) {
  return createToast('error', message);
}

export function showWarning(message) {
  return createToast('warning', message);
}

export function showInfo(message) {
  return createToast('info', message);
}
