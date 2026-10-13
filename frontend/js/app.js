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

document.addEventListener("DOMContentLoaded", async () => {
  registerServiceWorker();
  bindUIEvents();
  loadSavedByokForm();
  await ensureAuthenticatedUser();
  await Promise.all([
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
      state.user = await window.api.request("/api/v1/auth/me");
      renderUserHeader();
      renderPersonasList();
      return;
    } catch {
      window.api.setToken("");
    }
  }
  const res = await window.api.request("/api/v1/auth/guest", { method: "POST" });
  window.api.setToken(res.access_token);
  state.user = res.user;
  renderUserHeader();
  renderPersonasList();
}

function renderUserHeader() {
  if (!state.user) return;
  const avatarUrl = window.api.resolveAssetUrl(state.user.avatar_url);
  document.getElementById("nav-user-avatar").src = avatarUrl;
  document.getElementById("nav-user-name").textContent = state.user.display_name;
  document.getElementById("nav-user-status").textContent = state.user.is_guest
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
  const acctTier = document.getElementById("acct-tier-pill");
  if (acctTier) {
    acctTier.textContent = state.user.is_guest ? "Temporary Guest" : "Registered Member";
  }
  const editDisplay = document.getElementById("acct-edit-display");
  if (editDisplay) editDisplay.value = state.user.display_name || "";
  const editBio = document.getElementById("acct-edit-bio");
  if (editBio) editBio.value = state.user.bio || "";
  const logoutBtn = document.getElementById("logout-account-btn");
  if (logoutBtn) {
    logoutBtn.classList.toggle("hidden", Boolean(state.user.is_guest));
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
  if (adapter.ready || window.api.hasPremiumPass()) return true;
  const keys = window.api.getByokKeys();
  if (adapter.id.startsWith("xai-") && keys.xai) return true;
  if (adapter.id === "openrouter-hermes-3" && keys.openrouter) return true;
  if (adapter.id.startsWith("openai-") && keys.openai) return true;
  if (adapter.id.startsWith("gemini-") && keys.gemini) return true;
  return false;
}

async function loadAdapters() {
  try {
    const data = await window.api.request("/api/v1/adapters");
    state.adapters = data.adapters || [];

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
        opt.textContent = `${m.name} — ${unlocked ? "Unlocked" : "Flagship Tier"}`;
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
  } catch (err) {
    console.error("Failed loading adapters:", err);
  }
}

function renderAdaptersTable() {
  const freeTbody = document.getElementById("free-adapters-table-body");
  const premGrid = document.getElementById("premium-transparency-grid");
  const modalPremGrid = document.getElementById("modal-premium-list");
  const planBadge = document.getElementById("premium-plan-badge");
  const activateBtn = document.getElementById("activate-premium-btn");

  const hasPass = window.api.hasPremiumPass();
  if (planBadge) {
    planBadge.textContent = hasPass ? "Flagship Tier Active" : "Standard Tier";
  }
  if (activateBtn) {
    activateBtn.textContent = hasPass ? "Flagship Access Active (Click to Reset)" : "Unlock Flagship Access ($9/mo)";
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
  const categoryParam = isMine ? "All" : state.activeCategory;
  const qs = new URLSearchParams({
    category: categoryParam,
    gender: state.activeGender || "All",
    search: state.searchQuery,
    sort: state.sortBy,
    mine_only: isMine ? "true" : "false",
  });
  try {
    state.characters = await window.api.request(`/api/v1/characters?${qs.toString()}`);
    renderCharacterGrid();
  } catch (err) {
    showToast(`Failed loading directory: ${err.message}`);
  }
}

async function loadTemplates() {
  try {
    state.templates = await window.api.request("/api/v1/templates");
    renderTemplateDropdown("All");
  } catch {}
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
        <img src="${avatarSrc}" alt="${c.name}" class="char-tile-img" loading="lazy" decoding="async" onerror="this.src='/api/v1/avatar/${encodeURIComponent(c.name)}?theme=slate'" />
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
    state.sessions = await window.api.request("/api/v1/sessions");
    const badge = document.getElementById("chats-count-badge");
    if (state.sessions.length > 0) {
      badge.textContent = state.sessions.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
    renderSessionsList();
  } catch {}
}

function renderSessionsList() {
  const listEl = document.getElementById("sessions-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!state.sessions.length) {
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
    item.innerHTML = `
      <img src="${avatarSrc}" alt="${s.character_name}" class="char-avatar-lg" style="width:42px;height:42px;" />
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
      await window.api.request(`/api/v1/sessions/${s.id}`, { method: "DELETE" });
      showToast("Session removed");
      await loadSessions();
    });

    listEl.appendChild(item);
  });
}

async function loadMyCharacters() {
  try {
    state.myCharacters = await window.api.request("/api/v1/characters?mine_only=true");
    renderMyCharactersList();
  } catch {}
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
    item.innerHTML = `
      <img src="${avatarSrc}" alt="${c.name}" class="char-avatar-lg" style="width:44px;height:44px;" />
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;">
          <strong style="font-size:0.9rem;">${c.name}</strong>
          <span class="badge-mini badge-warm">${c.category}</span>
        </div>
        <p class="muted-text" style="font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.15rem;">
          ${c.tagline}
        </p>
      </div>
      <button class="icon-btn" data-del-char="${c.id}" title="Delete character">Delete</button>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-del-char]")) return;
      openCharacterChat(c.id, false);
    });

    item.querySelector(`[data-del-char="${c.id}"]`).addEventListener("click", async (e) => {
      e.stopPropagation();
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
    });
    mountChatDrawer(sessionData);
    loadSessions();
    loadPlatformStats();
  } catch (err) {
    showToast(`Error starting session: ${err.message}`);
  }
}

