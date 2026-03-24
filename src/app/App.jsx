import { useState, useEffect, useRef, useCallback } from 'react';
import { T, F } from '../shared/constants/theme';
import { DEFAULT_CONFIG } from '../shared/constants';
import { AlertModal, ConfirmModal } from '../shared/components/Modal';
import {
  nukeAllUserData,
  isGapiLoaded,
  initGoogleAPI,
  requestAccessToken,
  fetchUserProfile,
  tryRestoreSession,
  setLoginHint,
  signOut,
  getAccessToken,
  saveCloudConfig,
  deduplicateFolders,
} from '../services/google';
import { syncCloudConfig, resolveConfigConflict as resolveConflict, SYNC_FIELDS } from '../shared/hooks/useCloudSync';
import { processInboxBackground, getSavedProgress, setConfigCallback, retrySheetOutbox } from '../services/processor';
import { sendTokenToSW, onSWMessage, resumeSWProcessing, clearSWToken } from '../services/swBridge';
import { store, load, setCurrentUser, clearAllData } from '../services/storage';
import { css } from './styles';
import Nav from '../shared/components/Nav';
import ErrorBoundary from '../shared/components/ErrorBoundary';
import { useToast } from '../shared/components/Toast';
import SetupView from '../features/config/SetupView';
import DashView from '../features/dashboard/DashView';
import { RobotWorking } from '../shared/components/RobotScene';
import NonReceiptModal from '../shared/components/NonReceiptModal';
import InboxView from '../features/inbox/InboxView';
import ScanView from '../features/scan/ScanView';
import ReviewView from '../features/review/ReviewView';
import LogView from '../features/log/LogView';
import ConfigView from '../features/config/ConfigView';
import DetailView from '../features/log/DetailView';
import useAuth from '../features/auth/hooks/useAuth';

