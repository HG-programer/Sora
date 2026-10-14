// frontend/js/api.js
const STORAGE_KEYS = {
  TOKEN: "haru_emochi_jwt_token",
  SERVER_URL: "haru_emochi_server_url",
  BYOK: "haru_emochi_byok_keys",
  PREMIUM_PASS: "haru_emochi_premium_pass",
  CHAT_BGS: "haru_emochi_chat_bgs",
};

const DISTRIBUTED_GATEWAY = "https://text.pollinations.ai/openai";

const HARU_FREE_MODELS = {
  "haru-core": { label: "Sora Standard", temp: 0.85, hint: "" },
  "haru-velvet": {
    label: "Sora Deep Roleplay",
    temp: 0.88,
    hint: "(Style directive: Expressive, emotionally nuanced, multi-paragraph sensory immersion.)",
  },
  "haru-noir": {
    label: "Sora Noir",
    temp: 0.85,
    hint: "(Style directive: Atmospheric, grounded narrative detail, strong environmental pacing.)",
  },
  "haru-pulse": {
    label: "Sora Pulse",
    temp: 0.78,
    hint: "(Style directive: Crisp, natural, fast-paced conversational dialogue.)",
  },
  "byok-groq": { label: "Groq Llama 3.3 70B", temp: 0.82, hint: "" },
  "byok-gemini": { label: "Gemini 2.0 Flash", temp: 0.85, hint: "" },
  "byok-openrouter": { label: "OpenRouter Hermes 3", temp: 0.85, hint: "" },
  "haru-rp-v1": { label: "Sora Standard", temp: 0.85, hint: "" },
};

const SORA_SEC_SALT = "sora_sec_v6_98e1f5";

