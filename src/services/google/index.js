// Barrel: re-export everything so existing imports from '../services/google' still work unchanged.

export {
  initGoogleAPI,
  isGapiLoaded,
  getAccessToken,
  saveSession,
  tryRestoreSession,
  clearSession,
  requestAccessToken,
  fetchUserProfile,
  ensureToken,
  setLoginHint,
  getCachedGoogleIdToken,
  getGoogleIdToken,
  getToken,
  _clearToken,
  driveReq,
} from './auth';

import { signOut as _authSignOut } from './auth';
import {
  clearFolderCache,
  escQ,
  getOrCreateRootFolder,
  renameSubFolder,
  findOrCreateFolder,
  deduplicateFolders,
  listFilesInFolder,
  getFileAsBase64,
  getFileAsBlobUrl,
  getFileThumbnailUrl,
  uploadToDriveFolder,
  renameAndMoveFile,
  deleteFile,
  updateFileMetadata,
  getFileMetadata,
  nukeAllUserData,
  readCloudConfig,
  saveCloudConfig,
} from './drive';

/**
 * Combined signOut: revoke token (auth) + clear folder cache (drive).
 * Replaces the original monolithic google.js signOut that called both.
 */
export function signOut() {
  _authSignOut();
  clearFolderCache();
}

export {
  escQ,
  getOrCreateRootFolder,
  renameSubFolder,
  clearFolderCache,
  findOrCreateFolder,
  deduplicateFolders,
  listFilesInFolder,
  getFileAsBase64,
  getFileAsBlobUrl,
  getFileThumbnailUrl,
  uploadToDriveFolder,
  renameAndMoveFile,
  deleteFile,
  updateFileMetadata,
  getFileMetadata,
  nukeAllUserData,
  readCloudConfig,
  saveCloudConfig,
};

export {
  createReceiptSheet,
  readSheetRecords,
  appendToSheet,
} from './sheets';
