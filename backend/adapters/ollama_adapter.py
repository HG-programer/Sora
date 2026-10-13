# backend/adapters/ollama_adapter.py
import json
from typing import AsyncGenerator
from .base_adapter import AsyncLLMAdapter, get_http_client

class OllamaAdapter(AsyncLLMAdapter):
    """
    Async Ollama Local LLM Adapter (e.g., ollama-llama3, ollama-mistral).
    """

    def __init__(self, base_url: str = "http://127.0.0.1:11434"):
        super().__init__(api_key="local")
        self.base_url = base_url.rstrip("/")

    def _clean_model(self, model: str) -> str:
        return model.replace("ollama-", "", 1)

    async def generate(self, messages: list[dict[str, str]], model: str) -> str:
        client = get_http_client()
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self._clean_model(model),
            "messages": messages,
            "stream": False,
        }
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")

    async def generate_stream(
        self, messages: list[dict[str, str]], model: str
    ) -> AsyncGenerator[str, None]:
        client = get_http_client()
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self._clean_model(model),
            "messages": messages,
            "stream": True,
        }
        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        yield token
                except Exception:
                    continue
