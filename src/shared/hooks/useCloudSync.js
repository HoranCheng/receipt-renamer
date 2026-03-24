import { readCloudConfig, saveCloudConfig, renameSubFolder } from '../../services/google';
import { store } from '../../services/storage';
import { DEFAULT_CONFIG } from '../constants';

// ─── Cloud config sync ────────────────────────────────────────────────────────

// All user preferences that should sync across devices
export const SYNC_FIELDS = [
  'inboxFolder', 'validatedFolder', 'reviewFolder',
  'sheetId', 'sheetName',
  'compressImages', 'wifiOnlyUpload',
];

/**
 * Sync cloud config with local config.
 * Returns a conflict object if conflicts detected, otherwise null.
 * Calls setConfig and showToast when provided.
 */
export async function syncCloudConfig(localConfig, { setConfig, showToast } = {}) {
  try {
    const cloud = await readCloudConfig();
    const syncFields = SYNC_FIELDS;

    if (!cloud) {
      // No cloud config yet — upload current config as the source of truth
      const toSave = {};
      syncFields.forEach(k => { if (localConfig[k] != null) toSave[k] = localConfig[k]; });
      toSave.updatedAt = new Date().toISOString();
      try {
        await saveCloudConfig(toSave);
      } catch (e) {
        console.warn('Initial cloud config upload failed:', e);
        showToast?.('⚠️ 配置上传失败，跨设备同步可能不可用', 'warn', 4000);
      }
      return null;
    }

    // Determine if local is "fresh" (new device / never customized)
    const isLocalFresh = !localConfig.sheetId && (
      localConfig.inboxFolder === DEFAULT_CONFIG.inboxFolder &&
      localConfig.validatedFolder === DEFAULT_CONFIG.validatedFolder &&
      localConfig.reviewFolder === DEFAULT_CONFIG.reviewFolder
    );

    if (isLocalFresh) {
      // New device — cloud wins for everything, no conflict prompt
      let updated = { ...localConfig };
      let changed = false;
      syncFields.forEach(k => {
        if (cloud[k] != null) {
          updated[k] = cloud[k];
          changed = true;
        }
      });
      if (cloud.sheetId) { updated.sheetId = cloud.sheetId; changed = true; }
      if (cloud.sheetName) { updated.sheetName = cloud.sheetName; changed = true; }
      if (changed) {
        setConfig?.(updated);
        await store('rr-config', updated);
        console.info('Synced cloud config to new device:', updated);
      }
      return null;
    }

    // Both sides have customized values — check for conflicts
    const conflicts = syncFields.filter(k =>
      cloud[k] != null && localConfig[k] != null && cloud[k] !== localConfig[k]
    );

    if (conflicts.length > 0) {
      return { cloud, local: localConfig, fields: conflicts };
    }

    // No conflict — merge (cloud wins for missing local values)
    let updated = { ...localConfig };
    let changed = false;
    syncFields.forEach(k => {
      if (cloud[k] != null && localConfig[k] == null) {
        updated[k] = cloud[k];
        changed = true;
      }
    });
    if (changed) {
      setConfig?.(updated);
      await store('rr-config', updated);
    }
    return null;
  } catch (e) {
    console.warn('Cloud config sync failed:', e);
    return null;
  }
}

/**
 * Resolve a config conflict — user picks cloud or local.
 * Returns the merged config object.
 */
export async function resolveConfigConflict(useCloud, configConflict, config, { showToast } = {}) {
  if (!configConflict) return config;
  const syncFields = SYNC_FIELDS;
  const folderFields = ['inboxFolder', 'validatedFolder', 'reviewFolder'];
  let merged = { ...config };

  if (useCloud) {
    for (const k of syncFields) {
      if (configConflict.cloud[k] != null) {
        const oldVal = merged[k];
        merged[k] = configConflict.cloud[k];
        if (folderFields.includes(k) && oldVal && oldVal !== merged[k]) {
          try { await renameSubFolder(oldVal, merged[k]); } catch (e) {
            console.warn(`Failed to rename folder ${oldVal} → ${merged[k]}:`, e);
          }
        }
      }
    }
  } else {
    for (const k of folderFields) {
      const cloudVal = configConflict.cloud[k];
      const localVal = merged[k];
      if (cloudVal && localVal && cloudVal !== localVal) {
        try { await renameSubFolder(cloudVal, localVal); } catch (e) {
          console.warn(`Failed to rename folder ${cloudVal} → ${localVal}:`, e);
        }
      }
    }
    for (const k of syncFields) {
      if (!merged[k] && configConflict.cloud[k]) {
        merged[k] = configConflict.cloud[k];
      }
    }
  }

  await store('rr-config', merged);
  const toSave = {};
  syncFields.forEach(k => { if (merged[k] != null) toSave[k] = merged[k]; });
  toSave.updatedAt = new Date().toISOString();
  try {
    await saveCloudConfig(toSave);
  } catch (e) {
    console.warn('Cloud config sync after conflict resolve failed:', e);
    showToast?.('⚠️ 配置同步失败，请稍后在设置中重试', 'warn', 4000);
  }
  return merged;
}
