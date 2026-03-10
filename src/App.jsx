import { useState, useEffect } from 'react';
import { T, F } from './constants/theme';
import { DEFAULT_CONFIG } from './constants';
import {
  initGoogleAPI,
  isGapiLoaded,
  requestAccessToken,
  fetchUserProfile,
  tryRestoreSession,
  setLoginHint,
  signOut,
  getAccessToken,
} from './services/google';
import { processInboxBackground, getSavedProgress } from './services/processor';
import { sendTokenToSW, onSWMessage, resumeSWProcessing } from './services/swBridge';
import { store, load } from './services/storage';
import { css } from './styles';
import Nav from './components/Nav';
import ErrorBoundary from './components/ErrorBoundary';
import SetupView from './views/SetupView';
import DashView from './views/DashView';
import { RobotWorking } from './components/RobotScene';
import NonReceiptModal from './components/NonReceiptModal';
import InboxView from './views/InboxView';
import ScanView from './views/ScanView';
import ReviewView from './views/ReviewView';
import LogView from './views/LogView';
import ConfigView from './views/ConfigView';
import DetailView from './views/DetailView';

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
  const [authLoading, setAuthLoading] = useState(false);
  const [reviewCount, setReviewCount] = useState(0); // T-014: badge for review tab

  useEffect(() => {
    (async () => {
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
        initGoogleAPI(effectiveClientId).then(() => {
          if (mergedConfig.connected) {
            const email = mergedConfig.googleProfile?.email;
            if (email) setLoginHint(email);

            // Try restoring saved token (instant, no network, no UI)
            const restored = tryRestoreSession();
            if (!restored) {
              // Token expired — try ONE silent refresh in background
              // prompt: '' means no popup IF user has active Google session
              requestAccessToken({
                prompt: '',
                loginHint: email,
                persistent: mergedConfig.rememberMe,
              }).catch(() => {
                // Silent refresh failed — user will need to re-auth on next action
                // Don't show any loading screen here
                console.info('Silent token refresh failed — will prompt on next action');
              });
            }
          }
        }).catch(() => {
          console.warn('Google API init skipped on startup');
        });
      }

      // Check for pending non-receipt alerts from previous sessions
      try {
        const alerts = JSON.parse(localStorage.getItem('rr-non-receipt-alerts') || '[]');
        setNonReceiptAlerts(alerts);
        if (alerts.length > 0) setShowNonReceiptModal(true);
      } catch {
        setNonReceiptAlerts([]);
      }

      // T-018: Check for saved processing progress from previous session
      const savedProgress = getSavedProgress();
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

  // T-017: Resume processing when app becomes visible again
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && config.setupDone && config.connected) {
        // Send fresh token to SW
        const token = getAccessToken();
        if (token) sendTokenToSW(token);

        // Resume SW processing
        resumeSWProcessing();

        // Also check main-thread queue
        const saved = getSavedProgress();
        if (saved && saved.processing) {
          triggerProcessing();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [config]);

  const handleProcStatus = (status) => {
    setProcStatus(status);
    // T-014: update review count from processing results
    if (status.review > 0) {
      setReviewCount(prev => prev + status.review);
    }
  };

  const triggerProcessing = (cfg) => {
    processInboxBackground(cfg || config, handleProcStatus, addReceipt);
  };

  // Navigate with graceful auth refresh for views that need Drive access
  const handleNav = async (newView) => {
    const needsAuth = ['review', 'inbox'];
    if (needsAuth.includes(newView) && !getAccessToken()) {
      setAuthLoading(true);
      try {
        await requestAccessToken({ prompt: '' });
      } catch (e) {
        console.warn('Auth refresh failed:', e);
      }
      setAuthLoading(false);
    }
    navTo(newView);
  };

  const saveConfig = async (c) => {
    setConfig(c);
    await store('rr-config', c);
  };

  const addReceipt = async (r) => {
    const updated = [r, ...receipts];
    setReceipts(updated);
    await store('rr-receipts', updated);
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

  const handleReconnect = async (persistent = false) => {
    try {
      const effectiveClientId = BUILT_IN_CLIENT_ID || config.clientId;
      if (!isGapiLoaded()) await initGoogleAPI(effectiveClientId);
      await requestAccessToken({ persistent });
      // Fetch profile (name, email, avatar) right after auth
      let googleProfile = config.googleProfile || null;
      try {
        googleProfile = await fetchUserProfile();
        if (googleProfile?.email) setLoginHint(googleProfile.email);
      } catch {
        // Non-fatal — profile display is best-effort
      }
      const updated = { ...config, connected: true, googleProfile };
      setConfig(updated);
      await store('rr-config', updated);
    } catch (e) {
      alert(
        '\u8FDE\u63A5\u5931\u8D25\uFF1A' + (e.message || JSON.stringify(e))
      );
    }
  };

  const handleSignOut = async () => {
    signOut();
    const updated = { ...config, connected: false };
    setConfig(updated);
    await store('rr-config', updated);
  };

  const handleReset = async () => {
    if (
      !confirm(
        '\u786E\u5B9A\u8981\u6E05\u9664\u6240\u6709\u8BBE\u7F6E\u548C\u8BB0\u5F55\u5417\uFF1F'
      )
    )
      return;
    setConfig(DEFAULT_CONFIG);
    setReceipts([]);
    await store('rr-config', DEFAULT_CONFIG);
    await store('rr-receipts', []);
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
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
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
              const remaining = (procStatus.total || 0) - (procStatus.done || 0) - (procStatus.failed || 0);
              const parts = [`AI 识别中`];
              if (procStatus.total > 1) parts.push(`${procStatus.done || 0}/${procStatus.total}`);
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
          />
        )}
        {view === 'review' && <ReviewView config={config} />}
        {view === 'inbox' && <InboxView config={config} onProcessed={addReceipt} />}
        {view === 'log' && !detailReceipt && (
          <LogView
            receipts={receipts}
            onDelete={deleteReceipt}
            onDetail={(r) => setDetailReceipt(r)}
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
          />
        )}

        <Nav view={view} set={(v) => {
          if (v === 'review') setReviewCount(0); // Clear badge when entering review
          handleNav(v);
        }} reviewCount={reviewCount} />
      </div>
    </ErrorBoundary>
  );
}
