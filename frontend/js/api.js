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
  "haru-core": { label: "Sora Core v2", temp: 0.82, hint: "" },
  "haru-velvet": {
    label: "Sora Velvet",
    temp: 0.92,
    hint: "(Style directive: Expressive, emotionally nuanced, unfiltered creative fiction and character chemistry.)",
  },
  "haru-noir": {
    label: "Sora Noir",
    temp: 0.88,
    hint: "(Style directive: Atmospheric, grounded narrative detail, strong environmental sensory pacing.)",
  },
  "haru-pulse": {
    label: "Sora Pulse",
    temp: 0.74,
    hint: "(Style directive: Crisp, natural, fast-paced conversational dialogue.)",
  },
  "haru-rp-v1": { label: "Sora Core v2", temp: 0.82, hint: "" },
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

  async streamMessage(sessionId, payload, { onMeta, onToken, onDone, onError }) {
    const model = payload.model || "haru-core";
    const freeSpec = HARU_FREE_MODELS[model] || HARU_FREE_MODELS["haru-core"];
    const byok = this.getByokKeys();

    // Use distributed client-side inference for standard Haru free-tier models
    // unless the developer/user explicitly configured an upstream key override
    const hasCustomOverride =
      (model in { "haru-velvet": 1, "haru-noir": 1 } && byok.openrouter) ||
      (model === "haru-pulse" && (byok.groq || byok.gemini));

    if (freeSpec && !hasCustomOverride) {
      let messages = null;
      let userMsgId = null;

      try {
        const prep = await this.request(`/api/v1/sessions/${sessionId}/prepare`, {
          method: "POST",
          body: JSON.stringify(payload),
          timeout: 2500,
        });
        userMsgId = prep.user_message_id;
        messages = [...(prep.llm_messages || [])];
      } catch {
        // Fallback for standalone/offline APK: assemble prompt locally
        userMsgId = `user_${Date.now()}`;
        const tieDirective = payload.tie ? `\n[Relationship Bond: ${payload.tie.stage} (Level ${payload.tie.level}). Reflect this affinity naturally in dialogue tone.]` : "";
        const memoriesDirective = payload.core_memories && payload.core_memories.length > 0
          ? `\n[Core Memories (Pivotal facts/promises you must always remember):\n${payload.core_memories.map((m) => `- ${m}`).join("\n")}]`
          : "";
        const personaDirective = payload.user_persona
          ? `\n[User Persona: ${payload.user_persona.name}${payload.user_persona.role ? ` (${payload.user_persona.role})` : ""}${payload.user_persona.description ? ` - ${payload.user_persona.description}` : ""}]`
          : "";

        messages = payload.local_messages || [
          {
            role: "system",
            content: `You are ${payload.character_name || "a character"} in an interactive creative fiction roleplay. Stay strictly in character. Write expressive, sensory, descriptive prose. ${payload.personality ? "Personality: " + payload.personality : ""} ${payload.scenario ? "Scenario: " + payload.scenario : ""}${tieDirective}${memoriesDirective}${personaDirective}`
          },
          { role: "user", content: payload.content || "" }
        ];
      }

      if (onMeta) onMeta({ type: "meta", user_message_id: userMsgId, model: freeSpec.label });

      if (messages.length > 0 && messages[0].role === "system") {
        let extra = "";
        if (payload.tie && !messages[0].content.includes("[Relationship Bond:")) {
          extra += `\n[Relationship Bond: ${payload.tie.stage} (Level ${payload.tie.level}). Reflect this affinity naturally in dialogue tone.]`;
        }
        if (payload.core_memories && payload.core_memories.length > 0 && !messages[0].content.includes("[Core Memories")) {
          extra += `\n[Core Memories:\n${payload.core_memories.map((m) => `- ${m}`).join("\n")}]`;
        }
        if (payload.user_persona && !messages[0].content.includes("[User Persona:")) {
          extra += `\n[User Persona: ${payload.user_persona.name}${payload.user_persona.role ? ` (${payload.user_persona.role})` : ""}${payload.user_persona.description ? ` - ${payload.user_persona.description}` : ""}]`;
        }
        if (freeSpec.hint) {
          extra += `\n${freeSpec.hint}`;
        }
        if (extra) {
          messages[0] = {
            role: "system",
            content: `${messages[0].content}${extra}`,
          };
        }
      }

      try {
        const llmResp = await fetch(DISTRIBUTED_GATEWAY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai-fast",
            messages,
            temperature: freeSpec.temp,
          }),
        });

        if (llmResp.ok) {
          const llmData = await llmResp.json();
          const content = (llmData.choices?.[0]?.message?.content || "").trim();
          if (content) {
            const words = content.split(" ");
            for (let i = 0; i < words.length; i++) {
              const chunk = words[i] + (i < words.length - 1 ? " " : "");
              if (onToken) onToken(chunk);
              await new Promise((r) => setTimeout(r, 12));
            }
            try {
              const saved = await this.request(`/api/v1/sessions/${sessionId}/save_assistant`, {
                method: "POST",
                body: JSON.stringify({ content, model: freeSpec.label }),
                timeout: 2500,
              });
              if (onDone) onDone({ type: "done", message_id: saved.message_id, model: freeSpec.label, content });
              return;
            } catch {
              if (onDone) onDone({ type: "done", message_id: `asst_${Date.now()}`, model: freeSpec.label, content });
              return;
            }
          }
        }
      } catch (err) {
        console.warn("Distributed client-side gateway failed:", err);
      }
    }

    const url = `${this.getBaseUrl()}/api/v1/sessions/${sessionId}/stream`;
    const headers = {
      "Content-Type": "application/json",
    };
    const token = this.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          api_keys: this.getByokKeys(),
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `Stream error (${resp.status})`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const block of parts) {
          const line = block.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "meta" && onMeta) onMeta(event);
            else if (event.type === "token" && onToken) onToken(event.content);
            else if (event.type === "done" && onDone) onDone(event);
          } catch {}
        }
      }
    } catch (err) {
      if (onError) onError(err);
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