async function openExistingSession(sessionId) {
  try {
    const sessionData = await window.api.request(`/api/v1/sessions/${sessionId}`);
    mountChatDrawer(sessionData);
  } catch (err) {
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

  document.getElementById("chat-char-avatar").src = window.api.resolveAssetUrl(c.avatar_url);
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

  renderMessagesList();
}

function renderStoryPrologue(c) {
  const div = document.createElement("div");
  div.className = "story-prologue-card";
  const avatar = window.api.resolveAssetUrl(c.avatar_url);
  const culture = getCharacterCulture(c);
  div.innerHTML = `
    <div class="prologue-banner" style="background-image: url('${avatar}')"></div>
    <div class="prologue-content">
      <img src="${avatar}" alt="${c.name}" class="prologue-avatar" />
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
    container.appendChild(createMessageDom(m.role, m.content, m.model_used, charAvatar, userAvatar));
  });
  container.scrollTop = container.scrollHeight;
}

function createMessageDom(role, content, modelUsed, charAvatar, userAvatar) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;
  const avatar = role === "user" ? userAvatar : charAvatar;

  row.innerHTML = `
    <img src="${avatar}" alt="${role}" class="msg-avatar" />
    <div style="min-width:0;flex:1;">
      <div class="msg-bubble">${formatRoleplayHTML(content)}</div>
      <div class="msg-meta">
        <span>${role === "user" ? state.user?.display_name || "You" : state.activeSession.character.name}</span>
        ${role === "assistant" && modelUsed ? `<span>· ${modelUsed}</span>` : ""}
      </div>
    </div>
  `;
  return row;
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
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <strong style="font-size:0.86rem;">${p.name}</strong>
          ${p.is_default ? '<span class="badge-mini">Default</span>' : ""}
        </div>
        <p class="muted-text" style="font-size:0.78rem;margin-top:0.12rem;">${p.description || "Standard profile"}</p>
      </div>
    `;
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
  const charGrid = document.getElementById("characters-grid");
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

  document.getElementById("new-branch-btn").addEventListener("click", () => {
    if (!state.activeSession) return;
    openCharacterChat(state.activeSession.character.id, true);
    showToast("Started new session");
  });

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

    container.appendChild(createMessageDom("user", content, "", charAvatar, userAvatar));

    const displayModelLabel = getPublicModelName(selectedModel);
    const aiRow = createMessageDom("assistant", "...", displayModelLabel, charAvatar, userAvatar);
    const bubbleEl = aiRow.querySelector(".msg-bubble");
    const metaEl = aiRow.querySelector(".msg-meta");
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
      },
      {
        onToken: (token) => {
          accumulated += token;
          bubbleEl.innerHTML = formatRoleplayHTML(accumulated);
          container.scrollTop = container.scrollHeight;
        },
        onDone: (doneEvt) => {
          const finalLabel = doneEvt.model || displayModelLabel;
          bubbleEl.innerHTML = formatRoleplayHTML(doneEvt.content || accumulated);
          if (metaEl && state.activeSession) {
            metaEl.innerHTML = `<span>${state.activeSession.character.name}</span><span>· ${finalLabel}</span>`;
          }
          statusEl.textContent = "";
          state.activeSession.messages.push(
            { role: "user", content, model_used: "user" },
            { role: "assistant", content: doneEvt.content || accumulated, model_used: finalLabel }
          );
          loadPlatformStats();
        },
        onError: (err) => {
          bubbleEl.innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
          statusEl.textContent = "";
        },
      }
    );
  });

  document.getElementById("chat-model-select").addEventListener("change", (e) => {
    const chosenId = e.target.value;
    const adapter = state.adapters.find((a) => a.id === chosenId);
    if (adapter && adapter.tier === "premium" && !isModelUnlocked(adapter)) {
      document.getElementById("premium-modal").classList.remove("hidden");
    }
  });

  const premiumModal = document.getElementById("premium-modal");
  document.getElementById("open-premium-btn").addEventListener("click", () => {
    renderAdaptersTable();
    premiumModal.classList.remove("hidden");
  });
  document.getElementById("close-premium-modal").addEventListener("click", () => {
    premiumModal.classList.add("hidden");
  });
  document.getElementById("close-premium-continue-free").addEventListener("click", () => {
    const chatSelect = document.getElementById("chat-model-select");
    const chosen = state.adapters.find((a) => a.id === chatSelect.value);
    if (chosen && chosen.tier === "premium" && !isModelUnlocked(chosen)) {
      chatSelect.value = "haru-core";
    }
    premiumModal.classList.add("hidden");
  });
  document.getElementById("activate-premium-btn").addEventListener("click", () => {
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

  document.getElementById("regenerate-btn").addEventListener("click", async () => {
    if (!state.activeSession) return;
    triggerHaptic(12);
    const statusEl = document.getElementById("stream-status-indicator");
    const selectedModel = document.getElementById("chat-model-select").value;
    statusEl.textContent = "Regenerating...";
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
      statusEl.textContent = "";
    } catch (err) {
      statusEl.textContent = "";
      showToast(`Regenerate failed: ${err.message}`);
    }
  });

  // --- Account & Profile Center Events ---
  const authModal = document.getElementById("auth-modal");
  const openAuth = () => {
    renderUserHeader();
    authModal.classList.remove("hidden");
  };
  document.getElementById("open-auth-btn").addEventListener("click", openAuth);
  document.getElementById("user-pill").addEventListener("click", openAuth);
  document.getElementById("close-auth-modal").addEventListener("click", () => authModal.classList.add("hidden"));

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
      state.user = await window.api.request("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ display_name, bio }),
      });
      renderUserHeader();
      showToast("Profile updated");
    } catch (err) {
      showToast(`Update failed: ${err.message}`);
    }
  });

  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      state.authMode = t.dataset.authMode;
      const isReg = state.authMode === "register";
      document.getElementById("auth-display-group").style.display = isReg ? "flex" : "none";
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

    try {
      const endpoint = state.authMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const res = await window.api.request(endpoint, {
        method: "POST",
        body: JSON.stringify({ username, password, display_name }),
      });
      window.api.setToken(res.access_token);
      state.user = res.user;
      renderUserHeader();
      renderPersonasList();
      await Promise.all([loadCharacters(), loadMyCharacters(), loadSessions(), loadPlatformStats()]);
      authModal.classList.add("hidden");
      showToast(`Signed in as ${state.user.display_name}`);
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

  document.getElementById("new-guest-btn").addEventListener("click", signOutOrSwitchGuest);
  document.getElementById("logout-account-btn").addEventListener("click", signOutOrSwitchGuest);

  document.getElementById("install-pwa-btn").addEventListener("click", async () => {
    if (!state.deferredPwaPrompt) return;
    state.deferredPwaPrompt.prompt();
    await state.deferredPwaPrompt.userChoice;
    state.deferredPwaPrompt = null;
    document.getElementById("install-pwa-btn").classList.add("hidden");
  });
}
