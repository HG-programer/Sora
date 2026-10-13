# backend/app.py
import asyncio
import base64
import hashlib
import json
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import (
    HOST,
    PORT,
    MAX_CONCURRENT_LLM_REQUESTS,
    RATE_LIMIT_PER_MINUTE,
    MAX_CONTEXT_MESSAGES,
    SUPER_ADMIN_EMAILS,
)
from database import engine, Base, get_db, AsyncSessionLocal
from models import User, UserPersona, Character, CharacterLike, ChatSession, ChatMessage
from schemas import (
    AuthRegisterRequest,
    AuthLoginRequest,
    AuthTokenResponse,
    UserResponse,
    UserUpdateRequest,
    TierSimulateRequest,
    ImageUploadRequest,
    UserPersonaSchema,
    PersonaCreateRequest,
    CharacterCreateRequest,
    CharacterUpdateRequest,
    CharacterResponse,
    SessionCreateRequest,
    SessionUpdateRequest,
    ChatSessionSummary,
    ChatMessageResponse,
    SendMessageRequest,
    RegenerateMessageRequest,
    MessageUpdateRequest,
)
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_optional_user,
)
from adapters import (
    AVAILABLE_MODELS,
    get_adapter,
    get_adapters_status,
    get_public_model_label,
    build_roleplay_system_prompt,
    close_http_client,
)
from seed import seed_initial_characters, SEED_CHARACTERS

def check_user_tier_model_access(user: User, model_id: str, api_keys: dict | None = None) -> bool:
    """
    Validates whether the user's tier or super-admin status allows using model_id.
    Standard Sora models (haru-core, haru-velvet, haru-noir, haru-pulse, haru-rp-v1) are free for all.
    Flagship / Premium models (xai-grok-2, openrouter-hermes-3, openai-gpt-4o, gemini-2.0-pro)
    are unlocked for:
      - Super Admin / Founder (harshitg933@gmail.com)
      - Accounts in Pro / Ultra tier
      - Accounts with direct BYOK key
    All regular free users and unpaid emails are blocked from flagship models.
    """
    model_meta = next((m for m in AVAILABLE_MODELS if m["id"] == model_id), None)
    if not model_meta or model_meta.get("tier") != "premium":
        return True  # Free model, allowed for everyone

    # Check Super Admin status
    is_super = bool(
        user.is_super_admin
        or (user.email and user.email.lower() in SUPER_ADMIN_EMAILS)
        or user.username.lower() == "harshitg933"
    )
    # Effective tier respects simulation if active
    effective_tier = user.simulated_tier or ("super_admin" if is_super else (user.tier or "free"))

    if effective_tier in ("super_admin", "ultra", "pro"):
        return True

    # Check if BYOK override key was supplied
    if api_keys:
        if model_id.startswith("xai-") and api_keys.get("xai"):
            return True
        if model_id == "openrouter-hermes-3" and api_keys.get("openrouter"):
            return True
        if model_id.startswith("openai-") and api_keys.get("openai"):
            return True
        if model_id.startswith("gemini-") and api_keys.get("gemini"):
            return True

    return False


# Global concurrency semaphore & per-user sliding-window rate limiter
llm_semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM_REQUESTS)
_rate_buckets: dict[str, deque] = defaultdict(deque)


def check_rate_limit(key: str):
    now = time.monotonic()
    bucket = _rate_buckets[key]
    while bucket and now - bucket[0] > 60.0:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({RATE_LIMIT_PER_MINUTE} requests/min). Please wait a moment.",
        )
    bucket.append(now)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize async DB schema & seed initial Emochi characters
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for col_sql in [
            "ALTER TABLE characters ADD COLUMN gender VARCHAR(32) DEFAULT 'Female'",
            "ALTER TABLE users ADD COLUMN email VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN tier VARCHAR(32) DEFAULT 'free'",
            "ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN DEFAULT 0",
            "ALTER TABLE users ADD COLUMN simulated_tier VARCHAR(32)",
        ]:
            try:
                await conn.exec_driver_sql(col_sql)
            except Exception:
                pass
    async with AsyncSessionLocal() as db:
        await seed_initial_characters(db)
        # Auto-promote harshitg933@gmail.com or username harshitg933 to Super Admin / Founder
        stmt = select(User).where(
            (func.lower(User.email) == "harshitg933@gmail.com")
            | (func.lower(User.username) == "harshitg933")
        )
        super_users = (await db.execute(stmt)).scalars().all()
        for su in super_users:
            su.is_super_admin = True
            su.tier = "super_admin"
            if not su.email:
                su.email = "harshitg933@gmail.com"
        if super_users:
            await db.commit()
    yield
    await close_http_client()
    await engine.dispose()


