// frontend/js/app.js
const state = {
  user: null,
  characters: [],
  templates: [],
  myCharacters: [],
  sessions: [],
  adapters: [],
  activeCategory: "All",
  activeGender: "All",
  searchQuery: "",
  sortBy: "trending",
  activeSession: null,
  authMode: "register",
  deferredPwaPrompt: null,
  ttsAutoPlay: false,
  isSpeaking: false,
  editingCharacterId: null,
};

function triggerHaptic(ms = 12) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (_) {}
  }
}

function getCharacterCulture(c) {
  const text = `${c.name} ${c.scenario || ""} ${(c.tags || []).join(" ")}`.toLowerCase();
  if (text.includes("tokyo") || text.includes("kyoto") || text.includes("osaka") || text.includes("shrine") || text.includes("anime") || text.includes("manga") || text.includes("samurai") || text.includes("yakuza") || text.includes("senpai") || text.includes("sensei") || text.includes("japan")) return { flag: "🇯🇵", label: "JP" };
  if (text.includes("mumbai") || text.includes("delhi") || text.includes("bangalore") || text.includes("jaipur") || text.includes("kolkata") || text.includes("diwali") || text.includes("desi") || text.includes("bollywood") || text.includes("punjab") || text.includes("kerala") || text.includes("india")) return { flag: "🇮🇳", label: "IN" };
  return { flag: "🌐", label: "EN" };
}

function formatRoleplayHTML(rawText) {
  if (!rawText) return "";
  const escaped = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, '<span class="rp-action">*$1*</span>')
    .replace(/“([^”\n]+)”/g, '<span class="rp-dialogue">“$1”</span>')
    .replace(/"([^"\n]+)"/g, '<span class="rp-dialogue">“$1”</span>')
    .replace(/\n/g, "<br/>");
}

function showToast(message) {
  triggerHaptic(8);
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

let currentSpeakingUtterance = null;
let currentSpeakingBtn = null;

function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  if (currentSpeakingBtn) {
    currentSpeakingBtn.classList.remove("speaking");
    currentSpeakingBtn.textContent = "🔊";
    currentSpeakingBtn = null;
  }
  state.isSpeaking = false;
}