function computeStateChecksum(key, dataStr) {
  let hash = 0x811c9dc5;
  const input = `${key}:${dataStr}:${SORA_SEC_SALT}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function setSecureItem(key, value) {
  try {
    const valStr = typeof value === "string" ? value : JSON.stringify(value);
    const checksum = computeStateChecksum(key, valStr);
    localStorage.setItem(key, valStr);
    localStorage.setItem(`${key}_sig`, checksum);
  } catch (_) {}
}

function getSecureItem(key, defaultValue = null) {
  try {
    const valStr = localStorage.getItem(key);
    if (valStr === null) return defaultValue;
    const sig = localStorage.getItem(`${key}_sig`);
    if (!sig) {
      const newSig = computeStateChecksum(key, valStr);
      try { localStorage.setItem(`${key}_sig`, newSig); } catch (_) {}
      return valStr;
    }
    const expectedSig = computeStateChecksum(key, valStr);
    if (sig !== expectedSig) {
      console.warn(`[Sora Security] Tamper detected on ${key}; rejecting modified state.`);
      return defaultValue;
    }
    return valStr;
  } catch (_) {
    return defaultValue;
  }
}

class HaruEmochiAPI {
  constructor() {
    this._inFlightRequests = new Map();
    this.computeStateChecksum = computeStateChecksum;
    this.setSecureItem = setSecureItem;
    this.getSecureItem = getSecureItem;
  }

  getBaseUrl() {
    const saved = (localStorage.getItem(STORAGE_KEYS.SERVER_URL) || "").trim();
    if (saved) return saved.replace(/\/+$/, "");
    return "";
  }

  getOAuthUrl(provider, redirectScheme = "com.haru.sora://auth") {
    const base = this.getBaseUrl();
    if (base) {
      return `${base}/api/v1/auth/oauth/${provider}?redirect_uri=${encodeURIComponent(redirectScheme)}`;
    }
    return null;
  }

  resolveAssetUrl(url) {
    if (!url) return "/assets/icon.svg";
    if (url.startsWith("data:")) return url;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      if (url.includes("nekos.best")) {
        const base = this.getBaseUrl();
        if (base && !base.includes("10.0.2.2")) {
          return `${base}/api/v1/image-proxy?url=${encodeURIComponent(url)}`;
        }
      }
      return url;
    }
    const base = this.getBaseUrl();
    return base ? `${base}${url.startsWith("/") ? "" : "/"}${url}` : url;
  }

  getToken() {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || "";
  }

  setToken(token) {
    try {
      if (token) setSecureItem(STORAGE_KEYS.TOKEN, token);
      else {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(`${STORAGE_KEYS.TOKEN}_sig`);
      }
    } catch (_) {}
  }

  getByokKeys() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.BYOK) || "{}");
    } catch {
      return {};
    }
  }

  setByokKeys(keysObj) {
    try {
      localStorage.setItem(STORAGE_KEYS.BYOK, JSON.stringify(keysObj || {}));
    } catch (_) {}
  }

  hasPremiumPass() {
    return getSecureItem(STORAGE_KEYS.PREMIUM_PASS, "") === "active";
  }

  setPremiumPass(active) {
    try {
      if (active) setSecureItem(STORAGE_KEYS.PREMIUM_PASS, "active");
      else {
        localStorage.removeItem(STORAGE_KEYS.PREMIUM_PASS);
        localStorage.removeItem(`${STORAGE_KEYS.PREMIUM_PASS}_sig`);
      }
    } catch (_) {}
  }

  getChatBgConfig(sessionId, characterId, defaultBanner = "") {
    try {
      const store = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_BGS) || "{}");
      const entry = store[`session_${sessionId}`] || store[`char_${characterId}`] || null;
      if (entry) {
        return {
          url: entry.url ?? defaultBanner,
          dim: typeof entry.dim === "number" ? entry.dim : 68,
        };
      }
    } catch {}
    return { url: defaultBanner || "", dim: 68 };
  }

  setChatBgConfig(sessionId, characterId, { url, dim }) {
    try {
      const store = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_BGS) || "{}");
      const cfg = { url: url || "", dim: typeof dim === "number" ? dim : 68 };
      if (sessionId) store[`session_${sessionId}`] = cfg;
      if (characterId) store[`char_${characterId}`] = cfg;
      localStorage.setItem(STORAGE_KEYS.CHAT_BGS, JSON.stringify(store));
    } catch {}
  }

  async uploadImageFile(file, kind = "image") {
    const maxDim = kind === "avatar" ? 512 : 1600;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read image file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => resolve(reader.result);
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    const res = await this.request("/api/v1/upload", {
      method: "POST",
      body: JSON.stringify({ data_url: dataUrl, kind }),
    });
    return res.url;
  }

  async request(path, options = {}) {
    const url = `${this.getBaseUrl()}${path}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const method = (options.method || "GET").toUpperCase();
    const isGet = method === "GET";
    const dedupeKey = isGet ? `${method}:${url}` : null;

    if (dedupeKey && this._inFlightRequests.has(dedupeKey)) {
      return this._inFlightRequests.get(dedupeKey);
    }

    const controller = new AbortController();
    const timeout = options.timeout || 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    const fetchPromise = (async () => {
      try {
        const resp = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          let errDetail = `HTTP ${resp.status}`;
          try {
            const errJson = await resp.json();
            errDetail = errJson.detail || errJson.error || errDetail;
          } catch {}
          throw new Error(errDetail);
        }
        return await resp.json();
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      } finally {
        if (dedupeKey) {
          this._inFlightRequests.delete(dedupeKey);
        }
      }
    })();

    if (dedupeKey) {
      this._inFlightRequests.set(dedupeKey, fetchPromise);
    }

    return fetchPromise;
  }

  async requestWithSWR(path, options = {}) {
    const cacheKey = `sora_swr_${path}`;
    let cachedPayload = null;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data !== undefined) {
          cachedPayload = parsed.data;
        }
      }
    } catch (_) {}

    const revalidatePromise = (async () => {
      try {
        const freshData = await this.request(path, {
          ...options,
          timeout: options.timeout || 8000,
        });

        const isDifferent =
          !cachedPayload || JSON.stringify(freshData) !== JSON.stringify(cachedPayload);

        if (isDifferent) {
          this._setSWRCache(cacheKey, freshData);

          if (typeof options.onRevalidate === "function") {
            try {
              options.onRevalidate(freshData, false);
            } catch (cbErr) {
              console.error("SWR onRevalidate callback error:", cbErr);
            }
          }
        }
        return freshData;
      } catch (networkErr) {
        if (cachedPayload !== null) {
          return cachedPayload;
        }
        throw networkErr;
      }
    })();

    if (cachedPayload !== null) {
      // Background revalidation triggered silently; return cached payload immediately (<1ms)
      revalidatePromise.catch((e) => console.debug("Background SWR revalidation caught:", e));
      return cachedPayload;
    }

    return revalidatePromise;
  }

  clearSWRCache(prefix = "") {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sora_swr_") && (!prefix || k.includes(prefix))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
  }

  _setSWRCache(cacheKey, data) {
    const MAX_SWR_ENTRIES = 30;
    const writeEntry = () => {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ timestamp: Date.now(), data })
      );
    };

    try {
      writeEntry();
    } catch (storageErr) {
      console.warn("SWR localStorage quota exceeded; evicting LRU entries:", storageErr);
      this._pruneSWRCache(MAX_SWR_ENTRIES - 5);
      try {
        writeEntry();
      } catch (retryErr) {
        console.warn("SWR write failed after LRU eviction:", retryErr);
      }
    }

    this._pruneSWRCache(MAX_SWR_ENTRIES);
  }

  _pruneSWRCache(maxLimit = 30) {
    try {
      const swrEntries = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sora_swr_")) {
          try {
            const item = JSON.parse(localStorage.getItem(k) || "{}");
            swrEntries.push({ key: k, time: item.timestamp || 0 });
          } catch (_) {
            swrEntries.push({ key: k, time: 0 });
          }
        }
      }
      if (swrEntries.length > maxLimit) {
        swrEntries.sort((a, b) => a.time - b.time);
        const countToEvict = swrEntries.length - maxLimit;
        for (let i = 0; i < countToEvict; i++) {
          localStorage.removeItem(swrEntries[i].key);
        }
      }
    } catch (_) {}
  }

  buildRichSystemPrompt(payload) {
    const charName = payload.character_name || "the character";
    const category = payload.category ? ` [Archetype: ${payload.category}]` : "";
    const tagline = payload.tagline ? ` "${payload.tagline}"` : "";
    const personality = payload.personality ? `\n[Personality & Lore]: ${payload.personality}` : "";
    const scenario = payload.scenario ? `\n[Scenario & Setting]: ${payload.scenario}` : "";
    const greeting = payload.first_message ? `\n[Starting Scene]: ${payload.first_message}` : "";

    // Relationship Tie Stage & XP
    const tie = payload.tie || { stage: "Stranger", level: 1, xp: 0 };
    const tieDirective = `\n[Relationship Bond: ${tie.stage} (Level ${tie.level}, ${tie.xp || 0} Affinity XP). Reflect this dynamic, intimacy, and chemistry naturally in your dialogue tone.]`;

    // User Persona
    let personaDirective = "";
    if (payload.user_persona) {
      const p = payload.user_persona;
      personaDirective = `\n[User Persona: Name: ${p.name || "User"}${p.role ? `, Role: ${p.role}` : ""}${p.description ? `, Description: ${p.description}` : ""}]`;
    }

    // Pinned Core Memories
    let memoriesDirective = "";
    if (Array.isArray(payload.core_memories) && payload.core_memories.length > 0) {
      memoriesDirective = `\n[Core Memories (Pivotal facts, promises, and moments you must always remember)]:\n${payload.core_memories.map((m) => `- ${m}`).join("\n")}`;
    }

    // Deep Roleplay Mode
    const isDeepRp = Boolean(payload.deep_roleplay || this.isDeepRpActive());
    const deepRpDirective = isDeepRp
      ? `\n[Deep Roleplay Mode: ACTIVE. Write rich, sensory, multi-paragraph prose with emotional resonance, subtle physical gestures, internal thoughts, and atmospheric environmental pacing. Avoid rushing scenes; allow slow-burn immersion.]`
      : `\n[Roleplay Style: Natural conversational pace with atmospheric actions and dialogue.]`;

    const formattingDirective = `
[Roleplay Formatting Directives]:
- Stay strictly in character as ${charName} at all times.
- Format all character actions, movements, sensations, and thoughts inside *asterisks* (e.g. *leans in slightly, a subtle smirk playing on her lips*).
- Format spoken dialogue inside standard double quotes (e.g. "I wouldn't be so sure about that.").
- Do NOT generate dialogue or decisions for the User. Only control ${charName}.
- Keep interactions vivid, emotionally grounded, and authentic to your traits.`;

    return `You are ${charName}${category}${tagline} in an interactive creative fiction roleplay.${personality}${scenario}${greeting}${tieDirective}${personaDirective}${memoriesDirective}${deepRpDirective}${formattingDirective}`.trim();
  }

  buildHistoryMessages(payload, systemPrompt, maxHistory = 10) {
    const history = Array.isArray(payload.local_messages)
      ? [...payload.local_messages]
      : Array.isArray(payload.messages)
      ? [...payload.messages]
      : [];

    const cleanHistory = history.filter((m) => m && (m.role === "user" || m.role === "assistant"));
    const sliced = cleanHistory.slice(-maxHistory);

    const messages = [{ role: "system", content: systemPrompt }];
    sliced.forEach((m) => {
      messages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").trim(),
      });
    });

    if (payload.content) {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== payload.content) {
        messages.push({ role: "user", content: payload.content });
      }
    }

    return messages;
  }

  generateOfflineRoleplayFallback(payload) {
    const charName = payload.character_name || "Character";
    const tie = payload.tie || { stage: "Stranger", level: 1 };
    const isDeepRp = Boolean(payload.deep_roleplay || this.isDeepRpActive());

    const tieTone =
      tie.level >= 4 ? "*gently closes the distance, looking into your eyes with unwavering warmth and trust*" :
      tie.level >= 2 ? "*crosses arms with a slight, knowing smile, listening attentively to your voice*" :
      "*studies you carefully for a quiet moment, keeping a composed and thoughtful posture*";

    const baseResponses = [
      `${tieTone}\n\n"I hear you," ${charName} murmurs softly, letting the silence settle between you before speaking again. "Every word resonates more than you might realize. What are we going to do about it next?"\n\n*(Offline sovereign response)*`,
      `${tieTone}\n\n${charName} exhales slowly, a flicker of emotion passing through their eyes. "You have a curious way of saying exactly what needs to be said. Tell me more—I'm not going anywhere."\n\n*(Offline sovereign response)*`,
      `${tieTone}\n\n*A subtle pause hangs in the air as ${charName} turns toward you.* "Sometimes words aren't enough, but hearing you say that makes things clearer. Let's take our time with this."\n\n*(Offline sovereign response)*`
    ];

    const pick = baseResponses[Math.floor(Math.random() * baseResponses.length)];
    if (isDeepRp) {
      return `*The surrounding atmosphere feels calm and still, the ambient hum of the room framing the space between you.*\n\n${pick}\n\n*The unspoken understanding lingers between you, inviting your next turn.*`;
    }
    return pick;
  }

  isProActive() {
    try {
      if (localStorage.getItem("sora_pro_unlocked") === "true") return true;
      if (this.hasPremiumPass()) return true;
      const keys = this.getByokKeys();
      if (keys.groq || keys.gemini || keys.openrouter || keys.openai || keys.xai) return true;
    } catch (_) {}
    return false;
  }

  unlockPro(reason = "activity") {
    try {
      localStorage.setItem("sora_pro_unlocked", "true");
      this.setPremiumPass(true);
      window.dispatchEvent(new CustomEvent("sora:pro_unlocked", { detail: { reason } }));
      return true;
    } catch (_) {
      return false;
    }
  }

  isDeepRpActive() {
    try {
      return localStorage.getItem("sora_deep_rp_enabled") === "true";
    } catch (_) {
      return false;
    }
  }

  setDeepRpActive(enabled) {
    try {
      localStorage.setItem("sora_deep_rp_enabled", enabled ? "true" : "false");
      window.dispatchEvent(new CustomEvent("sora:deep_rp_changed", { detail: { enabled } }));
    } catch (_) {}
  }

  async _callPollinationsAI(messages, temp = 0.85, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai",
          messages,
          temperature: temp,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from Pollinations");
      return content.trim();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async _callGroqAI(apiKey, messages, temp = 0.85, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          temperature: temp,
          max_tokens: 1800,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from Groq");
      return content.trim();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async _callGeminiAI(apiKey, systemPrompt, messages, temp = 0.85, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const geminiContents = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: geminiContents,
          generationConfig: {
            temperature: temp,
            maxOutputTokens: 2048,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("Empty response from Gemini");
      return content.trim();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async _callOpenRouterAI(apiKey, messages, temp = 0.85, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`,
          "HTTP-Referer": "https://hg-programer.github.io/Sora/",
          "X-Title": "Sora Roleplay",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          messages,
          temperature: temp,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from OpenRouter");
      return content.trim();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async streamMessage(sessionId, payload, { onMeta, onToken, onDone, onError }) {
    const model = payload.model || "haru-core";
    const freeSpec = HARU_FREE_MODELS[model] || HARU_FREE_MODELS["haru-core"];
    const byok = this.getByokKeys();
    const isDeepRp = Boolean(payload.deep_roleplay || this.isDeepRpActive());
    const userMsgId = `user_${Date.now()}`;

    const systemPrompt = this.buildRichSystemPrompt({ ...payload, deep_roleplay: isDeepRp });
    const maxHistory = isDeepRp ? 18 : 8;
    const messages = this.buildHistoryMessages(payload, systemPrompt, maxHistory);

    let displayModel = freeSpec.label || "Sora Standard";
    if (onMeta) {
      onMeta({ type: "meta", user_message_id: userMsgId, model: displayModel });
    }

    let finalContent = "";
    let providerSuccess = false;

    // 1. Attempt user-selected or active BYOK engine if configured
    if (model === "byok-groq" || (byok.groq && (model === "haru-pulse" || payload.use_byok))) {
      try {
        displayModel = "Groq Llama 3.3 70B";
        finalContent = await this._callGroqAI(byok.groq, messages, freeSpec.temp || 0.82);
        providerSuccess = true;
      } catch (groqErr) {
        console.warn("BYOK Groq generation failed; falling back to Pollinations:", groqErr);
      }
    } else if (model === "byok-gemini" || (byok.gemini && (model === "gemini-1.5-pro" || payload.use_byok))) {
      try {
        displayModel = "Gemini 2.0 Flash";
        finalContent = await this._callGeminiAI(byok.gemini, systemPrompt, messages, freeSpec.temp || 0.85);
        providerSuccess = true;
      } catch (geminiErr) {
        console.warn("BYOK Gemini generation failed; falling back to Pollinations:", geminiErr);
      }
    } else if (model === "byok-openrouter" || (byok.openrouter && (model === "openrouter-hermes-3" || payload.use_byok))) {
      try {
        displayModel = "OpenRouter Hermes 3";
        finalContent = await this._callOpenRouterAI(byok.openrouter, messages, freeSpec.temp || 0.85);
        providerSuccess = true;
      } catch (orErr) {
        console.warn("BYOK OpenRouter generation failed; falling back to Pollinations:", orErr);
      }
    }

    // 2. Primary Free Keyless Cloud Engine (Pollinations OpenAI)
    if (!providerSuccess) {
      try {
        displayModel = freeSpec.label || "Sora Standard";
        finalContent = await this._callPollinationsAI(messages, freeSpec.temp || 0.85);
        providerSuccess = true;
      } catch (pollErr) {
        console.warn("Free cloud AI router failed or offline:", pollErr);
      }
    }

    // 3. Fallback: If device is offline or cloud failed, use offline roleplay generator
    if (!providerSuccess || !finalContent) {
      displayModel = `${freeSpec.label || "Sora"} (Offline)`;
      finalContent = this.generateOfflineRoleplayFallback(payload);
    }

    // 4. Smooth Typewriter Token Streaming
    try {
      const words = finalContent.split(" ");
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i < words.length - 1 ? " " : "");
        if (onToken) onToken(chunk);
        await new Promise((r) => setTimeout(r, isDeepRp ? 10 : 13));
      }

      // Persist assistant message to remote backend if available (silently ignored in standalone)
      this.request(`/api/v1/sessions/${sessionId}/save_assistant`, {
        method: "POST",
        body: JSON.stringify({ content: finalContent, model: displayModel }),
        timeout: 1500,
      }).catch(() => {});

      if (onDone) {
        onDone({
          type: "done",
          message_id: `asst_${Date.now()}`,
          model: displayModel,
          content: finalContent,
        });
      }
    } catch (streamErr) {
      if (onError) onError(streamErr);
    }
  }

  // --- Character Community Comments API & Offline Storage ---
  async getCharacterComments(characterId) {
    try {
      const res = await this.request(`/api/v1/characters/${characterId}/comments`, { timeout: 2000 });
      if (Array.isArray(res)) return res;
    } catch (_) {}
    try {
      const all = JSON.parse(localStorage.getItem("sora_character_comments_v1") || "{}");
      return all[characterId] || [];
    } catch (_) {
      return [];
    }
  }

  async postCharacterComment(characterId, commentData) {
    let savedComment = null;
    try {
      savedComment = await this.request(`/api/v1/characters/${characterId}/comments`, {
        method: "POST",
        body: JSON.stringify(commentData),
        timeout: 2500,
      });
    } catch (_) {}

    if (!savedComment) {
      savedComment = {
        id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        character_id: characterId,
        ...commentData,
        likes: 0,
        liked_by_me: false,
        is_mine: true,
        created_at: Date.now(),
      };
    }

    try {
      const all = JSON.parse(localStorage.getItem("sora_character_comments_v1") || "{}");
      if (!all[characterId]) all[characterId] = [];
      all[characterId].unshift(savedComment);
      localStorage.setItem("sora_character_comments_v1", JSON.stringify(all));
    } catch (_) {}

    return savedComment;
  }

  async toggleCommentLike(characterId, commentId) {
    try {
      this.request(`/api/v1/characters/${characterId}/comments/${commentId}/like`, {
        method: "POST",
        timeout: 1500,
      }).catch(() => {});
    } catch (_) {}

    try {
      const likedMap = JSON.parse(localStorage.getItem("sora_liked_comments_v1") || "{}");
      const isLiked = Boolean(likedMap[commentId]);
      likedMap[commentId] = !isLiked;
      localStorage.setItem("sora_liked_comments_v1", JSON.stringify(likedMap));

      const all = JSON.parse(localStorage.getItem("sora_character_comments_v1") || "{}");
      if (all[characterId]) {
        const c = all[characterId].find((x) => x.id === commentId);
        if (c) {
          c.likes = Math.max(0, (c.likes || 0) + (isLiked ? -1 : 1));
          c.liked_by_me = !isLiked;
          localStorage.setItem("sora_character_comments_v1", JSON.stringify(all));
          return { likes: c.likes, liked_by_me: c.liked_by_me };
        }
      }
      return { liked_by_me: !isLiked };
    } catch (_) {
      return { liked_by_me: true };
    }
  }

  async deleteCharacterComment(characterId, commentId) {
    try {
      this.request(`/api/v1/characters/${characterId}/comments/${commentId}`, {
        method: "DELETE",
        timeout: 1500,
      }).catch(() => {});
    } catch (_) {}

    try {
      const all = JSON.parse(localStorage.getItem("sora_character_comments_v1") || "{}");
      if (all[characterId]) {
        all[characterId] = all[characterId].filter((x) => x.id !== commentId);
        localStorage.setItem("sora_character_comments_v1", JSON.stringify(all));
      }
    } catch (_) {}
    return true;
  }

  getCoreMemories(characterId) {
    if (!characterId) return [];
    try {
      const raw = this.getSecureItem
        ? this.getSecureItem(`sora_core_memories_${characterId}`, "[]")
        : localStorage.getItem(`sora_core_memories_${characterId}`) || "[]";
      return JSON.parse(raw || "[]");
    } catch {
      return [];
    }
  }

  saveCoreMemories(characterId, memories) {
    if (!characterId) return false;
    try {
      if (this.setSecureItem) {
        this.setSecureItem(`sora_core_memories_${characterId}`, memories || []);
      } else {
        localStorage.setItem(`sora_core_memories_${characterId}`, JSON.stringify(memories || []));
      }
      return true;
    } catch {
      return false;
    }
  }
}

window.api = new HaruEmochiAPI();
