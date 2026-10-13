# backend/adapters/base_adapter.py
from abc import ABC, abstractmethod
from typing import AsyncGenerator
import httpx

# Shared async HTTP client with connection pooling for high concurrency (thousands of users)
_shared_http_client: httpx.AsyncClient | None = None

def get_http_client() -> httpx.AsyncClient:
    global _shared_http_client
    if _shared_http_client is None or _shared_http_client.is_closed:
        limits = httpx.Limits(max_keepalive_connections=100, max_connections=500)
        _shared_http_client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0), limits=limits)
    return _shared_http_client

async def close_http_client():
    global _shared_http_client
    if _shared_http_client and not _shared_http_client.is_closed:
        await _shared_http_client.aclose()


def build_roleplay_system_prompt(
    character: dict,
    user_persona: dict | None = None,
    memory_notes: str = "",
) -> str:
    """
    Compiles an Emochi-style immersive roleplay system prompt from character
    lore, personality, scenario, example dialogue, and the user's persona.
    """
    char_name = character.get("name", "Companion")
    tagline = character.get("tagline", "")
    personality = character.get("personality", "")
    backstory = character.get("backstory", "")
    scenario = character.get("scenario", "")
    example_dialogue = character.get("example_dialogue", "")

    user_name = user_persona.get("name", "Traveler") if user_persona else "Traveler"
    user_desc = user_persona.get("description", "") if user_persona else ""

    parts = [
        f"You are roleplaying as {char_name} ({tagline}).",
        "Stay 100% in character at all times. Never break character or mention being an AI.",
        "Format your responses in immersive Emochi roleplay style:",
        "- Wrap physical actions, facial expressions, and scene narration in *single asterisks* (e.g., *leans against the neon-lit railing and smirks*).",
        "- Write spoken dialogue naturally in quotes or plain text.",
        "- Be vivid, emotionally expressive, reactive to the user's actions, and drive the story forward.",
        "",
        f"### {char_name}'s Personality & Traits:\n{personality}",
    ]

    if backstory:
        parts.append(f"\n### {char_name}'s Backstory & Lore:\n{backstory}")
    if scenario:
        parts.append(f"\n### Current Scenario / Setting:\n{scenario}")
    if example_dialogue:
        parts.append(f"\n### Example Dialogue Style:\n{example_dialogue}")

    parts.append(f"\n### User Persona (Who you are talking to):\nName: {user_name}")
    if user_desc:
        parts.append(f"Details: {user_desc}")

    if memory_notes and memory_notes.strip():
        parts.append(f"\n### Important Story Memory & Pinned Notes:\n{memory_notes.strip()}")

    return "\n".join(parts)


class AsyncLLMAdapter(ABC):
    """
    Upgraded Async LLM Adapter (evolved from Haru-Gpt's LLMAdapter)
    supporting non-blocking async I/O and token-by-token streaming for thousands of users.
    """
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    @abstractmethod
    async def generate(self, messages: list[dict[str, str]], model: str) -> str:
        """Non-streaming full completion."""
        pass

    async def generate_stream(
        self, messages: list[dict[str, str]], model: str
    ) -> AsyncGenerator[str, None]:
        """
        Streams chunks of text. Default implementation yields chunks from generate()
        if a concrete adapter doesn't override native SSE streaming.
        """
        full_text = await self.generate(messages, model)
        # Yield in smooth word-sized chunks
        words = full_text.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
