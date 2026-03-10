const CACHE_NAME = 'receipt-renamer-v2';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ─── IndexedDB helper (works in SW context) ─────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rr-sw-queue', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllTasks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readonly');
    const store = tx.objectStore('tasks');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function putTask(task) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    store.put(task);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteTask(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Background processing ──────────────────────────────────────────────────

let _accessToken = null;

async function uploadToDrive(task) {
  if (!_accessToken) throw new Error('No access token');
  
  const metadata = { name: task.fileName, parents: [task.folderId] };
  const boundary = 'rr_sw_boundary';
  const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaPart = `--${boundary}\r\nContent-Type: ${task.mimeType}\r\n\r\n`;
  const closePart = `\r\n--${boundary}--`;

  // Convert base64 back to blob
  const byteStr = atob(task.base64Data);
  const bytes = new Uint8Array(byteStr.length);
  for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
  const fileBlob = new Blob([bytes], { type: task.mimeType });

  const body = new Blob([metaPart, mediaPart, fileBlob, closePart]);

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${_accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json();
}

async function runAIRecognition(fileId, mimeType, proxyUrl, uid) {
  if (!_accessToken) throw new Error('No access token');

  // Download file from Drive
  const dlRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${_accessToken}` } }
  );
  if (!dlRes.ok) throw new Error(`Download failed (${dlRes.status})`);
  const buffer = await dlRes.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);

  // Call AI proxy
  const mt = mimeType.includes('pdf') ? 'application/pdf'
    : mimeType.includes('png') ? 'image/png' : 'image/jpeg';
  const ft = mimeType.includes('pdf') ? 'pdf' : 'image';

  const aiRes = await fetch(`${proxyUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, base64, mediaType: mt, fileType: ft }),
  });
  if (!aiRes.ok) throw new Error(`AI failed (${aiRes.status})`);
  const data = await aiRes.json();
  const { _quota, ...receiptData } = data;
  return receiptData;
}

async function processTask(task) {
  try {
    // Update task status
    task.status = 'processing';
    await putTask(task);
    notifyClients({ type: 'task-update', task: { id: task.id, status: 'processing' } });

    let fileId = task.driveFileId;

    // Step 1: Upload if needed
    if (task.step === 'upload' && task.base64Data) {
      const uploaded = await uploadToDrive(task);
      fileId = uploaded.id;
      task.driveFileId = fileId;
      task.step = 'ai';
      task.base64Data = null; // Free memory
      await putTask(task);
      notifyClients({ type: 'task-update', task: { id: task.id, status: 'uploaded', driveFileId: fileId } });
    }

    // Step 2: AI recognition
    if (task.step === 'ai' && fileId) {
      const result = await runAIRecognition(fileId, task.mimeType, task.proxyUrl, task.uid);
      task.step = 'done';
      task.status = 'done';
      task.result = result;
      await putTask(task);
      notifyClients({ type: 'task-done', task: { id: task.id, driveFileId: fileId, result } });
    }

    // Clean up completed task after notifying
    await deleteTask(task.id);
  } catch (e) {
    task.status = 'error';
    task.error = e.message;
    task.retries = (task.retries || 0) + 1;
    if (task.retries >= 3) {
      task.status = 'failed';
    }
    await putTask(task);
    notifyClients({ type: 'task-error', task: { id: task.id, error: e.message, retries: task.retries } });
  }
}

async function processAllTasks() {
  const tasks = await getAllTasks();
  const pending = tasks.filter(t => t.status !== 'done' && t.status !== 'failed');
  
  for (const task of pending) {
    await processTask(task);
    // Small delay between tasks
    await new Promise(r => setTimeout(r, 500));
  }
}

function notifyClients(msg) {
  self.clients.matchAll().then(clients => {
    clients.forEach(c => c.postMessage(msg));
  });
}

// ─── Install & Activate ─────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch (SECURITY: only cache same-origin static assets) ─────────────────

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // SECURITY: Only cache same-origin requests (our own static assets)
  if (url.origin !== self.location.origin) return;

  // Don't cache API-like paths or dynamic content
  if (url.pathname.startsWith('/api/')) return;

  // Only cache static assets: HTML, JS, CSS, images, fonts, manifest
  const ext = url.pathname.split('.').pop()?.toLowerCase();
  const staticExts = ['html', 'js', 'css', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'woff', 'woff2', 'json'];
  if (ext && !staticExts.includes(ext) && url.pathname !== '/') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ─── Message handler (from main thread) ─────────────────────────────────────

self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  if (type === 'set-token') {
    _accessToken = data.token;
  }

  if (type === 'enqueue-task') {
    putTask(data.task).then(() => {
      // Try to process immediately
      processAllTasks();
    });
  }

  if (type === 'process-all') {
    processAllTasks();
  }

  if (type === 'get-status') {
    getAllTasks().then(tasks => {
      event.source.postMessage({ type: 'queue-status', tasks });
    });
  }
});

// ─── Background Sync (Android Chrome) ──────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'rr-process-queue') {
    event.waitUntil(processAllTasks());
  }
});
