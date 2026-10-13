# backend/adapters/groq_adapter.py
import json
from typing import AsyncGenerator
from .base_adapter import AsyncLLMAdapter, get_http_client

class GroqAdapter(AsyncLLMAdapter):
    """
    Async Groq API Adapter using pooled httpx.AsyncClient for thousands of concurrent users.
    Supports models like groq-llama-3.3-70b-versatile, groq-llama3-70b-8192, groq-mixtral-8x7b-32768.
    """
    API_URL = "https://api.groq.com/openai/v1/chat/completions"

    def _clean_model(self, model: str) -> str:
        m = model.replace("groq-", "", 1)
        # Map legacy deprecated Groq model IDs automatically to current supported ones if needed
        if m == "llama3-70b-8192":
            return "llama-3.3-70b-versatile"
        return m

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
