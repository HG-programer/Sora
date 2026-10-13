# backend/seed.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Character
from character_catalog import build_seed_characters

SEED_CHARACTERS = build_seed_characters()


async def seed_initial_characters(db: AsyncSession):
    """
    Ensures all 200+ curated SEED_CHARACTERS across all categories (including Uncensored 18+)
    and both genders exist and stay updated while preserving any user-created characters.
    """
    existing_rows = (await db.execute(select(Character))).scalars().all()
    existing_by_id = {c.id: c for c in existing_rows}
    seed_ids = {item["id"] for item in SEED_CHARACTERS}

    new_count = 0
    for item in SEED_CHARACTERS:
        model_kwargs = {k: v for k, v in item.items() if k != "culture"}
        existing = existing_by_id.get(item["id"])
        if existing:
            for k, v in model_kwargs.items():
                if k not in ("id", "creator_name", "created_at"):
                    setattr(existing, k, v)
        else:
            db.add(Character(**model_kwargs, is_public=True))
            new_count += 1

    # Prune obsolete system seeds that were replaced or retired
    for c in existing_rows:
        if c.creator_name == "haru" and c.id not in seed_ids:
            await db.delete(c)

    # Also ensure any user-created characters have a valid default gender & model
    for c in existing_rows:
        if not getattr(c, "gender", None):
            c.gender = "Female"
        if c.default_model == "haru-rp-v1":
            c.default_model = "haru-core"

    await db.commit()
    return len(seed_ids)