app = FastAPI(
    title="Haru-Emochi Platform API",
    description="High-concurrency multi-user AI Character & Roleplay platform evolved from Haru-Gpt",
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS for Web, PWA, and Android Capacitor APK (capacitor://localhost, http://localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


# --- Helper Serializers ---
def serialize_user(user: User) -> UserResponse:
    is_super = bool(
        user.is_super_admin
        or (user.email and user.email.lower() in SUPER_ADMIN_EMAILS)
        or user.username.lower() == "harshitg933"
    )
    effective_tier = user.simulated_tier or ("super_admin" if is_super else (user.tier or "free"))
    return UserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        tier=effective_tier,
        is_super_admin=is_super,
        simulated_tier=user.simulated_tier,
        avatar_url=user.avatar_url or f"/api/v1/avatar/{user.username}?theme=violet",
        bio=user.bio,
        is_guest=user.is_guest,
        personas=[
            UserPersonaSchema(
                id=p.id,
                name=p.name,
                description=p.description,
                avatar_url=p.avatar_url or f"/api/v1/avatar/{p.name}?theme=cyan",
                is_default=p.is_default,
            )
            for p in (user.personas or [])
        ],
    )


def serialize_character(c: Character, liked_ids: set[str] | None = None) -> CharacterResponse:
    tags_list = [t.strip() for t in (c.tags or "").split(",") if t.strip()]
    raw_banner = (c.banner_url or "").strip()
    if raw_banner.startswith("#") or raw_banner.startswith("linear-gradient"):
        raw_banner = ""
    return CharacterResponse(
        id=c.id,
        creator_id=c.creator_id,
        creator_name=c.creator_name or "@haru_creator",
        name=c.name,
        gender=getattr(c, "gender", None) or "Female",
        tagline=c.tagline,
        category=c.category,
        tags=tags_list,
        avatar_url=c.avatar_url or f"/api/v1/avatar/{c.name}?theme=slate",
        banner_url=raw_banner,
        accent_color=c.accent_color or "#d97757",
        personality=c.personality,
        backstory=c.backstory or "",
        scenario=c.scenario or "",
        greeting=c.greeting,
        example_dialogue=c.example_dialogue or "",
        default_model="haru-core" if (not c.default_model or c.default_model == "haru-rp-v1") else c.default_model,
        is_public=c.is_public,
        chat_count=c.chat_count or 0,
        message_count=c.message_count or 0,
        like_count=c.like_count or 0,
        liked_by_me=bool(liked_ids and c.id in liked_ids),
    )


# ==========================================================
# 1. WARM EDITORIAL MONOGRAM AVATAR GENERATOR
# ==========================================================
THEMES = {
    "slate": ("#2b221e", "#4a3830", "#f5efe6", "#d97757"),
    "zinc": ("#26211c", "#42382f", "#f5efe6", "#d4a359"),
    "stone": ("#2c241d", "#4d3e31", "#f5efe6", "#e08868"),
    "neutral": ("#1f2621", "#334237", "#f2efe9", "#8fb996"),
    "violet": ("#2e1f23", "#4c3239", "#f5efe6", "#d9828f"),
    "cyan": ("#212629", "#374147", "#f2efe9", "#89b0c2"),
    "amber": ("#302318", "#523b28", "#f7f0e4", "#e0a458"),
    "emerald": ("#1e2922", "#33473a", "#f2efe9", "#88b892"),
    "rose": ("#331f21", "#543236", "#f7eee9", "#e08279"),
    "crimson": ("#331d19", "#543029", "#f7efe8", "#d97757"),
}
WARM_PALETTE_LIST = list(THEMES.values())


@app.get("/api/v1/avatar/{seed}")
async def generate_stylized_avatar(seed: str, theme: str = "slate"):
    """Generates a warm, editorial bookplate-style serif monogram avatar."""
    idx = int(hashlib.md5(seed.encode("utf-8")).hexdigest()[:6], 16) % len(WARM_PALETTE_LIST)
    bg, border_col, fg, accent = WARM_PALETTE_LIST[idx] if theme in ("slate", "zinc") else THEMES.get(theme, WARM_PALETTE_LIST[idx])
    initials = "".join([part[0] for part in seed.replace("_", " ").replace("-", " ").split()[:2]]).upper() or "H"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <rect width="120" height="120" rx="22" fill="{bg}"/>
    <rect x="4" y="4" width="112" height="112" rx="18" fill="none" stroke="{border_col}" stroke-width="2"/>
    <rect x="10" y="10" width="100" height="100" rx="14" fill="none" stroke="{accent}" stroke-width="1" stroke-opacity="0.35"/>
    <text x="60" y="63" font-family="Georgia, 'Newsreader', 'Times New Roman', serif" font-size="44" font-weight="600" fill="{fg}" text-anchor="middle" dominant-baseline="central">{initials}</text>
    <circle cx="94" cy="94" r="3.5" fill="{accent}" fill-opacity="0.8"/>
    </svg>"""
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/api/v1/scene/{preset}")
async def generate_scene_wallpaper(preset: str):
    """Generates warm, atmospheric SVG scene wallpapers for chat window backgrounds."""
    scenes = {
        "rainy-cafe": ("#171311", "#2b201b", "#d97757", "#e2be96", "Late-Night Espresso Bar"),
        "candlelit-study": ("#18120f", "#332219", "#e0a458", "#f5efe6", "Candlelit Archive & Study"),
        "mountain-lodge": ("#131715", "#202b25", "#8fb996", "#d4c8b8", "Highland Stone Waystation"),
        "twilight-terrace": ("#191418", "#30222b", "#d9828f", "#f5efe6", "Twilight Rooftop Terrace"),
        "noir-harbor": ("#121619", "#1f2930", "#89b0c2", "#d4c8b8", "Sector 4 Dockside Office"),
    }
    c1, c2, accent, warm_light, _ = scenes.get(preset, scenes["rainy-cafe"])
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="{c1}"/>
        <stop offset="55%" stop-color="{c2}"/>
        <stop offset="100%" stop-color="{c1}"/>
      </linearGradient>
      <radialGradient id="lamp" cx="0.78" cy="0.24" r="0.48">
        <stop offset="0%" stop-color="{warm_light}" stop-opacity="0.22"/>
        <stop offset="50%" stop-color="{accent}" stop-opacity="0.09"/>
        <stop offset="100%" stop-color="{c1}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="hearth" cx="0.22" cy="0.78" r="0.52">
        <stop offset="0%" stop-color="{accent}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="{c1}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1600" height="1000" fill="url(#bg)"/>
    <rect width="1600" height="1000" fill="url(#lamp)"/>
    <rect width="1600" height="1000" fill="url(#hearth)"/>
    <g stroke="{warm_light}" stroke-opacity="0.06" stroke-width="2" fill="none">
      <rect x="90" y="70" width="1420" height="860" rx="24"/>
      <line x1="90" y1="720" x2="1510" y2="720"/>
      <line x1="520" y1="70" x2="520" y2="720"/>
      <line x1="1080" y1="70" x2="1080" y2="720"/>
    </g>
    <path d="M0 760 Q 420 690 860 750 T 1600 710 L 1600 1000 L 0 1000 Z" fill="{c1}" fill-opacity="0.65"/>
    </svg>"""
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/api/v1/upload")
async def upload_custom_image(
    req: ImageUploadRequest,
    user: User = Depends(get_current_user),
):
    """
    Saves user-uploaded images (account avatar, character avatar, or custom chat background)
    to /assets/uploads/ and returns a clean relative URL.
    """
    raw = req.data_url.strip()
    if not raw.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Invalid image format. Expected data:image/... URL.")
    try:
        header, b64_data = raw.split(",", 1)
        mime = header.split(";")[0].replace("data:", "").lower()
        ext_map = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        ext = ext_map.get(mime, "jpg")
        binary = base64.b64decode(b64_data)
        if len(binary) > 6 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image exceeds 6MB limit.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image data.")

    digest = hashlib.sha256(binary).hexdigest()[:20]
    uploads_dir = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{req.kind}_{digest}.{ext}"
    file_path = uploads_dir / filename
    file_path.write_bytes(binary)
    return {"url": f"/assets/uploads/{filename}"}


@app.get("/api/v1/random-avatar")
async def get_random_avatar(gender: str = Query(default="Female")):
    import random
    art_file = Path(__file__).resolve().parent / "character_images.json"
    if art_file.exists():
        try:
            data = json.loads(art_file.read_text(encoding="utf-8"))
            pool = data.get("male" if gender.lower() == "male" else "female", [])
            if pool:
                return {"url": random.choice(pool)}
        except Exception:
            pass
    return {"url": f"/api/v1/avatar/Character?theme=slate"}


# ==========================================================
# 2. MULTI-USER AUTHENTICATION & PERSONAS
# ==========================================================
@app.post("/api/v1/auth/guest", response_model=AuthTokenResponse)
async def create_guest_session(db: AsyncSession = Depends(get_db)):
    """Creates an isolated guest account."""
    suffix = secrets.token_hex(3)
    username = f"guest_{suffix}"
    display_name = f"Guest {suffix.upper()}"
    user = User(
        username=username,
        display_name=display_name,
        password_hash="guest$ephemeral",
        avatar_url=f"/api/v1/avatar/{display_name}?theme=zinc",
        is_guest=True,
    )
    db.add(user)
    await db.flush()

    default_persona = UserPersona(
        user_id=user.id,
        name="Default",
        description="Standard user profile.",
        avatar_url=user.avatar_url,
        is_default=True,
    )
    db.add(default_persona)
    await db.commit()

    stmt = select(User).options(selectinload(User.personas)).where(User.id == user.id)
    user = (await db.execute(stmt)).scalar_one()
    token = create_access_token(user.id, user.username)
    return AuthTokenResponse(access_token=token, user=serialize_user(user))


@app.post("/api/v1/auth/register", response_model=AuthTokenResponse)
async def register_user(
    req: AuthRegisterRequest,
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    clean_username = req.username.strip().lower()
    clean_email = req.email.strip().lower() if req.email and req.email.strip() else None

    if clean_email:
        existing_email = (
            await db.execute(select(User).where(func.lower(User.email) == clean_email))
        ).scalar_one_or_none()
        if existing_email:
            raise HTTPException(status_code=400, detail="This email address is already registered. Please sign in instead.")

    existing = (await db.execute(select(User).where(User.username == clean_username))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Username is already taken.")

    display = (req.display_name or req.username).strip()
    is_super = bool(
        (clean_email and clean_email in SUPER_ADMIN_EMAILS)
        or clean_username == "harshitg933"
    )
    tier_val = "super_admin" if is_super else "free"

    # If the user is currently on a temporary Guest session, upgrade their account in-place
    # so they keep all their created characters, likes, and active chat sessions!
    if current_user and current_user.is_guest:
        stmt = select(User).options(selectinload(User.personas)).where(User.id == current_user.id)
        user = (await db.execute(stmt)).scalar_one()
        user.username = clean_username
        user.email = clean_email
        user.display_name = display
        user.password_hash = hash_password(req.password)
        user.avatar_url = req.avatar_url or f"/api/v1/avatar/{display}?theme=slate"
        user.is_guest = False
        user.is_super_admin = is_super
        user.tier = tier_val
        user.simulated_tier = None
        if user.personas:
            user.personas[0].name = display
            user.personas[0].avatar_url = user.avatar_url
        await db.commit()
        await db.refresh(user)
        token = create_access_token(user.id, user.username)
        return AuthTokenResponse(access_token=token, user=serialize_user(user))

    user = User(
        username=clean_username,
        email=clean_email,
        display_name=display,
        password_hash=hash_password(req.password),
        avatar_url=req.avatar_url or f"/api/v1/avatar/{display}?theme=slate",
        is_guest=False,
        is_super_admin=is_super,
        tier=tier_val,
    )
    db.add(user)
    await db.flush()

    default_persona = UserPersona(
        user_id=user.id,
        name=display,
        description="Primary user profile.",
        avatar_url=user.avatar_url,
        is_default=True,
    )
    db.add(default_persona)
    await db.commit()

    stmt = select(User).options(selectinload(User.personas)).where(User.id == user.id)
    user = (await db.execute(stmt)).scalar_one()
    token = create_access_token(user.id, user.username)
    return AuthTokenResponse(access_token=token, user=serialize_user(user))


@app.post("/api/v1/auth/login", response_model=AuthTokenResponse)
async def login_user(req: AuthLoginRequest, db: AsyncSession = Depends(get_db)):
    clean_ident = req.username.strip().lower()
    stmt = (
        select(User)
        .options(selectinload(User.personas))
        .where((User.username == clean_ident) | (func.lower(User.email) == clean_ident))
    )
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")

    # Auto-grant super admin if email matches harshitg933@gmail.com or username harshitg933
    if (user.email and user.email.lower() in SUPER_ADMIN_EMAILS) or user.username.lower() == "harshitg933":
        user.is_super_admin = True
        user.tier = "super_admin"
        if not user.email:
            user.email = "harshitg933@gmail.com"
        await db.commit()
        await db.refresh(user)

    token = create_access_token(user.id, user.username)
    return AuthTokenResponse(access_token=token, user=serialize_user(user))


@app.get("/api/v1/auth/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return serialize_user(user)


@app.patch("/api/v1/auth/me", response_model=UserResponse)
async def update_me(
    req: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).options(selectinload(User.personas)).where(User.id == user.id)
    db_user = (await db.execute(stmt)).scalar_one()
    if req.display_name is not None and req.display_name.strip():
        db_user.display_name = req.display_name.strip()
    if req.bio is not None:
        db_user.bio = req.bio.strip()
    if req.avatar_url is not None and req.avatar_url.strip():
        db_user.avatar_url = req.avatar_url.strip()
    if req.email is not None:
        new_email = req.email.strip().lower() if req.email.strip() else None
        if new_email:
            existing_other = (
                await db.execute(
                    select(User).where(func.lower(User.email) == new_email, User.id != db_user.id)
                )
            ).scalar_one_or_none()
            if existing_other:
                raise HTTPException(status_code=400, detail="This email is already in use by another account.")
        db_user.email = new_email
        if (new_email and new_email in SUPER_ADMIN_EMAILS) or db_user.username.lower() == "harshitg933":
            db_user.is_super_admin = True
            db_user.tier = "super_admin"
    await db.commit()
    await db.refresh(db_user)
    return serialize_user(db_user)


@app.post("/api/v1/auth/simulate-tier", response_model=UserResponse)
async def simulate_tier(
    req: TierSimulateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Allows Super Admin (harshitg933@gmail.com) to simulate and test different subscription tiers
    (super_admin, ultra, pro, free) to inspect paywalls and user restrictions in real time.
    """
    is_super = bool(
        user.is_super_admin
        or (user.email and user.email.lower() in SUPER_ADMIN_EMAILS)
        or user.username.lower() == "harshitg933"
    )
    if not is_super:
        raise HTTPException(status_code=403, detail="Tier simulation is restricted to Super Admin / Founder.")

    target = req.tier.strip().lower()
    if target not in ("super_admin", "ultra", "pro", "free"):
        raise HTTPException(status_code=400, detail="Invalid tier. Choose super_admin, ultra, pro, or free.")

    stmt = select(User).options(selectinload(User.personas)).where(User.id == user.id)
    db_user = (await db.execute(stmt)).scalar_one()
    db_user.simulated_tier = None if target == "super_admin" else target
    await db.commit()
    await db.refresh(db_user)
    return serialize_user(db_user)


@app.post("/api/v1/auth/claim-super", response_model=AuthTokenResponse)
async def claim_super_access(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Instantly elevates the current session to Super Admin for harshitg933@gmail.com.
    """
    stmt = select(User).options(selectinload(User.personas)).where(User.id == user.id)
    db_user = (await db.execute(stmt)).scalar_one()
    db_user.email = "harshitg933@gmail.com"
    db_user.is_super_admin = True
    db_user.tier = "super_admin"
    db_user.simulated_tier = None
    await db.commit()
    await db.refresh(db_user)
    token = create_access_token(db_user.id, db_user.username)
    return AuthTokenResponse(access_token=token, user=serialize_user(db_user))


@app.post("/api/v1/personas", response_model=UserPersonaSchema)
async def create_persona(
    req: PersonaCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.is_default:
        existing_personas = (
            await db.execute(select(UserPersona).where(UserPersona.user_id == user.id))
        ).scalars().all()
        for p in existing_personas:
            p.is_default = False
    persona = UserPersona(
        user_id=user.id,
        name=req.name.strip(),
        description=req.description.strip(),
        avatar_url=req.avatar_url or f"/api/v1/avatar/{req.name.strip()}?theme=emerald",
        is_default=req.is_default,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return UserPersonaSchema(
        id=persona.id,
        name=persona.name,
        description=persona.description,
        avatar_url=persona.avatar_url,
        is_default=persona.is_default,
    )


@app.delete("/api/v1/personas/{persona_id}")
async def delete_persona(
    persona_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(UserPersona).where(UserPersona.id == persona_id, UserPersona.user_id == user.id)
    persona = (await db.execute(stmt)).scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    await db.delete(persona)
    await db.commit()
    return {"ok": True}


@app.post("/api/v1/personas/{persona_id}/default")
async def set_default_persona(
    persona_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    personas = (
        await db.execute(select(UserPersona).where(UserPersona.user_id == user.id))
    ).scalars().all()
    found = False
    for p in personas:
        if p.id == persona_id:
            p.is_default = True
            found = True
        else:
            p.is_default = False
    if not found:
        raise HTTPException(status_code=404, detail="Persona not found")
    await db.commit()
    return {"ok": True}


# ==========================================================
# 3. CHARACTER DISCOVERY & DEEP CHARACTER STUDIO
# ==========================================================
@app.get("/api/v1/templates")
async def list_character_templates(
    category: str = Query(default="All"),
    gender: str = Query(default="All"),
):
    results = SEED_CHARACTERS
    if category and category.strip().lower() != "all":
        cat_l = category.strip().lower()
        results = [
            t for t in results
            if cat_l in t["category"].lower() or cat_l in t["tags"].lower()
        ]
    if gender and gender.strip().lower() != "all":
        gen_l = gender.strip().lower()
        results = [t for t in results if t["gender"].lower() == gen_l]
    return results


@app.get("/api/v1/characters", response_model=list[CharacterResponse])
async def list_characters(
    category: str = Query(default="All"),
    gender: str = Query(default="All"),
    search: str = Query(default=""),
    sort: str = Query(default="trending"),
    mine_only: bool = Query(default=False),
    favorites_only: bool = Query(default=False),
    limit: int = Query(default=250, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Character)
    is_favorites = favorites_only or (category and category.strip().lower() in ("favorites", "favourite", "saved"))

    if is_favorites and user:
        stmt = stmt.join(CharacterLike, CharacterLike.character_id == Character.id).where(CharacterLike.user_id == user.id)
    elif mine_only and user:
        stmt = stmt.where(Character.creator_id == user.id)
    elif user:
        stmt = stmt.where(or_(Character.is_public == True, Character.creator_id == user.id))
    else:
        stmt = stmt.where(Character.is_public == True)

    if not is_favorites and category and category.strip() and category.strip().lower() != "all":
        cat_clean = category.strip()
        stmt = stmt.where(
            or_(
                Character.category.ilike(cat_clean),
                Character.tags.ilike(f"%{cat_clean}%"),
            )
        )

    if gender and gender.strip() and gender.strip().lower() != "all":
        stmt = stmt.where(Character.gender.ilike(gender.strip()))

    if search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Character.name.ilike(q),
                Character.tagline.ilike(q),
                Character.category.ilike(q),
                Character.tags.ilike(q),
                Character.personality.ilike(q),
            )
        )

    if sort == "newest":
        stmt = stmt.order_by(desc(Character.created_at))
    elif sort == "likes":
        stmt = stmt.order_by(desc(Character.like_count), desc(Character.chat_count))
    else:
        stmt = stmt.order_by(desc(Character.chat_count), desc(Character.like_count))

    stmt = stmt.offset(offset).limit(limit)
    chars = (await db.execute(stmt)).scalars().all()

    liked_ids: set[str] = set()
    if user and chars:
        char_ids = [c.id for c in chars]
        like_stmt = select(CharacterLike.character_id).where(
            CharacterLike.user_id == user.id,
            CharacterLike.character_id.in_(char_ids),
        )
        liked_ids = set((await db.execute(like_stmt)).scalars().all())

    return [serialize_character(c, liked_ids) for c in chars]


@app.get("/api/v1/characters/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    char = (await db.execute(select(Character).where(Character.id == character_id))).scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    liked_ids: set[str] = set()
    if user:
        lk = (
            await db.execute(
                select(CharacterLike.character_id).where(
                    CharacterLike.user_id == user.id, CharacterLike.character_id == char.id
                )
            )
        ).scalar_one_or_none()
        if lk:
            liked_ids.add(lk)
    return serialize_character(char, liked_ids)


@app.post("/api/v1/characters", response_model=CharacterResponse)
async def create_character(
    req: CharacterCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    clean_tags = ",".join([t.strip() for t in req.tags if t.strip()])
    avatar = req.avatar_url.strip()
    if not avatar:
        import random
        art_file = Path(__file__).resolve().parent / "character_images.json"
        if art_file.exists():
            try:
                data = json.loads(art_file.read_text(encoding="utf-8"))
                pool = data.get("male" if (req.gender or "").lower() == "male" else "female", [])
                if pool:
                    avatar = random.choice(pool)
            except Exception:
                pass
    if not avatar:
        avatar = f"/api/v1/avatar/{req.name.strip()}?theme=slate"

    banner = req.banner_url.strip() or avatar

    char = Character(
        creator_id=user.id,
        creator_name=user.display_name or f"@{user.username}",
        name=req.name.strip(),
        gender=(req.gender or "Female").strip(),
        tagline=req.tagline.strip(),
        category=req.category.strip() or "Romance",
        tags=clean_tags,
        avatar_url=avatar,
        banner_url=banner,
        accent_color=req.accent_color or "#d97757",
        personality=req.personality.strip(),
        backstory=req.backstory.strip(),
        scenario=req.scenario.strip(),
        greeting=req.greeting.strip(),
        example_dialogue=req.example_dialogue.strip(),
        default_model=req.default_model or "haru-core",
        is_public=req.is_public,
        chat_count=1,
        like_count=1,
    )
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return serialize_character(char)


@app.delete("/api/v1/characters/{character_id}")
async def delete_character(
    character_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    char = (await db.execute(select(Character).where(Character.id == character_id))).scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    if char.creator_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete characters you created.")
    await db.delete(char)
    await db.commit()
    return {"ok": True}


@app.patch("/api/v1/characters/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    req: CharacterUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Character).where(Character.id == character_id)
    char = (await db.execute(stmt)).scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    if char.creator_id != user.id and not getattr(user, "is_super_admin", False):
        raise HTTPException(status_code=403, detail="You can only edit characters you created.")

    if req.name is not None:
        char.name = req.name.strip()
    if req.gender is not None:
        char.gender = req.gender.strip()
    if req.tagline is not None:
        char.tagline = req.tagline.strip()
    if req.category is not None:
        char.category = req.category.strip()
    if req.tags is not None:
        char.tags = ",".join([t.strip() for t in req.tags if t.strip()])
    if req.avatar_url is not None:
        char.avatar_url = req.avatar_url.strip()
    if req.banner_url is not None:
        char.banner_url = req.banner_url.strip()
    if req.accent_color is not None:
        char.accent_color = req.accent_color.strip()
    if req.personality is not None:
        char.personality = req.personality.strip()
    if req.backstory is not None:
        char.backstory = req.backstory.strip()
    if req.scenario is not None:
        char.scenario = req.scenario.strip()
    if req.greeting is not None:
        char.greeting = req.greeting.strip()
    if req.example_dialogue is not None:
        char.example_dialogue = req.example_dialogue.strip()
    if req.default_model is not None:
        char.default_model = req.default_model.strip()
    if req.is_public is not None:
        char.is_public = req.is_public

    await db.commit()
    await db.refresh(char)
    return serialize_character(char)


@app.post("/api/v1/characters/{character_id}/like")
async def toggle_character_like(
    character_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    char = (await db.execute(select(Character).where(Character.id == character_id))).scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    existing = (
        await db.execute(
            select(CharacterLike).where(
                CharacterLike.user_id == user.id,
                CharacterLike.character_id == character_id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        char.like_count = max(0, (char.like_count or 1) - 1)
        liked = False
    else:
        db.add(CharacterLike(user_id=user.id, character_id=character_id))
        char.like_count = (char.like_count or 0) + 1
        liked = True

    await db.commit()
    return {"liked": liked, "like_count": char.like_count}


# ==========================================================
# 4. MULTI-USER ROLEPLAY SESSIONS & REAL-TIME SSE STREAMING
# ==========================================================
@app.get("/api/v1/sessions", response_model=list[ChatSessionSummary])
async def list_user_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ChatSession)
        .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
        .where(ChatSession.user_id == user.id)
        .order_by(desc(ChatSession.updated_at))
        .limit(50)
    )
    sessions = (await db.execute(stmt)).scalars().all()
    summaries = []
    for s in sessions:
        if not s.character:
            continue
        last_msg = s.messages[-1].content if s.messages else s.character.greeting
        summaries.append(
            ChatSessionSummary(
                id=s.id,
                character_id=s.character.id,
                character_name=s.character.name,
                character_avatar=s.character.avatar_url or f"/api/v1/avatar/{s.character.name}",
                character_tagline=s.character.tagline,
                character_accent=s.character.accent_color or "#a855f7",
                persona_id=s.persona_id,
                title=s.title,
                selected_model=get_public_model_label(s.selected_model),
                memory_notes=s.memory_notes or "",
                last_message=last_msg[:140],
                updated_at=s.updated_at.isoformat() if s.updated_at else "",
            )
        )
    return summaries


@app.post("/api/v1/sessions")
async def create_or_get_session(
    req: SessionCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    char = (await db.execute(select(Character).where(Character.id == req.character_id))).scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    if not req.force_new:
        existing_stmt = (
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(
                ChatSession.user_id == user.id,
                ChatSession.character_id == char.id,
            )
            .order_by(desc(ChatSession.updated_at))
            .limit(1)
        )
        existing = (await db.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            return await get_session_detail(existing.id, user, db)

    default_persona_id = req.persona_id
    if not default_persona_id and user.personas:
        default_p = next((p for p in user.personas if p.is_default), user.personas[0])
        default_persona_id = default_p.id

    raw_model = req.selected_model or char.default_model or "haru-core"
    if raw_model == "haru-rp-v1":
        raw_model = "haru-core"

    session = ChatSession(
        user_id=user.id,
        character_id=char.id,
        persona_id=default_persona_id,
        title=f"Story with {char.name}",
        selected_model=raw_model,
    )
    db.add(session)
    char.chat_count = (char.chat_count or 0) + 1
    await db.flush()

    greeting_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=char.greeting,
        model_used=get_public_model_label(session.selected_model),
    )
    db.add(greeting_msg)
    await db.commit()
    return await get_session_detail(session.id, user, db)


@app.get("/api/v1/sessions/{session_id}")
async def get_session_detail(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ChatSession)
        .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session or not session.character:
        raise HTTPException(status_code=404, detail="Chat session not found")

    liked_stmt = select(CharacterLike.character_id).where(
        CharacterLike.user_id == user.id,
        CharacterLike.character_id == session.character.id,
    )
    is_liked = bool((await db.execute(liked_stmt)).scalars().first())
    char_liked_set = {session.character.id} if is_liked else set()

    norm_sel = "haru-core" if session.selected_model in ("haru-rp-v1", "", None) else session.selected_model
    return {
        "id": session.id,
        "title": session.title,
        "selected_model": norm_sel,
        "persona_id": session.persona_id,
        "memory_notes": session.memory_notes or "",
        "character": serialize_character(session.character, liked_ids=char_liked_set),
        "messages": [
            ChatMessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                content=m.content,
                model_used=get_public_model_label(m.model_used) if m.model_used in ("haru-rp-v1", "haru-core", "haru-velvet", "haru-noir", "haru-pulse") else (m.model_used or ""),
                created_at=m.created_at.isoformat() if m.created_at else "",
            )
            for m in session.messages
        ],
    }


@app.patch("/api/v1/sessions/{session_id}")
async def update_session(
    session_id: str,
    req: SessionUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if req.selected_model is not None:
        session.selected_model = req.selected_model
    if req.persona_id is not None:
        session.persona_id = req.persona_id
    if req.memory_notes is not None:
        session.memory_notes = req.memory_notes
    if req.title is not None:
        session.title = req.title

    await db.commit()
    return {"ok": True}


@app.delete("/api/v1/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"ok": True}


@app.patch("/api/v1/sessions/{session_id}/messages/{message_id}")
async def update_message(
    session_id: str,
    message_id: str,
    req: MessageUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt2 = select(ChatMessage).where(ChatMessage.id == message_id, ChatMessage.session_id == session_id)
    msg = (await db.execute(stmt2)).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.content = req.content.strip()
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    return {
        "id": msg.id,
        "role": msg.role,
        "content": msg.content,
        "model_used": msg.model_used,
        "created_at": msg.created_at.isoformat() if msg.created_at else "",
    }


@app.delete("/api/v1/sessions/{session_id}/messages/{message_id}")
async def delete_message(
    session_id: str,
    message_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt2 = select(ChatMessage).where(ChatMessage.id == message_id, ChatMessage.session_id == session_id)
    msg = (await db.execute(stmt2)).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    await db.delete(msg)
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@app.post("/api/v1/sessions/{session_id}/new_chat")
async def start_new_chat(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a fresh conversation branch with the same character while keeping past chats in history."""
    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    old_session = (await db.execute(stmt)).scalar_one_or_none()
    if not old_session:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt_char = select(Character).where(Character.id == old_session.character_id)
    char = (await db.execute(stmt_char)).scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    new_session = ChatSession(
        user_id=user.id,
        character_id=char.id,
        persona_id=old_session.persona_id,
        title=f"Chat with {char.name}",
        selected_model=old_session.selected_model or "haru-core",
    )
    db.add(new_session)
    await db.flush()

    greeting_msg = ChatMessage(
        session_id=new_session.id,
        role="assistant",
        content=char.greeting,
        model_used=get_public_model_label(new_session.selected_model),
    )
    db.add(greeting_msg)
    char.chat_count = (char.chat_count or 0) + 1
    await db.commit()
    return {"id": new_session.id, "session_id": new_session.id}



async def _prepare_llm_context(
    session: ChatSession,
    user: User,
    db: AsyncSession,
) -> list[dict[str, str]]:
    char = session.character
    persona_dict = {"name": user.display_name, "description": ""}
    if session.persona_id:
        p = next((x for x in (user.personas or []) if x.id == session.persona_id), None)
        if p:
            persona_dict = {"name": p.name, "description": p.description}
    elif user.personas:
        p = next((x for x in user.personas if x.is_default), user.personas[0])
        persona_dict = {"name": p.name, "description": p.description}

    sys_prompt = build_roleplay_system_prompt(
        character={
            "name": char.name,
            "tagline": char.tagline,
            "personality": char.personality,
            "backstory": char.backstory,
            "scenario": char.scenario,
            "example_dialogue": char.example_dialogue,
        },
        user_persona=persona_dict,
        memory_notes=session.memory_notes or "",
    )

    recent_msgs = session.messages[-MAX_CONTEXT_MESSAGES:]
    formatted = [{"role": "system", "content": sys_prompt}]
    for m in recent_msgs:
        formatted.append({"role": m.role, "content": m.content})
    return formatted


@app.post("/api/v1/sessions/{session_id}/prepare")
async def prepare_client_inference(
    session_id: str,
    req: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Distributed Client-IP Mode:
    Saves the user turn and returns the compiled system + history prompt so the
    user's own device (Android/Browser IP) can call Keyless Cloud LLMs directly
    without consuming server IP rate limits or requiring any API keys.
    """
    check_rate_limit(user.id)
    stmt = (
        select(ChatSession)
        .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session or not session.character:
        raise HTTPException(status_code=404, detail="Session not found")

    if req.model:
        session.selected_model = req.model
    if req.persona_id:
        session.persona_id = req.persona_id

    target_model = session.selected_model or "haru-core"
    if not check_user_tier_model_access(user, target_model, req.api_keys):
        meta = next((m for m in AVAILABLE_MODELS if m["id"] == target_model), None)
        model_name = meta["name"] if meta else target_model
        raise HTTPException(
            status_code=403,
            detail=f"Access blocked: '{model_name}' requires Flagship Pro ($9/mo) or Super Access. Free accounts are restricted to included Sora engines.",
        )

    user_msg = ChatMessage(
        session_id=session.id,
        role="user",
        content=req.content.strip(),
        model_used="user",
    )
    db.add(user_msg)
    session.updated_at = datetime.now(timezone.utc)
    session.character.message_count = (session.character.message_count or 0) + 1
    await db.commit()
    await db.refresh(user_msg)

    stmt2 = (
        select(ChatSession)
        .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id)
    )
    session = (await db.execute(stmt2)).scalar_one()
    llm_messages = await _prepare_llm_context(session, user, db)
    return {
        "user_message_id": user_msg.id,
        "selected_model": session.selected_model,
        "llm_messages": llm_messages,
    }


@app.post("/api/v1/sessions/{session_id}/save_assistant")
async def save_client_assistant_message(
    session_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    content = (data.get("content") or "").strip()
    raw_model = data.get("model") or "haru-core"
    model_used = get_public_model_label(raw_model) if raw_model in ("haru-rp-v1", "haru-core", "haru-velvet", "haru-noir", "haru-pulse") else raw_model
    if not content:
        raise HTTPException(status_code=400, detail="Empty content")

    stmt = select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    ai_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=content,
        model_used=model_used,
    )
    db.add(ai_msg)
    await db.commit()
    await db.refresh(ai_msg)
    return {"message_id": ai_msg.id, "model": model_used, "content": content}


@app.post("/api/v1/sessions/{session_id}/stream")
async def stream_roleplay_message(
    session_id: str,
    req: SendMessageRequest,
    user: User = Depends(get_current_user),
):
    """
    Streams the AI character's response via Server-Sent Events (SSE) while
    holding ZERO database connections open during LLM token generation.
    """
    check_rate_limit(user.id)

    async with AsyncSessionLocal() as db:
        stmt = (
            select(ChatSession)
            .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
            .where(ChatSession.id == session_id, ChatSession.user_id == user.id)
        )
        session = (await db.execute(stmt)).scalar_one_or_none()
        if not session or not session.character:
            raise HTTPException(status_code=404, detail="Session not found")

        if req.model:
            session.selected_model = req.model
        if req.persona_id:
            session.persona_id = req.persona_id

        target_model = session.selected_model or "haru-core"
        if not check_user_tier_model_access(user, target_model, req.api_keys):
            meta = next((m for m in AVAILABLE_MODELS if m["id"] == target_model), None)
            model_name = meta["name"] if meta else target_model
            raise HTTPException(
                status_code=403,
                detail=f"Access blocked: '{model_name}' requires Flagship Pro ($9/mo) or Super Access. Free accounts are restricted to included Sora engines.",
            )

        user_msg = ChatMessage(
            session_id=session.id,
            role="user",
            content=req.content.strip(),
            model_used="user",
        )
        db.add(user_msg)
        session.updated_at = datetime.now(timezone.utc)
        session.character.message_count = (session.character.message_count or 0) + 1
        await db.commit()
        await db.refresh(user_msg)
        user_msg_id = user_msg.id

        # Re-fetch messages with the newly added user message and build prompt context
        stmt2 = (
            select(ChatSession)
            .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
            .where(ChatSession.id == session_id)
        )
        session = (await db.execute(stmt2)).scalar_one()
        llm_messages = await _prepare_llm_context(session, user, db)
        requested_model = session.selected_model

    # DB session is now completely closed before streaming starts!
    adapter, resolved_model = get_adapter(requested_model, req.api_keys)

    async def event_generator():
        full_reply = []
        yield f"data: {json.dumps({'type': 'meta', 'user_message_id': user_msg_id, 'model': resolved_model})}\n\n"
        try:
            async with llm_semaphore:
                async for token in adapter.generate_stream(llm_messages, requested_model):
                    full_reply.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        except Exception:
            fallback_adapter, _ = get_adapter("haru-rp-v1")
            if not full_reply:
                async for token in fallback_adapter.generate_stream(llm_messages, "haru-rp-v1"):
                    full_reply.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        final_text = "".join(full_reply).strip() or "*gazes at you thoughtfully*"
        async with AsyncSessionLocal() as save_db:
            ai_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=final_text,
                model_used=resolved_model,
            )
            save_db.add(ai_msg)
            await save_db.commit()
            await save_db.refresh(ai_msg)
            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id, 'model': resolved_model, 'content': final_text})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/sessions/{session_id}/regenerate")
async def regenerate_last_response(
    session_id: str,
    req: RegenerateMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Emochi Swipe / Regenerate feature: replaces the last assistant reply with a fresh take."""
    check_rate_limit(user.id)

    stmt = (
        select(ChatSession)
        .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session or not session.character:
        raise HTTPException(status_code=404, detail="Session not found")

    if len(session.messages) > 1 and session.messages[-1].role == "assistant":
        await db.delete(session.messages[-1])
        await db.commit()

    stmt2 = (
        select(ChatSession)
        .options(selectinload(ChatSession.character), selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id)
    )
    session = (await db.execute(stmt2)).scalar_one()
    llm_messages = await _prepare_llm_context(session, user, db)
    # Add a subtle variation hint so regenerated replies feel fresh
    llm_messages.append(
        {
            "role": "system",
            "content": f"(Regenerate a fresh, alternative in-character response with different wording and action details. Seed: {secrets.token_hex(2)})",
        }
    )

    requested_model = req.model or session.selected_model
    adapter, resolved_model = get_adapter(requested_model, req.api_keys)

    try:
        async with llm_semaphore:
            reply_text = await adapter.generate(llm_messages, requested_model)
    except Exception:
        fallback_adapter, resolved_model = get_adapter("haru-rp-v1")
        reply_text = await fallback_adapter.generate(llm_messages, "haru-rp-v1")

    ai_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=reply_text,
        model_used=resolved_model,
    )
    db.add(ai_msg)
    await db.commit()
    await db.refresh(ai_msg)
    return ChatMessageResponse(
        id=ai_msg.id,
        session_id=ai_msg.session_id,
        role=ai_msg.role,
        content=ai_msg.content,
        model_used=ai_msg.model_used,
        created_at=ai_msg.created_at.isoformat() if ai_msg.created_at else "",
    )


# ==========================================================
# 5. ADAPTERS HEALTH, PLATFORM METRICS & LEGACY COMPATIBILITY
# ==========================================================
@app.get("/api/v1/adapters")
async def list_adapters():
    return {"adapters": get_adapters_status()}


@app.get("/api/v1/stats")
async def platform_stats(db: AsyncSession = Depends(get_db)):
    users_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    chars_count = (await db.execute(select(func.count()).select_from(Character))).scalar() or 0
    sessions_count = (await db.execute(select(func.count()).select_from(ChatSession))).scalar() or 0
    msgs_count = (await db.execute(select(func.count()).select_from(ChatMessage))).scalar() or 0
    return {
        "status": "healthy",
        "architecture": "Async FastAPI ASGI + SQLAlchemy 2.0 WAL/Pool",
        "max_concurrent_llm_streams": MAX_CONCURRENT_LLM_REQUESTS,
        "available_llm_slots": llm_semaphore._value,
        "total_users": users_count,
        "total_characters": chars_count,
        "active_sessions": sessions_count,
        "total_messages": msgs_count,
    }


@app.post("/api/v1/generate")
async def legacy_haru_gpt_generate(request: Request):
    """Backward-compatible endpoint with original Haru-Gpt `/api/v1/generate`."""
    data = await request.json()
    prompt = data.get("prompt")
    model = data.get("model", "haru-rp-v1")
    if not prompt:
        raise HTTPException(status_code=400, detail="Missing 'prompt' in request body")

    adapter, resolved_model = get_adapter(model, data.get("api_keys"))
    messages = [{"role": "user", "content": prompt}]
    async with llm_semaphore:
        content = await adapter.generate(messages, model)
    return {"model": resolved_model, "content": content}


# ==========================================================
# 6. STATIC PWA & ANDROID WEB ASSET SERVING
# ==========================================================
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/manifest.webmanifest")
async def serve_manifest():
    return FileResponse(FRONTEND_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
async def serve_sw():
    return FileResponse(FRONTEND_DIR / "sw.js", media_type="application/javascript")


@app.get("/")
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("<h1>Haru-Emochi Backend Running</h1>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=HOST, port=PORT, reload=False, workers=1)
