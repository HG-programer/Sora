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

class HaruEmochiAPI {
  constructor() {
    this._inFlightRequests = new Map();
  }

  getBaseUrl() {
    const saved = (localStorage.getItem(STORAGE_KEYS.SERVER_URL) || "").trim();
    if (saved) return saved.replace(/\/+$/, "");
    return "";
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
    if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    else localStorage.removeItem(STORAGE_KEYS.TOKEN);
  }

  getByokKeys() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.BYOK) || "{}");
    } catch {
      return {};
    }
  }

  setByokKeys(keysObj) {
    localStorage.setItem(STORAGE_KEYS.BYOK, JSON.stringify(keysObj || {}));
  }

  hasPremiumPass() {
    return localStorage.getItem(STORAGE_KEYS.PREMIUM_PASS) === "active";
  }

  setPremiumPass(active) {
    if (active) localStorage.setItem(STORAGE_KEYS.PREMIUM_PASS, "active");
    else localStorage.removeItem(STORAGE_KEYS.PREMIUM_PASS);
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
          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ timestamp: Date.now(), data: freshData })
            );
          } catch (storageErr) {
            console.warn("SWR localStorage write failed:", storageErr);
          }

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
        messages = payload.local_messages || [
          {
            role: "system",
            content: `You are ${payload.character_name || "a character"} in an interactive creative fiction roleplay. Stay strictly in character. Write expressive, sensory, descriptive prose. ${payload.personality ? "Personality: " + payload.personality : ""} ${payload.scenario ? "Scenario: " + payload.scenario : ""}`
          },
          { role: "user", content: payload.content || "" }
        ];
      }

      if (onMeta) onMeta({ type: "meta", user_message_id: userMsgId, model: freeSpec.label });

      if (freeSpec.hint && messages.length > 0 && messages[0].role === "system") {
        messages[0] = {
          role: "system",
          content: `${messages[0].content}\n${freeSpec.hint}`,
        };
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
}

window.api = new HaruEmochiAPI();
