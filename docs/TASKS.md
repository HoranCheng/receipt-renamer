# TASKS.md — Receipt Renamer

## Project Status: ACTIVE
## Current Sprint: v0.2.0

---

## Completed (v0.1.0)

| ID | Task | Worker | Status |
|----|------|--------|--------|
| T-001 | Fix AI service (CORS + auth headers) | Tech Lead | ✅ Done |
| T-002 | ESLint + Prettier + cleanup | Tech Lead | ✅ Done |
| T-003 | Vitest + core tests | Tech Lead | ✅ Done |
| T-004 | UI polish + ErrorBoundary | Tech Lead | ✅ Done |
| T-005 | README + docs + LICENSE | Tech Lead | ✅ Done |
| T-006 | PWA manifest + meta tags | Tech Lead | ✅ Done |

---

## v0.2.0 Sprint — Active Tasks

### T-007 — Google OAuth token auto-refresh
- **Priority**: P1
- **Status**: Open → Assigned Worker-Claude
- **Description**: Current flow requires re-auth when token expires. Implement silent token refresh using Google Identity Services. When `gapi.client` returns 401, auto-call `requestAccessToken()` with `prompt: ''` (no consent prompt) to get a fresh token. Add a wrapper function `withAuth(fn)` that retries on auth failure.
- **Acceptance**: User doesn't see re-auth prompts during a session unless initial consent is needed.

### T-008 — Drive file pagination
- **Priority**: P1
- **Status**: Open → Assigned Worker-Claude
- **Description**: Current `listFilesInFolder()` is capped at 50 files. Implement cursor-based pagination using `pageToken`. Add "Load More" button in InboxView. Store the nextPageToken and append results.
- **Acceptance**: Users with >50 files in inbox can load all files. UI shows load-more affordance.

### T-009 — Receipt detail/edit page
- **Priority**: P1
- **Status**: Open → Assigned Worker-GPT
- **Description**: Add a detail view when tapping a receipt in LogView. Show: original filename, new filename, all extracted fields (editable), confidence score, file link to Drive, timestamp. Allow re-categorize and save changes to localStorage. Add "Open in Drive" button.
- **Acceptance**: Tapping a receipt row opens detail view. All fields editable. Changes persist.

### T-010 — Batch error recovery + retry
- **Priority**: P1
- **Status**: Open → Assigned Worker-GPT
- **Description**: Current batch processing stops on error. Implement: skip failed files and continue, show error count at end, add "Retry Failed" button that only re-processes failed files. Track failed file IDs in state.
- **Acceptance**: Batch process continues past errors. User can retry only failed files.

### T-011 — PDF file support
- **Priority**: P1
- **Status**: Open → Assigned Worker-Claude
- **Description**: Current app only handles images. For PDF files from Drive: detect `mimeType === 'application/pdf'`, use Claude's native PDF support (send as `document` type with `source.media_type: "application/pdf"`). Update `analyzeReceipt()` to handle both image and PDF content types.
- **Acceptance**: PDF receipts from Drive inbox are processed correctly by AI.

### T-012 — Export CSV + data backup
- **Priority**: P2
- **Status**: Open → Assigned Worker-GPT
- **Description**: Add export button in LogView header. Generate CSV with columns: Date, Merchant, Category, Amount, Currency, Confidence, Original Filename, New Filename, Processed At. Use `Blob` + `URL.createObjectURL` for download. Also add JSON export for full data backup.
- **Acceptance**: User can download CSV and JSON of all receipt records.

---

## Escalation Policy (improved from v0.1)
- L1 (30m no heartbeat): ping worker — max 1 alert per task
- L2 (60m): Tech Lead re-splits or reassigns
- L3 (120m): notify owner, scope downgrade
- **Dedup rule**: Same alert for same task → max 3 times in 24h
- **Ack mechanism**: Tech Lead confirms stale → alert stops
- **Self-execute exemption**: Tasks done by Tech Lead directly skip auto-alerts

## Done Sync Rule
When task → Done, worker MUST also update this file. No orphan statuses.

## Standup Rules
- Post to `receipt-tasks-board` only when status CHANGES
- Max 3 standups per day
- Incremental format: only list what changed since last standup
