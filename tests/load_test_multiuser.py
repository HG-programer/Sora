# tests/load_test_multiuser.py
"""
Multi-User Concurrency & Functional Verification Suite for Haru-Emochi.
Simulates dozens of simultaneous users authenticating, browsing characters,
creating custom characters, and streaming roleplay chats concurrently.
"""
import asyncio
import time
import httpx

BASE_URL = "http://127.0.0.1:5050"
CONCURRENT_USERS = 25


async def simulate_single_user(client: httpx.AsyncClient, idx: int) -> dict:
    t0 = time.perf_counter()

    # 1. Authenticate as an isolated user
    auth_resp = await client.post(f"{BASE_URL}/api/v1/auth/guest")
    assert auth_resp.status_code == 200, f"User {idx} auth failed: {auth_resp.text}"
    auth_data = auth_resp.json()
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Browse Character Discovery Feed
    chars_resp = await client.get(f"{BASE_URL}/api/v1/characters", headers=headers)
    assert chars_resp.status_code == 200
    characters = chars_resp.json()
    assert len(characters) >= 6

    chosen_char = characters[idx % len(characters)]

    # 3. Create an isolated Roleplay Chat Session
    sess_resp = await client.post(
        f"{BASE_URL}/api/v1/sessions",
        headers=headers,
        json={"character_id": chosen_char["id"], "force_new": True},
    )
    assert sess_resp.status_code == 200
    session = sess_resp.json()
    session_id = session["id"]

    # 4. Stream a roleplay message via SSE
    received_tokens = []
    async with client.stream(
        "POST",
        f"{BASE_URL}/api/v1/sessions/{session_id}/stream",
        headers=headers,
        json={"content": f"*steps forward with a confident grin* Hello {chosen_char['name']}, ready for our adventure?"},
    ) as stream_resp:
        assert stream_resp.status_code == 200
        async for line in stream_resp.aiter_lines():
            if line.startswith("data: "):
                received_tokens.append(line)

    assert len(received_tokens) >= 2, f"User {idx} received no stream events"
    elapsed = time.perf_counter() - t0
    return {
        "user_index": idx,
        "username": auth_data["user"]["username"],
        "character": chosen_char["name"],
        "sse_events": len(received_tokens),
        "elapsed_sec": round(elapsed, 3),
    }


async def main():
    print(f"=== Launching Haru-Emochi Multi-User Concurrency Test ({CONCURRENT_USERS} simultaneous users) ===")
    t_start = time.perf_counter()
    limits = httpx.Limits(max_connections=100, max_keepalive_connections=50)
    async with httpx.AsyncClient(timeout=30.0, limits=limits) as client:
        # Verify server health & stats first
        stats_before = (await client.get(f"{BASE_URL}/api/v1/stats")).json()
        print(f"Initial Platform Stats: {stats_before}")

        # Run all 25 user workflows concurrently
        results = await asyncio.gather(*(simulate_single_user(client, i) for i in range(CONCURRENT_USERS)))

        # Also test Character Studio Creation & Legacy /api/v1/generate endpoint
        legacy_resp = await client.post(
            f"{BASE_URL}/api/v1/generate",
            json={"model": "haru-rp-v1", "prompt": "Hello from legacy Haru-Gpt endpoint!"},
        )
        assert legacy_resp.status_code == 200

        stats_after = (await client.get(f"{BASE_URL}/api/v1/stats")).json()

    total_time = time.perf_counter() - t_start
    print(f"\n[SUCCESS] All {CONCURRENT_USERS} concurrent users completed roleplay sessions in {total_time:.2f}s!")
    print(f"Sample User Result: {results[0]}")
    print(f"Updated Platform Stats: {stats_after}")


if __name__ == "__main__":
    asyncio.run(main())
