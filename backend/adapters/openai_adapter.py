# backend/adapters/openai_adapter.py
import json
from typing import AsyncGenerator
from .base_adapter import AsyncLLMAdapter, get_http_client

class OpenAIAdapter(AsyncLLMAdapter):
    """
    Async OpenAI API Adapter using pooled httpx.AsyncClient.
    Supports openai-gpt-4o-mini, openai-gpt-4o, openai-gpt-3.5-turbo, etc.
    """
    API_URL = "https://api.openai.com/v1/chat/completions"

    def _clean_model(self, model: str) -> str:
        return model.replace("openai-", "", 1)

    async def generate(self, messages: list[dict[str, str]], model: str) -> str:
        client = get_http_client()
        payload = {
            "model": self._clean_model(model),
            "messages": messages,
            "temperature": 0.85,
            "max_tokens": 600,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        resp = await client.post(self.API_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    async def generate_stream(
        self, messages: list[dict[str, str]], model: str
    ) -> AsyncGenerator[str, None]:
        client = get_http_client()
        payload = {
            "model": self._clean_model(model),
            "messages": messages,
            "temperature": 0.85,
            "max_tokens": 600,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with client.stream("POST", self.API_URL, headers=headers, json=payload) as resp:
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
