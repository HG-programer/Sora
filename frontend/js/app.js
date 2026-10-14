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

function hapticTick(ms = 8) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (_) {}
  }
}
const triggerHaptic = hapticTick;

function getCharacterCulture(c) {
  const text = `${c.name} ${c.scenario || ""} ${(c.tags || []).join(" ")}`.toLowerCase();
  if (text.includes("tokyo") || text.includes("kyoto") || text.includes("osaka") || text.includes("shrine") || text.includes("anime") || text.includes("manga") || text.includes("samurai") || text.includes("yakuza") || text.includes("senpai") || text.includes("sensei") || text.includes("japan")) return { flag: "🇯🇵", label: "JP" };
  if (text.includes("mumbai") || text.includes("delhi") || text.includes("bangalore") || text.includes("jaipur") || text.includes("kolkata") || text.includes("diwali") || text.includes("desi") || text.includes("bollywood") || text.includes("punjab") || text.includes("kerala") || text.includes("india")) return { flag: "🇮🇳", label: "IN" };
  return { flag: "🌐", label: "EN" };
}

function formatRoleplayHTML(rawText) {
  if (!rawText) return "";

  // 1. Extract and preserve code blocks
  const codeBlocks = [];
  let processed = rawText.replace(/```([a-zA-Z0-9_]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const escapedCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    codeBlocks.push(`<pre class="rp-code-block"><code>${escapedCode}</code></pre>`);
    return `___CODE_BLOCK_${idx}___`;
  });

  // 2. Escape HTML
  processed = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 3. Inline code
  processed = processed.replace(/`([^`\n]+)`/g, '<code class="rp-inline-code">$1</code>');

  // 4. Bold and Bold-Italic
  processed = processed
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em class="rp-action">$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 5. Dialogue in Japanese corner quotes 「...」
  processed = processed.replace(/「([^」\n]+)」/g, '<span class="rp-dialogue">「$1」</span>');

  // 6. Dialogue in Double Quotes (curly or straight)
  processed = processed
    .replace(/“([^”\n]+)”/g, '<span class="rp-dialogue">“$1”</span>')
    .replace(/"([^"\n]+)"/g, '<span class="rp-dialogue">“$1”</span>');

  // 7. Roleplay Narration & Actions in Asterisks *...*
  processed = processed.replace(/\*([^*\n]+)\*/g, '<span class="rp-action">*$1*</span>');

  // 8. Paragraphs and Line Breaks
  const paragraphs = processed.split(/\n\s*\n/);
  if (paragraphs.length > 1) {
    processed = paragraphs
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p class="rp-para">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");
  } else {
    processed = processed.replace(/\n/g, "<br/>");
  }

  // 9. Re-insert preserved code blocks
  codeBlocks.forEach((block, idx) => {
    processed = processed.replace(`___CODE_BLOCK_${idx}___`, block);
  });

  return processed;
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

function getCharacterVocalProfile(char) {
  if (!char) return { pitch: 1.05, rate: 1.0, isFemale: true };
  const name = char.name || "Character";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  hash = Math.abs(hash);

  const isFemale = (char.gender || "Female").toLowerCase() === "female";
  const pers = (char.personality || "").toLowerCase();

  let basePitch = isFemale ? 1.15 : 0.90;
  if (pers.includes("shy") || pers.includes("soft") || pers.includes("gentle") || pers.includes("sweet")) {
    basePitch += isFemale ? 0.08 : 0.05;
  } else if (pers.includes("deep") || pers.includes("stoic") || pers.includes("commanding") || pers.includes("dominant") || pers.includes("fierce")) {
    basePitch -= 0.12;
  } else if (pers.includes("playful") || pers.includes("energetic") || pers.includes("cheerful")) {
    basePitch += 0.10;
  }
  const microPitch = ((hash % 11) - 5) * 0.01;
  const pitch = Math.max(0.75, Math.min(1.4, basePitch + microPitch));

  let baseRate = 1.0;
  if (pers.includes("fast") || pers.includes("energetic") || pers.includes("witty")) {
    baseRate = 1.06;
  } else if (pers.includes("calm") || pers.includes("stoic") || pers.includes("gentle") || pers.includes("mysterious")) {
    baseRate = 0.94;
  }
  const microRate = (((hash >> 3) % 9) - 4) * 0.01;
  const rate = Math.max(0.85, Math.min(1.18, baseRate + microRate));

  return { pitch: parseFloat(pitch.toFixed(2)), rate: parseFloat(rate.toFixed(2)), isFemale };
}

function speakText(rawText, charOrGender = "Female", triggerBtn = null) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    showToast("Voice narration not supported in this browser.");
    return;
  }

  if (state.isSpeaking && triggerBtn && triggerBtn === currentSpeakingBtn) {
    stopSpeech();
    return;
  }

  stopSpeech();

  const char = typeof charOrGender === "object"
    ? charOrGender
    : state.activeSession?.character || { gender: charOrGender };
  const profile = getCharacterVocalProfile(char);

  // Extract spoken dialogue if available in quotes for immersive audio roleplay
  const dialogueMatches = Array.from(rawText.matchAll(/“([^”]+)”|"([^"]+)"|「([^」]+)」/g))
    .map((m) => m[1] || m[2] || m[3]);

  let cleanText = "";
  if (dialogueMatches.length > 0) {
    cleanText = dialogueMatches.join(" ");
  } else {
    cleanText = (rawText || "")
      .replace(/\*([^*]+)\*/g, " ")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/[#*_~`]/g, "")
      .trim();
  }

  if (!cleanText || cleanText.length < 3) {
    cleanText = (rawText || "").replace(/[#*_~`]/g, "").trim();
  }
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voices = window.speechSynthesis.getVoices() || [];

  if (voices.length > 0) {
    let matchedVoice = null;
    if (profile.isFemale) {
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

  utterance.rate = profile.rate;
  utterance.pitch = profile.pitch;

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

function getFallbackAvatar(name = "Character", gender = "Female", category = "Romance") {
  if (typeof window.generateCharacterPortraitSVG === "function") {
    return window.generateCharacterPortraitSVG({ name, gender, category });
  }
  const clean = (name || "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const initials = (clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || "S").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="22" fill="#181B26"/><text x="60" y="66" font-family="sans-serif" font-size="40" font-weight="700" fill="#6E7BF2" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
window.getFallbackAvatar = getFallbackAvatar;

function getCharacterPortraitURI(char) {
  if (typeof window.getCharacterPortraitURI === "function" && window.getCharacterPortraitURI !== getCharacterPortraitURI) {
    return window.getCharacterPortraitURI(char);
  }
  if (!char) {
    return typeof window.generateCharacterPortraitSVG === "function"
      ? window.generateCharacterPortraitSVG({ name: "Character", gender: "Female", category: "Romance" })
      : getFallbackAvatar();
  }
  let raw = (typeof char === "string" ? char : char.avatar_url) || "";
  raw = typeof raw === "string" ? raw.trim() : "";

  if (raw.startsWith("data:image/svg+xml")) {
    if (raw.includes("<svg") || raw.includes("#")) {
      const commaIdx = raw.indexOf(",");
      if (commaIdx !== -1) {
        const payload = raw.slice(commaIdx + 1);
        try {
          const decoded = decodeURIComponent(payload);
          return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(decoded);
        } catch {
          return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(payload);
        }
      }
    }
    if (!raw.startsWith("data:image/svg+xml;charset=utf-8,")) {
      return raw.replace(/^data:image\/svg\+xml(?:;[a-z0-9=_-]+)*,/i, "data:image/svg+xml;charset=utf-8,");
    }
    return raw;
  }

  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("assets/") || raw.includes("/uploads/")) {
    return (window.api && typeof window.api.resolveAssetUrl === "function")
      ? window.api.resolveAssetUrl(raw)
      : raw;
  }

  if (!raw || raw.includes("api.dicebear.com")) {
    return typeof window.generateCharacterPortraitSVG === "function"
      ? window.generateCharacterPortraitSVG(char)
      : getFallbackAvatar(char.name, char.gender, char.category);
  }

  return raw;
}
window.getCharacterPortraitURI = getCharacterPortraitURI;

function getCharacterAvatarUrl(char) {
  return getCharacterPortraitURI(char);
}
window.getCharacterAvatarUrl = getCharacterAvatarUrl;

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

// ==========================================================
// CHARACTER TIES & BOND PROGRESSION ENGINE
// ==========================================================
function getCharacterTies() {
  try {
    const raw = window.api?.getSecureItem
      ? window.api.getSecureItem("sora_character_ties", "{}")
      : localStorage.getItem("sora_character_ties") || "{}";
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function saveCharacterTies(ties) {
  try {
    if (window.api?.setSecureItem) {
      window.api.setSecureItem("sora_character_ties", ties);
    } else {
      localStorage.setItem("sora_character_ties", JSON.stringify(ties || {}));
    }
  } catch (_) {}
}

function getTieStage(xp = 0) {
  if (xp >= 1500) {
    return {
      level: 5,
      stage: "Soulbound",
      icon: "💖",
      badgeClass: "badge-soulbound",
      nextXp: 1500,
      currentTierBase: 1500,
      progress: 100,
    };
  }
  if (xp >= 700) {
    const progress = Math.min(100, Math.round(((xp - 700) / (1500 - 700)) * 100));
    return {
      level: 4,
      stage: "Close Bond",
      icon: "💫",
      badgeClass: "badge-close",
      nextXp: 1500,
      currentTierBase: 700,
      progress,
    };
  }
  if (xp >= 300) {
    const progress = Math.min(100, Math.round(((xp - 300) / (700 - 300)) * 100));
    return {
      level: 3,
      stage: "Friend",
      icon: "✨",
      badgeClass: "badge-friend",
      nextXp: 700,
      currentTierBase: 300,
      progress,
    };
  }
  if (xp >= 100) {
    const progress = Math.min(100, Math.round(((xp - 100) / (300 - 100)) * 100));
    return {
      level: 2,
      stage: "Acquaintance",
      icon: "💬",
      badgeClass: "badge-acquaintance",
      nextXp: 300,
      currentTierBase: 100,
      progress,
    };
  }
  const progress = Math.min(100, Math.round((xp / 100) * 100));
  return {
    level: 1,
    stage: "Stranger",
    icon: "🌿",
    badgeClass: "badge-stranger",
    nextXp: 100,
    currentTierBase: 0,
    progress,
  };
}

function getTieForCharacter(charId, charMeta = null) {
  const ties = getCharacterTies();
  if (ties[charId]) {
    const t = ties[charId];
    const stageInfo = getTieStage(t.xp || 0);
    return { ...t, ...stageInfo };
  }
  const initial = {
    character_id: charId,
    character_name: charMeta?.name || "Character",
    avatar_url: charMeta?.avatar_url || "/assets/icon.svg",
    category: charMeta?.category || "Original",
    xp: 15,
    total_messages: 1,
    last_interaction: Date.now(),
    pinned: false,
  };
  ties[charId] = initial;
  saveCharacterTies(ties);
  return { ...initial, ...getTieStage(15) };
}

function recordTieInteraction(charId, charMeta = null, xpAdd = 15) {
  const ties = getCharacterTies();
  const existing = ties[charId] || {
    character_id: charId,
    character_name: charMeta?.name || "Character",
    avatar_url: charMeta?.avatar_url || "/assets/icon.svg",
    category: charMeta?.category || "Original",
    xp: 0,
    total_messages: 0,
    pinned: false,
  };

  const oldStage = getTieStage(existing.xp || 0);
  existing.xp = (existing.xp || 0) + xpAdd;
  existing.total_messages = (existing.total_messages || 0) + 1;
  existing.last_interaction = Date.now();
  if (charMeta?.name) existing.character_name = charMeta.name;
  if (charMeta?.avatar_url) existing.avatar_url = charMeta.avatar_url;
  if (charMeta?.category) existing.category = charMeta.category;

  const newStage = getTieStage(existing.xp);
  ties[charId] = existing;
  saveCharacterTies(ties);

  updateChatHeaderBondPill(newStage);
  animateBondXpFloat(xpAdd);

  if (newStage.level > oldStage.level) {
    triggerHaptic(20);
    showToast(`🎉 Bond Level Up! You and ${existing.character_name} are now ${newStage.stage} (${newStage.icon} Level ${newStage.level})!`);
  }

  updateTiesNavBadge();
  const tiesPanel = document.getElementById("tab-ties");
  if (tiesPanel && tiesPanel.classList.contains("active")) {
    renderTiesTab(state.activeTieFilter || "all");
  }

  return { ...existing, ...newStage };
}

function animateBondXpFloat(amount = 15) {
  const bondPill = document.getElementById("chat-bond-pill");
  if (!bondPill) return;
  const floatEl = document.createElement("div");
  floatEl.className = "bond-xp-float";
  floatEl.textContent = `+${amount} Bond XP`;
  bondPill.style.position = "relative";
  bondPill.appendChild(floatEl);
  setTimeout(() => floatEl.remove(), 1500);
}

function updateChatHeaderBondPill(stageInfo) {
  const pill = document.getElementById("chat-bond-pill");
  if (!pill) return;
  const iconEl = document.getElementById("chat-bond-icon");
  const labelEl = document.getElementById("chat-bond-label");
  const pctEl = document.getElementById("chat-bond-pct");
  if (iconEl) iconEl.textContent = stageInfo.icon;
  if (labelEl) labelEl.textContent = `${stageInfo.stage} Lv.${stageInfo.level}`;
  if (pctEl) pctEl.textContent = `${stageInfo.progress}%`;
  pill.className = `chat-bond-pill ${stageInfo.badgeClass}`;
  pill.title = `Bond: ${stageInfo.stage} (Level ${stageInfo.level}) — ${stageInfo.progress}% to next rank`;
}

function updateTiesNavBadge() {
  const badge = document.getElementById("ties-count-badge");
  if (!badge) return;
  const ties = getCharacterTies();
  const count = Object.keys(ties).length;
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Recently";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  return `${days}d ago`;
}

function renderTiesTab(filter = "all") {
  state.activeTieFilter = filter;
  const grid = document.getElementById("ties-grid");
  const emptyState = document.getElementById("ties-empty-state");
  if (!grid || !emptyState) return;

  const tiesMap = getCharacterTies();
  let tiesList = Object.values(tiesMap).map((t) => ({
    ...t,
    ...getTieStage(t.xp || 0),
  }));

  updateTiesNavBadge();

  // Apply filters
  if (filter === "soulbound") {
    tiesList = tiesList.filter((t) => t.level === 5);
  } else if (filter === "close") {
    tiesList = tiesList.filter((t) => t.level >= 4);
  } else if (filter === "recent") {
    tiesList.sort((a, b) => (b.last_interaction || 0) - (a.last_interaction || 0));
  } else {
    tiesList.sort((a, b) => (b.xp || 0) - (a.xp || 0));
  }

  // Update filter chip UI active state
  document.querySelectorAll(".tie-filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.tieFilter === filter);
  });

  if (tiesList.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  const frag = document.createDocumentFragment();

  tiesList.forEach((tie, index) => {
    const card = document.createElement("div");
    card.className = "tie-card";
    card.style.setProperty("--i", index);
    const safeName = (tie.character_name || "Character").replace(/'/g, "\\'");
    const safeCategory = (tie.category || "Romance").replace(/'/g, "\\'");
    const avatarUrl = getCharacterAvatarUrl(tie);
    const relTime = formatRelativeTime(tie.last_interaction);

    card.innerHTML = `
      <div class="tie-card-header">
        <img src="${avatarUrl}" alt="${tie.character_name}" class="tie-avatar char-portrait-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.src=getFallbackAvatar('${safeName}', 'Female', '${safeCategory}');" />
        <div class="tie-meta">
          <div class="tie-char-name">${tie.character_name}</div>
          <div class="tie-badge-row">
            <span class="badge-mini ${tie.badgeClass}">${tie.icon} ${tie.stage} Lv.${tie.level}</span>
            <span class="muted-text" style="font-size:0.72rem;">${tie.total_messages || 0} messages</span>
          </div>
        </div>
      </div>
      <div class="tie-progress-section">
        <div class="tie-progress-labels">
          <span>Bond Progression</span>
          <span><strong>${tie.xp || 0}</strong> / ${tie.nextXp} XP (${tie.progress}%)</span>
        </div>
        <div class="tie-progress-track">
          <div class="tie-progress-fill" style="width: ${tie.progress}%;"></div>
        </div>
      </div>
      <div class="tie-footer">
        <span>Active ${relTime}</span>
        <div style="display:flex;gap:0.35rem;align-items:center;">
          <button type="button" class="btn-xs btn-outline btn-tie-memories" data-tie-char-id="${tie.character_id}" title="View Character Core Memories" style="font-size:0.75rem;padding:0.25rem 0.45rem;">
            📌
          </button>
          <button type="button" class="btn-glass btn-sm btn-open-tie" style="font-size:0.76rem;padding:0.35rem 0.65rem;">
            Continue Story &rarr;
          </button>
        </div>
      </div>
    `;

    const memBtn = card.querySelector(".btn-tie-memories");
    if (memBtn) {
      memBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerHaptic(8);
        openCoreMemoriesModal(tie.character_id);
      });
    }

    card.querySelector(".btn-open-tie").addEventListener("click", () => {
      triggerHaptic(8);
      openCharacterChat(tie.character_id, false);
    });

    frag.appendChild(card);
  });

  grid.innerHTML = "";
  grid.appendChild(frag);
}

// ==========================================================
// CHARACTER COMMUNITY COMMENTS & REFLECTIONS ENGINE
// ==========================================================
state.activeCommentsCharId = null;
state.activeCommentSort = "top";
state.activeCommentReaction = "Peak";

function getCharacterCommentsSync(charId) {
  try {
    const all = JSON.parse(localStorage.getItem("sora_character_comments_v1") || "{}");
    if (all[charId] && all[charId].length) return all[charId];
  } catch (_) {}

  const char = state.characters.find((x) => x.id === charId) ||
               (window.SORA_DEFAULT_CATALOG && window.SORA_DEFAULT_CATALOG.find((x) => x.id === charId)) ||
               { id: charId, name: "Character", category: "Romance" };

  const name = char.name || "this character";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  hash = Math.abs(hash);

  const authors = [
    ["Kaito_R", "SakuraBreeze", "VesperNine"],
    ["AetherDrifter", "LunaStarlight", "ChronosKeeper"],
    ["VelvetNovelist", "EchoBlade", "TeaMasterKen"],
    ["MidnightMuse", "SolarisBlade", "Cipher_X"]
  ][hash % 4];

  const seeded = [
    {
      id: `seed_${charId}_1`,
      character_id: charId,
      author_name: authors[0],
      author_avatar: "",
      author_tie: { level: 4, stage: "Close Bond", badgeClass: "badge-close", icon: "✨" },
      reaction_tag: "Peak",
      text: `The dialogue nuance here is phenomenal. Reached Close Bond and the emotional depth and subtle callbacks felt so naturally human.`,
      likes: 38 + (hash % 45),
      liked_by_me: false,
      is_mine: false,
      created_at: Date.now() - (3600000 * (4 + (hash % 16))),
    },
    {
      id: `seed_${charId}_2`,
      character_id: charId,
      author_name: authors[1],
      author_avatar: "",
      author_tie: { level: 3, stage: "Friend", badgeClass: "badge-friend", icon: "🤝" },
      reaction_tag: "In-Character",
      text: `Stays impeccably true to the persona lore. Every response in this scene setting has rich sensory pacing.`,
      likes: 24 + (hash % 26),
      liked_by_me: false,
      is_mine: false,
      created_at: Date.now() - (3600000 * (26 + (hash % 30))),
    },
    {
      id: `seed_${charId}_3`,
      character_id: charId,
      author_name: authors[2],
      author_avatar: "",
      author_tie: { level: 5, stage: "Soulbound", badgeClass: "badge-soulbound", icon: "💎" },
      reaction_tag: "Wholesome",
      text: `One of my favorite characters on Sora. Uncensored chemistry and emotional resonance are on another level.`,
      likes: 49 + (hash % 50),
      liked_by_me: false,
      is_mine: false,
      created_at: Date.now() - (3600000 * (54 + (hash % 60))),
    }
  ];

  try {
    const all = JSON.parse(localStorage.getItem("sora_character_comments_v1") || "{}");
    all[charId] = seeded;
    localStorage.setItem("sora_character_comments_v1", JSON.stringify(all));
  } catch (_) {}

  return seeded;
}

function getCharacterCommentCount(charId) {
  try {
    const all = JSON.parse(localStorage.getItem("sora_character_comments_v1") || "{}");
    if (all[charId]) return all[charId].length;
  } catch (_) {}
  return 3;
}

function openCharacterComments(charId) {
  if (!charId) return;
  state.activeCommentsCharId = charId;
  const modal = document.getElementById("comments-modal");
  if (!modal) return;

  const char = state.characters.find((x) => x.id === charId) ||
               (window.SORA_DEFAULT_CATALOG && window.SORA_DEFAULT_CATALOG.find((x) => x.id === charId)) ||
               { id: charId, name: "Character" };

  const avatarEl = document.getElementById("comment-char-avatar");
  const nameEl = document.getElementById("comment-char-name");
  const taglineEl = document.getElementById("comment-char-tagline");

  if (avatarEl) {
    const safeName = (char.name || "Character").replace(/'/g, "\\'");
    avatarEl.src = getCharacterAvatarUrl(char);
    avatarEl.onerror = () => {
      avatarEl.onerror = null;
      avatarEl.src = getFallbackAvatar(safeName, char.gender || "Female", char.category || "Romance");
    };
  }
  if (nameEl) nameEl.textContent = char.name;
  if (taglineEl) taglineEl.textContent = char.tagline || "";

  renderCommentsFeed(charId, state.activeCommentSort || "top");

  modal.classList.remove("hidden");
  if (window.history && window.history.state?.view !== "comments-modal") {
    window.history.pushState({ view: "comments-modal" }, "");
  }
}

function renderCommentsFeed(charId, sortMode = "top") {
  state.activeCommentSort = sortMode;
  const feed = document.getElementById("comments-feed-list");
  const countEl = document.getElementById("comment-modal-count");
  if (!feed) return;

  const comments = getCharacterCommentsSync(charId);
  if (countEl) countEl.textContent = `${comments.length} comment${comments.length === 1 ? "" : "s"}`;

  document.querySelectorAll(".comment-sort-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.commentSort === sortMode);
  });

  let sorted = [...comments];
  if (sortMode === "top") {
    sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else {
    sorted.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }

  feed.innerHTML = "";
  if (sorted.length === 0) {
    feed.innerHTML = `
      <div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);">
        <p style="font-size:0.95rem;">No comments yet. Share your experience with this character below!</p>
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();
  sorted.forEach((comm, idx) => {
    const card = document.createElement("div");
    card.className = "comment-card";
    card.style.setProperty("--i", idx);

    const isMine = comm.is_mine || (state.user && comm.author_name === state.user.display_name);
    const tieInfo = comm.author_tie || { level: 1, stage: "Stranger", badgeClass: "badge-stranger", icon: "🌿" };
    const timeStr = formatRelativeTime(comm.created_at);

    const tagEmoji =
      comm.reaction_tag === "Peak" ? "🔥" :
      comm.reaction_tag === "Wholesome" ? "❤️" :
      comm.reaction_tag === "In-Character" ? "🎭" :
      comm.reaction_tag === "Emotional" ? "😭" : "✦";

    const authorAvatar = comm.author_avatar || getFallbackAvatar(comm.author_name, "Female", "Romance");

    card.innerHTML = `
      <div class="comment-card-top">
        <div class="comment-author-wrap">
          <img src="${authorAvatar}" alt="${comm.author_name}" class="comment-author-avatar" loading="lazy" />
          <div>
            <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
              <span class="comment-author-name">${comm.author_name}</span>
              ${(comm.is_pro || (isMine && isSoraProActive())) ? `<span class="badge-mini badge-pro-astral" style="font-size:0.65rem;padding:0.1rem 0.38rem;" title="Sora Pro Member">✦ PRO</span>` : ""}
              <span class="badge-mini ${tieInfo.badgeClass || "badge-friend"}" style="font-size:0.68rem;padding:0.12rem 0.4rem;">
                ${tieInfo.icon || "✨"} ${tieInfo.stage} Lv.${tieInfo.level}
              </span>
            </div>
            <span class="muted-text" style="font-size:0.74rem;">${timeStr}</span>
          </div>
        </div>
        <span class="reaction-chip active" style="font-size:0.72rem;padding:0.15rem 0.5rem;pointer-events:none;">
          ${tagEmoji} ${comm.reaction_tag || "Peak"}
        </span>
      </div>
      <div class="comment-card-body">${comm.text}</div>
      <div class="comment-card-bottom">
        <button type="button" class="comment-like-btn ${comm.liked_by_me ? "liked" : ""}" data-like-comm-id="${comm.id}">
          <span>${comm.liked_by_me ? "♥" : "♡"}</span>
          <span>${comm.likes || 0}</span>
        </button>
        ${isMine ? `<button type="button" class="comment-del-btn" data-del-comm-id="${comm.id}" title="Delete comment">Delete</button>` : ""}
      </div>
    `;

    const likeBtn = card.querySelector(`[data-like-comm-id="${comm.id}"]`);
    if (likeBtn) {
      likeBtn.addEventListener("click", () => {
        triggerHaptic(12);
        toggleCommentLikeUI(charId, comm.id);
      });
    }

    const delBtn = card.querySelector(`[data-del-comm-id="${comm.id}"]`);
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        triggerHaptic(10);
        deleteCommentUI(charId, comm.id);
      });
    }

    frag.appendChild(card);
  });

  feed.appendChild(frag);
}

async function toggleCommentLikeUI(charId, commentId) {
  if (window.api?.toggleCommentLike) {
    await window.api.toggleCommentLike(charId, commentId);
    renderCommentsFeed(charId, state.activeCommentSort || "top");
  }
}

async function deleteCommentUI(charId, commentId) {
  if (window.api?.deleteCharacterComment) {
    await window.api.deleteCharacterComment(charId, commentId);
    renderCommentsFeed(charId, state.activeCommentSort || "top");
    updateAllCommentBadges(charId);
    showToast("Comment deleted");
  }
}

function updateAllCommentBadges(charId) {
  const count = getCharacterCommentCount(charId);
  document.querySelectorAll(`[data-comments-id="${charId}"] .comment-count-pill`).forEach((el) => {
    el.textContent = count;
  });
  if (state.activeSession?.character?.id === charId) {
    const chatCount = document.getElementById("chat-comments-count");
    if (chatCount) chatCount.textContent = count;
    const mobCount = document.getElementById("chat-mobile-comments-count");
    if (mobCount) mobCount.textContent = count;
  }
}

// ==========================================================
// DYNAMIC CHARACTER MOOD & EMOTIONAL AFFINITY ENGINE
// ==========================================================
function calculateCharacterMood(character, messages = [], tie = null) {
  if (!character) return { emoji: "✨", label: "Curious", cssClass: "mood-curious" };

  const recentText = messages
    .slice(-4)
    .map((m) => m.content || "")
    .join(" ")
    .toLowerCase();

  const tieLevel = tie?.level || 1;

  if (recentText.includes("blush") || recentText.includes("fluster") || recentText.includes("shy") || recentText.includes("embarrass") || recentText.includes("stutter")) {
    return { emoji: "😳", label: "Flustered", cssClass: "mood-flustered" };
  }
  if (recentText.includes("love") || recentText.includes("kiss") || recentText.includes("cuddle") || recentText.includes("adore") || recentText.includes("heart") || tieLevel >= 4) {
    return { emoji: "💗", label: "Affectionate", cssClass: "mood-affectionate" };
  }
  if (recentText.includes("fight") || recentText.includes("danger") || recentText.includes("blade") || recentText.includes("shield") || recentText.includes("protect") || recentText.includes("threat")) {
    return { emoji: "🛡️", label: "Protective", cssClass: "mood-protective" };
  }
  if (recentText.includes("tears") || recentText.includes("cry") || recentText.includes("grief") || recentText.includes("pain") || recentText.includes("hurt") || recentText.includes("vulnerable")) {
    return { emoji: "🥺", label: "Vulnerable", cssClass: "mood-vulnerable" };
  }
  if (recentText.includes("laugh") || recentText.includes("smile") || recentText.includes("giggle") || recentText.includes("tease") || recentText.includes("joke") || recentText.includes("wink")) {
    return { emoji: "🌸", label: "Playful", cssClass: "mood-playful" };
  }
  if (recentText.includes("stare") || recentText.includes("breath") || recentText.includes("fierce") || recentText.includes("passion") || recentText.includes("pulse") || recentText.includes("intense")) {
    return { emoji: "🔥", label: "Intense", cssClass: "mood-intense" };
  }
  if (recentText.includes("think") || recentText.includes("ponder") || recentText.includes("wonder") || recentText.includes("silence") || recentText.includes("gaze")) {
    return { emoji: "💭", label: "Thoughtful", cssClass: "mood-thoughtful" };
  }
  if (recentText.includes("sleep") || recentText.includes("rest") || recentText.includes("calm") || recentText.includes("night") || recentText.includes("peace") || recentText.includes("breeze")) {
    return { emoji: "🌙", label: "Calm", cssClass: "mood-calm" };
  }

  if (tieLevel === 5) return { emoji: "💎", label: "Soulbound", cssClass: "mood-affectionate" };
  if (tieLevel >= 3) return { emoji: "✨", label: "Attuned", cssClass: "mood-curious" };
  return { emoji: "✨", label: "Curious", cssClass: "mood-curious" };
}

function updateChatHeaderMood() {
  const badge = document.getElementById("chat-mood-badge");
  if (!badge || !state.activeSession) return;
  const char = state.activeSession.character;
  const tie = getTieForCharacter(char.id, char);
  const mood = calculateCharacterMood(char, state.activeSession.messages || [], tie);

  badge.className = `badge-mini chat-mood-badge ${mood.cssClass}`;
  badge.textContent = `${mood.emoji} ${mood.label}`;
}

// ==========================================================
// CHARACTER CORE MEMORIES ENGINE
// ==========================================================
state.activeMemoriesCharId = null;

function getCharacterCoreMemories(charId) {
  if (!charId) return [];
  if (window.api?.getCoreMemories) {
    return window.api.getCoreMemories(charId);
  }
  try {
    return JSON.parse(localStorage.getItem(`sora_core_memories_${charId}`) || "[]");
  } catch {
    return [];
  }
}

function saveCharacterCoreMemories(charId, memories) {
  if (!charId) return;
  if (window.api?.saveCoreMemories) {
    window.api.saveCoreMemories(charId, memories);
  } else {
    try {
      localStorage.setItem(`sora_core_memories_${charId}`, JSON.stringify(memories || []));
    } catch (_) {}
  }
  updateCoreMemoriesBadges(charId);
}

function addCharacterCoreMemory(charId, text, fromMsgId = null) {
  if (!charId || !text || !text.trim()) return false;
  const clean = text.trim();
  const existing = getCharacterCoreMemories(charId);
  if (existing.some((m) => m.text.toLowerCase() === clean.toLowerCase())) {
    showToast("Memory already recorded 📌");
    return false;
  }
  const newMem = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: clean,
    created_at: Date.now(),
    from_msg_id: fromMsgId,
  };
  const updated = [newMem, ...existing].slice(0, 15);
  saveCharacterCoreMemories(charId, updated);
  showToast("Pinned to Core Memories 📌");
  triggerHaptic(12);
  return true;
}

function removeCharacterCoreMemory(charId, memoryId) {
  if (!charId || !memoryId) return;
  const existing = getCharacterCoreMemories(charId);
  const updated = existing.filter((m) => m.id !== memoryId);
  saveCharacterCoreMemories(charId, updated);
  triggerHaptic(8);
  showToast("Memory removed");
}

function updateCoreMemoriesBadges(charId) {
  const mems = getCharacterCoreMemories(charId);
  const count = mems.length;
  const countBadge = document.getElementById("core-memories-count-badge");
  if (countBadge) countBadge.textContent = count;
  const mobCount = document.getElementById("chat-mobile-memories-count");
  if (mobCount) mobCount.textContent = count;
  const capLabel = document.getElementById("memories-capacity-label");
  if (capLabel) capLabel.textContent = `${count} / 15 Memories`;
}

function openCoreMemoriesModal(charId) {
  if (!charId) return;
  state.activeMemoriesCharId = charId;
  const modal = document.getElementById("core-memories-modal");
  if (!modal) return;

  const char = state.characters.find((x) => x.id === charId) ||
               (window.SORA_DEFAULT_CATALOG && window.SORA_DEFAULT_CATALOG.find((x) => x.id === charId)) ||
               state.activeSession?.character ||
               { id: charId, name: "Character" };

  const avatarEl = document.getElementById("memories-char-avatar");
  const nameEl = document.getElementById("memories-char-name");
  if (avatarEl) {
    avatarEl.src = getCharacterAvatarUrl(char);
    avatarEl.onerror = () => {
      avatarEl.onerror = null;
      avatarEl.src = getFallbackAvatar(char.name, char.gender, char.category);
    };
  }
  if (nameEl) nameEl.textContent = `${char.name}'s Core Memories`;

  renderCoreMemoriesList(charId);
  modal.classList.remove("hidden");
  if (window.history && window.history.state?.view !== "memories-modal") {
    window.history.pushState({ view: "memories-modal" }, "");
  }
}

function renderCoreMemoriesList(charId) {
  const container = document.getElementById("core-memories-list");
  if (!container) return;
  const mems = getCharacterCoreMemories(charId);
  updateCoreMemoriesBadges(charId);

  container.innerHTML = "";
  if (mems.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);">
        <p style="font-size:0.9rem;margin-bottom:0.35rem;">No core memories pinned yet.</p>
        <p style="font-size:0.78rem;">Pin promises, pivotal story reveals, or backstory facts above or with the 📌 button on chat messages.</p>
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();
  mems.forEach((m) => {
    const item = document.createElement("div");
    item.className = "core-memory-item";
    const timeStr = formatRelativeTime(m.created_at);
    item.innerHTML = `
      <div class="core-memory-content">
        <span class="core-memory-pin-icon">📌</span>
        <div>
          <div class="core-memory-text">${m.text}</div>
          <div class="core-memory-date">${timeStr}</div>
        </div>
      </div>
      <button type="button" class="core-memory-del-btn" data-del-mem-id="${m.id}" title="Delete memory">🗑️</button>
    `;
    item.querySelector(`[data-del-mem-id="${m.id}"]`).addEventListener("click", () => {
      removeCharacterCoreMemory(charId, m.id);
      renderCoreMemoriesList(charId);
    });
    frag.appendChild(item);
  });
  container.appendChild(frag);
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
  updateTiesNavBadge();

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

  checkAndAutoUnlockPro();
  renderProBadge();
  updateTiesNavBadge();
});

function isNativeContainer() {
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
    window.location.protocol === "capacitor:" ||
    (window.location.hostname === "localhost" && !window.location.port)
  );
}

function registerServiceWorker() {
  const isNative = isNativeContainer();

  // In native Android APK, unregister any lingering service worker so WebView always loads fresh assets directly from APK
  if (isNative) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((r) => r.unregister());
      }).catch(() => {});
    }
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPwaPrompt = e;
    const btn = document.getElementById("install-pwa-btn");
    if (btn) btn.classList.remove("hidden");
    const bannerBtn = document.getElementById("banner-install-pwa-btn");
    if (bannerBtn) bannerBtn.classList.remove("hidden");
  });
}

function initPlatformBanner() {
  const isNative = isNativeContainer();
  const banner = document.getElementById("web-get-app-banner");
  const getAppBtn = document.getElementById("get-app-btn");
  const closeBannerBtn = document.getElementById("close-web-banner-btn");
  const bannerPwaBtn = document.getElementById("banner-install-pwa-btn");
  const installPwaBtn = document.getElementById("install-pwa-btn");

  if (isNative) {
    if (banner) banner.classList.add("hidden");
    if (getAppBtn) getAppBtn.classList.add("hidden");
    if (installPwaBtn) installPwaBtn.classList.add("hidden");
    return;
  }

  // Web environment: Reveal Get APK button in top bar
  if (getAppBtn) getAppBtn.classList.remove("hidden");

  // Show web install banner if not dismissed this session
  if (banner && !sessionStorage.getItem("sora_dismiss_web_banner")) {
    banner.classList.remove("hidden");
  }

  if (closeBannerBtn && banner) {
    closeBannerBtn.addEventListener("click", () => {
      banner.classList.add("hidden");
      sessionStorage.setItem("sora_dismiss_web_banner", "1");
    });
  }

  const triggerPwaInstall = async () => {
    if (!state.deferredPwaPrompt) return;
    try {
      state.deferredPwaPrompt.prompt();
      const choice = await state.deferredPwaPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        state.deferredPwaPrompt = null;
        if (installPwaBtn) installPwaBtn.classList.add("hidden");
        if (bannerPwaBtn) bannerPwaBtn.classList.add("hidden");
      }
    } catch (err) {
      console.warn("PWA prompt error:", err);
    }
  };

  if (bannerPwaBtn) {
    bannerPwaBtn.addEventListener("click", triggerPwaInstall);
  }
  if (installPwaBtn) {
    installPwaBtn.addEventListener("click", triggerPwaInstall);
  }
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
  } else if (isSoraProActive()) {
    tierLabel = "✦ Sora Pro (Community Edition)";
    tierClass = "badge-mini badge-pro-astral";
  } else if (state.user.is_guest) {
    tierLabel = "Standard Member (Guest)";
    tierClass = "badge-mini badge-warm";
  } else {
    tierLabel = "Standard Member";
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

function getUserActivityStats() {
  const sessions = getLocalSessions();
  let totalMessages = 0;
  sessions.forEach((s) => {
    (s.messages || []).forEach((m) => {
      if (m && m.role === "user") totalMessages++;
    });
  });

  const ties = getLocalTies();
  let maxTieLevel = 1;
  let highestTieStage = "Stranger";
  Object.values(ties).forEach((t) => {
    if (t && typeof t.level === "number" && t.level > maxTieLevel) {
      maxTieLevel = t.level;
      highestTieStage = t.stage || "Stranger";
    }
  });

  return { totalMessages, maxTieLevel, highestTieStage };
}

function isSoraProActive() {
  if (window.api && typeof window.api.isProActive === "function") {
    if (window.api.isProActive()) return true;
  }
  if (localStorage.getItem("sora_pro_unlocked") === "true") return true;
  const keys = window.api ? window.api.getByokKeys() : {};
  if (keys.groq || keys.gemini || keys.openrouter || keys.openai || keys.xai) return true;
  const userTier = state.user?.tier;
  if (userTier === "super_admin" || userTier === "ultra" || userTier === "pro") return true;
  const stats = getUserActivityStats();
  if (stats.totalMessages >= 10 || stats.maxTieLevel >= 2) return true;
  return false;
}

function renderProBadge() {
  const isPro = isSoraProActive();
  const topBtn = document.getElementById("open-premium-btn");
  const topLabel = document.getElementById("top-pro-label");
  if (topBtn) {
    topBtn.classList.toggle("pro-active", isPro);
    topBtn.classList.toggle("badge-pro-astral", isPro);
  }
  if (topLabel) {
    topLabel.textContent = isPro ? "PRO Active" : "Unlock Pro (Free)";
  }

  // Update Deep Roleplay toolbar button state
  const deepRpBtn = document.getElementById("deep-rp-toggle-btn");
  const deepRpLabel = document.getElementById("deep-rp-toggle-label");
  const isDeepRp = Boolean(window.api?.isDeepRpActive?.());
  if (deepRpBtn) {
    deepRpBtn.classList.toggle("active", isDeepRp);
  }
  if (deepRpLabel) {
    deepRpLabel.textContent = isDeepRp ? "Deep RP: ON" : "Deep RP: Off";
  }
}

function renderProModal() {
  const isPro = isSoraProActive();
  const stats = getUserActivityStats();

  const activeBanner = document.getElementById("pro-active-banner");
  if (activeBanner) activeBanner.classList.toggle("hidden", !isPro);

  const tierBadge = document.getElementById("pro-modal-tier-badge");
  if (tierBadge) {
    tierBadge.textContent = isPro ? "✦ PRO Active · $0" : "Earnable Edition · $0";
    tierBadge.className = isPro ? "badge-mini badge-pro-astral" : "badge-mini badge-warm";
  }

  const msgLabel = document.getElementById("pro-progress-msg-label");
  const msgBar = document.getElementById("pro-progress-msg-bar");
  if (msgLabel) msgLabel.textContent = `${Math.min(stats.totalMessages, 10)} / 10 Messages`;
  if (msgBar) msgBar.style.width = `${Math.min((stats.totalMessages / 10) * 100, 100)}%`;

  const tieLabel = document.getElementById("pro-progress-tie-label");
  const tieBar = document.getElementById("pro-progress-tie-bar");
  if (tieLabel) tieLabel.textContent = `${stats.highestTieStage} (Lv.${stats.maxTieLevel} / Lv.2)`;
  if (tieBar) tieBar.style.width = `${Math.min((stats.maxTieLevel / 2) * 100, 100)}%`;

  const claimBtn = document.getElementById("claim-pro-btn");
  const claimLabel = document.getElementById("claim-pro-btn-label");
  if (claimBtn && claimLabel) {
    if (isPro) {
      claimLabel.textContent = "✦ PRO Unlocked";
      claimBtn.disabled = true;
      claimBtn.classList.remove("btn-primary");
      claimBtn.classList.add("btn-glass");
    } else {
      claimLabel.textContent = "Claim Sora Pro (Free)";
      claimBtn.disabled = false;
      claimBtn.classList.add("btn-primary");
      claimBtn.classList.remove("btn-glass");
    }
  }
}

function checkAndAutoUnlockPro() {
  if (localStorage.getItem("sora_pro_unlocked") === "true") return true;
  const stats = getUserActivityStats();
  if (stats.totalMessages >= 10 || stats.maxTieLevel >= 2) {
    if (window.api?.unlockPro) {
      window.api.unlockPro("activity");
    } else {
      localStorage.setItem("sora_pro_unlocked", "true");
    }
    triggerHaptic(30);
    showToast("🎉 Sora Pro Unlocked for Free! ✦ PRO perks are now active.");
    renderProBadge();
    loadAdapters();
    renderUserHeader();
    return true;
  }
  return false;
}

function isModelUnlocked(adapter) {
  if (!adapter) return true;
  if (adapter.tier === "free") return true;
  if (isSoraProActive()) return true;

  const keys = window.api.getByokKeys();
  if (adapter.id === "byok-groq" && keys.groq) return true;
  if (adapter.id === "byok-gemini" && keys.gemini) return true;
  if (adapter.id === "byok-openrouter" && keys.openrouter) return true;
  return false;
}

async function loadAdapters() {
  state.adapters = [
    { id: "haru-core", name: "Sora Standard", tier: "free", badge: "Fast · Free", description: "Standard responsive roleplay engine powered by free cloud AI.", provider: "Cloud AI" },
    { id: "haru-velvet", name: "Sora Deep Roleplay", tier: "free", badge: "Creative · Free", description: "Expressive, emotionally nuanced multi-paragraph creative narrative.", provider: "Cloud AI" },
    { id: "haru-noir", name: "Sora Noir", tier: "free", badge: "Atmospheric · Free", description: "Rich sensory descriptions and grounded environmental pacing.", provider: "Cloud AI" },
    { id: "haru-pulse", name: "Sora Pulse", tier: "free", badge: "Snappy · Free", description: "Snappy, fast-paced conversational banter.", provider: "Cloud AI" },
    { id: "byok-groq", name: "Groq Llama 3.3 70B", tier: "pro", badge: "High-Speed · BYOK", description: "High-throughput Llama 3.3 70B via free Groq API key.", provider: "Groq" },
    { id: "byok-gemini", name: "Gemini 2.0 Flash", tier: "pro", badge: "Massive Context · BYOK", description: "Google Gemini 2.0 Flash via free Google AI Studio key.", provider: "Google" },
    { id: "byok-openrouter", name: "OpenRouter Hermes 3", tier: "pro", badge: "Unfiltered RP · BYOK", description: "Unfiltered deep character roleplay via free OpenRouter key.", provider: "NousResearch" }
  ];

  const freeModels = state.adapters.filter((m) => m.tier === "free");
  const proModels = state.adapters.filter((m) => m.tier === "pro");
  const proActive = isSoraProActive();

  document.querySelectorAll(".model-dropdown-populate").forEach((selectEl) => {
    const currentVal = selectEl.value;
    selectEl.innerHTML = "";

    const freeGroup = document.createElement("optgroup");
    freeGroup.label = "Included Free Engines (Zero Cost)";
    freeModels.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.badge})`;
      freeGroup.appendChild(opt);
    });
    selectEl.appendChild(freeGroup);

    const proGroup = document.createElement("optgroup");
    proGroup.label = "Sora Pro & BYOK Engines";
    proModels.forEach((m) => {
      const unlocked = isModelUnlocked(m);
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} — ${unlocked ? "✦ Unlocked" : "🔒 Pro Required"}`;
      proGroup.appendChild(opt);
    });
    selectEl.appendChild(proGroup);

    if (currentVal && state.adapters.some((a) => a.id === currentVal)) {
      selectEl.value = currentVal;
    } else {
      selectEl.value = "haru-core";
    }
  });

  renderAdaptersTable();
  renderProBadge();
}

