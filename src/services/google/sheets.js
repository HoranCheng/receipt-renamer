import { driveReq, ensureToken } from './auth';
import { getOrCreateRootFolder } from './drive';

const SHEETS_API = 'https://sheets.googleapis.com/v4';

export async function createReceiptSheet(sheetName = 'receipt_index') {
  const rootId = await getOrCreateRootFolder();
  const token = await ensureToken();

  const file = await driveReq('POST', '/files', {
    body: {
      name: 'Receipt Renamer 记录表',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [rootId],
    },
    params: { fields: 'id' },
  });
  const spreadsheetId = file.id;

  const ssRes = await fetch(`${SHEETS_API}/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ssData = await ssRes.json();
  const firstSheetId = ssData.sheets?.[0]?.properties?.sheetId ?? 0;

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

export async function readSheetRecords(spreadsheetId, sheetName = 'receipt_index') {
  const token = await ensureToken();
  const range = encodeURIComponent(`${sheetName}!A:F`);
  const res = await fetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    if (res.status === 404) {
      return [];
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets read error (${res.status})`);
  }
  const data = await res.json();
  const rows = data.values || [];
  if (rows.length <= 1) return [];

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
  })).reverse();
}

export async function appendToSheet(spreadsheetId, sheetName, row) {
  const token = await ensureToken();

  const range = encodeURIComponent(`${sheetName}!A:F`);
  const res = await fetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`,
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
