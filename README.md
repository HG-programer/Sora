# Sora — Unfiltered stories, living characters, zero ads. Just pure immersion.

An **AI Character Discovery, Creation & Roleplay Platform** with **Android compatibility (PWA + Capacitor APK)** and a **high-concurrency Async FastAPI + SQLAlchemy 2.0 backend** designed to support thousands of users simultaneously.

Built as a next-generation evolution of [`HG-programer/Haru-Gpt`](https://github.com/HG-programer/Haru-Gpt) without modifying the original repository.

---

## 🚀 How Sora Upgrades Original `Haru-Gpt`

| Capability | Original `Haru-Gpt` | New `Sora` Platform |
| :--- | :--- | :--- |
| **Concurrency** | Single-threaded synchronous Flask (`app.run()`) | **Async FastAPI (ASGI / Uvicorn)** + `httpx.AsyncClient` connection pooling + concurrency semaphores |
| **User Capacity** | Single local browser (`localStorage` only) | **Thousands of users** with JWT Auth, Guest Quick-Auth, per-user rate limiting, and isolated DB sessions |
| **Database** | None | **Async SQLAlchemy 2.0** (SQLite WAL mode for local dev; PostgreSQL `asyncpg` pool for cloud scale) |
| **Experience** | Plain single-prompt chat box | **Character Discovery Feed**, **Deep Character Studio**, **Roleplay Personas**, **`*action*` formatting**, **Reroll/Swipe**, & **Pinned Story Memory** |
| **LLM Adapters** | Synchronous Groq, Gemini, OpenAI, HF | **Async Streaming SSE Adapters** for Groq, Gemini, OpenAI, HuggingFace, Ollama + **Built-In Sora Roleplay Engines (`sora-core`, `sora-velvet`, `sora-noir`, `sora-pulse`)** (works with 0 API keys!) |
| **Android Support** | Desktop HTML only | **Mobile-First Bottom-Nav UI + Installable Android PWA (`manifest.webmanifest` + Service Worker) + Capacitor Native Android APK (`capacitor.config.json`)** |

---

## ⚡ Quick Start (Local Web & Mobile Server)

### 1. Install Python Dependencies
```powershell
python -m pip install -r backend/requirements.txt
```

### 2. Start the Async Backend & Web Platform
```powershell
cd backend
python app.py
```
Open **[http://localhost:5050](http://localhost:5050)** in your browser (or on your Android phone over LAN at `http://<YOUR_PC_LAN_IP>:5050`).

> **Zero API Keys Needed to Start:** The built-in Sora Roleplay Engine works immediately out of the box! You can also add `GROQ_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, or `HF_API_KEY` in `backend/.env` or directly in the UI's **Adapters & BYOK** tab.

---

## 📱 Android Compatibility (2 Ways to Run on Android)

### Option A: Instant Install on Android (PWA / WebAPK)
1. Connect your Android phone to the same Wi-Fi network as your PC (or deploy the backend to Render/Railway/Fly.io/VPS).
2. Open `http://<YOUR_SERVER_IP>:5050` in Chrome on Android.
3. Tap **📲 Install App** in the top header (or Chrome Menu → **Add to Home Screen / Install App**).
4. Launches full-screen in standalone Android mode with native bottom navigation and gesture bar safe-areas.

### Option B: Build a Native Android `.apk` with Capacitor
1. Install the Capacitor dependencies:
   ```powershell
   npm.cmd install
   npm.cmd run android:add
   npm.cmd run android:sync
   ```
2. Open the generated `android/` project in **Android Studio**:
   ```powershell
   npm.cmd run android:open
   ```
3. In the app's **⚡ Adapters** tab, set **Backend Server URL** to your backend host (e.g., `http://10.0.2.2:5050` for Android Emulator or your production HTTPS URL) and build your `.apk`!

---

## 🌐 Scaling to Thousands of Users in Production

To run with **PostgreSQL 16 + Multi-Worker Uvicorn ASGI** via Docker:
```powershell
docker compose up --build -d
```

To run the **Multi-User Concurrency Verification Suite** (simulating 25 simultaneous users registering, browsing, and streaming SSE roleplay chats concurrently):
```powershell
python tests/load_test_multiuser.py
```