function renderAdaptersTable() {
  const freeTbody = document.getElementById("free-adapters-table-body");
  const premGrid = document.getElementById("premium-transparency-grid");
  const planBadge = document.getElementById("premium-plan-badge");
  const isPro = isSoraProActive();

  if (planBadge) {
    if (isPro) {
      planBadge.textContent = "✦ Sora Pro Active (Community Edition)";
      planBadge.className = "badge-mini badge-pro-astral";
    } else {
      planBadge.textContent = "Standard Free Tier";
      planBadge.className = "badge-mini badge-warm";
    }
  }

  const proModels = state.adapters.filter((a) => a.tier === "pro");
  const freeModels = state.adapters.filter((a) => a.tier === "free");

  if (freeTbody) {
    freeTbody.innerHTML = "";
    freeModels.forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:600;">${a.name}</td>
        <td><span class="badge-mini">${a.badge}</span></td>
        <td class="muted-text">${a.description || ""}</td>
        <td class="muted-text"><span class="status-dot" style="background:#10b981;"></span>Included · 100% Free</td>
      `;
      freeTbody.appendChild(tr);
    });
  }

  const renderProCards = (container) => {
    if (!container) return;
    container.innerHTML = "";
    proModels.forEach((a) => {
      const unlocked = isModelUnlocked(a);
      const card = document.createElement("div");
      card.className = `premium-spec-card ${unlocked ? "unlocked" : ""}`;
      const dotColor = unlocked ? "#10b981" : "#a1a1aa";
      const statusLabel = unlocked ? "Unlocked · Active" : "✦ Pro Status or BYOK Required";
      card.innerHTML = `
        <div class="premium-spec-top">
          <span class="premium-spec-provider">${a.provider}</span>
          <span class="badge-mini">${a.badge}</span>
        </div>
        <div class="premium-spec-title">${a.name}</div>
        <div class="premium-spec-desc">${a.description || ""}</div>
        <div class="premium-spec-meta">
          <span><span class="status-dot" style="background:${dotColor};"></span>${statusLabel}</span>
          <span>Zero-Cost AI</span>
        </div>
      `;
      container.appendChild(card);
    });
  };

  renderProCards(premGrid);
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
  const path = `/api/v1/characters?${qs.toString()}`;
  try {
    const data = await window.api.requestWithSWR(path, {
      timeout: 8000,
      onRevalidate: (fresh) => {
        state.characters = fresh;
        renderCharacterGrid();
      },
    });
    state.characters = data;
    renderCharacterGrid();
  } catch (err) {
    // Offline / standalone APK fallback: filter bundled catalog
    filterLocalCharacters();
  }
}

async function loadTemplates() {
  try {
    const data = await window.api.requestWithSWR("/api/v1/templates", {
      timeout: 8000,
      onRevalidate: (fresh) => {
        state.templates = fresh;
        renderTemplateDropdown("All");
      },
    });
    state.templates = data;
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

  const fragment = document.createDocumentFragment();

  state.characters.forEach((c, index) => {
    const card = document.createElement("article");
    card.className = "char-card";
    card.style.setProperty("--i", index);
    const avatarSrc = getCharacterAvatarUrl(c);

    const tagsHtml = (c.tags || [])
      .slice(0, 5)
      .map((t) => `<span class="tag-pill" data-filter-tag="${t}" title="Filter by ${t}">${t}</span>`)
      .join("");

    const previewSnippet = (c.scenario || c.greeting || "").replace(/\*/g, "").slice(0, 110);
    const charGender = c.gender || "Female";
    const culture = getCharacterCulture(c);
    const safeName = (c.name || "Character").replace(/'/g, "\\'");
    const safeCategory = (c.category || "Romance").replace(/'/g, "\\'");
    const commentCount = getCharacterCommentCount(c.id);

    card.innerHTML = `
      <div class="char-tile-media">
        <img src="${avatarSrc}" alt="${c.name}" class="char-tile-img char-portrait-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.src=getFallbackAvatar('${safeName}', '${charGender}', '${safeCategory}');" />
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
            <button type="button" class="card-comment-btn" data-comments-id="${c.id}" title="View Community Reflections">
              <span>💬</span> <span class="comment-count-pill">${commentCount}</span>
            </button>
            <button class="like-btn ${c.liked_by_me ? "liked" : ""}" data-like-id="${c.id}">
              <span>${c.liked_by_me ? "Saved" : "Save"}</span> · <span>${c.like_count}</span>
            </button>
            <span class="char-enter-link">Enter Story &rarr;</span>
          </div>
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-like-id]") || e.target.closest("[data-comments-id]")) return;
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

    const commBtn = card.querySelector(`[data-comments-id="${c.id}"]`);
    if (commBtn) {
      commBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerHaptic(12);
        openCharacterComments(c.id);
      });
    }

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

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

