import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_CONFIG, BUILT_IN_CLIENT_ID } from '../constants';
import {
  initGoogleAPI,
  requestAccessToken,
  fetchUserProfile,
  tryRestoreSession,
  setLoginHint,
  signOut,
  getAccessToken,
  readCloudConfig,
  saveCloudConfig,
  deduplicateFolders,
} from '../services/google';
import { load, store, setCurrentUser } from '../services/storage';
import { sendTokenToSW, clearSWToken } from '../services/swBridge';
import { retrySheetOutbox } from '../services/processor';

/**
 * Auth hook — handles Google API init, token restore, silent/interactive auth,
 * cloud config sync, and token-to-SW bridging.
 *
 * Returns:
 *  { config, setConfig, ready, authLoading, configConflict, setConfigConflict,
 *    handleReconnect, handleSignOut, saveConfig, syncCloudConfig }
 */
export default function useAuth() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [configConflict, setConfigConflict] = useState(null);

  // ─── Cloud config sync ──────────────────────────────────────────────────
  const syncCloudConfig = useCallback(async (cfg) => {
    try {
      const cloud = await readCloudConfig();
      if (!cloud) {
        await saveCloudConfig(cfg);
        return;
      }
      // Detect conflicts
      const fields = [];
      if (cloud.sheetId && cfg.sheetId && cloud.sheetId !== cfg.sheetId) fields.push('sheetId');
      if (cloud.defaultFolder && cfg.defaultFolder && cloud.defaultFolder !== cfg.defaultFolder) fields.push('defaultFolder');
      if (fields.length > 0) {
        setConfigConflict({ cloud, local: cfg, fields });
      } else {
        // Merge cloud into local (cloud wins for unset fields)
        const merged = { ...cfg };
        if (!merged.sheetId && cloud.sheetId) merged.sheetId = cloud.sheetId;
        if (!merged.sheetName && cloud.sheetName) merged.sheetName = cloud.sheetName;
        if (!merged.defaultFolder && cloud.defaultFolder) merged.defaultFolder = cloud.defaultFolder;
        if (!merged.folderPath && cloud.folderPath) merged.folderPath = cloud.folderPath;
        setConfig(merged);
        await store('rr-config', merged);
      }
    } catch (e) {
      console.warn('Cloud config sync failed:', e);
    }
  }, []);

  // ─── Save config (local + cloud) ───────────────────────────────────────
  const saveConfig = useCallback(async (cfg) => {
    setConfig(cfg);
    await store('rr-config', cfg);
    if (cfg.connected) {
      saveCloudConfig(cfg).catch(() => {});
    }
  }, []);

  // ─── Reconnect (re-auth) ───────────────────────────────────────────────
  const handleReconnect = useCallback(async () => {
    try {
      setAuthLoading(true);
      await requestAccessToken({ persistent: false });
      const googleProfile = await fetchUserProfile();
      if (googleProfile?.sub) setCurrentUser(googleProfile.sub);
      const updated = { ...config, connected: true, googleProfile };
      setConfig(updated);
      await store('rr-config', updated);
      setAuthLoading(false);
    } catch (e) {
      setAuthLoading(false);
      throw e; // Let caller show alert
    }
  }, [config]);

  // ─── Sign out ───────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    signOut();
    clearSWToken();
    const updated = { ...config, connected: false };
    setConfig(updated);
    await store('rr-config', updated);
  }, [config]);

  // ─── Init on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Restore user scope
      const legacyConfig = localStorage.getItem('rr-config');
      if (legacyConfig) {
        try {
          const lc = JSON.parse(legacyConfig);
          if (lc.googleProfile?.sub) setCurrentUser(lc.googleProfile.sub);
          else if (lc.googleProfile?.email) setCurrentUser(lc.googleProfile.email);
        } catch {}
      }

      const c = await load('rr-config', DEFAULT_CONFIG);
      const effectiveClientId = BUILT_IN_CLIENT_ID || c.clientId;
      const mergedConfig = { ...c, clientId: effectiveClientId };
      setConfig(mergedConfig);
      setReady(true);

      if (effectiveClientId && mergedConfig.setupDone) {
        initGoogleAPI(effectiveClientId).then(async () => {
          const email = mergedConfig.googleProfile?.email;
          if (email) setLoginHint(email);

          let hasToken = tryRestoreSession();
          if (!hasToken) {
            try {
              await requestAccessToken({ prompt: '', loginHint: email, persistent: false });
              hasToken = true;
            } catch {
              try {
                setAuthLoading(true);
                await requestAccessToken({ persistent: false });
                hasToken = true;
                setAuthLoading(false);
              } catch {
                setAuthLoading(false);
              }
            }
          }

          if (hasToken) {
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
              syncCloudConfig(updated);
            } else {
              syncCloudConfig(mergedConfig);
            }
            deduplicateFolders();
            retrySheetOutbox().then(() => {
              load('rr-receipts', []).then(localReceipts => {
                const stillPending = localReceipts.filter(r => r.sheetSyncFailed);
                if (stillPending.length < localReceipts.length) {
                  store('rr-receipts', stillPending);
                }
              });
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    })();
  }, [syncCloudConfig]);

  // Token-to-SW bridge
  useEffect(() => {
    if (config.connected) {
      const token = getAccessToken();
      if (token) sendTokenToSW(token);
    }
  }, [config.connected]);

  return {
    config, setConfig, ready, authLoading, configConflict, setConfigConflict,
    handleReconnect, handleSignOut, saveConfig, syncCloudConfig,
  };
}