const BUILT_IN_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function App() {
  const [view, setView] = useState(() => {
    try { return sessionStorage.getItem('rr-view') || 'scan'; } catch { return 'scan'; }
  });

  // Persist active tab to sessionStorage so refresh restores it
  const navTo = (v) => { setView(v); try { sessionStorage.setItem('rr-view', v); } catch {} };
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  // Non-receipt alerts: loaded from localStorage, shown as bottom-sheet modal.
  // null = not yet checked; [] = checked, none pending; [...] = items to show.
  const [nonReceiptAlerts, setNonReceiptAlerts] = useState(null);
  // Whether to show the modal this session (user can defer with "later")
  const [showNonReceiptModal, setShowNonReceiptModal] = useState(false);
  const [receipts, setReceipts] = useState([]);
  const [ready, setReady] = useState(false);
  const [detailReceipt, setDetailReceipt] = useState(null);
  const [procStatus, setProcStatus] = useState(null); // { processing, current, total, done, failed }
  const [reviewCount, setReviewCount] = useState(0); // T-014: badge for review tab
  const [configConflict, setConfigConflict] = useState(null); // { cloud, local, fields[] }
  const [liveResults, setLiveResults] = useState([]); // Live AI recognition results for current batch
  const [syncTrigger, setSyncTrigger] = useState(0); // Incremented to trigger LogView Sheets refresh

  // Modal state (replaces native alert/confirm)
  const [alertModal, setAlertModal] = useState({ open: false, title: '', message: '', danger: false });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', danger: false, onConfirm: null });
  const showAlert = useCallback((title, message, danger = false) => setAlertModal({ open: true, title, message, danger }), []);
  const showConfirm = useCallback((title, message, onConfirm, danger = false) => setConfirmModal({ open: true, title, message, danger, onConfirm }), []);
  const { showToast, ToastContainer } = useToast();

  // Auth hook
  const { authLoading, setAuthLoading } = useAuth(config, setConfig, showAlert);

  // Let processor notify us when it auto-creates a sheet
  useEffect(() => {
    setConfigCallback((patch) => {
      setConfig(prev => {
        const updated = { ...prev, ...patch };
        store('rr-config', updated);
        return updated;
      });
    });
  }, []);

  useEffect(() => {
    (async () => {
      // Restore user scope before loading scoped data
      const legacyConfig = localStorage.getItem('rr-config');
      if (legacyConfig) {
        try {
          const lc = JSON.parse(legacyConfig);
          if (lc.googleProfile?.sub) setCurrentUser(lc.googleProfile.sub);
          else if (lc.googleProfile?.email) setCurrentUser(lc.googleProfile.email);
        } catch {}
      }
      const c = await load('rr-config', DEFAULT_CONFIG);
      const r = await load('rr-receipts', []);
      // Use built-in Client ID if available
      const effectiveClientId = BUILT_IN_CLIENT_ID || c.clientId;
      const mergedConfig = { ...c, clientId: effectiveClientId };
      setConfig(mergedConfig);
      setReceipts(r);
      setReady(true);
      if (effectiveClientId && mergedConfig.setupDone) {
        // Load Google API scripts in background — don't block UI
        initGoogleAPI(effectiveClientId).then(async () => {
          const email = mergedConfig.googleProfile?.email;
          if (email) setLoginHint(email);

          // Try restoring saved token (instant, no network, no UI)
          let hasToken = tryRestoreSession();
          if (!hasToken) {
            try {
              await requestAccessToken({
                prompt: '',
                loginHint: email,
                persistent: false,
              });
              hasToken = true;
            } catch {
              // Silent failed — try interactive auth immediately
              try {
                setAuthLoading(true);
                await requestAccessToken({ persistent: false });
                hasToken = true;
                setAuthLoading(false);
              } catch {
                setAuthLoading(false);
                console.info('Interactive auth failed/cancelled on startup');
              }
            }
          }

          if (hasToken) {
            // Update connected state if needed (e.g. new device, Safari re-auth)
            if (!mergedConfig.connected) {
              let googleProfile = mergedConfig.googleProfile;
              try {
                googleProfile = await fetchUserProfile();
                if (googleProfile?.sub) setCurrentUser(googleProfile.sub);
                else if (googleProfile?.email) setCurrentUser(googleProfile.email);
              } catch {}
              const updated = { ...mergedConfig, connected: true, googleProfile };
              setConfig(updated);
              store('rr-config', updated);
              handleSyncCloudConfig(updated);
            } else {
              handleSyncCloudConfig(mergedConfig);
            }
            deduplicateFolders();
            // Retry any failed Sheets writes from previous sessions
            retrySheetOutbox().then(() => {
              // After successful retry, clean up local receipts that were pending
              load('rr-receipts', []).then(localReceipts => {
                const stillPending = localReceipts.filter(r => r.sheetSyncFailed);
                if (stillPending.length < localReceipts.length) {
                  store('rr-receipts', stillPending);
                }
              });
            }).catch(() => {});
          }
        }).catch(() => {
          console.warn('Google API init skipped on startup');
        });
      }

      // Check for pending non-receipt alerts from previous sessions (user-scoped)
      try {
        const scopedAlerts = await load('rr-non-receipt-alerts', []);
        // Migration: old bug wrote deletions to unscoped key while scoped key kept stale data.
        // If unscoped key exists and has fewer items, it has the real (post-deletion) state.
        // Merge: only keep alerts whose fileIds appear in BOTH lists (intersection),
        // or if unscoped is gone, just use scoped as-is.
        let alerts = scopedAlerts;
        try {
          const unscopedRaw = localStorage.getItem('rr-non-receipt-alerts');
          if (unscopedRaw) {
            const unscopedAlerts = JSON.parse(unscopedRaw);
            if (Array.isArray(unscopedAlerts)) {
              // Unscoped key has the deletion-updated list — use it as filter
              const unscopedIds = new Set(unscopedAlerts.map(a => a.fileId));
              alerts = scopedAlerts.filter(a => unscopedIds.has(a.fileId));
              // Persist the cleaned list to scoped key
              if (alerts.length !== scopedAlerts.length) {
                await store('rr-non-receipt-alerts', alerts);
              }
            }
            // Remove the stale unscoped key
            localStorage.removeItem('rr-non-receipt-alerts');
          }
        } catch {}
        setNonReceiptAlerts(alerts);
        if (alerts.length > 0) setShowNonReceiptModal(true);
      } catch {
        setNonReceiptAlerts([]);
      }

      // T-018: Check for saved processing progress from previous session
      const savedProgress = await getSavedProgress();
      if (savedProgress) {
        setProcStatus({ ...savedProgress, processing: false, resumed: true });
      }
    })();
  }, []);

  // Send access token to SW whenever it changes (so SW can make API calls in background)
  useEffect(() => {
    if (config.connected) {
      const token = getAccessToken();
      if (token) sendTokenToSW(token);
    }
  }, [config.connected, procStatus]); // re-send on auth changes

  // Listen for SW background processing results
  useEffect(() => {
    onSWMessage({
      onTaskUpdate: (task) => {
        // Update processing status when SW reports progress
        setProcStatus(prev => prev ? { ...prev, processing: true } : { processing: true, total: 1, done: 0, failed: 0, review: 0 });
      },
      onTaskDone: (task) => {
        // SW finished processing a file — add receipt and update status
        if (task.result) {
          const receipt = {
            id: task.driveFileId,
            driveId: task.driveFileId,
            ...task.result,
            status: (task.result.confidence || 0) >= 70 ? 'validated' : 'review',
            createdAt: new Date().toISOString(),
          };
          addReceipt(receipt);
        }
        setProcStatus(prev => {
          if (!prev) return null;
          const done = (prev.done || 0) + 1;
          const processing = done < (prev.total || 0);
          return { ...prev, done, processing };
        });
      },
      onTaskError: (task) => {
        setProcStatus(prev => {
          if (!prev) return null;
          return { ...prev, failed: (prev.failed || 0) + 1 };
        });
      },
    });
  }, []);

  // T-017: Resume processing when app becomes visible again + auto-sync records
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && config.setupDone && config.connected) {
        // Send fresh token to SW
        const token = getAccessToken();
        if (token) sendTokenToSW(token);

        // Resume SW processing
        resumeSWProcessing();

        // Also check main-thread queue
        const saved = await getSavedProgress();
        if (saved && saved.processing) {
          triggerProcessing();
        }

        // Trigger Sheets auto-sync on resume
        setSyncTrigger(n => n + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [config]);

  // Auto-sync records from Sheets every 5 minutes while app is visible
  useEffect(() => {
    if (!config.setupDone || !config.connected || !config.sheetId) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setSyncTrigger(n => n + 1);
      }
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [config.setupDone, config.connected, config.sheetId]);

  // Cloud config sync — detect folder name conflicts across devices
  const handleSyncCloudConfig = async (localConfig) => {
    const conflict = await syncCloudConfig(localConfig, { setConfig, showToast });
    if (conflict) {
      setConfigConflict(conflict);
    }
  };

  // Resolve config conflict — user picks cloud or local
  const resolveConfigConflict = async (useCloud) => {
    if (!configConflict) return;
    const merged = await resolveConflict(useCloud, configConflict, config, { showToast });
    setConfig(merged);
    setConfigConflict(null);
  };

  const _prevProcessing = useRef(false);
  const handleProcStatus = (status) => {
    setProcStatus(status);
    // T-014: update review count from processing results
    if (status.review > 0) {
      setReviewCount(prev => prev + status.review);
    }
    // Toast when batch processing finishes
    if (_prevProcessing.current && !status.processing && status.total > 0) {
      const msg = status.failed > 0
        ? `处理完成：${status.done} 张成功，${status.failed} 张失败`
        : `全部处理完成 🎉 共 ${status.done} 张`;
      showToast(msg, status.failed > 0 ? 'warn' : 'success', 4000);
    }
    _prevProcessing.current = status.processing;
  };

  const triggerProcessing = (cfg) => {
    setLiveResults([]); // Clear previous batch results
    processInboxBackground(cfg || config, handleProcStatus, addReceipt);
  };

  // Navigate with unified auth check — if not logged in, redirect to settings
  const handleNav = async (newView) => {
    const needsAuth = ['review', 'inbox', 'scan'];
    if (needsAuth.includes(newView) && !getAccessToken()) {
      // Try silent restore first (no UI)
      const restored = tryRestoreSession();
      if (restored) {
        // Token restored silently — update connected state if needed
        if (!config.connected) {
          try {
            const googleProfile = await fetchUserProfile();
            if (googleProfile?.email) setLoginHint(googleProfile.email);
            const updated = { ...config, connected: true, googleProfile };
            setConfig(updated);
            await store('rr-config', updated);
          } catch {}
        }
        navTo(newView);
        return;
      }

      // Silent restore failed — try background GIS refresh
      try {
        setAuthLoading(true);
        await requestAccessToken({
          prompt: '',
          loginHint: config.googleProfile?.email,
          persistent: false,
        });
        // Auth succeeded silently — update state
        let googleProfile = config.googleProfile;
        try {
          googleProfile = await fetchUserProfile();
          if (googleProfile?.email) setLoginHint(googleProfile.email);
        } catch {}
        const updated = { ...config, connected: true, googleProfile };
        setConfig(updated);
        await store('rr-config', updated);
        setAuthLoading(false);
        navTo(newView);
        return;
      } catch {
        setAuthLoading(false);
      }

      // All silent methods failed — try interactive login directly
      try {
        setAuthLoading(true);
        await requestAccessToken({ persistent: false }); // interactive consent
        let googleProfile = config.googleProfile;
        try {
          googleProfile = await fetchUserProfile();
          if (googleProfile?.email) setLoginHint(googleProfile.email);
          if (googleProfile?.sub) setCurrentUser(googleProfile.sub);
          else if (googleProfile?.email) setCurrentUser(googleProfile.email);
        } catch {}
        const updated = { ...config, connected: true, googleProfile };
        setConfig(updated);
        await store('rr-config', updated);
        setAuthLoading(false);
        // Sync cloud config after login
        handleSyncCloudConfig(updated);
        deduplicateFolders();
        navTo(newView);
        return;
      } catch {
        setAuthLoading(false);
        // Interactive login also failed/cancelled — go to settings
        navTo('cfg');
        return;
      }
    }
    navTo(newView);
  };

  const saveConfig = async (c) => {
    setConfig(c);
    await store('rr-config', c);
    // Sync to cloud so other devices pick it up
    if (c.connected) {
      const toSave = {};
      SYNC_FIELDS.forEach(k => { if (c[k] != null) toSave[k] = c[k]; });
      toSave.updatedAt = new Date().toISOString();
      saveCloudConfig(toSave).catch((e) => {
        console.warn('Cloud config sync failed:', e);
        showToast('⚠️ 配置同步失败，其他设备可能不会更新', 'warn', 4000);
      });
    }
  };

  const addReceipt = async (r) => {
    // Add to live results panel (session-only display)
    setLiveResults(prev => [...prev, r]);

    // Toast: AI recognition complete
    const merchant = r.merchant || '未知商家';
    const amount = r.amount ? ` $${parseFloat(r.amount).toFixed(2)}` : '';
    if (r.status === 'validated') {
      showToast(`${merchant}${amount} 已识别归档 📂`, 'success');
    } else if (r.status === 'review') {
      showToast(`${merchant}${amount} 需要人工审核 👀`, 'warn');
    }

    // Only persist locally if Sheets sync failed (so we can retry later)
    // Successfully synced items live in Sheets only (single source of truth)
    if (r.sheetSyncFailed) {
      const updated = [r, ...receipts];
      setReceipts(updated);
      await store('rr-receipts', updated);
    }
  };

  const deleteReceipt = async (id) => {
    const updated = receipts.filter((r) => r.id !== id);
    setReceipts(updated);
    await store('rr-receipts', updated);
  };

  const updateReceipt = async (updatedReceipt) => {
    const updated = receipts.map((r) =>
      r.id === updatedReceipt.id ? updatedReceipt : r
    );
    setReceipts(updated);
    await store('rr-receipts', updated);
    setDetailReceipt(null);
  };

  const handleSetupComplete = async (c) => {
    await saveConfig({ ...c, setupDone: true });
    navTo('dash');
  };

  const handleReconnect = async () => {
    try {
      const effectiveClientId = BUILT_IN_CLIENT_ID || config.clientId;
      if (!isGapiLoaded()) await initGoogleAPI(effectiveClientId);
      // persistent=false: token in sessionStorage only; Google session cookie handles cross-session restore
      await requestAccessToken({ persistent: false });
      // Fetch profile (name, email, avatar) right after auth
      let googleProfile = config.googleProfile || null;
      try {
        googleProfile = await fetchUserProfile();
        if (googleProfile?.email) setLoginHint(googleProfile.email);
        // Set user scope for data isolation
        if (googleProfile?.sub) setCurrentUser(googleProfile.sub);
        else if (googleProfile?.email) setCurrentUser(googleProfile.email);
      } catch {
        // Non-fatal — profile display is best-effort
      }
      const updated = { ...config, connected: true, googleProfile };
      setConfig(updated);
      await store('rr-config', updated);
    } catch (e) {
      showAlert('连接失败', e.message || JSON.stringify(e), true);
    }
  };

  const handleSignOut = async () => {
    signOut();
    clearSWToken(); // Immediately clear token from SW memory
    // Don't clear user data on sign-out — it stays scoped by user ID.
    // When another user logs in, they get their own scoped data.
    const updated = { ...config, connected: false };
    setConfig(updated);
    await store('rr-config', updated);
  };

  const executeReset = async () => {
    // Preserve auth state across reset
    const preservedAuth = {
      connected: config.connected,
      googleProfile: config.googleProfile,
      clientId: config.clientId,
      setupDone: config.setupDone,
      sheetId: config.sheetId,
      sheetName: config.sheetName,
    };
    clearAllData();
    const resetConfig = { ...DEFAULT_CONFIG, ...preservedAuth };
    setConfig(resetConfig);
    await store('rr-config', resetConfig);
    setReceipts([]);
    // Also clear IndexedDB caches (both scoped and unscoped)
    try {
      const userId = localStorage.getItem('rr-current-user') || '';
      const dbs = ['rr-sw-queue']; // Unscoped
      if (userId) {
        dbs.push(`rr-image-cache::${userId}`, `rr-pending-uploads::${userId}`);
      }
      // Also try unscoped names for legacy
      dbs.push('rr-image-cache', 'rr-pending-uploads');
      dbs.forEach(name => indexedDB.deleteDatabase(name));
    } catch {}
  };

  const handleReset = () => {
    showConfirm(
      '清除本地缓存',
      '确定要清除所有本地缓存吗？不影响 Google 账号连接和 Drive 数据。',
      executeReset
    );
  };

  const handleNukeAll = async () => {
    // 1. Delete cloud data (Drive folders + Sheets rows + config file)
    const result = await nukeAllUserData(config.sheetId, config.sheetName || 'receipt_index');

    // 2. Clear all local data
    clearAllData();

    // 3. Clear IndexedDB
    try {
      const userId = localStorage.getItem('rr-current-user') || '';
      const dbs = ['rr-sw-queue'];
      if (userId) {
        dbs.push(`rr-image-cache::${userId}`, `rr-pending-uploads::${userId}`);
      }
      dbs.push('rr-image-cache', 'rr-pending-uploads');
      dbs.forEach(name => indexedDB.deleteDatabase(name));
    } catch {}

    // 4. Sign out
    signOut();
    clearSWToken();

    // 5. Reset app state to factory defaults
    setConfig(DEFAULT_CONFIG);
    setReceipts([]);

    return result;
  };

  if (!ready)
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: T.bg,
          fontFamily: F,
        }}
      >
        <div style={{ textAlign: 'center', color: T.tx3 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{'\u{1F9FE}'}</div>
          <div style={{ fontSize: 13 }}>Loading...</div>
        </div>
      </div>
    );

  if (!config.setupDone) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: T.bg,
          fontFamily: F,
          color: T.tx,
          maxWidth: 520,
          margin: '0 auto',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <style>{css}</style>
        <SetupView
          config={config}
          setConfig={setConfig}
          onSave={handleSetupComplete}
          showAlert={showAlert}
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastContainer />
      <div
        style={{
          minHeight: '100vh',
          background: T.bg,
          fontFamily: F,
          color: T.tx,
          maxWidth: 520,
          margin: '0 auto',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <style>{css}</style>

        {/* Processing badge — bottom floating pill, above nav, avoids Dynamic Island */}
        {procStatus?.processing && (
          <div style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            background: 'rgba(17,24,39,0.92)',
            color: '#fff',
            borderRadius: 40,
            padding: '9px 18px',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            backdropFilter: 'blur(12px)',
            animation: 'fadeUp 0.25s ease',
          }}>
            <div style={{
              width: 12, height: 12,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }} />
            {(() => {
              const effectiveTotal = Math.max(procStatus.total || 0, (procStatus.done || 0) + (procStatus.failed || 0));
              const remaining = effectiveTotal - (procStatus.done || 0) - (procStatus.failed || 0);
              const parts = [`AI 识别中`];
              if (effectiveTotal > 1) parts.push(`${procStatus.done || 0}/${effectiveTotal}`);
              if (remaining > 0) parts.push(`剩余 ${remaining} 张`);
              if (procStatus.failed > 0) parts.push(`${procStatus.failed} 失败`);
              return parts.join(' · ');
            })()}
          </div>
        )}

        {/* Non-receipt alert modal */}
        {showNonReceiptModal && nonReceiptAlerts?.length > 0 && (
          <NonReceiptModal
            alerts={nonReceiptAlerts}
            onClose={(updated) => {
              setNonReceiptAlerts(updated);
              setShowNonReceiptModal(false);
            }}
            onManualReview={(item) => {
              // Remove this alert and go to ReviewView — file is already in 待确认 folder
              const updated = nonReceiptAlerts.filter(a => a.fileId !== item.fileId);
              setNonReceiptAlerts(updated);
              setShowNonReceiptModal(false);
              navTo('review');
            }}
          />
        )}

        {/* Config conflict resolution modal */}
        {configConflict && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 800,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{
              background: T.sf, borderRadius: 20, padding: '24px 20px',
              maxWidth: 360, width: '100%',
              border: `1px solid ${T.bdr}`,
              boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.tx, marginBottom: 6 }}>
                ⚠️ 设置不一致
              </div>
              <div style={{ fontSize: 12, color: T.tx2, marginBottom: 16, lineHeight: 1.6 }}>
                检测到其他设备的文件夹设置与本设备不同，请选择使用哪一方：
              </div>

              {configConflict.fields.map(k => {
                const labels = {
                  inboxFolder: '📥 待处理', validatedFolder: '✅ 已存档',
                  reviewFolder: '⚠️ 待确认', sheetId: '📊 记录表',
                  sheetName: '📊 表格名',
                };
                return (
                  <div key={k} style={{
                    padding: '10px 12px', marginBottom: 8,
                    background: T.sf2, borderRadius: 10, border: `1px solid ${T.bdr}`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.tx3, marginBottom: 6 }}>
                      {labels[k] || k}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, fontSize: 12, color: T.tx }}>
                        <span style={{ fontSize: 10, color: T.tx3 }}>☁️ 云端：</span><br/>
                        <strong>{configConflict.cloud[k]?.slice?.(0, 20) || '—'}</strong>
                      </div>
                      <div style={{ flex: 1, fontSize: 12, color: T.tx }}>
                        <span style={{ fontSize: 10, color: T.tx3 }}>📱 本地：</span><br/>
                        <strong>{configConflict.local[k]?.slice?.(0, 20) || '—'}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => resolveConfigConflict(true)} style={{
                  flex: 1, padding: '12px', borderRadius: 12,
                  background: T.accDim, border: `1px solid rgba(250,204,21,0.3)`,
                  color: T.acc, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
                }}>
                  ☁️ 用云端的
                </button>
                <button onClick={() => resolveConfigConflict(false)} style={{
                  flex: 1, padding: '12px', borderRadius: 12,
                  background: T.sf2, border: `1px solid ${T.bdr}`,
                  color: T.tx, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
                }}>
                  📱 用本地的
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auth loading overlay — robot animation */}
        {authLoading && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: T.bg, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <RobotWorking
              title="正在连接 Google…"
              sub={'请在弹出的网页窗口中确认账号\n确认后会自动回到这里'}
            />
          </div>
        )}

        {view === 'scan' && (
          <ScanView
            config={config}
            onUploaded={() => {}}
            onSync={() => triggerProcessing()}
            procStatus={procStatus}
            onStatusChange={handleProcStatus}
            onReceiptProcessed={addReceipt}
            showToast={showToast}
            liveResults={liveResults}
          />
        )}
        {view === 'review' && <ReviewView config={config} showToast={showToast} onReceiptProcessed={addReceipt} showAlert={showAlert} showConfirm={showConfirm} />}
        {view === 'inbox' && <InboxView config={config} onProcessed={addReceipt} showAlert={showAlert} />}
        {view === 'log' && !detailReceipt && (
          <LogView
            receipts={receipts}
            onDelete={deleteReceipt}
            onDetail={(r) => setDetailReceipt(r)}
            config={config}
            refreshKey={receipts.length}
            syncTrigger={syncTrigger}
            showAlert={showAlert}
          />
        )}
        {view === 'log' && detailReceipt && (
          <DetailView
            receipt={detailReceipt}
            onSave={updateReceipt}
            onBack={() => setDetailReceipt(null)}
          />
        )}
        {view === 'cfg' && (
          <ConfigView
            config={config}
            setConfig={setConfig}
            onSave={saveConfig}
            onReconnect={handleReconnect}
            onSignOut={handleSignOut}
            onReset={handleReset}
            onNukeAll={handleNukeAll}
            showAlert={showAlert}
          />
        )}

        {/* Global modals */}
        <AlertModal
          open={alertModal.open}
          onClose={() => setAlertModal(m => ({ ...m, open: false }))}
          title={alertModal.title}
          message={alertModal.message}
          danger={alertModal.danger}
        />
        <ConfirmModal
          open={confirmModal.open}
          onClose={() => setConfirmModal(m => ({ ...m, open: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger}
        />

        <Nav view={view} set={(v) => {
          if (v === 'review') setReviewCount(0); // Clear badge when entering review
          handleNav(v);
        }} reviewCount={reviewCount} />
      </div>
    </ErrorBoundary>
  );
}
