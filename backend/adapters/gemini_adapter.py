# backend/adapters/gemini_adapter.py
from typing import AsyncGenerator
from .base_adapter import AsyncLLMAdapter, get_http_client

class GeminiAdapter(AsyncLLMAdapter):
    """
    Async Google Gemini REST API Adapter with BLOCK_NONE safety settings
    so creative writing and roleplay are not blocked by default filters.
    """
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

    SAFETY_SETTINGS = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]

    def _clean_model(self, model: str) -> str:
        if model in ("gemini-1.5-flash-latest", "gemini-flash"):
            return "gemini-2.0-flash"
        return model

    def _convert_messages(self, messages: list[dict[str, str]]) -> dict:
        system_instruction = None
        contents = []
        for m in messages:
            role = m["role"]
            text = m["content"]
            if role == "system":
                system_instruction = {"parts": [{"text": text}]}
            elif role == "assistant":
                contents.append({"role": "model", "parts": [{"text": text}]})
            else:
                contents.append({"role": "user", "parts": [{"text": text}]})

        body: dict = {
            "contents": contents,
            "safetySettings": self.SAFETY_SETTINGS,
            "generationConfig": {
                "temperature": 0.85,
                "maxOutputTokens": 650,
            },
        }
        if system_instruction:
            body["systemInstruction"] = system_instruction
        return body

    async def generate(self, messages: list[dict[str, str]], model: str) -> str:
        client = get_http_client()
        model_id = self._clean_model(model)
        url = f"{self.BASE_URL}/{model_id}:generateContent?key={self.api_key}"
        body = self._convert_messages(messages)
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return "*pauses thoughtfully*"
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts)

    async def generate_stream(
        self, messages: list[dict[str, str]], model: str
    ) -> AsyncGenerator[str, None]:
        full = await self.generate(messages, model)
        words = full.split(" ")
        for i, w in enumerate(words):
            yield w + (" " if i < len(words) - 1 else "")
