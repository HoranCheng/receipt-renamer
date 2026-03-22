import { driveReq, ensureToken, _clearToken } from './auth';

const ROOT_FOLDER_NAME = 'Receipt Renamer';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4';
const CONFIG_FILE_NAME = 'rr-config.json';

let _cachedRootFolderId = null;

// Escape single quotes for Drive API query strings
export function escQ(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ─── Root folder ──────────────────────────────────────────────────────────────

export async function getOrCreateRootFolder() {
  if (_cachedRootFolderId) return _cachedRootFolderId;
  const data = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(ROOT_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
      fields: 'files(id,createdTime)',
      pageSize: 10,
    },
  });
  if (data.files?.length) {
    const sorted = data.files.sort((a, b) => (a.createdTime || '').localeCompare(b.createdTime || ''));
    _cachedRootFolderId = sorted[0].id;
    if (sorted.length > 1) {
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

async function _mergeDuplicateRootFolders(canonicalId, duplicateIds) {
  for (const dupId of duplicateIds) {
    const children = await driveReq('GET', '/files', {
      params: {
        q: `'${dupId}' in parents and trashed=false`,
        fields: 'files(id,name)',
        pageSize: 100,
      },
    });
    for (const child of (children.files || [])) {
      await driveReq('PATCH', `/files/${child.id}`, {
        body: {},
        params: { addParents: canonicalId, removeParents: dupId, fields: 'id' },
      });
    }
    await driveReq('PATCH', `/files/${dupId}`, {
      body: { trashed: true },
    });
    console.info(`Merged duplicate root folder ${dupId} into ${canonicalId}`);
  }
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

export async function renameSubFolder(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return null;
  const rootId = await getOrCreateRootFolder();

  const data = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(oldName)}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: '1',
    },
  });

  if (data.files?.length) {
    const folderId = data.files[0].id;
    await driveReq('PATCH', `/files/${folderId}`, {
      body: { name: newName },
      params: { fields: 'id,name' },
    });
    return folderId;
  }

  const existing = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(newName)}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: '1',
    },
  });
  if (existing.files?.length) {
    return existing.files[0].id;
  }

  return null;
}

const _folderIdCache = {};

export function clearFolderCache() {
  Object.keys(_folderIdCache).forEach(k => delete _folderIdCache[k]);
  _cachedRootFolderId = null;
}

export async function findOrCreateFolder(name) {
  if (_folderIdCache[name]) {
    try {
      await driveReq('GET', `/files/${_folderIdCache[name]}`, {
        params: { fields: 'id,trashed' },
      });
      return _folderIdCache[name];
    } catch {
      delete _folderIdCache[name];
    }
  }

  const rootId = await getOrCreateRootFolder();
  const data = await driveReq('GET', '/files', {
    params: {
      q: `name='${escQ(name)}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,createdTime)',
      pageSize: 10,
    },
  });
  if (data.files?.length) {
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

export async function deduplicateFolders() {
  try {
    await getOrCreateRootFolder();
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

export async function getFileAsBlobUrl(fileId) {
  const token = await ensureToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

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

export async function uploadToDriveFolder(blob, fileName, folderId, mimeType = 'image/jpeg', options = {}) {
  const { onProgress, signal } = options;
  const { dlog } = await import('../debugLog');
  dlog('info', 'upload', `开始上传 ${fileName} (${(blob.size/1024).toFixed(0)}KB)`);

  async function doUpload(token) {
    const metadata = { name: fileName, parents: [folderId] };
    const boundary = 'rr_upload_boundary';
    const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const mediaPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const closePart = `\r\n--${boundary}--`;
    const body = new Blob([metaPart, mediaPart, blob, closePart]);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (signal) {
        if (signal.aborted) {
          reject(new DOMException('Upload cancelled', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 401) {
          resolve({ retry401: true });
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ id: 'unknown', name: fileName });
          }
        } else {
          let errMsg = `上传失败 (${xhr.status})`;
          try {
            const errData = JSON.parse(xhr.responseText);
            errMsg = errData.error?.message || errMsg;
          } catch {}
          reject(new Error(errMsg));
        }
      };
      xhr.onerror = () => { dlog('error', 'upload', `XHR onerror: ${fileName}`); reject(new Error('网络错误，上传中断')); };
      xhr.ontimeout = () => { dlog('error', 'upload', `XHR timeout: ${fileName}, timeout=${xhr.timeout}ms`); reject(new Error('上传超时，请检查网络后重试')); };
      xhr.onabort = () => { dlog('warn', 'upload', `XHR abort: ${fileName}`); reject(new DOMException('上传已取消', 'AbortError')); };

      xhr.open('POST', `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

      const conn = (typeof navigator !== 'undefined')
        ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection)
        : null;
      const weakNetwork = !!conn && (
        conn.type === 'cellular' || ['slow-2g', '2g', '3g'].includes(conn.effectiveType)
      );
      xhr.timeout = weakNetwork
        ? (blob.size > 2 * 1024 * 1024 ? 300000 : 120000)
        : (blob.size > 2 * 1024 * 1024 ? 120000 : 60000);

      xhr.send(body);
    });
  }

  onProgress?.(0);
  let token = await ensureToken();
  let result = await doUpload(token);
  if (result?.retry401) {
    _clearToken();
    token = await ensureToken();
    result = await doUpload(token);
    if (result?.retry401) throw new Error('登录已过期，请重新登录');
  }
  return result;
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

// ─── Nuclear delete ───────────────────────────────────────────────────────────

export async function nukeAllUserData(sheetId, sheetName = 'receipt_index') {
  const summary = { rootFoldersTrashed: 0, sheetCleared: false, errors: [] };

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
    clearFolderCache();
  } catch (e) {
    summary.errors.push(`List root folders: ${e.message}`);
  }

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

// ─── Cloud config ─────────────────────────────────────────────────────────────

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

export async function saveCloudConfig(configData) {
  try {
    const rootId = await getOrCreateRootFolder();
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
    throw e;
  }
}
