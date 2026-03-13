import { SCOPES } from '../constants';

const ROOT_FOLDER_NAME = 'Receipt Renamer';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4';

let gapiLoaded = false;
let tokenClient = null;
let _cachedRootFolderId = null;

// Escape single quotes for Drive API query strings
function escQ(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ─── Script loader ────────────────────────────────────────────────────────────

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Init & Auth ──────────────────────────────────────────────────────────────

export async function initGoogleAPI(clientId) {
  await loadScript('https://apis.google.com/js/api.js');
  await loadScript('https://accounts.google.com/gsi/client');

  await new Promise((resolve, reject) => {
    window.gapi.load('client', { callback: resolve, onerror: reject });
  });
  await window.gapi.client.init({});
  gapiLoaded = true;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {},
  });
}

export function isGapiLoaded() {
  return gapiLoaded;
}

export function getAccessToken() {
  return getToken();
}

// ─── Session persistence ──────────────────────────────────────────────────────
// Survives tab refresh (sessionStorage) and optionally browser restarts (localStorage)

const SESSION_KEY = 'rr-gapi-session';
const PERSIST_KEY  = 'rr-gapi-persistent';

/**
 * Save the current gapi token to storage.
 * persistent=true → also saves to localStorage (survives browser close).
 */
export function saveSession(persistent = false) {
  try {
    const token = window.gapi?.client?.getToken();
    if (!token) return;
    const expiresAt = Date.now() + 3540_000; // 59 min (1 min buffer)
    const payload = JSON.stringify({ token, expiresAt });
    sessionStorage.setItem(SESSION_KEY, payload);
    if (persistent) {
      localStorage.setItem(PERSIST_KEY, payload);
    } else {
      localStorage.removeItem(PERSIST_KEY);
    }
  } catch {}
}

/**
 * Try to restore a saved session from storage.
 * Returns true if a valid (non-expired) token was restored.
 */
export function tryRestoreSession() {
  try {
    // sessionStorage first (same tab), then localStorage (persistent)
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(PERSIST_KEY);
    if (!raw) return false;
    const { token, expiresAt } = JSON.parse(raw);
    if (Date.now() >= expiresAt - 60_000) {
      // Expired — clean up stale entry
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(PERSIST_KEY);
      return false;
    }
    window.gapi.client.setToken(token);
    return true;
  } catch {
    return false;
  }
}

/** Clear all stored sessions (called on sign out) */
export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PERSIST_KEY);
  } catch {}
}

export function signOut() {
  const token = window.gapi?.client?.getToken();
  if (token?.access_token) {
    window.google?.accounts?.oauth2?.revoke(token.access_token, () => {});
    window.gapi.client.setToken(null);
  }
  clearSession();
  clearFolderCache();
  gapiLoaded = false;
  tokenClient = null;
  _cachedRootFolderId = null;
}

/**
 * Request an OAuth access token.
 * options.prompt   — '' for silent, 'consent' for full UI (default)
 * options.loginHint — user email to skip account picker on silent refresh
 * options.persistent — save to localStorage (remember me across browser close)
 */
export function requestAccessToken(options = {}) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('Google not initialized'));
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(resp);
      } else {
        // Persist token to storage immediately after successful auth
        saveSession(options.persistent ?? false);
        resolve(resp);
      }
    };
    const req = { prompt: options.prompt ?? 'consent' };
    if (options.loginHint) req.login_hint = options.loginHint;
    tokenClient.requestAccessToken(req);
  });
}

// ─── REST helpers ─────────────────────────────────────────────────────────────

function getToken() {
  return window.gapi?.client?.getToken()?.access_token;
}

