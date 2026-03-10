import { useState } from 'react';
import { T, F } from '../constants/theme';
import Header from '../components/Header';
import Btn from '../components/Btn';
import StatusDot from '../components/StatusDot';
import { createReceiptSheet, renameSubFolder } from '../services/google';

// ─── Stable sub-components (defined OUTSIDE to avoid remount on every render) ─

function Section({ title, children }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.bdr}`,
      borderRadius: 16, padding: '16px', marginBottom: 14,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.tx3, letterSpacing: '1px', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ icon, label, sub, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0',
      borderBottom: `1px solid ${T.bdr}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: T.sf2, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: T.tx3, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConfigView({
  config,
  setConfig,
  onSave,
  onReconnect,
  onSignOut,
  onReset,
}) {
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [folderEdit, setFolderEdit] = useState({});

  const save = async () => {
    await onSave(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '0 16px 100px' }}>
      <Header title="设置" sub="账号与偏好" />

      {/* Google Account */}
      <Section title="🔐 Google 账号">
        {config.connected && config.googleProfile ? (
          /* Profile card — connected state */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0 12px' }}>
              {config.googleProfile.picture ? (
                <img src={config.googleProfile.picture} alt="" referrerPolicy="no-referrer"
                  style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${T.acc}`, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  background: T.sf2, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 24, border: `2px solid ${T.bdr}` }}>
                  🧑‍💼
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.tx,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {config.googleProfile.name || '已连接'}
                </div>
                <div style={{ fontSize: 12, color: T.tx3, marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {config.googleProfile.email || ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <StatusDot level="ok" />
                  <span style={{ fontSize: 10, color: T.grn }}>已连接</span>
                </div>
              </div>
              <Btn small onClick={onSignOut}
                style={{ color: T.red, borderColor: 'rgba(239,68,68,0.3)', fontSize: 11 }}>
                退出
              </Btn>
            </div>
          </>
        ) : (
          /* Not connected — show connect button + remember me checkbox */
          <>
            <div style={{ fontSize: 12, color: T.tx3, marginBottom: 14, lineHeight: 1.6 }}>
              连接 Google 账号后才能上传小票到 Drive 和记录消费数据。
            </div>
            {/* Remember me checkbox */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', marginBottom: 12,
              background: T.sf2, borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${rememberMe ? 'rgba(250,204,21,0.3)' : T.bdr}`,
              transition: 'border-color 0.15s',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: `2px solid ${rememberMe ? T.acc : T.bdr2}`,
                background: rememberMe ? T.acc : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {rememberMe && <span style={{ color: '#000', fontSize: 12, fontWeight: 800, lineHeight: 1 }}>✓</span>}
              </div>
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                style={{ display: 'none' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>记住我的登录状态</div>
                <div style={{ fontSize: 11, color: T.tx3, marginTop: 1 }}>
                  关闭浏览器再打开也不用重新登录
                </div>
              </div>
            </label>
            <Btn primary full onClick={() => onReconnect(rememberMe)}>
              🔗 连接 Google 账号
            </Btn>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 10 }}>
              <StatusDot level="err" />
              <span style={{ fontSize: 11, color: T.red }}>未连接，请先授权 Google 账号</span>
            </div>
          </>
        )}
      </Section>

      {/* Upload Settings */}
      <Section title="📡 上传设置">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>仅在 WiFi 下上传</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>开启后，使用手机流量时不会上传照片（省流量）</div>
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 1, opacity: 0.7 }}>注：此功能在 iOS Safari 上可能不生效</div>
          </div>
          <button
            onClick={() => setConfig(c => ({ ...c, wifiOnlyUpload: !c.wifiOnlyUpload }))}
            style={{
              width: 48, height: 28, borderRadius: 14, flexShrink: 0,
              background: config.wifiOnlyUpload ? T.acc : T.bdr2,
              border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 3,
              left: config.wifiOnlyUpload ? 23 : 3,
              transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      </Section>

      {/* Drive Folders */}
      <Section title="📁 Drive 文件夹">
        <div style={{ fontSize: 12, color: T.tx2, marginBottom: 10, lineHeight: 1.6 }}>
          小票会存到 Google Drive 的 <strong>Receipt Renamer</strong> 文件夹里，分四个子文件夹存放：
        </div>
        {/* Folder summary — always visible */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {[
            { icon: '📥', label: '待处理', key: 'inboxFolder', desc: '刚上传的小票先放这里' },
            { icon: '✅', label: '已存档', key: 'validatedFolder', desc: 'AI 确认无误后自动归档' },
            { icon: '⚠️', label: '待确认', key: 'reviewFolder', desc: '需要你确认的小票 + 非小票图片' },
          ].map(({ icon, label, key }) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px', background: T.sf2, borderRadius: 10,
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 12, color: T.tx2, flexShrink: 0, width: 44 }}>{label}</span>
              <span style={{
                fontSize: 12, fontWeight: 600, color: T.tx, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                📂 {config[key] || '（未设置）'}
              </span>
            </div>
          ))}
        </div>

        {/* Advanced settings toggle */}
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: T.sf2,
            border: `1px solid ${T.bdr}`,
            borderRadius: 10,
            color: T.tx2,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <span>⚙️ 高级设置</span>
          <span style={{ fontSize: 14, transition: 'transform 0.2s', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▾
          </span>
        </button>

        {showAdvanced && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12, lineHeight: 1.5 }}>
              修改后点「重命名」，App 会直接在 Drive 里将对应文件夹改名，文件无需手动移动。
            </div>
            {[
              { icon: '📥', label: '待处理', key: 'inboxFolder' },
              { icon: '✅', label: '已存档', key: 'validatedFolder' },
              { icon: '⚠️', label: '待确认', key: 'reviewFolder' },
            ].map(({ icon, label, key }) => {
              const fe = folderEdit[key] || {};
              // draft is always the editable value; initialize from config on first render
              const draft = fe.draft !== undefined ? fe.draft : (config[key] || '');
              const isDirty = draft !== (config[key] || '');
              const isRenaming = fe.renaming;
              const isDone = fe.done;

              const setDraft = (v) => setFolderEdit(p => ({
                ...p, [key]: { ...p[key], draft: v, done: false },
              }));

              const doRename = async () => {
                if (!isDirty || !draft.trim()) return;
                setFolderEdit(p => ({ ...p, [key]: { ...p[key], renaming: true } }));
                try {
                  await renameSubFolder(config[key], draft.trim());
                  setConfig(c => ({ ...c, [key]: draft.trim() }));
                  // Reset draft to new name so isDirty becomes false
                  setFolderEdit(p => ({ ...p, [key]: { draft: draft.trim(), renaming: false, done: true } }));
                  onSave?.({ ...config, [key]: draft.trim() });
                  setTimeout(() => setFolderEdit(p => ({ ...p, [key]: { ...p[key], done: false } })), 2000);
                } catch (e) {
                  setFolderEdit(p => ({ ...p, [key]: { ...p[key], renaming: false } }));
                  alert('重命名失败：' + e.message);
                }
              };

              return (
                <div key={key} style={{ padding: '12px 0', borderBottom: `1px solid ${T.bdr}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, flex: 1 }}>{label}</span>
                    {isDone && <span style={{ fontSize: 11, color: T.grn }}>✓ 已重命名</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      placeholder="输入文件夹名称"
                      style={{
                        flex: 1, padding: '8px 10px',
                        background: T.sf, border: `1px solid ${isDirty ? T.acc : T.bdr2}`,
                        borderRadius: 8, color: T.tx, fontSize: 12, fontFamily: F,
                        transition: 'border-color 0.15s', outline: 'none',
                      }}
                    />
                    <button
                      onClick={doRename}
                      disabled={!isDirty || isRenaming}
                      style={{
                        flexShrink: 0, padding: '8px 14px',
                        background: isDirty && !isRenaming ? T.accDim : T.sf2,
                        border: `1px solid ${isDirty ? 'rgba(250,204,21,0.35)' : T.bdr}`,
                        borderRadius: 8, color: isDirty && !isRenaming ? T.acc : T.tx3,
                        fontSize: 12, fontWeight: 700, cursor: isDirty ? 'pointer' : 'not-allowed',
                        fontFamily: F, display: 'flex', alignItems: 'center', gap: 5,
                        transition: 'all 0.15s',
                      }}
                    >
                      {isRenaming ? (
                        <div style={{ width: 12, height: 12, border: `2px solid ${T.bdr}`,
                          borderTopColor: T.acc, borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite' }} />
                      ) : '重命名'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Sheet */}
      <Section title="📊 消费记录表">
        <div style={{ fontSize: 12, color: T.tx2, marginBottom: 12, lineHeight: 1.6 }}>
          每次处理完小票，数据会自动同步到 Google Sheets 表格，方便你对账和统计。
        </div>
        {config.sheetId ? (
          <div style={{
            background: T.sf2, borderRadius: 10, padding: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.grn }}>✅ 记录表已连接</div>
              <div style={{ fontSize: 10, color: T.tx3, fontFamily: 'monospace', marginTop: 2 }}>
                {config.sheetId.slice(0, 28)}…
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={`https://docs.google.com/spreadsheets/d/${config.sheetId}`}
                target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: T.acc, textDecoration: 'none' }}>
                打开 ↗
              </a>
              <button onClick={() => setConfig(c => ({ ...c, sheetId: '' }))}
                style={{ fontSize: 11, color: T.red, background: 'none', border: 'none', cursor: 'pointer' }}>
                移除
              </button>
            </div>
          </div>
        ) : (
          <Btn
            small primary full
            onClick={async () => {
              setCreatingSheet(true);
              try {
                const id = await createReceiptSheet('receipt_index');
                setConfig(c => ({ ...c, sheetId: id, sheetName: 'receipt_index' }));
              } catch (e) { alert('创建失败：' + e.message); }
              setCreatingSheet(false);
            }}
            disabled={creatingSheet}
          >
            {creatingSheet ? '创建中…' : '✨ 一键创建记录表'}
          </Btn>
        )}
      </Section>

      {/* Backup Settings — T-021 experimental */}
      <Section title="💾 数据备份">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
            background: 'rgba(250,204,21,0.15)', color: T.acc,
            padding: '3px 8px', borderRadius: 6, border: `1px solid rgba(250,204,21,0.25)`,
          }}>实验性</span>
          <span style={{ fontSize: 11, color: T.tx3 }}>功能开发中，敬请期待</span>
        </div>

        <div style={{ fontSize: 12, color: T.tx2, marginBottom: 14, lineHeight: 1.7 }}>
          为你的小票数据创建自动备份，防止误删或数据丢失。
        </div>

        {/* Backup options */}
        {[
          {
            id: 'drive',
            icon: '☁️',
            label: 'Drive 内备份',
            desc: '自动复制一份到 Drive 的 Receipt Backup 文件夹',
            tag: '推荐',
          },
          {
            id: 'local',
            icon: '💻',
            label: '本地文件夹',
            desc: '自动保存到你选择的本地文件夹（仅 Chrome 支持）',
            tag: null,
          },
        ].map(opt => {
          const selected = (config.backupMode || []).includes(opt.id);
          return (
            <div
              key={opt.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px', marginBottom: 8,
                background: T.sf2, borderRadius: 12,
                border: `1px solid ${T.bdr}`,
                opacity: 0.55, cursor: 'not-allowed',
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{opt.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{opt.label}</span>
                  {opt.tag && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: T.grn,
                      background: 'rgba(34,197,94,0.1)', padding: '1px 6px',
                      borderRadius: 4,
                    }}>{opt.tag}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{opt.desc}</div>
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${T.bdr2}`, background: 'transparent',
              }} />
            </div>
          );
        })}

        <div style={{
          fontSize: 11, color: T.tx3, marginTop: 8, lineHeight: 1.5,
          padding: '8px 10px', background: T.sf, borderRadius: 8,
          border: `1px solid ${T.bdr}`,
        }}>
          🚧 备份功能正在开发中，暂时无法启用。确定方案后会上线。
        </div>
      </Section>

      {/* Save */}
      <Btn primary full onClick={save} style={{ marginBottom: 10 }}>
        {saved ? '✅ 已保存' : '💾 保存设置'}
      </Btn>

      {/* Danger zone */}
      <div style={{
        background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)',
        borderRadius: 14, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 8 }}>危险区域</div>
        <div style={{ fontSize: 12, color: T.tx3, marginBottom: 10 }}>
          清除所有本地数据（不影响 Google Drive 和 Sheets 里的文件）
        </div>
        <Btn small onClick={onReset} style={{ color: T.red, borderColor: 'rgba(239,68,68,0.3)' }}>
          🗑️ 清除本地缓存
        </Btn>
      </div>
    </div>
  );
}
