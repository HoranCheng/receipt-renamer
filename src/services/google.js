// Re-export shim: all exports now live in ./google/ (split into auth, drive, sheets).
// This file exists only to preserve backward compatibility with any non-standard imports.
// The canonical entry point is ./google/index.js (auto-resolved by the import './google' pattern).
export * from './google/index.js';
