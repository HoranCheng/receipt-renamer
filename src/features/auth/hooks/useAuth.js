import { useState } from 'react';
import {
  initGoogleAPI,
  isGapiLoaded,
  requestAccessToken,
  fetchUserProfile,
  tryRestoreSession,
  setLoginHint,
  signOut,
  deduplicateFolders,
} from '../../../services/google';
import { store, setCurrentUser } from '../../../services/storage';
import { clearSWToken } from '../../../services/swBridge';

const BUILT_IN_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/**
 * useAuth — authentication state and actions.
 *
 * @param {object} config  - current app config (contains connected, googleProfile, clientId)
 * @param {function} setConfig - config setter
 * @param {function} showAlert - optional alert callback
 * @returns {{ user, profile, isLoggedIn, isLoading, login, logout, switchAccount }}
 */
export default function useAuth(config, setConfig, showAlert) {
  const [authLoading, setAuthLoading] = useState(false);

  const user = config.googleProfile || null;
  const profile = config.googleProfile || null;
  const isLoggedIn = Boolean(config.connected);
  const isLoading = authLoading;

  const login = async () => {
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
      if (showAlert) showAlert('连接失败', e.message || JSON.stringify(e), true);
      throw e;
    }
  };

  const logout = async () => {
    signOut();
    clearSWToken(); // Immediately clear token from SW memory
    const updated = { ...config, connected: false };
    setConfig(updated);
    await store('rr-config', updated);
  };

  /**
   * switchAccount — force account picker and re-auth.
   */
  const switchAccount = async () => {
    try {
      setAuthLoading(true);
      await requestAccessToken({ prompt: 'select_account', persistent: false });
      let googleProfile = config.googleProfile || null;
      try {
        googleProfile = await fetchUserProfile();
        if (googleProfile?.email) setLoginHint(googleProfile.email);
        if (googleProfile?.sub) setCurrentUser(googleProfile.sub);
        else if (googleProfile?.email) setCurrentUser(googleProfile.email);
      } catch {}
      const updated = { ...config, connected: true, googleProfile };
      setConfig(updated);
      await store('rr-config', updated);
      deduplicateFolders();
      setAuthLoading(false);
    } catch (e) {
      setAuthLoading(false);
      if (showAlert) showAlert('切换账号失败', e.message || JSON.stringify(e), true);
    }
  };

  return {
    user,
    profile,
    isLoggedIn,
    isLoading,
    authLoading,
    setAuthLoading,
    login,
    logout,
    switchAccount,
  };
}
