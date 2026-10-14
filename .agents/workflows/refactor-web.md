# Refactor & Harden Web Layer Workflow

Analyze `frontend/js/api.js`, `frontend/js/catalog.js`, `frontend/js/app.js`, and `frontend/sw.js`:
1. Ensure all `api.request()` network calls have strict `AbortController` timeouts (2500–3500ms) with clean fallbacks.
2. Verify `js/catalog.js` pre-populates the directory grid immediately on `DOMContentLoaded` before any network or auth checks.
3. Confirm `registerServiceWorker()` in `js/app.js` checks for native Capacitor platforms and unregisters any lingering service workers to avoid stale asset caching.
4. Verify typography and responsive CSS tokens in `css/style.css` maintain standard readable sizes (base 16px, message bubbles >= 16px).
5. Run `npx.cmd cap sync android` to push updated web assets into the Android native project.
