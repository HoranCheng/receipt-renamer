import { useState } from 'react';
import { T } from '../constants/theme';
import { initGoogleAPI, requestAccessToken, createReceiptSheet } from '../services/google';
import Field from '../components/Field';
import Btn from '../components/Btn';
import StatusDot from '../components/StatusDot';

const BUILT_IN_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function SetupView({ config, setConfig, onSave }) {
  const hasBuiltInClientId = Boolean(BUILT_IN_CLIENT_ID);
  const step = config.connected ? 1 : 0;
  const [creatingSheet, setCreatingSheet] = useState(false);

  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '60px 0 8px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{'\u{1F9FE}'}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: T.tx, letterSpacing: '-0.5px' }}>
          Receipt Renamer
        </div>
        <div style={{ fontSize: 13, color: T.tx2, marginTop: 4 }}>
          {'\u5C0F\u7968\u667A\u80FD\u7BA1\u5BB6 \u00B7 \u8FDE\u63A5 Google Drive'}
        </div>
      </div>

      {/* Steps indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '24px 0 28px' }}>
        {['\u767B\u5F55\u8D26\u53F7', '\u6587\u4EF6\u5939\u8BBE\u7F6E'].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step >= i ? T.accDim : T.sf2,
              border: `1.5px solid ${step >= i ? T.acc : T.bdr}`,
              color: step >= i ? T.acc : T.tx3,
            }}>
              {i + 1}
            </div>
            {i < 1 && <div style={{ width: 20, height: 1, background: step > i ? T.acc : T.bdr }} />}
          </div>
        ))}
      </div>

      {/* Step 0: Connect Google */}
      {step === 0 && (
        <div style={{ animation: 'fadeUp 0.3s ease' }}>
          <div style={{
            background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16,
            padding: '24px', textAlign: 'center', marginBottom: 16,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u{1F4F1}'}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.tx, marginBottom: 6 }}>
              {'\u8FDE\u63A5 Google \u8D26\u53F7'}
            </div>
            <div style={{ fontSize: 12, color: T.tx2, marginBottom: 20, lineHeight: 1.6 }}>
              {'\u6388\u6743\u8BBF\u95EE Google Drive \u4E0E Sheets\uFF0C'}
              <br />
              {'\u60A8\u7684\u6587\u4EF6\u4EC5\u5B58\u4E8E\u60A8\u81EA\u5DF1\u7684 Google \u8D26\u53F7\u4E2D'}
            </div>
            <Btn
              primary
              onClick={async () => {
                try {
                  const clientId = BUILT_IN_CLIENT_ID || config.clientId;
                  await initGoogleAPI(clientId);
                  await requestAccessToken();
                  setConfig((c) => ({ ...c, clientId, connected: true }));
                } catch (e) {
                  alert('\u8FDE\u63A5\u5931\u8D25\uFF1A' + (e.message || JSON.stringify(e)));
                }
              }}
            >
              {'\u{1F510} \u4F7F\u7528 Google \u767B\u5F55'}
            </Btn>

            {/* Fallback: manual Client ID if no built-in */}
            {!hasBuiltInClientId && (
              <div style={{ marginTop: 20, textAlign: 'left' }}>
                <Field
                  label="Google OAuth Client ID"
                  icon={'\u{1F511}'}
                  value={config.clientId}
                  onChange={(v) => setConfig((c) => ({ ...c, clientId: v }))}
                  placeholder="xxxxx.apps.googleusercontent.com"
                  mono
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Folder config */}
      {step === 1 && (
        <div style={{ animation: 'fadeUp 0.3s ease' }}>
          <div style={{
            background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16,
            padding: '18px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <StatusDot level="ok" />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.grn }}>
                {'Google \u5DF2\u8FDE\u63A5'}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 10 }}>
              {'\u{1F4C1} \u6587\u4EF6\u5939\u914D\u7F6E'}
            </div>
            <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.6, marginBottom: 14 }}>
              {'\u8BBE\u7F6E Google Drive \u4E2D\u7684\u6536\u636E\u6587\u4EF6\u5939\u540D\u79F0\u3002\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u521B\u5EFA\u4E0D\u5B58\u5728\u7684\u6587\u4EF6\u5939\u3002'}
            </div>
          </div>
          <Field
            label={'\u6536\u4EF6\u7BB1\u6587\u4EF6\u5939'}
            icon={'\u{1F4E5}'}
            value={config.inboxFolder}
            onChange={(v) => setConfig((c) => ({ ...c, inboxFolder: v }))}
            placeholder="00_inbox"
          />
          <Field
            label={'\u5DF2\u9A8C\u8BC1\u6587\u4EF6\u5939'}
            icon={'\u2705'}
            value={config.validatedFolder}
            onChange={(v) => setConfig((c) => ({ ...c, validatedFolder: v }))}
            placeholder="10_validated"
          />
          <Field
            label={'\u5F85\u5BA1\u6838\u6587\u4EF6\u5939'}
            icon={'\u26A0\uFE0F'}
            value={config.reviewFolder}
            onChange={(v) => setConfig((c) => ({ ...c, reviewFolder: v }))}
            placeholder="20_review_needed"
          />
          {/* Sheet auto-create or manual ID */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: T.tx3, letterSpacing: '1px', display: 'block', marginBottom: 6 }}>
              📊 记录表（Google Sheets）
            </label>
            {config.sheetId ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 12, color: T.tx2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: T.sf2, padding: '8px 10px', borderRadius: 8 }}>
                  ✅ {config.sheetId.slice(0, 20)}...
                </div>
                <button onClick={() => setConfig(c => ({ ...c, sheetId: '', sheetName: 'receipt_index' }))}
                  style={{ fontSize: 11, color: T.red, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                  移除
                </button>
              </div>
            ) : (
              <Btn
                small
                onClick={async () => {
                  setCreatingSheet(true);
                  try {
                    const id = await createReceiptSheet('receipt_index');
                    setConfig(c => ({ ...c, sheetId: id, sheetName: 'receipt_index' }));
                  } catch (e) {
                    alert('创建失败：' + e.message);
                  }
                  setCreatingSheet(false);
                }}
                disabled={creatingSheet}
                style={{ width: '100%' }}
              >
                {creatingSheet ? '创建中...' : '📊 在 Drive 中自动创建记录表'}
              </Btn>
            )}
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>
              记录表会创建在 Drive 的 Receipt Renamer 文件夹内
            </div>
          </div>
          <Btn primary full style={{ marginTop: 8 }} onClick={() => onSave(config)}>
            {'\u{1F680} \u5F00\u59CB\u4F7F\u7528'}
          </Btn>
        </div>
      )}
    </div>
  );
}
