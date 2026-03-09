import { SCOPES, DISCOVERY_DOCS } from '../constants';

let gapiLoaded = false;
let gisLoaded = false;
let tokenClient = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function initGoogleAPI(clientId) {
  await loadScript("https://apis.google.com/js/api.js");
  await loadScript("https://accounts.google.com/gsi/client");

  await new Promise((resolve, reject) => {
    window.gapi.load("client", { callback: resolve, onerror: reject });
  });

  await window.gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
  gapiLoaded = true;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {},
  });
  gisLoaded = true;
}

export function isGapiLoaded() {
  return gapiLoaded;
}

export function requestAccessToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Google not initialized"));
    tokenClient.callback = (resp) => {
      if (resp.error) reject(resp);
      else resolve(resp);
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

export async function findOrCreateFolder(name, parentId) {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await window.gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  if (res.result.files?.length > 0) return res.result.files[0].id;
  const meta = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  const created = await window.gapi.client.drive.files.create({ resource: meta, fields: "id" });
  return created.result.id;
}

export async function listFilesInFolder(folderId) {
  const q = `'${folderId}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/pdf')`;
  const res = await window.gapi.client.drive.files.list({
    q, fields: "files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,size)",
    pageSize: 50, orderBy: "createdTime desc",
  });
  return res.result.files || [];
}

export async function getFileAsBase64(fileId, mimeType) {
  const resp = await window.gapi.client.drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const bytes = new Uint8Array(resp.body.length);
  for (let i = 0; i < resp.body.length; i++) bytes[i] = resp.body.charCodeAt(i);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function renameAndMoveFile(fileId, newName, targetFolderId, currentParents) {
  await window.gapi.client.drive.files.update({
    fileId,
    resource: { name: newName },
    addParents: targetFolderId,
    removeParents: currentParents,
    fields: "id,name,parents",
  });
}

export async function appendToSheet(spreadsheetId, sheetName, row) {
  await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:F`,
    valueInputOption: "USER_ENTERED",
    resource: { values: [row] },
  });
}