function _clearToken() {
  try { window.gapi?.client?.setToken(null); } catch {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

/** Fetch the signed-in user's Google profile (name, email, picture) */
export async function fetchUserProfile() {
  const token = await ensureToken();
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('无法获取 Google 账号信息');
  return res.json(); // { name, email, picture, sub, ... }
}

async function ensureToken() {
  const t = getToken();
  if (t) return t;
  // Token missing or expired — try to restore from sessionStorage/localStorage first
  if (tryRestoreSession()) return getToken();
  // Fall back to silent GIS refresh (uses Google session cookie, no UI if already consented)
  try {
    await requestAccessToken({ prompt: '', loginHint: _loginHint });
  } catch {
    throw new Error('登录已过期，请重新登录');
  }
  const t2 = getToken();
  if (!t2) throw new Error('登录已过期，请重新登录');
  return t2;
}

// Hint for silent refresh — set after profile fetch
let _loginHint = '';
export function setLoginHint(email) { _loginHint = email || ''; }

async function driveReq(method, path, { params, body, responseType } = {}) {
  const token = await ensureToken();

  let url = `${DRIVE_API}${path}`;
  if (params) {
    const q = new URLSearchParams(params);
    url += '?' + q.toString();
  }

  const headers = { Authorization: `Bearer ${token}` };
  if (body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? (body instanceof Blob || body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401) {
    // Token expired — try to refresh and retry once
    console.info('Token expired, attempting silent refresh...');
    _clearToken();
    try {
      const freshToken = await ensureToken();
      headers.Authorization = `Bearer ${freshToken}`;
      const retryRes = await fetch(url, {
        method,
        headers,
        body: body ? (body instanceof Blob || body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      });
      if (retryRes.ok) {
        if (responseType === 'arrayBuffer') return retryRes.arrayBuffer();
        if (responseType === 'blob') return retryRes.blob();
        if (retryRes.status === 204) return null;
        return retryRes.json();
      }
      const retryErr = await retryRes.json().catch(() => ({}));
      throw new Error(retryErr.error?.message || `Drive API error after re-auth (${retryRes.status})`);
    } catch (refreshErr) {
      throw new Error('登录已过期，请重新登录。' + (refreshErr.message || ''));
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Drive API error (${res.status})`);
  }

  if (responseType === 'arrayBuffer') return res.arrayBuffer();
  if (responseType === 'blob') return res.blob();
  if (res.status === 204) return null;
  return res.json();
}

// ─── Root folder (Receipt Renamer) ────────────────────────────────────────────

async function getOrCreateRootFolder() {
  if (_cachedRootFolderId) return _cachedRootFolderId;
  // Search for ALL matching root folders (not just first) to detect duplicates
  const data = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(ROOT_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
      fields: 'files(id,createdTime)',
      pageSize: 10,
    },
  });
  if (data.files?.length) {
    // Use the oldest one as canonical; schedule dedup for extras
    const sorted = data.files.sort((a, b) => (a.createdTime || '').localeCompare(b.createdTime || ''));
    _cachedRootFolderId = sorted[0].id;
    if (sorted.length > 1) {
      // Merge duplicates in background
      _mergeDuplicateRootFolders(sorted[0].id, sorted.slice(1).map(f => f.id)).catch(e =>
        console.warn('Root folder dedup failed:', e)
      );
    }
    return _cachedRootFolderId;
  }
  const created = await driveReq('POST', '/files', {
    body: { name: ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    params: { fields: 'id' },
  });
  _cachedRootFolderId = created.id;
  return _cachedRootFolderId;
}

/**
 * Move all children from duplicate root folders into the canonical one, then trash duplicates.
 */
async function _mergeDuplicateRootFolders(canonicalId, duplicateIds) {
  for (const dupId of duplicateIds) {
    // List all files in the duplicate folder
    const children = await driveReq('GET', '/files', {
      params: {
        q: `'${dupId}' in parents and trashed=false`,
        fields: 'files(id,name)',
        pageSize: 100,
      },
    });
    // Move each child to canonical folder
    for (const child of (children.files || [])) {
      await driveReq('PATCH', `/files/${child.id}`, {
        body: {},
        params: { addParents: canonicalId, removeParents: dupId, fields: 'id' },
      });
    }
    // Trash the now-empty duplicate
    await driveReq('PATCH', `/files/${dupId}`, {
      body: { trashed: true },
    });
    console.info(`Merged duplicate root folder ${dupId} into ${canonicalId}`);
  }
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

/**
 * Rename an existing subfolder under Receipt Renamer root.
 * If the folder with `oldName` doesn't exist yet (never created), returns null
 * and the caller should just update the config name — it'll be created fresh.
 */
/** Fetch the full-size image from Drive as a blob URL (for lightbox preview) */
export async function getFileAsBlobUrl(fileId) {
  const token = await ensureToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Fetch a Drive file's thumbnail URL (Drive generates this for images; may be null for fresh uploads) */
export async function getFileThumbnailUrl(fileId) {
  try {
    const data = await driveReq('GET', `/files/${fileId}`, {
      params: { fields: 'thumbnailLink,mimeType' },
    });
    return data.thumbnailLink || null;
  } catch {
    return null;
  }
}

/**
 * Rename a subfolder under Receipt Renamer root.
 * If the folder with oldName doesn't exist, also checks if newName already exists
 * (user may have renamed it manually in Drive). Returns folderId or null.
 */
export async function renameSubFolder(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return null;
  const rootId = await getOrCreateRootFolder();

  // First try to find by old name
  const data = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(oldName)}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: '1',
    },
  });

  if (data.files?.length) {
    // Found by old name — rename it
    const folderId = data.files[0].id;
    await driveReq('PATCH', `/files/${folderId}`, {
      body: { name: newName },
      params: { fields: 'id,name' },
    });
    return folderId;
  }

  // Old name not found — check if newName already exists (user renamed in Drive manually)
  const existing = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(newName)}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: '1',
    },
  });
  if (existing.files?.length) {
    // Already exists with the new name — no action needed
    return existing.files[0].id;
  }

  return null; // neither found — will be created fresh on next findOrCreateFolder call
}

// In-memory folder ID cache: name → id (cleared on sign-out)
const _folderIdCache = {};

export function clearFolderCache() {
  Object.keys(_folderIdCache).forEach(k => delete _folderIdCache[k]);
}

export async function findOrCreateFolder(name) {
  // Check in-memory cache first
  if (_folderIdCache[name]) {
    // Verify it still exists (cheap HEAD-like check)
    try {
      await driveReq('GET', `/files/${_folderIdCache[name]}`, {
        params: { fields: 'id,trashed' },
      });
      return _folderIdCache[name];
    } catch {
      // Cached ID invalid — fall through to search
      delete _folderIdCache[name];
    }
  }

  const rootId = await getOrCreateRootFolder();
  // Search for ALL matching folders to detect duplicates
  const data = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(name)}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,createdTime)',
      pageSize: 10,
    },
  });
  if (data.files?.length) {
    // Use oldest as canonical; merge duplicates in background
    const sorted = data.files.sort((a, b) => (a.createdTime || '').localeCompare(b.createdTime || ''));
    const canonicalId = sorted[0].id;
    _folderIdCache[name] = canonicalId;
    if (sorted.length > 1) {
      _mergeDuplicateFolders(canonicalId, sorted.slice(1).map(f => f.id)).catch(e =>
        console.warn(`Subfolder dedup for "${name}" failed:`, e)
      );
    }
    return canonicalId;
  }
  const created = await driveReq('POST', '/files', {
    body: { name, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] },
    params: { fields: 'id' },
  });
  _folderIdCache[name] = created.id;
  return created.id;
}

/**
 * Merge duplicate subfolders: move children into canonical, trash duplicates.
 */
async function _mergeDuplicateFolders(canonicalId, duplicateIds) {
  for (const dupId of duplicateIds) {
    const children = await driveReq('GET', '/files', {
      params: {
        q: `'${dupId}' in parents and trashed=false`,
        fields: 'files(id)',
        pageSize: 200,
      },
    });
    for (const child of (children.files || [])) {
      await driveReq('PATCH', `/files/${child.id}`, {
        body: {},
        params: { addParents: canonicalId, removeParents: dupId, fields: 'id' },
      });
    }
    await driveReq('PATCH', `/files/${dupId}`, { body: { trashed: true } });
    console.info(`Merged duplicate subfolder ${dupId} into ${canonicalId}`);
  }
}

/**
 * Manually trigger dedup for all known folders.
 * Called once after login to clean up any existing duplicates.
 */
export async function deduplicateFolders() {
  try {
    await getOrCreateRootFolder(); // This already handles root dedup
  } catch (e) {
    console.warn('Folder dedup failed:', e);
  }
}

// ─── File operations ──────────────────────────────────────────────────────────

export async function listFilesInFolder(folderId, pageToken) {
  const params = {
    q: `'${folderId}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/pdf')`,
    fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,size,description)',
    pageSize: 50,
    orderBy: 'createdTime desc',
  };
  if (pageToken) params.pageToken = pageToken;
  const data = await driveReq('GET', '/files', { params });
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken || null,
  };
}

export async function getFileAsBase64(fileId) {
  const token = await ensureToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function uploadToDriveFolder(blob, fileName, folderId, mimeType = 'image/jpeg') {
  const token = await ensureToken();

  const metadata = { name: fileName, parents: [folderId] };
  const boundary = 'rr_upload_boundary';
  const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closePart = `\r\n--${boundary}--`;

  const body = new Blob([metaPart, mediaPart, blob, closePart]);

  // Timeout: 60s for files ≤2MB, 120s for larger (covers slow mobile networks)
  const timeoutMs = blob.size > 2 * 1024 * 1024 ? 120000 : 60000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Upload failed (${res.status})`);
    }
    return res.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`上传超时（${timeoutMs / 1000}秒），请检查网络后重试`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function renameAndMoveFile(fileId, newName, targetFolderId, currentFolderId) {
  const params = {
    addParents: targetFolderId,
    removeParents: currentFolderId,
    fields: 'id,name',
  };
  return driveReq('PATCH', `/files/${fileId}`, {
    body: { name: newName },
    params,
  });
}

/** Move a file to Google Drive trash (recoverable) */
export async function deleteFile(fileId) {
  return driveReq('PATCH', `/files/${fileId}`, {
    body: { trashed: true },
    params: { fields: 'id,trashed' },
  });
}

export async function updateFileMetadata(fileId, updates) {
  return driveReq('PATCH', `/files/${fileId}`, {
    body: updates,
    params: { fields: 'id,name,description' },
  });
}

export async function getFileMetadata(fileId) {
  return driveReq('GET', `/files/${fileId}`, {
    params: { fields: 'id,name,mimeType,description,thumbnailLink,createdTime' },
  });
}

// ─── Nuclear delete: remove ALL user data from Drive + Sheets ─────────────────

/**
 * Permanently trash the entire Receipt Renamer root folder (and all subfolders/files),
 * plus clear all rows from the receipt Sheets spreadsheet.
 * Returns a summary of what was deleted.
 */
export async function nukeAllUserData(sheetId, sheetName = 'receipt_index') {
  const summary = { rootFoldersTrashed: 0, sheetCleared: false, errors: [] };

  // 1. Trash ALL Receipt Renamer root folders (including duplicates)
  try {
    const data = await driveReq('GET', '/files', {
      params: {
        q: `name='${escQ(ROOT_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
        fields: 'files(id)',
        pageSize: 50,
      },
    });
    for (const folder of (data.files || [])) {
      try {
        await driveReq('PATCH', `/files/${folder.id}`, { body: { trashed: true } });
        summary.rootFoldersTrashed++;
      } catch (e) {
        summary.errors.push(`Trash folder ${folder.id}: ${e.message}`);
      }
    }
    _cachedRootFolderId = null;
    _folderIdCache = {};
  } catch (e) {
    summary.errors.push(`List root folders: ${e.message}`);
  }

  // 2. Clear Sheets data (keep header row, delete all data rows)
  if (sheetId) {
    try {
      const token = await ensureToken();
      const range = encodeURIComponent(`${sheetName}!A2:Z`);
      const res = await fetch(
        `${SHEETS_API}/spreadsheets/${sheetId}/values/${range}:clear`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      if (res.ok) summary.sheetCleared = true;
      else summary.errors.push(`Clear sheet: HTTP ${res.status}`);
    } catch (e) {
      summary.errors.push(`Clear sheet: ${e.message}`);
    }
  }

  // 3. Also trash the cloud config file if it exists
  try {
    const configData = await driveReq('GET', '/files', {
      params: {
        q: `name='${escQ(CONFIG_FILE_NAME)}' and trashed=false`,
        fields: 'files(id)',
        pageSize: 5,
      },
    });
    for (const f of (configData.files || [])) {
      await driveReq('PATCH', `/files/${f.id}`, { body: { trashed: true } }).catch(() => {});
    }
  } catch {}

  return summary;
}

// ─── Auto-create receipt sheet ────────────────────────────────────────────────

/**
 * Creates a new Google Spreadsheet inside the Receipt Renamer folder,
 * with a header row. Returns the spreadsheet ID.
 */
export async function createReceiptSheet(sheetName = 'receipt_index') {
  const rootId = await getOrCreateRootFolder();
  const token = await ensureToken();

  // Create the Sheets file inside Receipt Renamer folder
  const file = await driveReq('POST', '/files', {
    body: {
      name: 'Receipt Renamer 记录表',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [rootId],
    },
    params: { fields: 'id' },
  });
  const spreadsheetId = file.id;

  // Get default sheet tab info (it's called "Sheet1" by default)
  const ssRes = await fetch(`${SHEETS_API}/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ssData = await ssRes.json();
  const firstSheetId = ssData.sheets?.[0]?.properties?.sheetId ?? 0;

  // Rename the default "Sheet1" tab to sheetName
  await fetch(`${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: firstSheetId, title: sheetName },
          fields: 'title',
        },
      }],
    }),
  });

  // Write header row
  await fetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + '!A1')}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: [['日期', '商家', '分类', '金额', '货币', 'Drive 链接']],
      }),
    }
  );

  return spreadsheetId;
}

// ─── Cloud config sync (multi-device folder names etc.) ──────────────────────

const CONFIG_FILE_NAME = 'rr-config.json';

/** Read cloud config from Drive (stored as JSON file in root folder) */
export async function readCloudConfig() {
  try {
    const rootId = await getOrCreateRootFolder();
    const data = await driveReq('GET', '/files', {
      params: {
        q: `name='${escQ(CONFIG_FILE_NAME)}' and '${rootId}' in parents and trashed=false`,
        fields: 'files(id)',
        pageSize: 1,
      },
    });
    if (!data.files?.length) return null;
    const token = await ensureToken();
    const res = await fetch(`${DRIVE_API}/files/${data.files[0].id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Save cloud config to Drive */
export async function saveCloudConfig(configData) {
  try {
    const rootId = await getOrCreateRootFolder();
    // Check if config file already exists
    const data = await driveReq('GET', '/files', {
      params: {
        q: `name='${escQ(CONFIG_FILE_NAME)}' and '${rootId}' in parents and trashed=false`,
        fields: 'files(id)',
        pageSize: 1,
      },
    });

    const token = await ensureToken();
    const content = JSON.stringify(configData, null, 2);
    const blob = new Blob([content], { type: 'application/json' });

    if (data.files?.length) {
      // Update existing
      const fileId = data.files[0].id;
      const res = await fetch(
        `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: blob,
        }
      );
      if (!res.ok) throw new Error(`Update config failed (${res.status})`);
    } else {
      // Create new
      const metadata = { name: CONFIG_FILE_NAME, parents: [rootId] };
      const boundary = 'rr_cfg_boundary';
      const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
      const mediaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n`;
      const closePart = `\r\n--${boundary}--`;
      const body = new Blob([metaPart, mediaPart, blob, closePart]);

      await fetch(
        `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
    }
  } catch (e) {
    console.warn('Failed to save cloud config:', e);
  }
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

/** Read all rows from the receipt sheet (for multi-device sync) */
export async function readSheetRecords(spreadsheetId, sheetName = 'receipt_index') {
  const token = await ensureToken();
  const range = encodeURIComponent(`${sheetName}!A:F`);
  const res = await fetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    if (res.status === 404) {
      // Sheet or spreadsheet was deleted — return empty
      return [];
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets read error (${res.status})`);
  }
  const data = await res.json();
  const rows = data.values || [];
  if (rows.length <= 1) return []; // Only header or empty

  // Skip header row, map to receipt objects
  return rows.slice(1).map((row, i) => ({
    id: `sheet-${i}`,
    date: row[0] || '',
    merchant: row[1] || '',
    category: row[2] || '',
    amount: row[3] || '',
    currency: row[4] || 'AUD',
    driveLink: row[5] || '',
    driveId: (row[5] || '').match(/\/d\/([^/]+)/)?.[1] || '',
    status: 'validated',
    source: 'sheet',
  })).reverse(); // Most recent first
}

export async function appendToSheet(spreadsheetId, sheetName, row) {
  const token = await ensureToken();

  const range = encodeURIComponent(`${sheetName}!A:F`);
  const res = await fetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets error (${res.status})`);
  }
  return res.json();
}