function speakText(rawText, gender = "Female", triggerBtn = null) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    showToast("Voice narration not supported in this browser.");
    return;
  }

  if (state.isSpeaking && triggerBtn && triggerBtn === currentSpeakingBtn) {
    stopSpeech();
    return;
  }

  stopSpeech();

  let cleanText = (rawText || "")
    .replace(/\*([^*]+)\*/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[#*_~`]/g, "")
    .trim();

  if (!cleanText || cleanText.length < 3) {
    cleanText = (rawText || "").replace(/[#*_~`]/g, "").trim();
  }
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voices = window.speechSynthesis.getVoices() || [];
  const isFemale = (gender || "").toLowerCase() === "female";

  if (voices.length > 0) {
    let matchedVoice = null;
    if (isFemale) {
      matchedVoice = voices.find((v) =>
        /female|zira|samantha|victoria|karen|susan|moira|fiona|natural.*female/i.test(v.name)
      );
    } else {
      matchedVoice = voices.find((v) =>
        /male|david|george|alex|daniel|oliver|natural.*male/i.test(v.name)
      );
    }
    if (!matchedVoice) {
      matchedVoice = voices.find((v) => v.lang.startsWith("en")) || voices[0];
    }
    if (matchedVoice) utterance.voice = matchedVoice;
  }

  utterance.rate = 1.0;
  utterance.pitch = isFemale ? 1.14 : 0.92;

  if (triggerBtn) {
    currentSpeakingBtn = triggerBtn;
    triggerBtn.classList.add("speaking");
    triggerBtn.textContent = "⏹️";
  }
  state.isSpeaking = true;

  utterance.onend = () => {
    stopSpeech();
  };
  utterance.onerror = () => {
    stopSpeech();
  };

  window.speechSynthesis.speak(utterance);
}

function copyFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Copied to clipboard 📋");
  } catch {
    showToast("Copy failed");
  }
  ta.remove();
}

function getFallbackAvatar(name = "Character", gender = "Female") {
  const clean = (name || "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const initials = (clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || "S").toUpperCase();
  const isMale = (gender || "").toLowerCase() === "male";
  const hash = (name || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const palettes = [
    ["#2b231c", "#d97757", "#f7f2eb"],
    ["#331c26", "#e07a90", "#fff0f3"],
    ["#1c2826", "#58b09c", "#eefaf6"],
    ["#2a1f33", "#b085f5", "#f7f0ff"],
    ["#33281c", "#e0a458", "#fff8f0"],
    ["#1c2633", "#64b5f6", "#f0f8ff"],
  ];
  const [c1, c2, cText] = palettes[hash % palettes.length];
  const safeId = `g_${clean.replace(/\s+/g, "_") || "init"}_${hash}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <defs>
      <linearGradient id="${safeId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="#120e0c"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="22" fill="url(#${safeId})"/>
    <circle cx="60" cy="60" r="46" fill="none" stroke="${c2}" stroke-width="1.8" stroke-dasharray="2 3" opacity="0.4"/>
    <rect x="4" y="4" width="112" height="112" rx="18" fill="none" stroke="${c2}" stroke-width="1.5" stroke-opacity="0.5"/>
    <text x="60" y="66" font-family="'Newsreader', Georgia, serif" font-size="44" font-weight="600" fill="${cText}" text-anchor="middle" dominant-baseline="central">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Offline Storage & State Helpers
function getLocalSessions() {
  try {
    return JSON.parse(localStorage.getItem("sora_local_sessions") || "[]");
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions) {
  try {
    localStorage.setItem("sora_local_sessions", JSON.stringify(sessions || []));
  } catch {}
}

function getLocalMyCharacters() {
  try {
    return JSON.parse(localStorage.getItem("sora_my_characters") || "[]");
  } catch {
    return [];
  }
}

function saveLocalMyCharacters(chars) {
  try {
    localStorage.setItem("sora_my_characters", JSON.stringify(chars || []));
  } catch {}
}

function getLocalLikedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem("sora_liked_ids") || "[]"));
  } catch {
    return new Set();
  }
}

function toggleLocalLikedId(id, isLiked) {
  try {
    const set = getLocalLikedIds();
    if (isLiked) set.add(id);
    else set.delete(id);
    localStorage.setItem("sora_liked_ids", JSON.stringify(Array.from(set)));
  } catch {}
}

function filterLocalCharacters() {
  let list = [...(window.SORA_DEFAULT_CATALOG || [])];
  const localMy = getLocalMyCharacters();
  list = [...localMy, ...list];

  const likedIds = getLocalLikedIds();
  list.forEach((c) => {
    c.liked_by_me = likedIds.has(c.id);
  });

  if (state.activeCategory === "Mine") {
    list = list.filter((c) => c.creator_name === state.user?.username || localMy.some((m) => m.id === c.id));
  } else if (state.activeCategory === "Favorites") {
    list = list.filter((c) => likedIds.has(c.id));
  } else if (state.activeCategory && state.activeCategory !== "All") {
    list = list.filter((c) => c.category === state.activeCategory || (c.tags && c.tags.includes(state.activeCategory)));
  }

  if (state.activeGender && state.activeGender !== "All") {
    list = list.filter((c) => (c.gender || "").toLowerCase() === state.activeGender.toLowerCase());
  }

  if (state.searchQuery && state.searchQuery.trim()) {
    const q = state.searchQuery.trim().toLowerCase();
    list = list.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.tagline && c.tagline.toLowerCase().includes(q)) ||
      (c.category && c.category.toLowerCase().includes(q)) ||
      (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }

  if (state.sortBy === "likes") {
    list.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
  } else if (state.sortBy === "recent") {
    // Preserve order
  } else {
    list.sort((a, b) => (b.chat_count || 0) - (a.chat_count || 0));
  }

  state.characters = list;
  renderCharacterGrid();
}

document.addEventListener("DOMContentLoaded", async () => {
  registerServiceWorker();
  bindUIEvents();
  loadSavedByokForm();

  // Instant pre-population from bundled catalog: zero blank-screen latency
  if (window.SORA_DEFAULT_CATALOG && window.SORA_DEFAULT_CATALOG.length) {
    state.characters = [...window.SORA_DEFAULT_CATALOG];
    state.templates = [...window.SORA_DEFAULT_CATALOG];
    filterLocalCharacters();
    renderTemplateDropdown("All");
  }

  await ensureAuthenticatedUser();

  await Promise.allSettled([
    loadAdapters(),
    loadPlatformStats(),
    loadCharacters(),
    loadTemplates(),
    loadMyCharacters(),
    loadSessions(),
  ]);
});

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPwaPrompt = e;
    const btn = document.getElementById("install-pwa-btn");
    if (btn) btn.classList.remove("hidden");
  });
}

async function ensureAuthenticatedUser() {
  const existingToken = window.api.getToken();
  if (existingToken) {
    try {
      state.user = await window.api.request("/api/v1/auth/me", { timeout: 2500 });
      localStorage.setItem("sora_cached_user", JSON.stringify(state.user));
      renderUserHeader();
      renderPersonasList();
      return;
    } catch {
      window.api.setToken("");
    }
  }

  try {
    const res = await window.api.request("/api/v1/auth/guest", { method: "POST", timeout: 2500 });
    window.api.setToken(res.access_token);
    state.user = res.user;
    localStorage.setItem("sora_cached_user", JSON.stringify(state.user));
    renderUserHeader();
    renderPersonasList();
    return;
  } catch (err) {
    console.warn("Backend auth offline, using local guest session:", err);
  }

  // Standalone offline guest profile fallback
  let localUser = null;
  try {
    localUser = JSON.parse(localStorage.getItem("sora_cached_user") || "null");
  } catch {}

  if (!localUser) {
    localUser = {
      id: "guest_" + Math.random().toString(36).substring(2, 9),
      username: "guest",
      display_name: "Guest Storyteller",
      email: "",
      bio: "Living characters, unfiltered stories.",
      is_guest: true,
      tier: "free",
      personas: [
        {
          id: "persona_default",
          name: "Default Persona",
          description: "Curious storyteller wandering the world.",
          avatar_url: "/assets/icon.svg",
          is_default: true,
        },
      ],
    };
    localStorage.setItem("sora_cached_user", JSON.stringify(localUser));
  }

  state.user = localUser;
  renderUserHeader();
  renderPersonasList();
}

function renderUserHeader() {
  if (!state.user) return;
  const avatarUrl = window.api.resolveAssetUrl(state.user.avatar_url);
  document.getElementById("nav-user-avatar").src = avatarUrl;
  document.getElementById("nav-user-name").textContent = state.user.display_name;

  const isSuper = Boolean(
    state.user.is_super_admin ||
    (state.user.email && state.user.email.toLowerCase() === "harshitg933@gmail.com") ||
    state.user.username === "harshitg933"
  );

  const userTier = state.user.tier || "free";
  let tierLabel = "Standard Free Member";
  let tierClass = "badge-mini badge-warm";

  if (userTier === "super_admin") {
    tierLabel = "👑 Super Access (Founder)";
    tierClass = "badge-mini badge-gold";
  } else if (userTier === "ultra") {
    tierLabel = "🌟 Ultra Member ($19/mo)";
    tierClass = "badge-mini badge-ultra";
  } else if (userTier === "pro") {
    tierLabel = "💎 Flagship Pro ($9/mo)";
    tierClass = "badge-mini badge-pro";
  } else if (state.user.is_guest) {
    tierLabel = "Temporary Guest";
    tierClass = "badge-mini badge-warm";
  }

  document.getElementById("nav-user-status").textContent = isSuper
    ? `👑 @${state.user.username}`
    : state.user.is_guest
    ? "Guest Session"
    : `@${state.user.username}`;

  document.getElementById("top-auth-label").textContent = state.user.is_guest
    ? `Account (${state.user.display_name})`
    : state.user.display_name;

  // Populate Account Profile Modal fields
  const acctAvatar = document.getElementById("acct-avatar-preview");
  if (acctAvatar) acctAvatar.src = avatarUrl;
  const acctName = document.getElementById("acct-current-name");
  if (acctName) acctName.textContent = state.user.display_name;
  const acctHandle = document.getElementById("acct-current-handle");
  if (acctHandle) acctHandle.textContent = `@${state.user.username}`;

  const acctEmail = document.getElementById("acct-current-email");
  if (acctEmail) {
    acctEmail.textContent = state.user.email ? `✉ ${state.user.email}` : "No email linked";
    acctEmail.style.color = state.user.email ? "var(--accent-warm)" : "var(--text-subtle)";
  }

  const acctTier = document.getElementById("acct-tier-pill");
  if (acctTier) {
    acctTier.textContent = tierLabel;
    acctTier.className = tierClass;
  }

  const editDisplay = document.getElementById("acct-edit-display");
  if (editDisplay) editDisplay.value = state.user.display_name || "";
  const editBio = document.getElementById("acct-edit-bio");
  if (editBio) editBio.value = state.user.bio || "";
  const editEmail = document.getElementById("acct-edit-email");
  if (editEmail) editEmail.value = state.user.email || "";

  const logoutBtn = document.getElementById("logout-account-btn");
  if (logoutBtn) {
    logoutBtn.classList.toggle("hidden", Boolean(state.user.is_guest));
  }

  // Founder & Super Admin Panel Visibility
  const superPanel = document.getElementById("super-admin-panel");
  if (superPanel) {
    superPanel.classList.toggle("hidden", !isSuper);
    if (isSuper) {
      const activeTag = document.getElementById("super-admin-active-tier-tag");
      if (activeTag) {
        activeTag.textContent = userTier === "super_admin"
          ? "All Unlocked (Owner)"
          : `Simulating ${userTier.toUpperCase()}`;
      }
      document.querySelectorAll(".btn-tier-sim").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.sim === userTier);
      });
    }
  }

  const personaSelect = document.getElementById("chat-persona-select");
  personaSelect.innerHTML = "";
  (state.user.personas || []).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `Profile: ${p.name}`;
    if (p.is_default) opt.selected = true;
    personaSelect.appendChild(opt);
  });
}

async function loadPlatformStats() {
  try {
    const stats = await window.api.request("/api/v1/stats");
    const el = document.getElementById("metrics-text");
    el.textContent = `${stats.total_characters} characters · ${stats.total_users} users`;
  } catch {}
}

function getPublicModelName(modelId) {
  if (!modelId || modelId === "haru-rp-v1") return "Haru Core v2";
  const found = state.adapters.find((a) => a.id === modelId);
  return found ? found.name : modelId;
}

function isModelUnlocked(adapter) {
  if (!adapter) return true;
  if (adapter.tier === "free") return true;

  const activeTier = state.user?.tier || "free";
  if (activeTier === "super_admin" || activeTier === "ultra" || activeTier === "pro") {
    return true;
  }

  const keys = window.api.getByokKeys();
  if (adapter.id.startsWith("xai-") && keys.xai) return true;
  if (adapter.id === "openrouter-hermes-3" && keys.openrouter) return true;
  if (adapter.id.startsWith("openai-") && keys.openai) return true;
  if (adapter.id.startsWith("gemini-") && keys.gemini) return true;
  return false;
}

async function loadAdapters() {
  try {
    const data = await window.api.request("/api/v1/adapters", { timeout: 2500 });
    state.adapters = data.adapters || [];
  } catch (err) {
    state.adapters = [
      { id: "haru-core", name: "Sora Core v2", tier: "free", badge: "Included · Primary", description: "Standard expressive creative roleplay engine.", provider: "Sora In-House" },
      { id: "haru-velvet", name: "Sora Velvet", tier: "free", badge: "Included · Emotional", description: "Nuanced, high-chemistry emotional dialogue.", provider: "Sora In-House" },
      { id: "haru-noir", name: "Sora Noir", tier: "free", badge: "Included · Atmospheric", description: "Rich sensory descriptions and grounded pacing.", provider: "Sora In-House" },
      { id: "haru-pulse", name: "Sora Pulse", tier: "free", badge: "Included · Fast Dialogue", description: "Snappy, fast-paced conversational banter.", provider: "Sora In-House" },
      { id: "grok-beta", name: "Grok 2 (xAI)", tier: "premium", badge: "Flagship · 128k", description: "Direct unthrottled xAI flagship routing.", provider: "xAI" },
      { id: "openrouter-hermes-3", name: "Hermes 3 Llama-3.1 70B", tier: "premium", badge: "Flagship · 128k", description: "Unfiltered deep character roleplay flagship.", provider: "NousResearch" },
      { id: "openai-gpt-4o", name: "GPT-4o (OpenAI)", tier: "premium", badge: "Flagship · 128k", description: "High-reasoning flagship intelligence.", provider: "OpenAI" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", tier: "premium", badge: "Flagship · 1M", description: "Massive 1M token context memory.", provider: "Google" }
    ];
  }

  const freeModels = state.adapters.filter((m) => m.tier === "free");
  const premiumModels = state.adapters.filter((m) => m.tier === "premium");

  document.querySelectorAll(".model-dropdown-populate").forEach((selectEl) => {
    const currentVal = selectEl.value;
    selectEl.innerHTML = "";

    const freeGroup = document.createElement("optgroup");
    freeGroup.label = "Sora Standard Models (Included Free)";
    freeModels.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.badge.replace("Included · ", "")})`;
      freeGroup.appendChild(opt);
    });
    selectEl.appendChild(freeGroup);

    const premGroup = document.createElement("optgroup");
    premGroup.label = "Verified Flagship Models (Premium)";
    premiumModels.forEach((m) => {
      const unlocked = isModelUnlocked(m);
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} — ${unlocked ? "Unlocked" : "🔒 Pro/Ultra Required"}`;
      premGroup.appendChild(opt);
    });
    selectEl.appendChild(premGroup);

    if (currentVal && currentVal !== "haru-rp-v1") {
      selectEl.value = currentVal;
    } else {
      selectEl.value = "haru-core";
    }
  });

  renderAdaptersTable();
}

function renderAdaptersTable() {
  const freeTbody = document.getElementById("free-adapters-table-body");
  const premGrid = document.getElementById("premium-transparency-grid");
  const modalPremGrid = document.getElementById("modal-premium-list");
  const planBadge = document.getElementById("premium-plan-badge");
  const activateBtn = document.getElementById("activate-premium-btn");

  const userTier = state.user?.tier || "free";
  const isSuper = Boolean(
    state.user?.is_super_admin ||
    (state.user?.email && state.user.email.toLowerCase() === "harshitg933@gmail.com") ||
    state.user?.username === "harshitg933"
  );
  const hasPass = isSuper || userTier === "super_admin" || userTier === "ultra" || userTier === "pro";

  if (planBadge) {
    if (userTier === "super_admin") {
      planBadge.textContent = "👑 Super Access (Founder)";
      planBadge.className = "badge-mini badge-gold";
    } else if (userTier === "ultra") {
      planBadge.textContent = "🌟 Ultra Member ($19/mo)";
      planBadge.className = "badge-mini badge-ultra";
    } else if (userTier === "pro") {
      planBadge.textContent = "💎 Flagship Pro ($9/mo)";
      planBadge.className = "badge-mini badge-pro";
    } else {
      planBadge.textContent = "Standard Free Tier";
      planBadge.className = "badge-mini";
    }
  }

  if (activateBtn) {
    if (isSuper) {
      activateBtn.textContent = "👑 Super Access Active (Founder)";
      activateBtn.disabled = true;
    } else if (hasPass) {
      activateBtn.textContent = "Plan Active";
      activateBtn.disabled = true;
    } else {
      activateBtn.textContent = "Unlock Flagship Access ($9/mo)";
      activateBtn.disabled = false;
    }
  }

  const freeModels = state.adapters.filter((a) => a.tier === "free");
  const premiumModels = state.adapters.filter((a) => a.tier === "premium");

  if (freeTbody) {
    freeTbody.innerHTML = "";
    freeModels.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:600;">${a.name}</td>
        <td><span class="badge-mini">${a.badge}</span></td>
        <td class="muted-text">${a.description || ""}</td>
        <td class="muted-text"><span class="status-dot" style="background:#10b981;"></span>Included · Active</td>
      `;
      freeTbody.appendChild(tr);
    });
  }

  const renderPremiumCards = (container) => {
    if (!container) return;
    container.innerHTML = "";
    premiumModels.forEach((a) => {
      const unlocked = isModelUnlocked(a);
      const card = document.createElement("div");
      card.className = `premium-spec-card ${unlocked ? "unlocked" : ""}`;
      const dotColor = unlocked ? "#10b981" : "#a1a1aa";
      const statusLabel = unlocked ? "Unlocked · Direct API Routing" : "Verified Flagship · Upgrade to Unlock";
      card.innerHTML = `
        <div class="premium-spec-top">
          <span class="premium-spec-provider">${a.provider}</span>
          <span class="badge-mini">${a.badge}</span>
        </div>
        <div class="premium-spec-title">${a.name}</div>
        <div class="premium-spec-desc">${a.description || ""}</div>
        <div class="premium-spec-meta">
          <span><span class="status-dot" style="background:${dotColor};"></span>${statusLabel}</span>
          <span>100% Disclosed</span>
        </div>
      `;
      container.appendChild(card);
    });
  };

  renderPremiumCards(premGrid);
  renderPremiumCards(modalPremGrid);
}

// --- Character Directory ---
function resetDirectoryFilters() {
  state.activeCategory = "All";
  state.activeGender = "All";
  state.searchQuery = "";
  const searchInput = document.getElementById("char-search-input");
  if (searchInput) searchInput.value = "";
  const genderSelect = document.getElementById("char-gender-select");
  if (genderSelect) genderSelect.value = "All";
  document.querySelectorAll(".cat-chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.category === "All");
  });
  loadCharacters();
}
window.resetDirectoryFilters = resetDirectoryFilters;

async function loadCharacters() {
  const isMine = state.activeCategory === "Mine";
  const isFav = state.activeCategory === "Favorites";
  const categoryParam = (isMine || isFav) ? "All" : state.activeCategory;
  const qs = new URLSearchParams({
    category: categoryParam,
    gender: state.activeGender || "All",
    search: state.searchQuery,
    sort: state.sortBy,
    mine_only: isMine ? "true" : "false",
    favorites_only: isFav ? "true" : "false",
  });
  try {
    state.characters = await window.api.request(`/api/v1/characters?${qs.toString()}`, { timeout: 2500 });
    renderCharacterGrid();
  } catch (err) {
    // Offline / standalone APK fallback: filter bundled catalog
    filterLocalCharacters();
  }
}

async function loadTemplates() {
  try {
    state.templates = await window.api.request("/api/v1/templates", { timeout: 2500 });
    renderTemplateDropdown("All");
  } catch {
    state.templates = [...(window.SORA_DEFAULT_CATALOG || [])];
    renderTemplateDropdown("All");
  }
}

