# backend/adapters/roleplay_engine.py
import asyncio
import hashlib
import json
import re
from typing import AsyncGenerator
from .base_adapter import AsyncLLMAdapter, get_http_client


class HaruRoleplayEngineAdapter(AsyncLLMAdapter):
    """
    Zero-Key Uncensored Roleplay Engine ('haru-rp-v1').
    1. Primary: Calls the live keyless GPT-OSS 20B open-weight LLM endpoint
       (no API key required from server or user).
    2. Fallback: Uses the local offline response generator if the machine is offline
       or under heavy synthetic load-testing.
    """
    KEYLESS_API_URL = "https://text.pollinations.ai/openai"

    def __init__(self, api_key: str = "keyless"):
        super().__init__(api_key)

    async def generate(self, messages: list[dict[str, str]], model: str) -> str:
        if model != "haru-offline":
            try:
                client = get_http_client()
                payload = {
                    "model": "openai-fast",
                    "messages": messages,
                    "temperature": 0.85,
                }
                resp = await client.post(self.KEYLESS_API_URL, json=payload, timeout=22.0)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if content and content.strip():
                        return content.strip()
            except Exception:
                pass

        return self._offline_fallback(messages)

    async def generate_stream(
        self, messages: list[dict[str, str]], model: str
    ) -> AsyncGenerator[str, None]:
        if model != "haru-offline":
            try:
                client = get_http_client()
                payload = {
                    "model": "openai-fast",
                    "messages": messages,
                    "temperature": 0.85,
                    "stream": True,
                }
                yielded_any = False
                async with client.stream("POST", self.KEYLESS_API_URL, json=payload, timeout=22.0) as resp:
                    if resp.status_code == 200:
                        async for line in resp.aiter_lines():
                            if not line or not line.startswith("data: "):
                                continue
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                                if delta:
                                    yielded_any = True
                                    yield delta
                            except Exception:
                                continue
                        if yielded_any:
                            return
            except Exception:
                pass

        # Fallback if stream was not supported or offline
        full_text = await self.generate(messages, model)
        tokens = re.findall(r"\S+\s*", full_text)
        for token in tokens:
            await asyncio.sleep(0.01)
            yield token

    def _offline_fallback(self, messages: list[dict[str, str]]) -> str:
        system_text = ""
        user_last = ""
        turn_count = 0
        for m in messages:
            if m["role"] == "system":
                system_text = m["content"]
            elif m["role"] == "user":
                user_last = m["content"]
                turn_count += 1

        char_name = "Character"
        m_name = re.search(r"You are roleplaying as ([^(\n]+)", system_text)
        if m_name:
            char_name = m_name.group(1).strip()

        seed_int = int(hashlib.md5(f"{char_name}:{user_last}:{turn_count}".encode()).hexdigest()[:8], 16)
        actions = [
            f"*{char_name} considers your words for a moment before replying.*",
            f"*{char_name} looks over at you with a calm, attentive expression.*",
            f"*{char_name} nods slightly, picking up the thread of the conversation.*",
        ]
        dialogues = [
            "\"That makes sense. Let's go with that and see how things play out from here.\"",
            "\"I appreciate you being direct about it. What do you think our next move should be?\"",
        ]
        return f"{actions[seed_int % len(actions)]}\n\n{dialogues[seed_int % len(dialogues)]}"
