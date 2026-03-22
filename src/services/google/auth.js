import { SCOPES } from '../../constants';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

let gapiLoaded = false;
let tokenClient = null;

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

const SESSION_KEY = 'rr-gapi-session';
const PERSIST_KEY  = 'rr-gapi-persistent';

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

export function tryRestoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(PERSIST_KEY);
    if (!raw) return false;
    const { token, expiresAt } = JSON.parse(raw);
    if (Date.now() >= expiresAt - 60_000) {
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
  // clearFolderCache is imported by callers that need it
  gapiLoaded = false;
  tokenClient = null;
}

export function requestAccessToken(options = {}) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('Google not initialized'));
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(resp);
      } else {
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

export function getToken() {
  return window.gapi?.client?.getToken()?.access_token;
}

export function _clearToken() {
  try { window.gapi?.client?.setToken(null); } catch {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

export async function fetchUserProfile() {
  const token = await ensureToken();
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('无法获取 Google 账号信息');
  return res.json();
}

export async function ensureToken() {
  const t = getToken();
  if (t) return t;
  if (tryRestoreSession()) return getToken();
  try {
    await requestAccessToken({ prompt: '', loginHint: _loginHint });
  } catch {
    throw new Error('登录已过期，请重新登录');
  }
  const t2 = getToken();
  if (!t2) throw new Error('登录已过期，请重新登录');
  return t2;
}

let _loginHint = '';
export function setLoginHint(email) { _loginHint = email || ''; }

export async function driveReq(method, path, { params, body, responseType } = {}) {
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