function renderTemplateDropdown(genderFilter = "All") {
  const selectEl = document.getElementById("studio-template-select");
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">-- Select a Character Template to Pre-Fill Form (${state.templates.length} Available) --</option>`;

  const filtered = state.templates.filter((t) =>
    genderFilter === "All" ? true : (t.gender || "").toLowerCase() === genderFilter.toLowerCase()
  );

  // Group templates by category for clean browsing
  const byCategory = {};
  filtered.forEach((t) => {
    const cat = t.category || "Romance";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  });

  Object.keys(byCategory).forEach((cat) => {
    const group = document.createElement("optgroup");
    group.label = `${cat} (${byCategory[cat].length})`;
    byCategory[cat].forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.name} [${t.gender}] — ${t.tagline.slice(0, 68)}`;
      group.appendChild(opt);
    });
    selectEl.appendChild(group);
  });
}

function renderCharacterGrid() {
  const grid = document.getElementById("character-grid");
  grid.innerHTML = "";

  const countBadge = document.getElementById("directory-count-badge");
  if (countBadge) {
    const genLabel = state.activeGender && state.activeGender !== "All" ? ` ${state.activeGender}` : "";
    const catLabel = state.activeCategory && state.activeCategory !== "All" ? ` · ${state.activeCategory}` : "";
    countBadge.textContent = `${state.characters.length}${genLabel} Characters${catLabel}`;
  }

  if (!state.characters.length) {
    grid.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align:center; padding: 2.25rem;">
        <h3>No matching characters</h3>
        <p class="muted-text" style="margin: 0.35rem 0 1rem;">No characters matched your selected category, gender, or search filter.</p>
        <div style="display:flex; justify-content:center; gap:0.6rem; flex-wrap:wrap;">
          <button class="btn-glass" onclick="resetDirectoryFilters()">Reset All Filters</button>
          <button class="btn-primary" onclick="switchTab('create')">Create Character</button>
        </div>
      </div>
    `;
    return;
  }

  state.characters.forEach((c) => {
    const card = document.createElement("article");
    card.className = "char-card";
    const avatarSrc = window.api.resolveAssetUrl(c.avatar_url);

    const tagsHtml = (c.tags || [])
      .slice(0, 5)
      .map((t) => `<span class="tag-pill" data-filter-tag="${t}" title="Filter by ${t}">${t}</span>`)
      .join("");

    const previewSnippet = (c.scenario || c.greeting || "").replace(/\*/g, "").slice(0, 110);
    const charGender = c.gender || "Female";
    const culture = getCharacterCulture(c);

    card.innerHTML = `
      <div class="char-tile-media">
        <img src="${avatarSrc}" alt="${c.name}" class="char-tile-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.src=getFallbackAvatar('${c.name.replace(/'/g, "\\'")}', '${charGender}');" />
        <div class="char-tile-scrim"></div>
        <div class="char-tile-badges">
          <span class="badge-mini badge-gender">${charGender}</span>
          <span class="badge-mini badge-warm">${c.category}</span>
          <span class="badge-mini" title="${culture.label}">${culture.flag} ${culture.label}</span>
        </div>
      </div>
      <div class="char-card-body">
        <div class="char-header-info">
          <div class="char-title-row">
            <h3 class="char-title">${c.name}</h3>
          </div>
          <div class="char-creator">by ${c.creator_name} · ${getPublicModelName(c.default_model)}</div>
        </div>
        <p class="char-tagline">${c.tagline}</p>
        ${previewSnippet ? `<div class="char-scene-preview">“${previewSnippet}${previewSnippet.length >= 110 ? "..." : ""}”</div>` : ""}
        <div class="char-tags">${tagsHtml}</div>
        <div class="char-card-footer">
          <span class="char-footer-stats">${c.chat_count.toLocaleString()} sessions</span>
          <div class="char-footer-actions">
            <button class="like-btn ${c.liked_by_me ? "liked" : ""}" data-like-id="${c.id}">
              <span>${c.liked_by_me ? "Saved" : "Save"}</span> · <span>${c.like_count}</span>
            </button>
            <span class="char-enter-link">Enter Story &rarr;</span>
          </div>
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-like-id]")) return;
      const clickedTag = e.target.closest("[data-filter-tag]");
      if (clickedTag) {
        e.stopPropagation();
        triggerHaptic(10);
        const tagVal = clickedTag.getAttribute("data-filter-tag") || "";
        const matchingChip = Array.from(document.querySelectorAll(".cat-chip")).find(
          (chip) => chip.dataset.category.toLowerCase() === tagVal.toLowerCase()
        );
        if (matchingChip) {
          document.querySelectorAll(".cat-chip").forEach((ch) => ch.classList.remove("active"));
          matchingChip.classList.add("active");
          state.activeCategory = matchingChip.dataset.category;
        } else {
          state.searchQuery = tagVal;
          document.getElementById("char-search-input").value = tagVal;
        }
        loadCharacters();
        return;
      }
      triggerHaptic(14);
      openCharacterChat(c.id, false);
    });

    card.querySelector(`[data-like-id="${c.id}"]`).addEventListener("click", async (e) => {
      e.stopPropagation();
      triggerHaptic(12);
      try {
        const res = await window.api.request(`/api/v1/characters/${c.id}/like`, { method: "POST" });
        c.liked_by_me = res.liked;
        c.like_count = res.like_count;
        renderCharacterGrid();
      } catch (err) {
        showToast(err.message);
      }
    });

    grid.appendChild(card);
  });
}

// --- Active Sessions List ---
async function loadSessions() {
  try {
    state.sessions = await window.api.request("/api/v1/sessions", { timeout: 2500 });
  } catch {
    state.sessions = getLocalSessions();
  }
  const badge = document.getElementById("chats-count-badge");
  if (state.sessions && state.sessions.length > 0) {
    badge.textContent = state.sessions.length;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
  renderSessionsList();
}

function renderSessionsList() {
  const listEl = document.getElementById("sessions-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!state.sessions || !state.sessions.length) {
    listEl.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align:center; padding: 2rem;">
        <h3>No active sessions</h3>
        <p class="muted-text" style="margin:0.35rem 0 1rem;">Select a character from the directory to start a session.</p>
        <button class="btn-primary" onclick="switchTab('discover')">Open Directory</button>
      </div>
    `;
    return;
  }

  state.sessions.forEach((s) => {
    const item = document.createElement("div");
    item.className = "session-card";
    const avatarSrc = window.api.resolveAssetUrl(s.character_avatar);
    const safeName = (s.character_name || "").replace(/'/g, "\\'");
    item.innerHTML = `
      <img src="${avatarSrc}" alt="${s.character_name}" class="char-avatar-lg" style="width:42px;height:42px;" onerror="this.onerror=null; this.src=getFallbackAvatar('${safeName}');" />
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:0.88rem;">${s.character_name}</strong>
          <span class="badge-mini">${s.selected_model}</span>
        </div>
        <p class="muted-text" style="font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.18rem;">
          ${s.last_message}
        </p>
      </div>
      <button class="icon-btn" data-del-session="${s.id}" title="Remove session">Remove</button>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-del-session]")) return;
      openExistingSession(s.id);
    });

    item.querySelector(`[data-del-session="${s.id}"]`).addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await window.api.request(`/api/v1/sessions/${s.id}`, { method: "DELETE", timeout: 2500 });
      } catch {}
      const local = getLocalSessions().filter((ls) => ls.id !== s.id);
      saveLocalSessions(local);
      showToast("Session removed");
      await loadSessions();
    });

    listEl.appendChild(item);
  });
}

async function loadMyCharacters() {
  try {
    state.myCharacters = await window.api.request("/api/v1/characters?mine_only=true", { timeout: 2500 });
  } catch {
    state.myCharacters = getLocalMyCharacters();
  }
  renderMyCharactersList();
}

function renderMyCharactersList() {
  const listEl = document.getElementById("my-characters-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!state.myCharacters.length) {
    listEl.innerHTML = `
      <div class="muted-text" style="grid-column: 1 / -1; padding: 0.75rem 0;">
        You haven't created any characters yet. Fill out the studio form above to create your first character.
      </div>
    `;
    return;
  }

  state.myCharacters.forEach((c) => {
    const item = document.createElement("div");
    item.className = "session-card";
    const avatarSrc = window.api.resolveAssetUrl(c.avatar_url);
    const safeName = (c.name || "").replace(/'/g, "\\'");
    item.innerHTML = `
      <img src="${avatarSrc}" alt="${c.name}" class="char-avatar-lg" style="width:44px;height:44px;" onerror="this.onerror=null; this.src=getFallbackAvatar('${safeName}', '${c.gender || ''}');" />
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;">
          <strong style="font-size:0.9rem;">${c.name}</strong>
          <span class="badge-mini badge-warm">${c.category}</span>
        </div>
        <p class="muted-text" style="font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.15rem;">
          ${c.tagline}
        </p>
      </div>
      <div style="display:flex;align-items:center;gap:0.35rem;">
        <button type="button" class="icon-btn btn-edit-my-char" data-edit-char="${c.id}" title="Edit character in Studio">Edit</button>
        <button type="button" class="icon-btn" data-del-char="${c.id}" title="Delete character">Delete</button>
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-del-char]") || e.target.closest("[data-edit-char]")) return;
      openCharacterChat(c.id, false);
    });

    item.querySelector(`[data-edit-char="${c.id}"]`).addEventListener("click", (e) => {
      e.stopPropagation();
      triggerHaptic(10);
      populateStudioFormForEdit(c);
    });

    item.querySelector(`[data-del-char="${c.id}"]`).addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete character ${c.name}?`)) return;
      try {
        await window.api.request(`/api/v1/characters/${c.id}`, { method: "DELETE" });
        showToast(`Deleted ${c.name}`);
        await Promise.all([loadCharacters(), loadMyCharacters(), loadPlatformStats()]);
      } catch (err) {
        showToast(err.message);
      }
    });

    listEl.appendChild(item);
  });
}

function populateStudioFormForEdit(c) {
  state.editingCharacterId = c.id;
  document.getElementById("cc-name").value = c.name || "";
  document.getElementById("cc-gender").value = c.gender || "Female";
  document.getElementById("cc-tagline").value = c.tagline || "";
  document.getElementById("cc-category").value = c.category || "Romance";
  document.getElementById("cc-tags").value = (c.tags || []).join(", ");
  document.getElementById("cc-accent").value = c.accent_color || "#d97757";
  document.getElementById("cc-avatar").value = c.avatar_url || "";
  document.getElementById("cc-banner").value = c.banner_url || "";
  document.getElementById("cc-model").value = c.default_model || "haru-core";
  document.getElementById("cc-personality").value = c.personality || "";
  document.getElementById("cc-backstory").value = c.backstory || "";
  document.getElementById("cc-scenario").value = c.scenario || "";
  document.getElementById("cc-greeting").value = c.greeting || "";
  document.getElementById("cc-example").value = c.example_dialogue || "";
  document.getElementById("cc-public").checked = Boolean(c.is_public);
  document.getElementById("cc-avatar-preview").src = window.api.resolveAssetUrl(c.avatar_url);

  const submitBtn = document.querySelector("#create-char-form button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Save Changes ✨";

  switchTab("create");
  showToast(`Editing ${c.name} in Character Studio ✏️`);
}

function applyChatBackground(url, dimPercent = 68, persist = true) {
  const bgLayer = document.getElementById("chat-bg-layer");
  const scrimLayer = document.getElementById("chat-bg-scrim");
  const urlInput = document.getElementById("chat-bg-url-input");
  const dimSlider = document.getElementById("chat-bg-dim-slider");
  const dimLabel = document.getElementById("bg-dim-label");

  // Mobile sheet elements
  const sheetUrlInput = document.getElementById("sheet-bg-url-input");
  const sheetDimSlider = document.getElementById("sheet-dim-slider");
  const sheetDimVal = document.getElementById("sheet-dim-val");

  const cleanUrl = (url || "").trim();
  const clampedDim = Math.max(20, Math.min(95, Number(dimPercent) || 68));

  if (bgLayer) {
    if (cleanUrl) {
      const resolved = window.api.resolveAssetUrl(cleanUrl);
      bgLayer.style.backgroundImage = `url("${resolved}")`;
    } else {
      bgLayer.style.backgroundImage = "none";
    }
  }
  if (scrimLayer) {
    const alpha = cleanUrl ? (clampedDim / 100).toFixed(2) : "1";
    scrimLayer.style.background = cleanUrl
      ? `radial-gradient(circle at center 35%, rgba(21, 18, 16, ${Math.max(0.25, alpha - 0.25)}) 0%, rgba(21, 18, 16, ${alpha}) 75%, rgba(21, 18, 16, 0.96) 100%)`
      : "var(--bg-deep)";
  }
  if (urlInput) urlInput.value = cleanUrl;
  if (dimSlider) dimSlider.value = String(clampedDim);
  if (dimLabel) dimLabel.textContent = `Dimming: ${clampedDim}%`;

  if (sheetUrlInput) sheetUrlInput.value = cleanUrl;
  if (sheetDimSlider) sheetDimSlider.value = String(clampedDim);
  if (sheetDimVal) sheetDimVal.textContent = `${clampedDim}%`;

  if (persist && state.activeSession) {
    window.api.setChatBgConfig(
      state.activeSession.id,
      state.activeSession.character?.id,
      { url: cleanUrl, dim: clampedDim }
    );
  }
}

function applyChatBgBlur(blurMode = "none") {
  const bgLayer = document.getElementById("chat-bg-layer");
  if (!bgLayer) return;
  bgLayer.classList.remove("blur-soft", "blur-dreamy");
  if (blurMode === "soft") bgLayer.classList.add("blur-soft");
  if (blurMode === "dreamy") bgLayer.classList.add("blur-dreamy");
  document.querySelectorAll(".sheet-pill-btn[data-blur]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.blur === blurMode);
  });
  if (state.activeSession) {
    try {
      localStorage.setItem(`sora_bg_blur_${state.activeSession.id}`, blurMode);
    } catch (_) {}
  }
}

// --- Conversation Drawer ---
async function openCharacterChat(characterId, forceNew = false) {
  try {
    const sessionData = await window.api.request("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({
        character_id: characterId,
        force_new: forceNew,
      }),
      timeout: 2500,
    });
    mountChatDrawer(sessionData);
    loadSessions();
    loadPlatformStats();
    return;
  } catch (err) {
    console.warn("Backend session request failed, initiating local session:", err);
  }

  // Standalone offline session
  const char = (state.characters || []).find((c) => c.id === characterId) ||
               (window.SORA_DEFAULT_CATALOG || []).find((c) => c.id === characterId);
  if (!char) {
    showToast("Character not found");
    return;
  }

  const localSessions = getLocalSessions();
  let existing = !forceNew ? localSessions.find((s) => s.character_id === characterId) : null;

  if (!existing) {
    existing = {
      id: `local_sess_${Date.now()}_${char.id}`,
      character_id: char.id,
      character_name: char.name,
      character_avatar: char.avatar_url,
      character: char,
      user_id: state.user?.id || "guest",
      selected_model: char.default_model || "haru-core",
      memory_notes: "",
      last_message: (char.greeting || "").slice(0, 80),
      messages: [
        {
          id: `msg_init_${Date.now()}`,
          role: "assistant",
          content: char.greeting || `*Smiles warmly as you approach.* "Welcome. I'm ${char.name}. Tell me what's on your mind."`,
          model: getPublicModelName(char.default_model),
          created_at: new Date().toISOString(),
        },
      ],
    };
    localSessions.unshift(existing);
    saveLocalSessions(localSessions);
  }

  mountChatDrawer(existing);
  renderSessionsList();
}

async function openExistingSession(sessionId) {
  try {
    const sessionData = await window.api.request(`/api/v1/sessions/${sessionId}`, { timeout: 2500 });
    mountChatDrawer(sessionData);
    return;
  } catch (err) {
    const local = getLocalSessions().find((s) => s.id === sessionId);
    if (local) {
      mountChatDrawer(local);
      return;
    }
    showToast(`Could not load session: ${err.message}`);
  }
}

function mountChatDrawer(sessionData) {
  state.activeSession = sessionData;
  const c = sessionData.character;
  const drawer = document.getElementById("chat-drawer");
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("chat-active");

  const charAvatarEl = document.getElementById("chat-char-avatar");
  if (charAvatarEl) {
    charAvatarEl.onerror = () => {
      charAvatarEl.onerror = null;
      charAvatarEl.src = getFallbackAvatar(c.name, c.gender);
    };
    charAvatarEl.src = window.api.resolveAssetUrl(c.avatar_url);
  }
  document.getElementById("chat-char-name").textContent = c.name;
  document.getElementById("chat-char-category").textContent = c.category;
  document.getElementById("chat-char-tagline").textContent = c.tagline;

  document.getElementById("chat-lore-personality").textContent = c.personality;
  document.getElementById("chat-lore-scenario").textContent = c.scenario ? `Setting: ${c.scenario}` : "Setting: Open World Interactive Roleplay";
  document.getElementById("chat-memory-input").value = sessionData.memory_notes || "";

  // Mobile sheet fields sync
  const sheetLorePers = document.getElementById("sheet-lore-personality");
  if (sheetLorePers) sheetLorePers.textContent = c.personality;
  const sheetLoreScen = document.getElementById("sheet-lore-scenario");
  if (sheetLoreScen) sheetLoreScen.textContent = c.scenario ? `Setting: ${c.scenario}` : "Setting: Open World Interactive Roleplay";
  const sheetMemInput = document.getElementById("sheet-memory-input");
  if (sheetMemInput) sheetMemInput.value = sessionData.memory_notes || "";

  // Load saved custom chat background (or character's default banner_url / avatar_url)
  const defaultCharArt = c.banner_url || c.avatar_url || "";
  const bgCfg = window.api.getChatBgConfig(sessionData.id, c.id, defaultCharArt);
  applyChatBackground(bgCfg.url, bgCfg.dim, false);

  const savedBlur = localStorage.getItem(`sora_bg_blur_${sessionData.id}`) || "none";
  applyChatBgBlur(savedBlur);

  const modelSelect = document.getElementById("chat-model-select");
  if (sessionData.selected_model) {
    modelSelect.value = sessionData.selected_model;
  }
  const mobileModelLabel = document.getElementById("chat-mobile-model-label");
  if (mobileModelLabel) {
    mobileModelLabel.textContent = getPublicModelName(sessionData.selected_model || "haru-core");
  }
  const sheetModelSelect = document.getElementById("sheet-model-select");
  if (sheetModelSelect && sessionData.selected_model) {
    sheetModelSelect.value = sessionData.selected_model;
  }

  const personaSelect = document.getElementById("chat-persona-select");
  if (sessionData.persona_id) {
    personaSelect.value = sessionData.persona_id;
  }
  const sheetPersonaSelect = document.getElementById("sheet-persona-select");
  if (sheetPersonaSelect && sessionData.persona_id) {
    sheetPersonaSelect.value = sessionData.persona_id;
  }

  updateChatFavoriteButtonUI(Boolean(c.liked_by_me));
  updateTtsButtonsUI(state.ttsAutoPlay);

  renderMessagesList();
}

function renderStoryPrologue(c) {
  const div = document.createElement("div");
  div.className = "story-prologue-card";
  const avatar = window.api.resolveAssetUrl(c.avatar_url);
  const fallbackImg = getFallbackAvatar(c.name, c.gender);
  const culture = getCharacterCulture(c);
  div.innerHTML = `
    <div class="prologue-banner" style="background-image: url('${avatar}')"></div>
    <div class="prologue-content">
      <img src="${avatar}" alt="${c.name}" class="prologue-avatar" onerror="this.onerror=null; this.src='${fallbackImg}';" />
      <h3 class="prologue-title">${c.name}</h3>
      <p class="prologue-tagline">${c.tagline || ""}</p>
      <div class="prologue-badges">
        <span class="badge-mini badge-warm">${c.category}</span>
        <span class="badge-mini badge-gender">${c.gender || "Female"}</span>
        <span class="badge-mini" title="${culture.label}">${culture.flag} ${culture.label}</span>
      </div>
      ${c.scenario ? `<p class="prologue-setting"><strong>Setting:</strong> ${c.scenario}</p>` : ""}
    </div>
    <div class="prologue-divider">
      <span>Chapter I · The Encounter</span>
    </div>
  `;
  return div;
}

function renderMessagesList() {
  const container = document.getElementById("chat-messages");
  container.innerHTML = "";
  if (!state.activeSession) return;

  const c = state.activeSession.character;
  container.appendChild(renderStoryPrologue(c));

  const charAvatar = window.api.resolveAssetUrl(c.avatar_url);
  const userAvatar = window.api.resolveAssetUrl(state.user?.avatar_url);

  state.activeSession.messages.forEach((m) => {
    container.appendChild(createMessageDom(m, m.content, m.model_used, charAvatar, userAvatar, m.id));
  });
  container.scrollTop = container.scrollHeight;
}

function createMessageDom(msgOrRole, content, modelUsed, charAvatar, userAvatar, msgId = null) {
  const role = typeof msgOrRole === "object" ? msgOrRole.role : msgOrRole;
  let text = typeof msgOrRole === "object" ? msgOrRole.content : content;
  const model = typeof msgOrRole === "object" ? msgOrRole.model_used : modelUsed;
  const id = typeof msgOrRole === "object" ? (msgOrRole.id || "") : (msgId || "");

  const row = document.createElement("div");
  row.className = `msg-row ${role}`;
  if (id) row.dataset.msgId = id;
  row.dataset.rawText = text;
  const avatar = role === "user" ? userAvatar : charAvatar;

  const authorName = role === "user"
    ? (state.user?.display_name || "You")
    : (state.activeSession?.character?.name || "Character");

  const fallbackMsgAvatar = getFallbackAvatar(authorName);
  row.innerHTML = `
    <img src="${avatar}" alt="${role}" class="msg-avatar" onerror="this.onerror=null; this.src='${fallbackMsgAvatar}';" />
    <div style="min-width:0;flex:1;">
      <div class="msg-bubble">${formatRoleplayHTML(text)}</div>
      <div class="msg-edit-box hidden">
        <textarea class="msg-inline-edit-input" placeholder="Edit message text..."></textarea>
        <div class="msg-edit-controls">
          <button type="button" class="btn-xs btn-outline btn-cancel-edit">Cancel</button>
          <button type="button" class="btn-xs btn-primary btn-save-edit">Save</button>
        </div>
      </div>
      <div class="msg-meta-row">
        <div class="msg-meta-info">
          <span>${authorName}</span>
          ${role === "assistant" && model ? `<span>· ${model}</span>` : ""}
        </div>
        <div class="msg-action-btns">
          <button type="button" class="msg-act-btn btn-copy-msg" title="Copy message">📋</button>
          <button type="button" class="msg-act-btn btn-tts-msg" title="Voice narration">🔊</button>
          <button type="button" class="msg-act-btn btn-edit-msg" title="Edit turn">✏️</button>
          <button type="button" class="msg-act-btn btn-del-msg" title="Delete turn">🗑️</button>
        </div>
      </div>
    </div>
  `;

  const bubbleEl = row.querySelector(".msg-bubble");
  const editBoxEl = row.querySelector(".msg-edit-box");
  const editInput = row.querySelector(".msg-inline-edit-input");

  // Copy button
  const copyBtn = row.querySelector(".btn-copy-msg");
  copyBtn.addEventListener("click", () => {
    triggerHaptic(8);
    const toCopy = row.dataset.rawText || text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(toCopy)
        .then(() => showToast("Copied to clipboard 📋"))
        .catch(() => copyFallback(toCopy));
    } else {
      copyFallback(toCopy);
    }
  });

  // TTS Voice button
  const ttsBtn = row.querySelector(".btn-tts-msg");
  ttsBtn.addEventListener("click", () => {
    triggerHaptic(10);
    const toSpeak = row.dataset.rawText || text;
    const gender = role === "assistant" ? (state.activeSession?.character?.gender || "Female") : "Female";
    speakText(toSpeak, gender, ttsBtn);
  });

  // Edit button
  const editBtn = row.querySelector(".btn-edit-msg");
  editBtn.addEventListener("click", () => {
    triggerHaptic(8);
    const cur = row.dataset.rawText || text;
    editInput.value = cur;
    bubbleEl.classList.add("hidden");
    editBoxEl.classList.remove("hidden");
    editInput.focus();
    editInput.style.height = "auto";
    editInput.style.height = `${Math.max(70, editInput.scrollHeight)}px`;
  });

  // Cancel edit button
  const cancelBtn = row.querySelector(".btn-cancel-edit");
  cancelBtn.addEventListener("click", () => {
    editBoxEl.classList.add("hidden");
    bubbleEl.classList.remove("hidden");
  });

  // Save edit button
  const saveBtn = row.querySelector(".btn-save-edit");
  saveBtn.addEventListener("click", async () => {
    const updated = editInput.value.trim();
    if (!updated) return;
    const curId = row.dataset.msgId;
    if (!curId || !state.activeSession) {
      row.dataset.rawText = updated;
      text = updated;
      bubbleEl.innerHTML = formatRoleplayHTML(updated);
      editBoxEl.classList.add("hidden");
      bubbleEl.classList.remove("hidden");
      return;
    }
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "...";
      await window.api.request(`/api/v1/sessions/${state.activeSession.id}/messages/${curId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: updated }),
      });
      const localMsg = state.activeSession.messages.find((m) => m.id === curId);
      if (localMsg) localMsg.content = updated;
      row.dataset.rawText = updated;
      text = updated;
      bubbleEl.innerHTML = formatRoleplayHTML(updated);
      editBoxEl.classList.add("hidden");
      bubbleEl.classList.remove("hidden");
      showToast("Message updated ✏️");
    } catch (err) {
      showToast(`Edit failed: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });

  // Delete turn button
  const delBtn = row.querySelector(".btn-del-msg");
  delBtn.addEventListener("click", async () => {
    triggerHaptic(12);
    if (!confirm("Delete this turn from the conversation?")) return;
    const curId = row.dataset.msgId;
    if (curId && state.activeSession) {
      try {
        await window.api.request(`/api/v1/sessions/${state.activeSession.id}/messages/${curId}`, {
          method: "DELETE",
        });
        state.activeSession.messages = state.activeSession.messages.filter((m) => m.id !== curId);
      } catch (err) {
        showToast(`Delete failed: ${err.message}`);
        return;
      }
    }
    row.remove();
    showToast("Turn deleted 🗑️");
  });

  return row;
}

async function toggleActiveCharacterFavorite() {
  if (!state.activeSession || !state.activeSession.character) return;
  triggerHaptic(14);
  const char = state.activeSession.character;
  try {
    const res = await window.api.request(`/api/v1/characters/${char.id}/like`, { method: "POST" });
    char.liked_by_me = res.liked;
    char.like_count = res.like_count;
    updateChatFavoriteButtonUI(res.liked);
    showToast(res.liked ? `Saved ${char.name} to Favorites ❤️` : `Removed ${char.name} from Favorites`);
    const dChar = state.characters.find((c) => c.id === char.id);
    if (dChar) {
      dChar.liked_by_me = res.liked;
      dChar.like_count = res.like_count;
    }
  } catch (err) {
    showToast(`Favorite failed: ${err.message}`);
  }
}

function updateChatFavoriteButtonUI(isLiked) {
  const desktopBtn = document.getElementById("chat-favorite-btn");
  const mobileBtn = document.getElementById("chat-mobile-fav-btn");
  [desktopBtn, mobileBtn].forEach((btn) => {
    if (!btn) return;
    if (isLiked) {
      btn.classList.add("favorited");
      btn.textContent = "❤️";
      btn.title = "Saved to Favorites";
    } else {
      btn.classList.remove("favorited");
      btn.textContent = "🤍";
      btn.title = "Save to Favorites";
    }
  });
}

function toggleTtsNarration() {
  triggerHaptic(12);
  state.ttsAutoPlay = !state.ttsAutoPlay;
  updateTtsButtonsUI(state.ttsAutoPlay);
  if (!state.ttsAutoPlay) {
    stopSpeech();
    showToast("Voice Narration: Muted 🔇");
  } else {
    showToast("Voice Narration: Active 🔊");
    if (state.activeSession && state.activeSession.messages.length > 0) {
      const lastMsg = state.activeSession.messages[state.activeSession.messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        speakText(lastMsg.content, state.activeSession.character.gender);
      }
    }
  }
}

function updateTtsButtonsUI(isActive) {
  const ttsBtn = document.getElementById("chat-tts-toggle-btn");
  const mobileTtsBtn = document.getElementById("chat-mobile-tts-btn");
  const quickTtsBtn = document.getElementById("quick-tts-btn");

  if (ttsBtn) {
    ttsBtn.classList.toggle("active-voice", isActive);
    ttsBtn.textContent = isActive ? "🔊 Voice On" : "🔇 Voice Off";
  }
  if (mobileTtsBtn) {
    mobileTtsBtn.classList.toggle("active-voice", isActive);
    mobileTtsBtn.textContent = isActive ? "🔊" : "🔇";
  }
  if (quickTtsBtn) {
    quickTtsBtn.classList.toggle("active-voice", isActive);
    const chipText = quickTtsBtn.querySelector(".chip-text");
    if (chipText) chipText.textContent = isActive ? "Voice: On" : "Voice: Off";
  }
}

function exportCurrentStoryTranscript() {
  if (!state.activeSession || !state.activeSession.character) return;
  triggerHaptic(12);
  const c = state.activeSession.character;
  const msgs = state.activeSession.messages || [];
  const userName = state.user?.display_name || "You";
  const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  let md = `# Sora Roleplay: ${c.name}\n\n`;
  md += `> **Character:** ${c.name} (${c.gender || "Female"} · ${c.category || "Roleplay"})\n`;
  if (c.tagline) md += `> **Tagline:** ${c.tagline}\n`;
  if (c.scenario) md += `> **Setting:** ${c.scenario}\n`;
  md += `> **Date:** ${dateStr}\n\n`;
  md += `---\n\n`;

  msgs.forEach((m) => {
    const speaker = m.role === "user" ? userName : c.name;
    const modelTag = m.role === "assistant" && m.model_used ? ` *(${m.model_used})*` : "";
    md += `### **${speaker}**${modelTag}\n\n${m.content}\n\n---\n\n`;
  });

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  a.href = url;
  a.download = `${safeName}_story_transcript.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Story transcript exported (.md) 📖`);
}

