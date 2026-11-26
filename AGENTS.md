# Project Agent Rules (`AGENTS.md`)

Follow these rules on every feature, fix, and release in this repository.

## 1. Major Changes — Ask About Forcing Session Logout
Whenever a task involves a **major change** — such as authentication/session updates, breaking `localStorage` / `config_json` / API schema changes, new required user settings, or major UX/scoring overhauls where stale browser state could break the app — **explicitly ask the user before committing/pushing**:

> *"This is a major change — do you want me to make sure all existing user sessions across the web app are logged out on deploy?"*

- Session invalidation is controlled via `NEXT_PUBLIC_BUILD_ID` in `frontend/next.config.mjs` and `CURRENT_SESSION_VERSION` (`audit_session_version`) in `frontend/src/context/AuthContext.jsx`.
- Keep local development stable (`"dev"`) so hot-reload never signs developers out unexpectedly.
- When the user switches from auto-logout-on-every-deploy to selective logout (e.g., for paying external clients), use an explicit `NEXT_PUBLIC_SESSION_EPOCH` and only bump it when the user confirms a forced logout.

## 2. Safe Defaults for All New Features & Settings
Never ship a new option or setting that breaks existing users until they manually click/select it:
- **Backend & Frontend must both default safely** when a field is `null` or missing in existing DB rows (`config_json`) or browser storage (`localStorage`). Example: Gemini `tier` defaults to `"free"` everywhere when unset.
- **Always merge saved state over fresh defaults** (`{ ...DEFAULTS, ...saved }`) so newly added keys always have valid values for returning users.
- **Test the "existing upgraded user" path:** whenever adding a new setting or field, include a unit test where that field is missing/`null` and confirm it still works cleanly.

## 3. Graceful Degradation Across Optional Integrations
Every audit, scoring, visibility, and reporting feature must handle all 4 integration states cleanly:
- **Both GSC + GA4 connected** (`gsc+ga4`)
- **Only GSC connected** (`gsc_only`)
- **Only GA4 connected** (`ga4_only`)
- **Neither connected** (`crawl_only`)

Never display broken metrics, fake numbers, or unhandled errors when an integration is disconnected.
