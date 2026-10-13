# backend/adapters/openrouter_grok_adapter.py
import json
from typing import AsyncGenerator
from .base_adapter import AsyncLLMAdapter, get_http_client


class OpenAICompatibleAdapter(AsyncLLMAdapter):
    """
    Async OpenAI-Compatible Adapter for xAI Grok ('https://api.x.ai/v1/chat/completions')
    and OpenRouter Uncensored RP Models ('https://openrouter.ai/api/v1/chat/completions').
    """
    def __init__(self, api_key: str, base_url: str, model_map: dict[str, str] | None = None):
        super().__init__(api_key)
        self.base_url = base_url
        self.model_map = model_map or {}

    def _resolve_model(self, model: str) -> str:
        if model in self.model_map:
            return self.model_map[model]
        for prefix in ("openrouter-", "xai-"):
            if model.startswith(prefix):
                return model[len(prefix):]
        return model

    async def generate(self, messages: list[dict[str, str]], model: str) -> str:
        client = get_http_client()
        payload = {
            "model": self._resolve_model(model),
            "messages": messages,
            "temperature": 0.85,
            "max_tokens": 600,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        resp = await client.post(self.base_url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    async def generate_stream(
        self, messages: list[dict[str, str]], model: str
    ) -> AsyncGenerator[str, None]:
        client = get_http_client()
        payload = {
            "model": self._resolve_model(model),
            "messages": messages,
            "temperature": 0.85,
            "max_tokens": 600,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with client.stream("POST", self.base_url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk["choices"][0].get("delta", {}).get("content")
                    if delta:
                        yield delta
                except Exception:
                    continue