// --- Profiles Manager ---
function renderPersonasList() {
  const container = document.getElementById("personas-list");
  if (!container || !state.user) return;
  container.innerHTML = "";

  (state.user.personas || []).forEach((p) => {
    const card = document.createElement("div");
    card.className = "persona-card";
    const avatarSrc = window.api.resolveAssetUrl(p.avatar_url);
    card.innerHTML = `
      <img src="${avatarSrc}" alt="${p.name}" class="user-avatar-sm" style="width:38px;height:38px;" />
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <strong style="font-size:0.86rem;">${p.name}</strong>
          ${p.is_default ? '<span class="badge-mini">Default</span>' : ""}
        </div>
        <p class="muted-text" style="font-size:0.78rem;margin-top:0.12rem;">${p.description || "Standard profile"}</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.35rem;">
        ${!p.is_default ? `<button type="button" class="btn-xs btn-outline btn-set-default" data-persona-id="${p.id}" style="font-size:0.75rem;padding:0.25rem 0.5rem;">Set Active</button>` : ""}
        <button type="button" class="btn-xs btn-outline btn-del-persona" data-persona-id="${p.id}" style="color:#f87171;font-size:0.75rem;padding:0.25rem 0.5rem;" title="Delete profile">Delete</button>
      </div>
    `;

    const setDefBtn = card.querySelector(".btn-set-default");
    if (setDefBtn) {
      setDefBtn.addEventListener("click", async () => {
        triggerHaptic(10);
        try {
          await window.api.request(`/api/v1/personas/${p.id}/default`, { method: "POST" });
          state.user = await window.api.request("/api/v1/auth/me");
          renderUserHeader();
          renderPersonasList();
          showToast(`Default profile set to ${p.name}`);
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    const delBtn = card.querySelector(".btn-del-persona");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        triggerHaptic(12);
        if (!confirm(`Delete profile "${p.name}"?`)) return;
        try {
          await window.api.request(`/api/v1/personas/${p.id}`, { method: "DELETE" });
          state.user = await window.api.request("/api/v1/auth/me");
          renderUserHeader();
          renderPersonasList();
          showToast("Profile deleted");
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    container.appendChild(card);
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
  const titles = {
    discover: "Character Directory",
    chats: "Active Sessions",
    create: "Create Character",
    personas: "User Profiles",
    settings: "Configuration",
  };
  document.getElementById("view-title").textContent = titles[tabName] || "Haru";
}
window.switchTab = switchTab;

function loadSavedByokForm() {
  const keys = window.api.getByokKeys();
  document.getElementById("cfg-server-url").value = localStorage.getItem("haru_emochi_server_url") || "";
  document.getElementById("cfg-groq-key").value = keys.groq || "";
  document.getElementById("cfg-gemini-key").value = keys.gemini || "";
  document.getElementById("cfg-openai-key").value = keys.openai || "";
  document.getElementById("cfg-openrouter-key").value = keys.openrouter || "";
  document.getElementById("cfg-xai-key").value = keys.xai || "";
  document.getElementById("cfg-hf-key").value = keys.hf || "";
  document.getElementById("cfg-ollama-url").value = keys.ollama_url || "";
}

function bindUIEvents() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  let searchTimer = null;
  document.getElementById("char-search-input").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = e.target.value;
      loadCharacters();
    }, 200);
  });

  document.getElementById("char-gender-select").addEventListener("change", (e) => {
    state.activeGender = e.target.value;
    loadCharacters();
  });

  document.getElementById("char-sort-select").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    loadCharacters();
  });

  document.querySelectorAll(".cat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".cat-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.activeCategory = chip.dataset.category;
      loadCharacters();
    });
  });

  // --- 210+ Character Template Loader in Character Studio ---
  const tplGenderEl = document.getElementById("studio-template-gender");
  if (tplGenderEl) {
    tplGenderEl.addEventListener("change", (e) => {
      renderTemplateDropdown(e.target.value || "All");
    });
  }

  const applyTemplateToStudio = (tplId) => {
    if (!tplId) return;
    const tpl = state.templates.find((t) => t.id === tplId);
    if (!tpl) return;
    document.getElementById("cc-name").value = tpl.name || "";
    document.getElementById("cc-gender").value = tpl.gender || "Female";
    document.getElementById("cc-category").value = tpl.category || "Romance";
    document.getElementById("cc-tagline").value = tpl.tagline || "";
    document.getElementById("cc-tags").value = tpl.tags || "";
    document.getElementById("cc-avatar").value = tpl.avatar_url || "";
    document.getElementById("cc-avatar-preview").src = window.api.resolveAssetUrl(tpl.avatar_url);
    document.getElementById("cc-banner").value = tpl.banner_url || "";
    document.getElementById("cc-personality").value = tpl.personality || "";
    document.getElementById("cc-backstory").value = tpl.backstory || "";
    document.getElementById("cc-scenario").value = tpl.scenario || "";
    document.getElementById("cc-greeting").value = tpl.greeting || "";
    document.getElementById("cc-example").value = tpl.example_dialogue || "";
    if (tpl.default_model) {
      document.getElementById("cc-model").value = tpl.default_model;
    }
    showToast(`Loaded template: ${tpl.name} (${tpl.gender} · ${tpl.category})`);
  };

  const applyTplBtn = document.getElementById("apply-template-btn");
  if (applyTplBtn) {
    applyTplBtn.addEventListener("click", () => {
      const chosen = document.getElementById("studio-template-select").value;
      if (!chosen) {
        showToast("Select a character template from the dropdown first");
        return;
      }
      applyTemplateToStudio(chosen);
    });
  }

  const tplSelectEl = document.getElementById("studio-template-select");
  if (tplSelectEl) {
    tplSelectEl.addEventListener("change", (e) => {
      if (e.target.value) applyTemplateToStudio(e.target.value);
    });
  }

  // --- Quick Trope Tag Chips in Character Studio ---
  document.querySelectorAll("[data-quick-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.getAttribute("data-quick-tag");
      const tagsInput = document.getElementById("cc-tags");
      const existing = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const idx = existing.findIndex((t) => t.toLowerCase() === tag.toLowerCase());
      if (idx >= 0) {
        existing.splice(idx, 1);
        btn.classList.remove("active");
      } else {
        existing.push(tag);
        btn.classList.add("active");
      }
      tagsInput.value = existing.join(", ");
    });
  });

  // --- Character Studio Image Uploads (Portrait & Default Chat Background) ---
  const ccRandomAiBtn = document.getElementById("cc-random-ai-btn");
  if (ccRandomAiBtn) {
    ccRandomAiBtn.addEventListener("click", async () => {
      const gender = document.getElementById("cc-gender").value || "Female";
      try {
        ccRandomAiBtn.textContent = "Picking...";
        const res = await window.api.request(`/api/v1/random-avatar?gender=${encodeURIComponent(gender)}`);
        if (res && res.url) {
          document.getElementById("cc-avatar").value = res.url;
          document.getElementById("cc-avatar-preview").src = window.api.resolveAssetUrl(res.url);
          const bannerInput = document.getElementById("cc-banner");
          if (!bannerInput.value) {
            bannerInput.value = res.url;
          }
          showToast(`Assigned AI portrait for ${gender} character`);
        }
      } catch (err) {
        showToast(`Could not fetch AI art: ${err.message}`);
      } finally {
        ccRandomAiBtn.textContent = "Pick AI Art";
      }
    });
  }

  document.getElementById("cc-avatar").addEventListener("input", (e) => {
    const val = e.target.value.trim();
    document.getElementById("cc-avatar-preview").src = val
      ? window.api.resolveAssetUrl(val)
      : "/assets/icon.svg";
  });

  document.getElementById("cc-avatar-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast("Uploading portrait...");
      const uploadedUrl = await window.api.uploadImageFile(file, "avatar");
      document.getElementById("cc-avatar").value = uploadedUrl;
      document.getElementById("cc-avatar-preview").src = window.api.resolveAssetUrl(uploadedUrl);
      showToast("Portrait uploaded");
    } catch (err) {
      showToast(`Upload failed: ${err.message}`);
    }
  });

  document.getElementById("cc-banner-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast("Uploading scene background...");
      const uploadedUrl = await window.api.uploadImageFile(file, "background");
      document.getElementById("cc-banner").value = uploadedUrl;
      showToast("Default chat background uploaded");
    } catch (err) {
      showToast(`Upload failed: ${err.message}`);
    }
  });

  document.getElementById("create-char-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tagsRaw = document.getElementById("cc-tags").value;
    const payload = {
      name: document.getElementById("cc-name").value,
      gender: document.getElementById("cc-gender").value || "Female",
      category: document.getElementById("cc-category").value,
      tagline: document.getElementById("cc-tagline").value,
      tags: tagsRaw.split(",").map((t) => t.trim()).filter(Boolean),
      accent_color: document.getElementById("cc-accent").value || "#d97757",
      avatar_url: document.getElementById("cc-avatar").value,
      banner_url: document.getElementById("cc-banner").value,
      default_model: document.getElementById("cc-model").value,
      personality: document.getElementById("cc-personality").value,
      backstory: document.getElementById("cc-backstory").value,
      scenario: document.getElementById("cc-scenario").value,
      greeting: document.getElementById("cc-greeting").value,
      example_dialogue: document.getElementById("cc-example").value,
      is_public: document.getElementById("cc-public").checked,
    };

    try {
      const submitBtn = document.querySelector("#create-char-form button[type='submit']");
      if (state.editingCharacterId) {
        await window.api.request(`/api/v1/characters/${state.editingCharacterId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showToast("Character updated successfully ✨");
        state.editingCharacterId = null;
        if (submitBtn) submitBtn.textContent = "Publish to Directory";
        e.target.reset();
        document.querySelectorAll("[data-quick-tag]").forEach((b) => b.classList.remove("active"));
        document.getElementById("cc-avatar-preview").src = "/assets/icon.svg";
        await Promise.all([loadCharacters(), loadMyCharacters(), loadPlatformStats()]);
      } else {
        const created = await window.api.request("/api/v1/characters", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast(`Created ${created.name}`);
        e.target.reset();
        document.querySelectorAll("[data-quick-tag]").forEach((b) => b.classList.remove("active"));
        document.getElementById("cc-avatar-preview").src = "/assets/icon.svg";
        await Promise.all([loadCharacters(), loadMyCharacters(), loadPlatformStats()]);
        openCharacterChat(created.id, true);
      }
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  });

  document.getElementById("create-persona-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await window.api.request("/api/v1/personas", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("up-name").value,
          description: document.getElementById("up-desc").value,
          is_default: true,
        }),
      });
      state.user = await window.api.request("/api/v1/auth/me");
      renderUserHeader();
      renderPersonasList();
      e.target.reset();
      showToast("Profile created");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("byok-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const srv = document.getElementById("cfg-server-url").value.trim();
    if (srv) localStorage.setItem("haru_emochi_server_url", srv);
    else localStorage.removeItem("haru_emochi_server_url");

    window.api.setByokKeys({
      groq: document.getElementById("cfg-groq-key").value.trim(),
      gemini: document.getElementById("cfg-gemini-key").value.trim(),
      openai: document.getElementById("cfg-openai-key").value.trim(),
      openrouter: document.getElementById("cfg-openrouter-key").value.trim(),
      xai: document.getElementById("cfg-xai-key").value.trim(),
      hf: document.getElementById("cfg-hf-key").value.trim(),
      ollama_url: document.getElementById("cfg-ollama-url").value.trim(),
    });
    showToast("Configuration saved");
    loadAdapters();
  });

  document.getElementById("close-chat-btn").addEventListener("click", () => {
    document.getElementById("chat-drawer").classList.add("hidden");
    document.body.classList.remove("chat-active");
    loadSessions();
  });

  // --- Mobile Bottom Sheet & Ambience Controls ---
  const mobileSheet = document.getElementById("chat-mobile-sheet");
  const openMobileSheet = (tab = "ambience") => {
    triggerHaptic(10);
    if (!mobileSheet) return;
    mobileSheet.classList.remove("hidden");
    switchSheetTab(tab);
  };
  const closeMobileSheet = () => {
    triggerHaptic(8);
    if (mobileSheet) mobileSheet.classList.add("hidden");
  };
  const switchSheetTab = (tabName) => {
    document.querySelectorAll(".sheet-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.sheetTab === tabName);
    });
    document.querySelectorAll(".sheet-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `sheet-section-${tabName}`);
    });
  };

  document.querySelectorAll(".sheet-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      triggerHaptic(8);
      switchSheetTab(btn.dataset.sheetTab);
    });
  });

  const mobileMenuBtn = document.getElementById("chat-mobile-menu-btn");
  if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", () => openMobileSheet("ambience"));

  const mobileQuickSceneBtn = document.getElementById("mobile-quick-scene-btn");
  if (mobileQuickSceneBtn) mobileQuickSceneBtn.addEventListener("click", () => openMobileSheet("ambience"));

  const mobileModelBtn = document.getElementById("chat-mobile-model-btn");
  if (mobileModelBtn) mobileModelBtn.addEventListener("click", () => openMobileSheet("model"));

  const avatarProfileTrigger = document.getElementById("chat-avatar-profile-trigger");
  if (avatarProfileTrigger) avatarProfileTrigger.addEventListener("click", () => openMobileSheet("lore"));

  const metaProfileTrigger = document.getElementById("chat-meta-profile-trigger");
  if (metaProfileTrigger) metaProfileTrigger.addEventListener("click", () => openMobileSheet("lore"));

  const closeMobileSheetBtn = document.getElementById("close-mobile-sheet-btn");
  if (closeMobileSheetBtn) closeMobileSheetBtn.addEventListener("click", closeMobileSheet);

  if (mobileSheet) {
    mobileSheet.addEventListener("click", (e) => {
      if (e.target === mobileSheet) closeMobileSheet();
    });
  }

  // Mobile Sheet Background Controls
  const sheetBgFileInput = document.getElementById("sheet-bg-file-input");
  if (sheetBgFileInput) {
    sheetBgFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        showToast("Uploading custom chat background...");
        const uploadedUrl = await window.api.uploadImageFile(file, "background");
        const currentDim = Number(document.getElementById("sheet-dim-slider").value) || 68;
        applyChatBackground(uploadedUrl, currentDim, true);
        showToast("Custom chat background applied");
      } catch (err) {
        showToast(`Background upload failed: ${err.message}`);
      }
    });
  }

  const sheetApplyBgBtn = document.getElementById("sheet-apply-bg-url-btn");
  if (sheetApplyBgBtn) {
    sheetApplyBgBtn.addEventListener("click", () => {
      const url = document.getElementById("sheet-bg-url-input").value.trim();
      const currentDim = Number(document.getElementById("sheet-dim-slider").value) || 68;
      applyChatBackground(url, currentDim, true);
      showToast(url ? "Background applied" : "Reverted to solid background");
    });
  }

  const sheetClearBgBtn = document.getElementById("sheet-clear-bg-btn");
  if (sheetClearBgBtn) {
    sheetClearBgBtn.addEventListener("click", () => {
      applyChatBackground("", 68, true);
      showToast("Reset to default background");
    });
  }

  const sheetUseCharArtBtn = document.getElementById("sheet-use-char-art-btn");
  if (sheetUseCharArtBtn) {
    sheetUseCharArtBtn.addEventListener("click", () => {
      if (!state.activeSession) return;
      const c = state.activeSession.character;
      const charArt = c.banner_url || c.avatar_url || "";
      const currentDim = Number(document.getElementById("sheet-dim-slider").value) || 68;
      applyChatBackground(charArt, currentDim, true);
      showToast(charArt ? "Character AI art applied" : "No character art");
    });
  }

  document.querySelectorAll("[data-scene-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      triggerHaptic(10);
      const sceneUrl = btn.getAttribute("data-scene-preset") || "";
      const currentDim = Number(document.getElementById("sheet-dim-slider").value) || 68;
      applyChatBackground(sceneUrl, currentDim, true);
    });
  });

  const sheetDimSlider = document.getElementById("sheet-dim-slider");
  if (sheetDimSlider) {
    sheetDimSlider.addEventListener("input", (e) => {
      const dim = Number(e.target.value) || 68;
      const url = document.getElementById("sheet-bg-url-input").value.trim();
      applyChatBackground(url, dim, true);
    });
  }

  document.querySelectorAll(".sheet-pill-btn[data-blur]").forEach((btn) => {
    btn.addEventListener("click", () => {
      triggerHaptic(10);
      applyChatBgBlur(btn.dataset.blur);
    });
  });

  const sheetSaveMemBtn = document.getElementById("sheet-save-memory-btn");
  if (sheetSaveMemBtn) {
    sheetSaveMemBtn.addEventListener("click", async () => {
      if (!state.activeSession) return;
      triggerHaptic(12);
      const notes = document.getElementById("sheet-memory-input").value;
      await window.api.request(`/api/v1/sessions/${state.activeSession.id}`, {
        method: "PATCH",
        body: JSON.stringify({ memory_notes: notes }),
      });
      state.activeSession.memory_notes = notes;
      document.getElementById("chat-memory-input").value = notes;
      showToast("Story notes updated");
    });
  }

  const sheetModelSelect = document.getElementById("sheet-model-select");
  if (sheetModelSelect) {
    sheetModelSelect.addEventListener("change", (e) => {
      const model = e.target.value;
      const mainSelect = document.getElementById("chat-model-select");
      if (mainSelect) mainSelect.value = model;
      const lbl = document.getElementById("chat-mobile-model-label");
      if (lbl) lbl.textContent = getPublicModelName(model);
      triggerHaptic(10);
    });
  }

  const sheetPersonaSelect = document.getElementById("sheet-persona-select");
  if (sheetPersonaSelect) {
    sheetPersonaSelect.addEventListener("change", (e) => {
      const persona = e.target.value;
      const mainPersona = document.getElementById("chat-persona-select");
      if (mainPersona) mainPersona.value = persona;
      triggerHaptic(10);
    });
  }

  const sheetNewSessionBtn = document.getElementById("sheet-new-session-btn");
  if (sheetNewSessionBtn) {
    sheetNewSessionBtn.addEventListener("click", () => {
      if (!state.activeSession) return;
      closeMobileSheet();
      openCharacterChat(state.activeSession.character.id, true);
      showToast("Started fresh story session");
    });
  }

  // View Mode Switcher in Directory Toolbar
  const compactBtn = document.getElementById("grid-view-compact-btn");
  const storyBtn = document.getElementById("grid-view-story-btn");
  const charGrid = document.getElementById("character-grid");
  const setGridViewMode = (mode) => {
    triggerHaptic(10);
    if (!charGrid) return;
    const isCompact = mode === "compact";
    charGrid.classList.toggle("compact-mode", isCompact);
    if (compactBtn) compactBtn.classList.toggle("active", isCompact);
    if (storyBtn) storyBtn.classList.toggle("active", !isCompact);
    try {
      localStorage.setItem("sora_grid_view_mode", mode);
    } catch (_) {}
  };
  if (compactBtn) compactBtn.addEventListener("click", () => setGridViewMode("compact"));
  if (storyBtn) storyBtn.addEventListener("click", () => setGridViewMode("story"));
  const savedGridMode = localStorage.getItem("sora_grid_view_mode") || (window.innerWidth <= 640 ? "compact" : "story");
  setGridViewMode(savedGridMode);

  const navLogoBtn = document.getElementById("nav-logo-btn");
  if (navLogoBtn) navLogoBtn.addEventListener("click", () => switchTab("discover"));

  // --- Custom Chat Window Background Controls (Desktop) ---
  document.getElementById("toggle-bg-btn").addEventListener("click", () => {
    document.getElementById("chat-bg-panel").classList.toggle("hidden");
    document.getElementById("chat-lore-panel").classList.add("hidden");
  });

  document.getElementById("toggle-lore-btn").addEventListener("click", () => {
    document.getElementById("chat-lore-panel").classList.toggle("hidden");
    document.getElementById("chat-bg-panel").classList.add("hidden");
  });

  document.getElementById("chat-bg-file-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast("Uploading custom chat background...");
      const uploadedUrl = await window.api.uploadImageFile(file, "background");
      const currentDim = Number(document.getElementById("chat-bg-dim-slider").value) || 68;
      applyChatBackground(uploadedUrl, currentDim, true);
      showToast("Custom chat background applied");
    } catch (err) {
      showToast(`Background upload failed: ${err.message}`);
    }
  });

  document.getElementById("apply-bg-url-btn").addEventListener("click", () => {
    const url = document.getElementById("chat-bg-url-input").value.trim();
    const currentDim = Number(document.getElementById("chat-bg-dim-slider").value) || 68;
    applyChatBackground(url, currentDim, true);
    showToast(url ? "Background image applied" : "Reverted to default background");
  });

  document.getElementById("clear-bg-btn").addEventListener("click", () => {
    applyChatBackground("", 68, true);
    showToast("Reset to default warm espresso background");
  });

  const useCharArtBtn = document.getElementById("use-char-art-bg-btn");
  if (useCharArtBtn) {
    useCharArtBtn.addEventListener("click", () => {
      if (!state.activeSession) return;
      const c = state.activeSession.character;
      const charArt = c.banner_url || c.avatar_url || "";
      const currentDim = Number(document.getElementById("chat-bg-dim-slider").value) || 68;
      applyChatBackground(charArt, currentDim, true);
      showToast(charArt ? "Character AI art set as chat background" : "No character art available");
    });
  }

  document.querySelectorAll("[data-scene-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sceneUrl = btn.getAttribute("data-scene-url") || "";
      const currentDim = Number(document.getElementById("chat-bg-dim-slider").value) || 68;
      applyChatBackground(sceneUrl, currentDim, true);
    });
  });

  document.getElementById("chat-bg-dim-slider").addEventListener("input", (e) => {
    const dim = Number(e.target.value) || 68;
    const url = document.getElementById("chat-bg-url-input").value.trim();
    applyChatBackground(url, dim, true);
  });

  document.getElementById("save-memory-btn").addEventListener("click", async () => {
    if (!state.activeSession) return;
    const notes = document.getElementById("chat-memory-input").value;
    await window.api.request(`/api/v1/sessions/${state.activeSession.id}`, {
      method: "PATCH",
      body: JSON.stringify({ memory_notes: notes }),
    });
    state.activeSession.memory_notes = notes;
    showToast("Session notes updated");
  });

  const legacyBranchBtn = document.getElementById("new-branch-btn");
  if (legacyBranchBtn) {
    legacyBranchBtn.addEventListener("click", () => {
      if (!state.activeSession) return;
      openCharacterChat(state.activeSession.character.id, true);
      showToast("Started new session");
    });
  }

  document.getElementById("insert-action-btn").addEventListener("click", () => {
    triggerHaptic(10);
    const input = document.getElementById("chat-input");
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value;
    if (start !== end) {
      input.value = val.slice(0, start) + `*${val.slice(start, end)}*` + val.slice(end);
    } else {
      input.value = val + (val.endsWith(" ") || !val ? "**" : " **");
      input.selectionStart = input.selectionEnd = input.value.length - 1;
    }
    input.focus();
    autoResizeChatInput();
  });

  const chatInput = document.getElementById("chat-input");
  function autoResizeChatInput() {
    if (!chatInput) return;
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    const sendBtn = document.getElementById("chat-send-btn");
    if (sendBtn) {
      sendBtn.classList.toggle("ready-to-send", chatInput.value.trim().length > 0);
    }
  }

  chatInput.addEventListener("input", autoResizeChatInput);
  chatInput.addEventListener("focus", () => {
    setTimeout(() => {
      const container = document.getElementById("chat-messages");
      if (container) container.scrollTop = container.scrollHeight;
    }, 250);
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      document.getElementById("chat-send-form").requestSubmit();
    }
  });

  document.getElementById("chat-send-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.activeSession) return;
    const content = chatInput.value.trim();
    if (!content) return;

    triggerHaptic(15);
    chatInput.value = "";
    chatInput.style.height = "auto";
    const sendBtn = document.getElementById("chat-send-btn");
    if (sendBtn) sendBtn.classList.remove("ready-to-send");

    const selectedModel = document.getElementById("chat-model-select").value;
    const selectedPersona = document.getElementById("chat-persona-select").value;

    const container = document.getElementById("chat-messages");
    const charAvatar = window.api.resolveAssetUrl(state.activeSession.character.avatar_url);
    const userAvatar = window.api.resolveAssetUrl(state.user?.avatar_url);

    const userRow = createMessageDom("user", content, "", charAvatar, userAvatar);
    container.appendChild(userRow);

    const displayModelLabel = getPublicModelName(selectedModel);
    const aiRow = createMessageDom("assistant", "...", displayModelLabel, charAvatar, userAvatar);
    const bubbleEl = aiRow.querySelector(".msg-bubble");
    const metaInfoEl = aiRow.querySelector(".msg-meta-info");
    container.appendChild(aiRow);
    container.scrollTop = container.scrollHeight;

    const statusEl = document.getElementById("stream-status-indicator");
    statusEl.textContent = `Generating via ${displayModelLabel}...`;

    let accumulated = "";
    await window.api.streamMessage(
      state.activeSession.id,
      {
        content,
        model: selectedModel,
        persona_id: selectedPersona || null,
        character_name: state.activeSession.character?.name,
        personality: state.activeSession.character?.personality,
        scenario: state.activeSession.character?.scenario,
        local_messages: (state.activeSession.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
        })).concat([{ role: "user", content }]),
      },
      {
        onMeta: (meta) => {
          if (meta && meta.user_message_id) {
            userRow.dataset.msgId = meta.user_message_id;
          }
        },
        onToken: (token) => {
          accumulated += token;
          aiRow.dataset.rawText = accumulated;
          bubbleEl.innerHTML = formatRoleplayHTML(accumulated);
          container.scrollTop = container.scrollHeight;
        },
        onDone: (doneEvt) => {
          const finalLabel = doneEvt.model || displayModelLabel;
          const finalContent = doneEvt.content || accumulated;
          aiRow.dataset.rawText = finalContent;
          if (doneEvt.message_id) {
            aiRow.dataset.msgId = doneEvt.message_id;
          }
          bubbleEl.innerHTML = formatRoleplayHTML(finalContent);
          if (metaInfoEl && state.activeSession) {
            metaInfoEl.innerHTML = `<span>${state.activeSession.character.name}</span><span>· ${finalLabel}</span>`;
          }
          statusEl.textContent = "";
          state.activeSession.messages.push(
            { id: userRow.dataset.msgId, role: "user", content, model_used: "user" },
            { id: doneEvt.message_id, role: "assistant", content: finalContent, model_used: finalLabel }
          );
          state.activeSession.last_message = finalContent.slice(0, 80);
          const sessions = getLocalSessions();
          const idx = sessions.findIndex((s) => s.id === state.activeSession.id);
          if (idx >= 0) sessions[idx] = state.activeSession;
          else sessions.unshift(state.activeSession);
          saveLocalSessions(sessions);

          loadPlatformStats();

          // Auto-play voice narration if user enabled TTS toggle
          if (state.ttsAutoPlay) {
            const ttsBtn = aiRow.querySelector(".btn-tts-msg");
            speakText(finalContent, state.activeSession.character.gender, ttsBtn);
          }
        },
        onError: (err) => {
          bubbleEl.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
          statusEl.textContent = "";
        },
      }
    );
  });

  // --- Chat Toolbar & Header Action Listeners ---
  const chatFavBtn = document.getElementById("chat-favorite-btn");
  if (chatFavBtn) chatFavBtn.addEventListener("click", toggleActiveCharacterFavorite);
  const mobileFavBtn = document.getElementById("chat-mobile-fav-btn");
  if (mobileFavBtn) mobileFavBtn.addEventListener("click", toggleActiveCharacterFavorite);

  const ttsToggleBtn = document.getElementById("chat-tts-toggle-btn");
  if (ttsToggleBtn) ttsToggleBtn.addEventListener("click", toggleTtsNarration);
  const mobileTtsBtn = document.getElementById("chat-mobile-tts-btn");
  if (mobileTtsBtn) mobileTtsBtn.addEventListener("click", toggleTtsNarration);
  const quickTtsBtn = document.getElementById("quick-tts-btn");
  if (quickTtsBtn) quickTtsBtn.addEventListener("click", toggleTtsNarration);

  const chatNewBranchBtn = document.getElementById("chat-new-branch-btn");
  if (chatNewBranchBtn) {
    chatNewBranchBtn.addEventListener("click", async () => {
      if (!state.activeSession) return;
      triggerHaptic(14);
      if (!confirm(`Start a fresh conversation branch with ${state.activeSession.character.name}? Your previous story remains safely archived in your chats.`)) return;
      try {
        const res = await window.api.request(`/api/v1/sessions/${state.activeSession.id}/new_chat`, { method: "POST" });
        await loadSessions();
        const nextId = res.id || res.session_id;
        await openExistingSession(nextId);
        showToast(`Started new story branch with ${state.activeSession.character.name} 🌿`);
      } catch (err) {
        showToast(`Branching failed: ${err.message}`);
      }
    });
  }

  const chatExportBtn = document.getElementById("chat-export-btn");
  if (chatExportBtn) chatExportBtn.addEventListener("click", exportCurrentStoryTranscript);
  const sheetExportBtn = document.getElementById("sheet-export-chat-btn");
  if (sheetExportBtn) sheetExportBtn.addEventListener("click", exportCurrentStoryTranscript);

  const sheetDelChatBtn = document.getElementById("sheet-delete-session-btn");
  if (sheetDelChatBtn) {
    sheetDelChatBtn.addEventListener("click", async () => {
      if (!state.activeSession) return;
      triggerHaptic(14);
      if (!confirm(`Delete this entire conversation with ${state.activeSession.character.name}? This cannot be undone.`)) return;
      try {
        await window.api.request(`/api/v1/sessions/${state.activeSession.id}`, { method: "DELETE" });
        closeMobileSheet();
        document.getElementById("close-chat-btn").click();
        await loadSessions();
        showToast("Conversation deleted 🗑️");
      } catch (err) {
        showToast(`Delete failed: ${err.message}`);
      }
    });
  }

  document.querySelectorAll(".rp-mood-chip[data-quick-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      triggerHaptic(8);
      const actionText = btn.dataset.quickAction || "";
      const input = document.getElementById("chat-input");
      if (!input) return;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const val = input.value;
      input.value = val.slice(0, start) + actionText + val.slice(end);
      input.selectionStart = input.selectionEnd = start + actionText.length;
      input.focus();
      const sendBtn = document.getElementById("chat-send-btn");
      if (sendBtn) sendBtn.classList.toggle("ready-to-send", input.value.trim().length > 0);
    });
  });

  document.getElementById("chat-model-select").addEventListener("change", (e) => {
    const chosenId = e.target.value;
    const adapter = state.adapters.find((a) => a.id === chosenId);
    if (adapter && adapter.tier === "premium" && !isModelUnlocked(adapter)) {
      document.getElementById("premium-modal").classList.remove("hidden");
    }
  });

  const premiumModal = document.getElementById("premium-modal");
  const openPremBtn = document.getElementById("open-premium-btn");
  if (openPremBtn && premiumModal) {
    openPremBtn.addEventListener("click", () => {
      renderAdaptersTable();
      premiumModal.classList.remove("hidden");
    });
  }
  const closePremBtn = document.getElementById("close-premium-modal");
  if (closePremBtn && premiumModal) {
    closePremBtn.addEventListener("click", () => premiumModal.classList.add("hidden"));
  }
  const closePremContBtn = document.getElementById("close-premium-continue-free");
  if (closePremContBtn && premiumModal) {
    closePremContBtn.addEventListener("click", () => {
      const chatSelect = document.getElementById("chat-model-select");
      if (chatSelect) {
        const chosen = state.adapters.find((a) => a.id === chatSelect.value);
        if (chosen && chosen.tier === "premium" && !isModelUnlocked(chosen)) {
          chatSelect.value = "haru-core";
        }
      }
      premiumModal.classList.add("hidden");
    });
  }
  const actPremBtn = document.getElementById("activate-premium-btn");
  if (actPremBtn && premiumModal) {
    actPremBtn.addEventListener("click", () => {
      const nextState = !window.api.hasPremiumPass();
      window.api.setPremiumPass(nextState);
      loadAdapters();
      premiumModal.classList.add("hidden");
      showToast(
        nextState
          ? "Flagship Access enabled — Verified models unlocked"
          : "Reverted to Standard Free Tier (Sora Models)"
      );
    });
  }
  if (premiumModal) {
    premiumModal.addEventListener("click", (e) => {
      if (e.target === premiumModal) premiumModal.classList.add("hidden");
    });
  }

  const regenBtn = document.getElementById("regenerate-btn");
  if (regenBtn) {
    regenBtn.addEventListener("click", async () => {
      if (!state.activeSession) return;
      triggerHaptic(12);
      const statusEl = document.getElementById("stream-status-indicator");
      const modelSelectEl = document.getElementById("chat-model-select");
      const selectedModel = modelSelectEl ? modelSelectEl.value : "haru-core";
      if (statusEl) statusEl.textContent = "Regenerating...";
      try {
        const newMsg = await window.api.request(
          `/api/v1/sessions/${state.activeSession.id}/regenerate`,
          {
            method: "POST",
            body: JSON.stringify({
              model: selectedModel,
              api_keys: window.api.getByokKeys(),
            }),
          }
        );
        if (
          state.activeSession.messages.length > 1 &&
          state.activeSession.messages[state.activeSession.messages.length - 1].role === "assistant"
        ) {
          state.activeSession.messages.pop();
        }
        state.activeSession.messages.push(newMsg);
        renderMessagesList();
        if (statusEl) statusEl.textContent = "";
      } catch (err) {
        if (statusEl) statusEl.textContent = "";
        showToast(`Regenerate failed: ${err.message}`);
      }
    });
  }

  // --- Account & Profile Center Events ---
  const authModal = document.getElementById("auth-modal");
  const openAuth = () => {
    try {
      renderUserHeader();
    } catch (_) {}
    if (authModal) authModal.classList.remove("hidden");
  };
  const openAuthBtn = document.getElementById("open-auth-btn");
  if (openAuthBtn) openAuthBtn.addEventListener("click", openAuth);
  const userPill = document.getElementById("user-pill");
  if (userPill) userPill.addEventListener("click", openAuth);
  const closeAuthBtn = document.getElementById("close-auth-modal");
  if (closeAuthBtn && authModal) {
    closeAuthBtn.addEventListener("click", () => authModal.classList.add("hidden"));
  }
  if (authModal) {
    authModal.addEventListener("click", (e) => {
      if (e.target === authModal) authModal.classList.add("hidden");
    });
  }

  document.getElementById("acct-avatar-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast("Uploading account avatar...");
      const uploadedUrl = await window.api.uploadImageFile(file, "avatar");
      state.user = await window.api.request("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ avatar_url: uploadedUrl }),
      });
      renderUserHeader();
      showToast("Account avatar updated");
    } catch (err) {
      showToast(`Avatar update failed: ${err.message}`);
    }
  });

  document.getElementById("account-profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const display_name = document.getElementById("acct-edit-display").value.trim();
      const bio = document.getElementById("acct-edit-bio").value.trim();
      const email = document.getElementById("acct-edit-email")?.value.trim() || null;
      state.user = await window.api.request("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ display_name, bio, email }),
      });
      renderUserHeader();
      loadAdapters();
      showToast(
        state.user.is_super_admin
          ? "👑 Super Access active! Founder privileges unlocked."
          : "Profile updated"
      );
    } catch (err) {
      showToast(`Update failed: ${err.message}`);
    }
  });

  // Founder Tier Simulator Buttons
  document.querySelectorAll(".btn-tier-sim").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetTier = btn.dataset.sim;
      try {
        const updatedUser = await window.api.request("/api/v1/auth/simulate-tier", {
          method: "POST",
          body: JSON.stringify({ tier: targetTier }),
        });
        state.user = updatedUser;
        renderUserHeader();
        loadAdapters();
        showToast(
          targetTier === "super_admin"
            ? "👑 Super Access Active: All models and tiers unlocked"
            : targetTier === "free"
            ? "🔒 Free Tier Simulated: Flagship models blocked with upgrade prompt"
            : `Testing as ${targetTier.toUpperCase()} Tier`
        );
      } catch (err) {
        showToast(`Simulation error: ${err.message}`);
      }
    });
  });

  // One-Click Claim Super Access Button for harshitg933@gmail.com
  const claimSuperBtn = document.getElementById("claim-super-access-btn");
  if (claimSuperBtn) {
    claimSuperBtn.addEventListener("click", async () => {
      try {
        showToast("Activating Super Access for harshitg933@gmail.com...");
        const res = await window.api.request("/api/v1/auth/claim-super", { method: "POST" });
        window.api.setToken(res.access_token);
        state.user = res.user;
        renderUserHeader();
        renderPersonasList();
        loadAdapters();
        showToast("👑 Super Access Activated: Welcome harshitg933@gmail.com!");
      } catch (err) {
        showToast(`Activation failed: ${err.message}`);
      }
    });
  }

  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      state.authMode = t.dataset.authMode;
      const isReg = state.authMode === "register";
      document.getElementById("auth-display-group").style.display = isReg ? "flex" : "none";
      const emailGrp = document.getElementById("auth-email-group");
      if (emailGrp) emailGrp.style.display = isReg ? "flex" : "none";
      const userLabel = document.getElementById("auth-username-label");
      if (userLabel) userLabel.textContent = isReg ? "Username" : "Username or Email";
      document.getElementById("auth-submit-btn").textContent = isReg
        ? "Save Permanent Account"
        : "Sign In";
    });
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("auth-error-msg");
    errEl.classList.add("hidden");
    const username = document.getElementById("auth-username").value.trim();
    const password = document.getElementById("auth-password").value;
    const display_name = document.getElementById("auth-display").value.trim();
    const email = document.getElementById("auth-email")?.value.trim() || null;

    try {
      const endpoint = state.authMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const payload = state.authMode === "register"
        ? { username, password, display_name, email }
        : { username, password };
      const res = await window.api.request(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      window.api.setToken(res.access_token);
      state.user = res.user;
      renderUserHeader();
      renderPersonasList();
      await Promise.all([loadCharacters(), loadMyCharacters(), loadSessions(), loadPlatformStats()]);
      loadAdapters();
      authModal.classList.add("hidden");
      showToast(
        state.user.is_super_admin
          ? `👑 Welcome Founder! Super Access unlocked for ${state.user.display_name}`
          : `Signed in as ${state.user.display_name}`
      );
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  });

  const signOutOrSwitchGuest = async () => {
    const res = await window.api.request("/api/v1/auth/guest", { method: "POST" });
    window.api.setToken(res.access_token);
    state.user = res.user;
    renderUserHeader();
    renderPersonasList();
    await Promise.all([loadCharacters(), loadMyCharacters(), loadSessions(), loadPlatformStats()]);
    authModal.classList.add("hidden");
    showToast(`Switched to ${state.user.display_name}`);
  };

  const newGuestBtn = document.getElementById("new-guest-btn");
  if (newGuestBtn) newGuestBtn.addEventListener("click", signOutOrSwitchGuest);
  const logoutAcctBtn = document.getElementById("logout-account-btn");
  if (logoutAcctBtn) logoutAcctBtn.addEventListener("click", signOutOrSwitchGuest);

  const installPwaBtn = document.getElementById("install-pwa-btn");
  if (installPwaBtn) {
    installPwaBtn.addEventListener("click", async () => {
      if (!state.deferredPwaPrompt) return;
      state.deferredPwaPrompt.prompt();
      await state.deferredPwaPrompt.userChoice;
      state.deferredPwaPrompt = null;
      installPwaBtn.classList.add("hidden");
    });
  }
}
