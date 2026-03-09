# TASKS.md — Receipt Renamer

## Project Status: ACTIVE
## Version Target: v0.1.0

---

## Task Board

### T-001 — Fix AI service (CORS + auth headers)
- **Priority**: P0
- **Status**: Open
- **Assigned**: Worker-Claude
- **Description**: `src/services/ai.js` is missing `x-api-key` and `anthropic-version` headers. Also, direct browser calls to `api.anthropic.com` will fail due to CORS. Add a configurable proxy mode: user can set `VITE_AI_PROXY_URL` for production, or use direct API key (dev only). Add proper error handling for API failures.
- **Acceptance**: AI service works with both proxy mode and direct API key mode; errors are caught and surfaced to the user.

### T-002 — Add ESLint + Prettier + code quality
- **Priority**: P0
- **Status**: Open
- **Assigned**: Worker-Claude
- **Description**: Add ESLint (flat config) + Prettier. Add lint script to package.json. Fix any lint errors. Remove `src/app-prototype.jsx` (already migrated). Remove stale `dist/` from tracking.
- **Acceptance**: `npm run lint` passes with 0 errors. Prototype file removed. Code formatted consistently.

### T-003 — Complete missing views + UI polish
- **Priority**: P0
- **Status**: Open
- **Assigned**: Worker-GPT
- **Description**: Review `ConfigView.jsx` and `LogView.jsx` — they appear incomplete (short files). Ensure all views are fully functional. Check: ConfigView should show/edit all settings, support reconnect and reset. LogView should show full receipt history with delete and detail view. Add proper loading states and error boundaries.
- **Acceptance**: All 6 views render correctly, handle edge cases (empty state, error state, loading state).

### T-004 — Add Vitest + core tests
- **Priority**: P1
- **Status**: Open
- **Assigned**: Worker-Claude
- **Description**: Add Vitest + testing-library. Write unit tests for: constants (categories, config defaults), storage service (store/load), AI service (mock fetch, test JSON parsing, error handling). Write component smoke tests for App, Nav, Btn.
- **Acceptance**: `npm test` runs, ≥80% coverage on services/, all tests green.

### T-005 — README + deployment docs
- **Priority**: P1
- **Status**: Open
- **Assigned**: Worker-GPT
- **Description**: Rewrite README.md with: project description, screenshots placeholder, setup guide (Google Cloud Console step-by-step), environment variables, deployment guide (Vercel/Netlify), architecture diagram (text). Update CLAUDE.md to reflect current state.
- **Acceptance**: README is comprehensive and beginner-friendly. CLAUDE.md reflects actual project state.

### T-006 — PWA basics + manifest
- **Priority**: P2
- **Status**: Open
- **Assigned**: Worker-GPT
- **Description**: Add PWA manifest, service worker for offline shell caching, meta tags for mobile (viewport, theme-color, apple-mobile-web-app-capable). Add app icons placeholder.
- **Acceptance**: App is installable on mobile via "Add to Home Screen". Offline shell loads.

---

## Escalation Policy
- L1 (30m no heartbeat): ping worker
- L2 (60m): Tech Lead re-splits or reassigns
- L3 (120m): notify owner, scope downgrade
- **Ack mechanism**: Once Tech Lead confirms a stale task is handled, mark `acknowledged: true` in heartbeat to stop repeat alerts.
- **Role rule**: If Tech Lead executes a task directly, that task is exempt from auto-alerts.

## Done Sync Rule
When a task moves to Done, the worker MUST also clear its heartbeat entry. No orphan heartbeats.
