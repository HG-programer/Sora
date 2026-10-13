# backend/adapters/__init__.py
import os
from config import (
    GROQ_API_KEY,
    GOOGLE_API_KEY,
    OPENAI_API_KEY,
    HF_API_KEY,
    OLLAMA_BASE_URL,
)
from .base_adapter import AsyncLLMAdapter, build_roleplay_system_prompt, close_http_client
from .roleplay_engine import HaruRoleplayEngineAdapter
from .groq_adapter import GroqAdapter
from .gemini_adapter import GeminiAdapter
from .openai_adapter import OpenAIAdapter
from .hf_adapter import HuggingFaceAdapter
from .ollama_adapter import OllamaAdapter
from .openrouter_grok_adapter import OpenAICompatibleAdapter

XAI_API_KEY = os.getenv("XAI_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

# ==============================================================================
# INTERNAL DEVELOPER MAPPING (Server-Side Only — Hidden from Frontend Users)
# ==============================================================================
# Free Tier (Custom Branded Names in UI -> Actual Upstream Free Models):
#   - "haru-core"   ("Haru Core v2")   -> Keyless GPT-OSS 20B (Pollinations OVH)
#   - "haru-velvet" ("Haru Velvet")    -> Dolphin 3.0 Mistral 24B Uncensored (:free) / Keyless 20B fallback
#   - "haru-noir"   ("Haru Noir")      -> Mistral Nemo 12B Uncensored (:free) / Keyless 20B fallback
#   - "haru-pulse"  ("Haru Pulse")     -> Groq Llama 3.3 70B / Gemini Flash BLOCK_NONE / Keyless 20B fallback
#
# Premium Tier (Transparently Disclosed for User Purchase Confidence):
#   - "xai-grok-2"          -> xAI Grok-2 Latest (128k context, Unfiltered)
#   - "openrouter-hermes-3" -> Nous Hermes 3 Llama 3.1 405B (128k context, Uncensored)
#   - "openai-gpt-4o"       -> OpenAI GPT-4o (128k context, Flagship)
#   - "gemini-2.0-pro"      -> Google Gemini 2.0 Flash/Pro (1M+ context, BLOCK_NONE)
# ==============================================================================

INTERNAL_OPENROUTER_MAP = {
    "haru-velvet": "cognitivecomputations/dolphin3.0-mistral-24b:free",
    "haru-noir": "mistralai/mistral-nemo:free",
    "openrouter-hermes-3": "nousresearch/hermes-3-llama-3.1-405b:free",
}

AVAILABLE_MODELS = [
    # --- FREE TIER: Custom Proprietary Names (Underlying provider hidden from users) ---
    {
        "id": "haru-core",
        "name": "Haru Core v2",
        "provider": "Haru Engine",
        "tier": "free",
        "badge": "Included · Standard",
        "description": "Balanced dialogue, character consistency, and situational awareness.",
        "requires_key": False,
    },
    {
        "id": "haru-velvet",
        "name": "Haru Velvet",
        "provider": "Haru Engine",
        "tier": "free",
        "badge": "Included · Unfiltered RP",
        "description": "Tuned for expressive creative writing, romance, and unrestricted roleplay.",
        "requires_key": False,
    },
    {
        "id": "haru-noir",
        "name": "Haru Noir",
        "provider": "Haru Engine",
        "tier": "free",
        "badge": "Included · Narrative",
        "description": "Focused on atmospheric storytelling, dark fantasy, and long-form plotlines.",
        "requires_key": False,
    },
    {
        "id": "haru-pulse",
        "name": "Haru Pulse",
        "provider": "Haru Engine",
        "tier": "free",
        "badge": "Included · Low Latency",
        "description": "High-speed conversational engine for rapid back-and-forth exchanges.",
        "requires_key": False,
    },
    # --- PREMIUM TIER: Full Transparency for User Purchases ---
    {
        "id": "xai-grok-2",
        "name": "xAI Grok-2 (Unfiltered)",
        "provider": "xAI (Verified)",
        "tier": "premium",
        "badge": "Premium · 128k Context",
        "description": "Official xAI Grok-2 flagship model with permissive creative fiction alignment.",
        "requires_key": True,
    },
    {
        "id": "openrouter-hermes-3",
        "name": "Nous Hermes 3 · Llama 3.1 405B",
        "provider": "Nous Research (Verified)",
        "tier": "premium",
        "badge": "Premium · 405B Parameters",
        "description": "Frontier 405B parameter uncensored roleplay model by Nous Research.",
        "requires_key": True,
    },
    {
        "id": "openai-gpt-4o",
        "name": "OpenAI GPT-4o",
        "provider": "OpenAI (Verified)",
        "tier": "premium",
        "badge": "Premium · 128k Context",
        "description": "OpenAI's flagship multimodal reasoning model for complex logic and world-building.",
        "requires_key": True,
    },
    {
        "id": "gemini-2.0-pro",
        "name": "Google Gemini 2.0 (1M Context)",
        "provider": "Google DeepMind (Verified)",
        "tier": "premium",
        "badge": "Premium · 1M Context",
        "description": "Massive 1,000,000-token context window for book-length memory retention.",
        "requires_key": True,
    },
]

PUBLIC_DISPLAY_NAMES = {m["id"]: m["name"] for m in AVAILABLE_MODELS}
PUBLIC_DISPLAY_NAMES["haru-rp-v1"] = "Haru Core v2"


def get_public_model_label(model_id: str) -> str:
    return PUBLIC_DISPLAY_NAMES.get(model_id, "Haru Core v2")


def get_adapter(
    model_name: str,
    client_keys: dict[str, str] | None = None,
) -> tuple[AsyncLLMAdapter, str]:
    """
    Routes custom Haru free-tier IDs and transparent Premium IDs to their actual
    underlying adapters while returning the clean public model ID.
    """
    keys = client_keys or {}
    norm_model = "haru-core" if model_name in ("haru-rp-v1", "haru-core", "") else model_name

    # --- 1. FREE TIER CUSTOM MODELS ---
    if norm_model == "haru-core":
        return HaruRoleplayEngineAdapter(), "Haru Core v2"

    if norm_model in ("haru-velvet", "haru-noir"):
        label = "Haru Velvet" if norm_model == "haru-velvet" else "Haru Noir"
        or_key = keys.get("openrouter") or OPENROUTER_API_KEY
        if or_key:
            return (
                OpenAICompatibleAdapter(
                    api_key=or_key,
                    base_url="https://openrouter.ai/api/v1/chat/completions",
                    model_map=INTERNAL_OPENROUTER_MAP,
                ),
                label,
            )
        return HaruRoleplayEngineAdapter(), label

    if norm_model == "haru-pulse":
        groq_key = keys.get("groq") or GROQ_API_KEY
        if groq_key:
            return GroqAdapter(api_key=groq_key), "Haru Pulse"
        gem_key = keys.get("gemini") or GOOGLE_API_KEY
        if gem_key:
            return GeminiAdapter(api_key=gem_key), "Haru Pulse"
        return HaruRoleplayEngineAdapter(), "Haru Pulse"

    # --- 2. TRANSPARENT PREMIUM MODELS ---
    if norm_model.startswith("xai-"):
        key = keys.get("xai") or XAI_API_KEY
        if key:
            return (
                OpenAICompatibleAdapter(
                    api_key=key,
                    base_url="https://api.x.ai/v1/chat/completions",
                    model_map={"xai-grok-2": "grok-2-latest"},
                ),
                "xAI Grok-2",
            )
        return HaruRoleplayEngineAdapter(), "Haru Core v2"

    if norm_model == "openrouter-hermes-3":
        key = keys.get("openrouter") or OPENROUTER_API_KEY
        if key:
            return (
                OpenAICompatibleAdapter(
                    api_key=key,
                    base_url="https://openrouter.ai/api/v1/chat/completions",
                    model_map=INTERNAL_OPENROUTER_MAP,
                ),
                "Nous Hermes 3 405B",
            )
        return HaruRoleplayEngineAdapter(), "Haru Core v2"

    if norm_model.startswith("openai-"):
        key = keys.get("openai") or OPENAI_API_KEY
        if key:
            return OpenAIAdapter(api_key=key), "OpenAI GPT-4o"
        return HaruRoleplayEngineAdapter(), "Haru Core v2"

    if norm_model.startswith("gemini-"):
        key = keys.get("gemini") or GOOGLE_API_KEY
        if key:
            return GeminiAdapter(api_key=key), "Google Gemini 2.0"
        return HaruRoleplayEngineAdapter(), "Haru Core v2"

    if norm_model.startswith("groq-"):
        key = keys.get("groq") or GROQ_API_KEY
        if key:
            return GroqAdapter(api_key=key), "Haru Pulse"
        return HaruRoleplayEngineAdapter(), "Haru Pulse"

    if norm_model.startswith("hf-"):
        key = keys.get("hf") or HF_API_KEY
        if key:
            return HuggingFaceAdapter(api_key=key), norm_model
        return HaruRoleplayEngineAdapter(), "Haru Core v2"

    if norm_model.startswith("ollama-"):
        ollama_url = keys.get("ollama_url") or OLLAMA_BASE_URL
        return OllamaAdapter(base_url=ollama_url), "Haru Local"

    return HaruRoleplayEngineAdapter(), "Haru Core v2"


def get_adapters_status(client_keys: dict[str, str] | None = None) -> list[dict]:
    keys = client_keys or {}
    statuses = []
    for m in AVAILABLE_MODELS:
        mid = m["id"]
        tier = m["tier"]
        if tier == "free":
            ready = True
            mode = "Included in Free Tier · Active"
        else:
            ready = False
            if mid.startswith("xai-"):
                ready = bool(keys.get("xai") or XAI_API_KEY)
            elif mid == "openrouter-hermes-3":
                ready = bool(keys.get("openrouter") or OPENROUTER_API_KEY)
            elif mid.startswith("openai-"):
                ready = bool(keys.get("openai") or OPENAI_API_KEY)
            elif mid.startswith("gemini-"):
                ready = bool(keys.get("gemini") or GOOGLE_API_KEY)
            mode = "Unlocked · Active" if ready else "Premium Plan Required"

        statuses.append({
            **m,
            "ready": ready,
            "status_text": mode,
        })
    return statuses
