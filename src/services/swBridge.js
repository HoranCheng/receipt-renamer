/**
 * Service Worker bridge — communicates with sw.js for background processing.
 * Sends tasks to SW, receives progress updates.
 */

let _onTaskUpdate = null;
let _onTaskDone = null;
let _onTaskError = null;

/** Register callbacks for SW messages */
export function onSWMessage({ onTaskUpdate, onTaskDone, onTaskError }) {
  _onTaskUpdate = onTaskUpdate;
  _onTaskDone = onTaskDone;
  _onTaskError = onTaskError;
}

// Listen for messages from SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, task } = event.data || {};
    if (type === 'task-update') _onTaskUpdate?.(task);
    if (type === 'task-done') _onTaskDone?.(task);
    if (type === 'task-error') _onTaskError?.(task);
  });
}

/** Send the current access token to the SW so it can make API calls */
export function sendTokenToSW(token) {
  navigator.serviceWorker?.controller?.postMessage({
    type: 'set-token',
    data: { token },
  });
}

/**
 * Enqueue a file for background upload + AI processing.
 * @param {object} task - { id, fileName, mimeType, base64Data, folderId, proxyUrl, uid, step: 'upload'|'ai' }
 */
export function enqueueToSW(task) {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) {
    console.warn('No active SW — falling back to main thread processing');
    return false;
  }
  sw.postMessage({ type: 'enqueue-task', data: { task } });

  // Also register Background Sync if available
  navigator.serviceWorker?.ready?.then(reg => {
    if (reg.sync) {
      reg.sync.register('rr-process-queue').catch(() => {});
    }
  });

  return true;
}

/** Tell SW to process any pending tasks (e.g. on visibility change) */
export function resumeSWProcessing() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'process-all' });
}

/** Check if SW-based background processing is available */
export function isSWAvailable() {
  return !!navigator.serviceWorker?.controller;
}
