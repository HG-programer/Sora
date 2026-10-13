# backend/adapters/hf_adapter.py
from .base_adapter import AsyncLLMAdapter, get_http_client

class HuggingFaceAdapter(AsyncLLMAdapter):
    """
    Async Hugging Face Inference API Adapter (upgraded from Haru-Gpt's hf_adapter.py).
    """

    def _clean_model(self, model: str) -> str:
        return model[3:] if model.startswith("hf-") else model

    async def generate(self, messages: list[dict[str, str]], model: str) -> str:
        client = get_http_client()
        model_id = self._clean_model(model)
        url = f"https://api-inference.huggingface.co/models/{model_id}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model_id,
            "messages": messages,
            "max_tokens": 500,
            "temperature": 0.85,
        }
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code == 200:
            data = resp.json()
            if "choices" in data and data["choices"]:
                return data["choices"][0]["message"]["content"]

        # Fallback to text-generation endpoint (as in original Haru-Gpt)
        legacy_url = f"https://api-inference.huggingface.co/models/{model_id}"
        prompt_text = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\nASSISTANT:"
        resp2 = await client.post(
            legacy_url,
            headers=headers,
            json={"inputs": prompt_text, "parameters": {"return_full_text": False, "max_new_tokens": 350}},
        )
        resp2.raise_for_status()
        data2 = resp2.json()
        if isinstance(data2, list) and data2 and "generated_text" in data2[0]:
            return data2[0]["generated_text"].strip()
        return str(data2)
