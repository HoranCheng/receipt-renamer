import { useState, useEffect, useCallback } from 'react';
import { T, F } from '../constants/theme';
import Header from '../components/Header';
import Btn from '../components/Btn';
import StatusDot from '../components/StatusDot';
import { createReceiptSheet, renameSubFolder } from '../services/google';

// ─── Nuclear Delete: double-confirm + double 5-second wait ───────────────────

function NukeConfirmModal({ stage, countdown, onConfirm, onCancel, deleting, deleteResult }) {
  // stage: 1 = first confirm, 2 = second confirm, 3 = deleting/done
  if (!stage) return null;

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 900,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, animation: 'fadeIn 0.2s ease',
  };
  const card = {
    background: T.card, borderRadius: 20, padding: '24px 20px',
    maxWidth: 360, width: '100%',
    border: stage === 2 ? '2px solid rgba(239,68,68,0.6)' : `1px solid ${T.bdr}`,
  };

  if (stage === 3) {
    return (
      <div style={overlay}>
        <div style={card}>
          {deleting ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${T.bdr}`, borderTopColor: T.red, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: T.tx }}>正在删除所有数据…</div>
              <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>请勿关闭页面</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 8 }}>数据已全部删除</div>
              {deleteResult && (
                <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6 }}>
                  <div>Drive 文件夹已移入回收站：{deleteResult.rootFoldersTrashed} 个</div>
                  <div>Sheets 记录已清空：{deleteResult.sheetCleared ? '是' : '否'}</div>
                  <div>本地缓存已清除</div>
                  {deleteResult.errors?.length > 0 && (
                    <div style={{ color: T.red, marginTop: 4 }}>
                      ⚠ {deleteResult.errors.length} 个操作出错，请检查 Drive 回收站
                    </div>
                  )}
                </div>
              )}
              <button onClick={onCancel} style={{
                marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none',
                background: T.accDim, color: T.acc, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: F,
              }}>好的</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{stage === 1 ? '⚠️' : '🚨'}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.red }}>
            {stage === 1 ? '危险操作' : '最终确认 — 不可逆'}
          </div>
        </div>
        <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.8, marginBottom: 16 }}>
          {stage === 1 ? (
            <>
              你即将删除 Receipt Renamer 的<strong>全部数据</strong>，包括：
              <div style={{ margin: '8px 0', padding: '10px 12px', background: T.sf2, borderRadius: 10, fontSize: 12 }}>
                • Google Drive 中的 Receipt Renamer 文件夹及所有文件<br/>
                • Google Sheets 中的消费记录<br/>
                • 云端配置文件<br/>
                • 本地缓存和配置<br/>
                • 所有 IndexedDB 数据
              </div>
              <div style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>
                Drive 文件将移入回收站（30 天内可恢复），但 Sheets 记录清空后无法恢复。
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.red, marginBottom: 8 }}>
                这是最后一步。确认后数据将立即被删除。
              </div>
              <div style={{ fontSize: 12, color: T.tx3 }}>
                请再次确认你已经了解：Sheets 消费记录清空后不可恢复，Drive 文件将移入回收站。
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px 0', borderRadius: 10,
            border: `1px solid ${T.bdr}`, background: 'transparent',
            color: T.tx2, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F,
          }}>取消</button>
          <button
            onClick={onConfirm}
            disabled={countdown > 0}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
              background: countdown > 0 ? T.sf2 : 'rgba(239,68,68,0.9)',
              color: countdown > 0 ? T.tx3 : '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: F,
              cursor: countdown > 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
            }}
          >
            {countdown > 0 ? `请等待 ${countdown} 秒…` : (stage === 1 ? '继续删除' : '确认删除全部数据')}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  onNukeAll,
  showAlert,
}) {
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [folderEdit, setFolderEdit] = useState({});
  // Nuclear delete state
  const [nukeStage, setNukeStage] = useState(0); // 0=hidden, 1=first, 2=second, 3=executing/done
  const [nukeCountdown, setNukeCountdown] = useState(0);
  const [nukeDeleting, setNukeDeleting] = useState(false);
  const [nukeResult, setNukeResult] = useState(null);

  // Countdown timer for nuke confirm
  useEffect(() => {
    if (nukeCountdown <= 0) return;
    const t = setTimeout(() => setNukeCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [nukeCountdown]);

  const startNuke = useCallback(() => {
    setNukeStage(1);
    setNukeCountdown(5);
    setNukeResult(null);
  }, []);

  const handleNukeConfirm = useCallback(async () => {
    if (nukeStage === 1) {
      // Move to second confirm
      setNukeStage(2);
      setNukeCountdown(5);
    } else if (nukeStage === 2) {
      // Execute
      setNukeStage(3);
      setNukeDeleting(true);
      try {
        const result = await onNukeAll();
        setNukeResult(result);
      } catch (e) {
        setNukeResult({ rootFoldersTrashed: 0, sheetCleared: false, errors: [e.message] });
      }
      setNukeDeleting(false);
    }
  }, [nukeStage, onNukeAll]);

  const handleNukeCancel = useCallback(() => {
    setNukeStage(0);
    setNukeCountdown(0);
  }, []);

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
          /* Not connected — show connect button */
          <>
            <div style={{ fontSize: 12, color: T.tx3, marginBottom: 14, lineHeight: 1.6 }}>
              连接 Google 账号后才能上传小票到 Drive 和记录消费数据。
              <br />
              <span style={{ fontSize: 11, color: T.tx3 }}>
                登录状态由 Google 自动保持，关闭浏览器后通常无需重新登录。
              </span>
            </div>
            <Btn primary full onClick={() => onReconnect()}>
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
                  (showAlert || alert)('重命名失败', e.message, true);
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
              } catch (e) { (showAlert || alert)('创建失败', e.message, true); }
              setCreatingSheet(false);
            }}
            disabled={creatingSheet}
          >
            {creatingSheet ? '创建中…' : '✨ 一键创建记录表'}
          </Btn>
        )}
      </Section>

      {/* Image Compression Settings */}
      <Section title="📷 图片处理">
        <div style={{ fontSize: 12, color: T.tx2, marginBottom: 12, lineHeight: 1.6 }}>
          上传前压缩照片可以节省 Drive 空间和 AI 识别成本，同时保持小票文字清晰。
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>上传前压缩</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
              {config.compressImages
                ? '已开启 · 压缩后约 200KB-500KB/张'
                : '已关闭 · 上传原图（1-5MB/张）'}
            </div>
          </div>
          <button
            onClick={() => setConfig(c => ({ ...c, compressImages: !c.compressImages }))}
            style={{
              width: 48, height: 28, borderRadius: 14, flexShrink: 0,
              background: config.compressImages ? T.acc : T.bdr2,
              border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 3,
              left: config.compressImages ? 23 : 3,
              transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
        {config.compressImages && (
          <div style={{
            fontSize: 11, color: T.tx3, padding: '8px 10px',
            background: T.sf, borderRadius: 8, border: `1px solid ${T.bdr}`,
          }}>
            💡 压缩在设备本地完成，不消耗额外 API 额度。小票文字在 1280px 宽度下仍可清晰辨认。
          </div>
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
        <div style={{ fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 12 }}>危险区域</div>

        {/* Clear local cache only */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: T.tx3, marginBottom: 8 }}>
            清除本地缓存（不影响 Google Drive 和 Sheets 里的数据）
          </div>
          <Btn small onClick={onReset} style={{ color: T.red, borderColor: 'rgba(239,68,68,0.3)' }}>
            🧹 清除本地缓存
          </Btn>
        </div>

        {/* Nuclear: delete ALL data */}
        {config.connected && (
          <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: T.red, marginBottom: 4, fontWeight: 600 }}>
              彻底删除全部数据
            </div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 8, lineHeight: 1.5 }}>
              删除 Google Drive 文件夹、Sheets 记录、云端配置、本地缓存。
              <strong style={{ color: T.red }}>此操作不可完全撤销。</strong>
            </div>
            <Btn small onClick={startNuke} style={{ color: '#fff', background: 'rgba(239,68,68,0.8)', borderColor: 'rgba(239,68,68,0.5)' }}>
              ☠️ 删除我的全部数据
            </Btn>
          </div>
        )}
      </div>

      {/* Nuclear delete confirm modal */}
      <NukeConfirmModal
        stage={nukeStage}
        countdown={nukeCountdown}
        onConfirm={handleNukeConfirm}
        onCancel={handleNukeCancel}
        deleting={nukeDeleting}
        deleteResult={nukeResult}
      />
    </div>
  );
}