// --- Active Sessions List ---
async function loadSessions() {
  try {
    const data = await window.api.requestWithSWR("/api/v1/sessions", {
      timeout: 8000,
      onRevalidate: (fresh) => {
        state.sessions = fresh;
        updateSessionsBadge();
        renderSessionsList();
      },
    });
    state.sessions = data;
  } catch {
    state.sessions = getLocalSessions();
  }
  updateSessionsBadge();
  renderSessionsList();
}

function updateSessionsBadge() {
  const badge = document.getElementById("chats-count-badge");
  if (!badge) return;
  if (state.sessions && state.sessions.length > 0) {
    badge.textContent = state.sessions.length;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
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
    const avatarSrc = getCharacterPortraitURI({ name: s.character_name, avatar_url: s.character_avatar });
    const safeName = (s.character_name || "").replace(/'/g, "\\'");
    item.innerHTML = `
      <img src="${avatarSrc}" alt="${s.character_name}" class="char-avatar-lg char-portrait-img" style="width:42px;height:42px;" onerror="this.onerror=null; this.src=getFallbackAvatar('${safeName}');" />
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
    const avatarSrc = getCharacterPortraitURI(c);
    const safeName = (c.name || "").replace(/'/g, "\\'");
    item.innerHTML = `
      <img src="${avatarSrc}" alt="${c.name}" class="char-avatar-lg char-portrait-img" style="width:44px;height:44px;" onerror="this.onerror=null; this.src=getFallbackAvatar('${safeName}', '${c.gender || ''}');" />
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
  hapticTick(8);
  state.activeSession = sessionData;
  const c = sessionData.character;
  const drawer = document.getElementById("chat-drawer");
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("chat-active");
  if (window.history && window.history.state?.view !== "chat") {
    window.history.pushState({ view: "chat", sessionId: sessionData.id }, "");
  }

  const charAvatarEl = document.getElementById("chat-char-avatar");
  if (charAvatarEl) {
    charAvatarEl.onerror = () => {
      charAvatarEl.onerror = null;
      charAvatarEl.src = getFallbackAvatar(c.name, c.gender, c.category);
    };
    charAvatarEl.src = getCharacterAvatarUrl(c);
  }
  document.getElementById("chat-char-name").textContent = c.name;
  document.getElementById("chat-char-category").textContent = c.category;
  document.getElementById("chat-char-tagline").textContent = c.tagline;

  const currentTie = getTieForCharacter(c.id, c);
  updateChatHeaderBondPill(currentTie);

  const commentCount = getCharacterCommentCount(c.id);
  const chatCommentBadge = document.getElementById("chat-comments-count");
  if (chatCommentBadge) chatCommentBadge.textContent = commentCount;
  const mobileCommentBadge = document.getElementById("chat-mobile-comments-count");
  if (mobileCommentBadge) mobileCommentBadge.textContent = commentCount;

  updateChatHeaderMood();
  updateCoreMemoriesBadges(c.id);

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
  const avatar = getCharacterAvatarUrl(c);
  const fallbackImg = getFallbackAvatar(c.name, c.gender, c.category);
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

  const charAvatar = getCharacterAvatarUrl(c);
  const userAvatar = window.api.resolveAssetUrl(state.user?.avatar_url);

  state.activeSession.messages.forEach((m) => {
    container.appendChild(createMessageDom(m, m.content, m.model_used, charAvatar, userAvatar, m.id));
  });
  container.scrollTop = container.scrollHeight;
}

function createMessageDom(msgOrRole, content, modelUsed, charAvatar, userAvatar, msgId = null) {
  const msgObj = typeof msgOrRole === "object" ? msgOrRole : { role: msgOrRole, content, model_used: modelUsed, id: msgId };
  const role = msgObj.role;
  let text = msgObj.content || content || "";
  const model = msgObj.model_used || modelUsed;
  const id = msgObj.id || msgId || "";

  if (role === "assistant") {
    if (!msgObj.variations || !Array.isArray(msgObj.variations) || msgObj.variations.length === 0) {
      msgObj.variations = [text];
    }
    if (typeof msgObj.variation_index !== "number" || msgObj.variation_index >= msgObj.variations.length) {
      msgObj.variation_index = msgObj.variations.length - 1;
    }
    text = msgObj.variations[msgObj.variation_index] || text;
  }

  const row = document.createElement("div");
  row.className = `msg-row ${role} animate-in`;
  if (id) row.dataset.msgId = id;
  row.dataset.rawText = text;
  const avatar = role === "user" ? userAvatar : charAvatar;

  const authorName = role === "user"
    ? (state.user?.display_name || "You")
    : (state.activeSession?.character?.name || "Character");

  const fallbackMsgAvatar = role === "user"
    ? getFallbackAvatar(authorName, "Female", "User")
    : getFallbackAvatar(authorName, state.activeSession?.character?.gender, state.activeSession?.character?.category);

  row.innerHTML = `
    <img src="${avatar}" alt="${role}" class="msg-avatar" onerror="this.onerror=null; this.src='${fallbackMsgAvatar}';" />
    <div class="msg-wrapper" style="min-width:0;flex:1;">
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
          ${role === "assistant" ? `
            <div class="msg-swipe-nav" title="Swipe between response variations">
              <button type="button" class="btn-swipe-prev" ${msgObj.variation_index <= 0 ? "disabled" : ""} title="Previous variation">◀</button>
              <span class="swipe-indicator">${msgObj.variation_index + 1}/${msgObj.variations.length}</span>
              <button type="button" class="btn-swipe-next" ${msgObj.variation_index >= msgObj.variations.length - 1 ? "disabled" : ""} title="Next variation">▶</button>
            </div>
            <button type="button" class="msg-act-btn btn-regen-msg" title="Generate new variation (Swipe)" aria-label="Regenerate variation">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
          ` : ""}
          <button type="button" class="msg-act-btn btn-copy-msg" title="Copy message" aria-label="Copy message">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button type="button" class="msg-act-btn btn-tts-msg" title="Listen with character voice" aria-label="Voice narration">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          </button>
          <button type="button" class="msg-act-btn btn-pin-memory-msg" title="Pin fact to Character Core Memories" aria-label="Pin to Core Memories">
            <span style="font-size:0.75rem;">📌</span>
          </button>
          <button type="button" class="msg-act-btn btn-rewind-msg" title="Rewind conversation to this turn" aria-label="Rewind turn">
            <span style="font-size:0.75rem;">⏪</span>
          </button>
          <button type="button" class="msg-act-btn btn-edit-msg" title="Edit turn" aria-label="Edit turn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button type="button" class="msg-act-btn btn-del-msg" title="Delete turn" aria-label="Delete turn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const bubbleEl = row.querySelector(".msg-bubble");
  const editBoxEl = row.querySelector(".msg-edit-box");
  const editInput = row.querySelector(".msg-inline-edit-input");

  // Swipe Navigation
  const prevBtn = row.querySelector(".btn-swipe-prev");
  const nextBtn = row.querySelector(".btn-swipe-next");
  const swipeInd = row.querySelector(".swipe-indicator");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (msgObj.variation_index > 0) {
        triggerHaptic(8);
        msgObj.variation_index--;
        const curText = msgObj.variations[msgObj.variation_index];
        msgObj.content = curText;
        row.dataset.rawText = curText;
        bubbleEl.innerHTML = formatRoleplayHTML(curText);
        swipeInd.textContent = `${msgObj.variation_index + 1}/${msgObj.variations.length}`;
        prevBtn.disabled = msgObj.variation_index <= 0;
        nextBtn.disabled = msgObj.variation_index >= msgObj.variations.length - 1;
        saveLocalSessions(getLocalSessions().map((s) => (s.id === state.activeSession?.id ? state.activeSession : s)));
        updateChatHeaderMood();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (msgObj.variation_index < msgObj.variations.length - 1) {
        triggerHaptic(8);
        msgObj.variation_index++;
        const curText = msgObj.variations[msgObj.variation_index];
        msgObj.content = curText;
        row.dataset.rawText = curText;
        bubbleEl.innerHTML = formatRoleplayHTML(curText);
        swipeInd.textContent = `${msgObj.variation_index + 1}/${msgObj.variations.length}`;
        prevBtn.disabled = msgObj.variation_index <= 0;
        nextBtn.disabled = msgObj.variation_index >= msgObj.variations.length - 1;
        saveLocalSessions(getLocalSessions().map((s) => (s.id === state.activeSession?.id ? state.activeSession : s)));
        updateChatHeaderMood();
      }
    });
  }

  // Regenerate Response Variation (Swipe)
  const regenMsgBtn = row.querySelector(".btn-regen-msg");
  if (regenMsgBtn) {
    regenMsgBtn.addEventListener("click", async () => {
      if (!state.activeSession) return;
      triggerHaptic(12);
      showToast("Generating response variation...");
      regenMsgBtn.disabled = true;
      try {
        const char = state.activeSession.character;
        const tie = getTieForCharacter(char.id, char);
        const selectedModel = document.getElementById("chat-model-select")?.value || "haru-core";
        const selectedPersona = document.getElementById("chat-persona-select")?.value;
        const personaObj = (state.user?.personas || []).find((p) => p.id === selectedPersona) || null;
        const coreMems = getCharacterCoreMemories(char.id).map((m) => m.text);

        const targetIdx = state.activeSession.messages.findIndex((m) => m.id === id);
        const sliceEnd = targetIdx >= 0 ? targetIdx : state.activeSession.messages.length - 1;
        const historyBefore = state.activeSession.messages.slice(0, sliceEnd);

        let newContent = "";
        await window.api.streamMessage(
          state.activeSession.id,
          {
            content: historyBefore[historyBefore.length - 1]?.content || "Continue the scene.",
            model: selectedModel,
            character_name: char.name,
            tagline: char.tagline,
            category: char.category,
            first_message: char.first_message,
            personality: char.personality,
            scenario: char.scenario,
            tie: { level: tie.level, stage: tie.stage, xp: tie.xp },
            core_memories: coreMems,
            user_persona: personaObj ? { name: personaObj.name, description: personaObj.description } : null,
            deep_roleplay: Boolean(window.api?.isDeepRpActive?.()),
            local_messages: historyBefore.map((m) => ({ role: m.role, content: m.content })),
          },
          {
            onToken: (tok) => {
              newContent += tok;
              bubbleEl.innerHTML = formatRoleplayHTML(newContent);
            },
            onDone: (d) => {
              const finalTxt = d.content || newContent;
              msgObj.variations.push(finalTxt);
              msgObj.variation_index = msgObj.variations.length - 1;
              msgObj.content = finalTxt;
              row.dataset.rawText = finalTxt;
              bubbleEl.innerHTML = formatRoleplayHTML(finalTxt);
              if (swipeInd) swipeInd.textContent = `${msgObj.variations.length}/${msgObj.variations.length}`;
              if (prevBtn) prevBtn.disabled = false;
              if (nextBtn) nextBtn.disabled = true;
              saveLocalSessions(getLocalSessions().map((s) => (s.id === state.activeSession?.id ? state.activeSession : s)));
              updateChatHeaderMood();
              showToast(`New variation added (< ${msgObj.variations.length}/${msgObj.variations.length} >)`);
            },
            onError: (err) => {
              showToast(`Variation error: ${err.message}`);
            },
          }
        );
      } catch (err) {
        showToast(`Regeneration failed: ${err.message}`);
      } finally {
        regenMsgBtn.disabled = false;
      }
    });
  }

  // Rewind Conversation Button
  const rewindBtn = row.querySelector(".btn-rewind-msg");
  if (rewindBtn) {
    rewindBtn.addEventListener("click", () => {
      triggerHaptic(12);
      if (!confirm("Rewind chat to this message? Subsequent responses will be cleared to allow you to branch the story.")) return;
      const curId = row.dataset.msgId;
      if (!curId || !state.activeSession) return;
      const idx = state.activeSession.messages.findIndex((m) => m.id === curId);
      if (idx >= 0) {
        state.activeSession.messages = state.activeSession.messages.slice(0, idx + 1);
        state.activeSession.last_message = (state.activeSession.messages[state.activeSession.messages.length - 1]?.content || "").slice(0, 80);
        saveLocalSessions(getLocalSessions().map((s) => (s.id === state.activeSession.id ? state.activeSession : s)));
        renderMessagesList();
        updateChatHeaderMood();
        triggerHaptic(14);
        showToast("Conversation rewound ⏪");
      }
    });
  }

  // Pin Fact to Core Memories Button
  const pinMemBtn = row.querySelector(".btn-pin-memory-msg");
  if (pinMemBtn) {
    pinMemBtn.addEventListener("click", () => {
      triggerHaptic(10);
      const charId = state.activeSession?.character?.id;
      if (!charId) return;
      const cur = row.dataset.rawText || text;
      const dialogueMatches = Array.from(cur.matchAll(/“([^”]+)”|"([^"]+)"|「([^」]+)」/g))
        .map((m) => m[1] || m[2] || m[3]);
      const excerpt = (dialogueMatches.length > 0 ? dialogueMatches.join(" ") : cur).slice(0, 150).trim();
      const custom = prompt("Pin key fact or promise to Core Memories:", excerpt);
      if (custom && custom.trim()) {
        addCharacterCoreMemory(charId, custom.trim(), row.dataset.msgId);
      }
    });
  }

  // Copy button
  const copyBtn = row.querySelector(".btn-copy-msg");
  copyBtn.addEventListener("click", () => {
    triggerHaptic(8);
    const toCopy = row.dataset.rawText || text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(toCopy)
        .then(() => showToast("Copied to clipboard"))
        .catch(() => copyFallback(toCopy));
    } else {
      copyFallback(toCopy);
    }
  });

  // TTS Voice button with character vocal profile
  const ttsBtn = row.querySelector(".btn-tts-msg");
  ttsBtn.addEventListener("click", () => {
    triggerHaptic(10);
    const toSpeak = row.dataset.rawText || text;
    const char = role === "assistant" ? state.activeSession?.character : { gender: "Female" };
    speakText(toSpeak, char, ttsBtn);
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
      updateChatHeaderMood();
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
      updateChatHeaderMood();
      showToast("Message updated");
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
    updateChatHeaderMood();
    showToast("Turn deleted");
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

function switchTab(tabName, pushHistory = true) {
  triggerHaptic(8);
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
  const titles = {
    discover: "Character Directory",
    chats: "Active Sessions",
    ties: "Character Ties & Bonds",
    create: "Create Character",
    personas: "User Profiles",
    settings: "Configuration",
  };
  document.getElementById("view-title").textContent = titles[tabName] || "Sora";
  if (tabName === "ties") {
    renderTiesTab(state.activeTieFilter || "all");
  }
  if (pushHistory && window.history && tabName !== "discover" && window.history.state?.tab !== tabName) {
    window.history.pushState({ view: "tab", tab: tabName }, "");
  }
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

function exportSoraBackup() {
  try {
    triggerHaptic(10);
    const sessions = getLocalSessions();
    const characters = getMyCharactersLocal();
    const liked = Array.from(getLikedIds());
    const user = state.user || JSON.parse(localStorage.getItem("sora_cached_user") || "null");
    const personas = user?.personas || [];
    const chatBgs = JSON.parse(localStorage.getItem("haru_emochi_chat_bgs") || "{}");
    const serverUrl = localStorage.getItem("haru_emochi_server_url") || "";

    const backupPayload = {
      version: 1,
      app: "com.haru.sora",
      exported_at: new Date().toISOString(),
      user,
      personas,
      sessions,
      characters,
      liked_character_ids: liked,
      chat_backgrounds: chatBgs,
      settings: {
        server_url: serverUrl,
        grid_mode: localStorage.getItem("sora_grid_view_mode") || "story",
      },
    };

    const jsonStr = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const filename = `sora-backup-${yyyy}-${mm}-${dd}.json`;

    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    setTimeout(() => {
      URL.revokeObjectURL(downloadLink.href);
      downloadLink.remove();
    }, 1500);

    showToast(`Backup exported: ${filename} (${sessions.length} chats, ${characters.length} characters)`);
  } catch (err) {
    console.error("Backup export failed:", err);
    showToast(`Export failed: ${err.message}`);
  }
}

async function importSoraBackup(file) {
  if (!file) return;
  try {
    triggerHaptic(12);
    showToast("Validating and importing backup...");
    const rawText = await file.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      throw new Error("Invalid file content: Not valid JSON.");
    }

    if (!data || typeof data !== "object") {
      throw new Error("Invalid backup format: Expected a JSON object.");
    }

    if (!Array.isArray(data.sessions) && !Array.isArray(data.characters) && !data.user) {
      throw new Error("Unrecognized backup format: No Sora sessions, characters, or user profile found.");
    }

    let sessionsCount = 0;
    let charsCount = 0;
    let personasCount = 0;

    // 1. Restore & merge sessions
    if (Array.isArray(data.sessions)) {
      const existing = getLocalSessions();
      const map = new Map();
      existing.forEach((s) => s?.id && map.set(s.id, s));
      data.sessions.forEach((s) => {
        if (s?.id) {
          map.set(s.id, s);
          sessionsCount++;
        }
      });
      saveLocalSessions(Array.from(map.values()));
    }

    // 2. Restore & merge custom characters
    if (Array.isArray(data.characters)) {
      const existing = getMyCharactersLocal();
      const map = new Map();
      existing.forEach((c) => c?.id && map.set(c.id, c));
      data.characters.forEach((c) => {
        if (c?.id) {
          map.set(c.id, c);
          charsCount++;
        }
      });
      saveMyCharactersLocal(Array.from(map.values()));
    }

    // 3. Restore liked character ids
    if (Array.isArray(data.liked_character_ids)) {
      const liked = getLikedIds();
      data.liked_character_ids.forEach((id) => liked.add(id));
      saveLikedIds(liked);
    }

    // 4. Restore chat background configs
    if (data.chat_backgrounds && typeof data.chat_backgrounds === "object") {
      try {
        const cur = JSON.parse(localStorage.getItem("haru_emochi_chat_bgs") || "{}");
        const merged = Object.assign({}, cur, data.chat_backgrounds);
        localStorage.setItem("haru_emochi_chat_bgs", JSON.stringify(merged));
      } catch (_) {}
    }

    // 5. Restore user profile & personas
    if (data.user) {
      const curUser = state.user || JSON.parse(localStorage.getItem("sora_cached_user") || "null") || {};
      const mergedPersonas = [...(curUser.personas || [])];
      const pIdSet = new Set(mergedPersonas.map((p) => p.id));
      const importedPersonas = data.personas || data.user.personas || [];
      if (Array.isArray(importedPersonas)) {
        for (const p of importedPersonas) {
          if (p?.id && !pIdSet.has(p.id)) {
            mergedPersonas.push(p);
            pIdSet.add(p.id);
            personasCount++;
          }
        }
      }

      state.user = {
        ...curUser,
        ...data.user,
        personas: mergedPersonas,
      };
      localStorage.setItem("sora_cached_user", JSON.stringify(state.user));
    }

    // 6. Restore settings if present
    if (data.settings?.server_url) {
      localStorage.setItem("haru_emochi_server_url", data.settings.server_url);
      const srvEl = document.getElementById("cfg-server-url");
      if (srvEl) srvEl.value = data.settings.server_url;
    }
    if (data.settings?.grid_mode) {
      localStorage.setItem("sora_grid_view_mode", data.settings.grid_mode);
    }

    triggerHaptic(15);
    showToast(`Restore complete! ${sessionsCount} sessions, ${charsCount} characters, ${personasCount} personas imported.`);

    // Refresh application state
    renderUserHeader();
    renderPersonasList();
    await Promise.all([loadCharacters(), loadMyCharacters(), loadSessions()]);
  } catch (err) {
    console.error("Backup import failed:", err);
    showToast(`Restore failed: ${err.message}`);
  }
}

function bindUIEvents() {
  initPlatformBanner();

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

    const groqKey = document.getElementById("cfg-groq-key").value.trim();
    const geminiKey = document.getElementById("cfg-gemini-key").value.trim();
    const openrouterKey = document.getElementById("cfg-openrouter-key").value.trim();

    window.api.setByokKeys({
      groq: groqKey,
      gemini: geminiKey,
      openai: document.getElementById("cfg-openai-key").value.trim(),
      openrouter: openrouterKey,
      xai: document.getElementById("cfg-xai-key").value.trim(),
      hf: document.getElementById("cfg-hf-key").value.trim(),
      ollama_url: document.getElementById("cfg-ollama-url").value.trim(),
    });

    if (groqKey || geminiKey || openrouterKey) {
      if (window.api?.unlockPro) window.api.unlockPro("byok");
      else localStorage.setItem("sora_pro_unlocked", "true");
      triggerHaptic(25);
      showToast("✦ Sora Pro Activated via BYOK Key! All engines unlocked.");
    } else {
      showToast("Configuration saved");
    }
    loadAdapters();
    renderProBadge();
  });

  document.getElementById("close-chat-btn").addEventListener("click", () => {
    if (window.history.state?.view === "chat") {
      window.history.back();
    } else {
      document.getElementById("chat-drawer").classList.add("hidden");
      document.body.classList.remove("chat-active");
      loadSessions();
    }
  });

  // --- Mobile Bottom Sheet & Ambience Controls ---
  const mobileSheet = document.getElementById("chat-mobile-sheet");
  const openMobileSheet = (tab = "ambience") => {
    triggerHaptic(10);
    if (!mobileSheet) return;
    mobileSheet.classList.remove("hidden");
    switchSheetTab(tab);
    if (window.history && window.history.state?.view !== "sheet") {
      window.history.pushState({ view: "sheet", sheetTab: tab }, "");
    }
  };
  const closeMobileSheet = () => {
    triggerHaptic(8);
    if (window.history.state?.view === "sheet") {
      window.history.back();
    } else if (mobileSheet) {
      mobileSheet.classList.add("hidden");
    }
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

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const chatDrawer = document.getElementById("chat-drawer");
      if (chatDrawer && !chatDrawer.classList.contains("hidden")) {
        const container = document.getElementById("chat-messages");
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }
    });
  }

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

    hapticTick(8);
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

    const activeChar = state.activeSession.character;
    const currentTie = recordTieInteraction(activeChar.id, activeChar, 15);
    const activePersona = (state.user?.personas || []).find((p) => p.id === selectedPersona) || null;
    const coreMems = getCharacterCoreMemories(activeChar.id).map((m) => m.text);

    let accumulated = "";
    await window.api.streamMessage(
      state.activeSession.id,
      {
        content,
        model: selectedModel,
        persona_id: selectedPersona || null,
        character_name: activeChar?.name,
        tagline: activeChar?.tagline,
        category: activeChar?.category,
        first_message: activeChar?.first_message,
        personality: activeChar?.personality,
        scenario: activeChar?.scenario,
        tie: {
          level: currentTie.level,
          stage: currentTie.stage,
          xp: currentTie.xp,
        },
        core_memories: coreMems,
        user_persona: activePersona ? { name: activePersona.name, description: activePersona.description } : null,
        deep_roleplay: Boolean(window.api?.isDeepRpActive?.()),
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
            { id: doneEvt.message_id, role: "assistant", content: finalContent, model_used: finalLabel, variations: [finalContent], variation_index: 0 }
          );
          state.activeSession.last_message = finalContent.slice(0, 80);
          const sessions = getLocalSessions();
          const idx = sessions.findIndex((s) => s.id === state.activeSession.id);
          if (idx >= 0) sessions[idx] = state.activeSession;
          else sessions.unshift(state.activeSession);
          saveLocalSessions(sessions);
          checkAndAutoUnlockPro();
          loadPlatformStats();
          if (state.activeSession?.character) {
            recordTieInteraction(state.activeSession.character.id, state.activeSession.character, 10);
          }
          updateChatHeaderMood();

          // Auto-play voice narration if user enabled TTS toggle
          if (state.ttsAutoPlay) {
            const ttsBtn = aiRow.querySelector(".btn-tts-msg");
            speakText(finalContent, state.activeSession.character, ttsBtn);
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
    if (adapter && adapter.tier === "pro" && !isModelUnlocked(adapter)) {
      renderProModal();
      openPremium();
    }
  });

  const premiumModal = document.getElementById("premium-modal");
  const openPremBtn = document.getElementById("open-premium-btn");
  const openPremium = () => {
    renderProModal();
    renderAdaptersTable();
    if (premiumModal) {
      premiumModal.classList.remove("hidden");
      if (window.history && window.history.state?.view !== "premium-modal") {
        window.history.pushState({ view: "premium-modal" }, "");
      }
    }
  };
  const closePremium = () => {
    if (window.history.state?.view === "premium-modal") {
      window.history.back();
    } else if (premiumModal) {
      premiumModal.classList.add("hidden");
    }
  };
  if (openPremBtn && premiumModal) {
    openPremBtn.addEventListener("click", openPremium);
  }
  const closePremBtn = document.getElementById("close-premium-modal");
  if (closePremBtn && premiumModal) {
    closePremBtn.addEventListener("click", closePremium);
  }
  const closePremContBtn = document.getElementById("close-premium-continue-free");
  if (closePremContBtn && premiumModal) {
    closePremContBtn.addEventListener("click", closePremium);
  }

  const claimProBtn = document.getElementById("claim-pro-btn");
  if (claimProBtn && premiumModal) {
    claimProBtn.addEventListener("click", () => {
      triggerHaptic(25);
      if (window.api?.unlockPro) window.api.unlockPro("claimed");
      else localStorage.setItem("sora_pro_unlocked", "true");
      showToast("🎉 Sora Pro Unlocked! Community Edition perks are now active.");
      renderProModal();
      renderProBadge();
      loadAdapters();
      renderUserHeader();
    });
  }

  // Deep Roleplay Mode Toggle Wiring
  const deepRpBtn = document.getElementById("deep-rp-toggle-btn");
  if (deepRpBtn) {
    deepRpBtn.addEventListener("click", () => {
      triggerHaptic(12);
      if (!isSoraProActive()) {
        showToast("✦ Unlock Sora Pro (Free) to enable Deep Roleplay Mode!");
        renderProModal();
        openPremium();
        return;
      }
      const nextState = !Boolean(window.api?.isDeepRpActive?.());
      if (window.api?.setDeepRpActive) {
        window.api.setDeepRpActive(nextState);
      } else {
        localStorage.setItem("sora_deep_rp_enabled", nextState ? "true" : "false");
      }
      renderProBadge();
      showToast(nextState ? "✦ Deep Roleplay Mode ON (Rich multi-paragraph narrative)" : "Deep Roleplay Mode OFF");
    });
  }

  if (premiumModal) {
    premiumModal.addEventListener("click", (e) => {
      if (e.target === premiumModal) closePremium();
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
    if (authModal) {
      authModal.classList.remove("hidden");
      if (window.history && window.history.state?.view !== "auth-modal") {
        window.history.pushState({ view: "auth-modal" }, "");
      }
    }
  };
  const closeAuth = () => {
    if (window.history.state?.view === "auth-modal") {
      window.history.back();
    } else if (authModal) {
      authModal.classList.add("hidden");
    }
  };
  const openAuthBtn = document.getElementById("open-auth-btn");
  if (openAuthBtn) openAuthBtn.addEventListener("click", openAuth);
  const userPill = document.getElementById("user-pill");
  if (userPill) userPill.addEventListener("click", openAuth);
  const closeAuthBtn = document.getElementById("close-auth-modal");
  if (closeAuthBtn && authModal) {
    closeAuthBtn.addEventListener("click", closeAuth);
  }
  if (authModal) {
    authModal.addEventListener("click", (e) => {
      if (e.target === authModal) closeAuth();
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

    if (!username || username.length < 3) {
      errEl.textContent = "Username must be at least 3 characters.";
      errEl.classList.remove("hidden");
      return;
    }
    if (!password || password.length < 4) {
      errEl.textContent = "Password must be at least 4 characters.";
      errEl.classList.remove("hidden");
      return;
    }

    try {
      const endpoint = state.authMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const payload = state.authMode === "register"
        ? { username, password, display_name, email }
        : { username, password };
      try {
        const res = await window.api.request(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
          timeout: 4000,
        });
        window.api.setToken(res.access_token);
        state.user = res.user;
      } catch (networkErr) {
        // Fallback for standalone/offline APK
        console.warn("Backend auth offline, creating secure local profile:", networkErr);
        const isSuper = (email && email.toLowerCase() === "harshitg933@gmail.com") || username === "harshitg933";
        state.user = {
          id: "usr_" + Math.random().toString(36).substring(2, 9),
          username: username,
          display_name: display_name || username,
          email: email || `${username}@sora.local`,
          bio: "Living characters, unfiltered stories.",
          is_guest: false,
          is_super_admin: isSuper,
          tier: isSuper ? "super_admin" : "free",
          personas: state.user?.personas || [
            {
              id: "persona_default",
              name: "Default Persona",
              description: "Curious storyteller wandering the world.",
              avatar_url: "/assets/icon.svg",
              is_default: true,
            },
          ],
        };
        window.api.setToken("local_token_" + Date.now());
      }

      if (window.api?.setSecureItem) {
        window.api.setSecureItem("sora_cached_user", state.user);
      } else {
        localStorage.setItem("sora_cached_user", JSON.stringify(state.user));
      }

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

  // Social SSO Handlers (Google & Facebook)
  async function handleSocialLogin(provider) {
    triggerHaptic(10);
    const errEl = document.getElementById("auth-error-msg");
    if (errEl) errEl.classList.add("hidden");

    const oauthUrl = window.api.getOAuthUrl(provider);
    if (oauthUrl) {
      window.location.href = oauthUrl;
      return;
    }

    // Direct client fallback handshake for standalone mode
    showToast(`Connecting with ${provider.charAt(0).toUpperCase() + provider.slice(1)}...`);
    const defaultEmail = state.user?.email || (provider === "google" ? "harshitg933@gmail.com" : "user@facebook.com");
    const isFounder = defaultEmail.toLowerCase() === "harshitg933@gmail.com";
    state.user = {
      id: `${provider}_` + Math.random().toString(36).substring(2, 9),
      username: `${provider}_user`,
      display_name: isFounder ? "Harshit Gupta (Founder)" : `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
      email: defaultEmail,
      bio: `Authenticated via ${provider.charAt(0).toUpperCase() + provider.slice(1)} SSO.`,
      is_guest: false,
      is_super_admin: isFounder,
      tier: isFounder ? "super_admin" : "pro",
      avatar_url: "/assets/icon.svg",
      personas: state.user?.personas || [
        {
          id: "persona_default",
          name: "Default Persona",
          description: "Curious storyteller wandering the world.",
          avatar_url: "/assets/icon.svg",
          is_default: true,
        },
      ],
    };

    window.api.setToken(`${provider}_token_${Date.now()}`);
    if (window.api?.setSecureItem) {
      window.api.setSecureItem("sora_cached_user", state.user);
    } else {
      localStorage.setItem("sora_cached_user", JSON.stringify(state.user));
    }

    renderUserHeader();
    renderPersonasList();
    loadAdapters();
    authModal.classList.add("hidden");
    showToast(`Signed in with ${provider.charAt(0).toUpperCase() + provider.slice(1)}!`);
  }

  function handleOAuthCallbackUrl(urlStr) {
    try {
      const url = new URL(urlStr, window.location.href);
      const hashParams = url.hash ? new URLSearchParams(url.hash.replace(/^#/, "")) : null;
      const token =
        url.searchParams.get("token") ||
        url.searchParams.get("access_token") ||
        hashParams?.get("token") ||
        hashParams?.get("access_token");

      if (token) {
        window.api.setToken(token);
        const authModal = document.getElementById("auth-modal");
        if (authModal) authModal.classList.add("hidden");
        window.api.request("/api/v1/auth/me", { timeout: 3000 }).then((u) => {
          state.user = u;
          if (window.api?.setSecureItem) window.api.setSecureItem("sora_cached_user", state.user);
          renderUserHeader();
          renderPersonasList();
          loadAdapters();
          showToast(`Welcome back, ${state.user.display_name}!`);
        }).catch(() => {});
      }
    } catch (_) {}
  }

  const googleBtn = document.getElementById("google-auth-btn");
  if (googleBtn) googleBtn.addEventListener("click", () => handleSocialLogin("google"));
  const fbBtn = document.getElementById("facebook-auth-btn");
  if (fbBtn) fbBtn.addEventListener("click", () => handleSocialLogin("facebook"));

  // Ties filter chip events
  document.querySelectorAll(".tie-filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      triggerHaptic(8);
      const filter = btn.dataset.tieFilter;
      renderTiesTab(filter);
    });
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

  // --- Backup & Restore Handlers ---
  const backupFileInput = document.getElementById("import-backup-file");
  if (backupFileInput) {
    backupFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        importSoraBackup(file);
      }
      e.target.value = "";
    });
  }

  const exportBackupBtn = document.getElementById("export-backup-btn");
  if (exportBackupBtn) exportBackupBtn.addEventListener("click", exportSoraBackup);
  const cfgExportBackupBtn = document.getElementById("cfg-export-backup-btn");
  if (cfgExportBackupBtn) cfgExportBackupBtn.addEventListener("click", exportSoraBackup);

  const importBackupBtn = document.getElementById("import-backup-btn");
  if (importBackupBtn) importBackupBtn.addEventListener("click", () => backupFileInput?.click());
  const cfgImportBackupBtn = document.getElementById("cfg-import-backup-btn");
  if (cfgImportBackupBtn) cfgImportBackupBtn.addEventListener("click", () => backupFileInput?.click());

  // --- Character Comments Section Event Wiring ---
  const commentsModal = document.getElementById("comments-modal");
  const closeCommentsModal = () => {
    triggerHaptic(8);
    if (window.history.state?.view === "comments-modal") {
      window.history.back();
    } else if (commentsModal) {
      commentsModal.classList.add("hidden");
    }
  };

  const closeCommentsBtn = document.getElementById("close-comments-modal");
  if (closeCommentsBtn) {
    closeCommentsBtn.addEventListener("click", closeCommentsModal);
  }
  if (commentsModal) {
    commentsModal.addEventListener("click", (e) => {
      if (e.target === commentsModal) closeCommentsModal();
    });
  }

  const chatCommentsBtn = document.getElementById("chat-header-comments-btn");
  if (chatCommentsBtn) {
    chatCommentsBtn.addEventListener("click", () => {
      const charId = state.activeSession?.character?.id || state.activeSession?.character_id;
      if (charId) openCharacterComments(charId);
    });
  }

  const chatMobCommentsBtn = document.getElementById("chat-mobile-comments-btn");
  if (chatMobCommentsBtn) {
    chatMobCommentsBtn.addEventListener("click", () => {
      const charId = state.activeSession?.character?.id || state.activeSession?.character_id;
      if (charId) openCharacterComments(charId);
    });
  }

  document.querySelectorAll("#reaction-tag-selector .reaction-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      triggerHaptic(8);
      document.querySelectorAll("#reaction-tag-selector .reaction-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  document.querySelectorAll(".comment-sort-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      triggerHaptic(8);
      const sort = tab.dataset.commentSort || "top";
      if (state.activeCommentsCharId) {
        renderCommentsFeed(state.activeCommentsCharId, sort);
      }
    });
  });

  const commentForm = document.getElementById("comment-compose-form");
  if (commentForm) {
    commentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const charId = state.activeCommentsCharId;
      if (!charId) return;

      const input = document.getElementById("comment-input-text");
      const text = input ? input.value.trim() : "";
      if (!text) return;

      const activeReactionChip = document.querySelector("#reaction-tag-selector .reaction-chip.active");
      const reactionTag = activeReactionChip ? activeReactionChip.dataset.reactionTag || "Peak" : "Peak";

      const tie = getTieForCharacter(charId);
      const tieInfo = {
        level: tie.level,
        stage: tie.stage,
        badgeClass: tie.badgeClass,
        icon: tie.icon,
      };

      const authorName = state.user?.display_name || "You";
      const authorAvatar = state.user?.avatar_url
        ? window.api.resolveAssetUrl(state.user.avatar_url)
        : getFallbackAvatar(authorName, "Female", "User");

      triggerHaptic(12);
      try {
        if (window.api?.postCharacterComment) {
          await window.api.postCharacterComment(charId, {
            author_name: authorName,
            author_avatar: authorAvatar,
            author_tie: tieInfo,
            reaction_tag: reactionTag,
            text,
            is_mine: true,
            is_pro: isSoraProActive(),
          });
        }
        if (input) input.value = "";
        renderCommentsFeed(charId, state.activeCommentSort || "top");
        updateAllCommentBadges(charId);
        showToast("Comment posted 💬");
      } catch (err) {
        showToast(`Could not post comment: ${err.message}`);
      }
    });
  }

  // --- Character Core Memories Event Wiring ---
  const openMemoriesBtn = document.getElementById("open-core-memories-btn");
  if (openMemoriesBtn) {
    openMemoriesBtn.addEventListener("click", () => {
      const charId = state.activeSession?.character?.id || state.activeSession?.character_id;
      if (charId) openCoreMemoriesModal(charId);
    });
  }

  const mobMemoriesBtn = document.getElementById("chat-mobile-memories-btn");
  if (mobMemoriesBtn) {
    mobMemoriesBtn.addEventListener("click", () => {
      const charId = state.activeSession?.character?.id || state.activeSession?.character_id;
      if (charId) openCoreMemoriesModal(charId);
    });
  }

  const closeMemoriesBtn = document.getElementById("close-memories-modal");
  const memModal = document.getElementById("core-memories-modal");
  const closeMemModal = () => {
    triggerHaptic(8);
    if (window.history.state?.view === "memories-modal") {
      window.history.back();
    } else if (memModal) {
      memModal.classList.add("hidden");
    }
  };
  if (closeMemoriesBtn) closeMemoriesBtn.addEventListener("click", closeMemModal);
  if (memModal) {
    memModal.addEventListener("click", (e) => {
      if (e.target === memModal) closeMemModal();
    });
  }

  const addMemForm = document.getElementById("add-core-memory-form");
  if (addMemForm) {
    addMemForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("new-core-memory-input");
      const val = input ? input.value.trim() : "";
      if (!val || !state.activeMemoriesCharId) return;
      addCharacterCoreMemory(state.activeMemoriesCharId, val);
      if (input) input.value = "";
      renderCoreMemoriesList(state.activeMemoriesCharId);
    });
  }

  const clearAllMemBtn = document.getElementById("clear-all-memories-btn");
  if (clearAllMemBtn) {
    clearAllMemBtn.addEventListener("click", () => {
      if (!state.activeMemoriesCharId) return;
      if (!confirm("Clear all pinned core memories for this character?")) return;
      triggerHaptic(12);
      saveCharacterCoreMemories(state.activeMemoriesCharId, []);
      renderCoreMemoriesList(state.activeMemoriesCharId);
      showToast("All core memories cleared");
    });
  }

  // --- Hardware & Gesture Navigation (Android Back Button & Popstate) ---
  function handleHardwareBack() {
    const coreMemoriesModal = document.getElementById("core-memories-modal");
    if (coreMemoriesModal && !coreMemoriesModal.classList.contains("hidden")) {
      coreMemoriesModal.classList.add("hidden");
      return true;
    }
    const commentsModal = document.getElementById("comments-modal");
    if (commentsModal && !commentsModal.classList.contains("hidden")) {
      commentsModal.classList.add("hidden");
      return true;
    }
    const mobileSheet = document.getElementById("chat-mobile-sheet");
    if (mobileSheet && !mobileSheet.classList.contains("hidden")) {
      mobileSheet.classList.add("hidden");
      return true;
    }
    const premiumModal = document.getElementById("premium-modal");
    if (premiumModal && !premiumModal.classList.contains("hidden")) {
      premiumModal.classList.add("hidden");
      return true;
    }
    const authModal = document.getElementById("auth-modal");
    if (authModal && !authModal.classList.contains("hidden")) {
      authModal.classList.add("hidden");
      return true;
    }
    const chatDrawer = document.getElementById("chat-drawer");
    if (chatDrawer && !chatDrawer.classList.contains("hidden")) {
      chatDrawer.classList.add("hidden");
      document.body.classList.remove("chat-active");
      loadSessions();
      return true;
    }
    const activeTab = document.querySelector(".tab-panel.active");
    if (activeTab && activeTab.id !== "tab-discover") {
      switchTab("discover", false);
      return true;
    }
    return false;
  }

  window.addEventListener("popstate", (e) => {
    const handled = handleHardwareBack();
    if (!handled && e.state?.tab) {
      switchTab(e.state.tab, false);
    }
  });

  // Web OAuth callback handling on boot
  if (window.location.search && (window.location.search.includes("token=") || window.location.search.includes("access_token="))) {
    handleOAuthCallbackUrl(window.location.href);
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (_) {}
  }

  // Capacitor native hardware back-button & deep-link integration
  if (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.App) {
    window.Capacitor.Plugins.App.addListener("backButton", () => {
      const handled = handleHardwareBack();
      if (!handled) {
        window.Capacitor.Plugins.App.exitApp();
      }
    });

    window.Capacitor.Plugins.App.addListener("appUrlOpen", (event) => {
      if (event?.url) {
        handleOAuthCallbackUrl(event.url);
      }
    });
  }
}
