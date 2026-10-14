# Sora (`com.haru.sora`) Workspace Rules

## Architecture Overview
- **Platform**: Capacitor hybrid Android app (`com.haru.sora`) wrapping a vanilla JavaScript web application.
- **Frontend Source**: `frontend/` containing `index.html`, `css/style.css`, `js/api.js`, `js/catalog.js`, `js/app.js`, and `assets/`.
- **Android Layer**: `android/` containing Capacitor Android shell with AndroidX libraries, ProGuard/R8 configuration, and native assets in `android/app/src/main/assets/public/`.
- **Backend Service**: `backend/` FastAPI + SQLAlchemy application with 210-character roleplay catalog, vector monogram generator, and distributed LLM client routing.

## Development & Verification Guidelines
- **Native Platform Detection**: Always check `window.Capacitor?.isNativePlatform?.()` before registering Service Workers or using browser-only APIs.
- **Offline First**: All 210 characters are bundled in `js/catalog.js` to ensure zero-latency initial rendering even when running in airplane mode or without a local backend.
- **Network Resilience**: Wrap all remote API requests in `js/api.js` with `AbortController` timeouts (default 8000ms), in-flight request deduplication, and Stale-While-Revalidate (SWR) `localStorage` caching so the UI renders instantly and refreshes in the background.
- **Asset Bundling & Syncing**: Before syncing native assets, run `npm run build` to minify CSS, HTML, and JS modules with `esbuild` into `dist/`, then run `npx cap sync android` to copy minified assets into Android.
- **Android Builds**: Production APK builds are automated via `.github/workflows/build-apk.yml`, running asset minification, R8 code/resource shrinking, and publishing both `app-release.apk` and `app-debug.apk`.
