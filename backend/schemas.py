# backend/schemas.py
from pydantic import BaseModel, Field
from typing import Optional

# --- Auth & Users ---
class AuthRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4, max_length=128)
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

class AuthLoginRequest(BaseModel):
    username: str
    password: str

class UserPersonaSchema(BaseModel):
    id: str
    name: str
    description: str
    avatar_url: str
    is_default: bool

class PersonaCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    avatar_url: str = Field(default="")
    is_default: bool = True

class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    avatar_url: str
    bio: str
    is_guest: bool
    personas: list[UserPersonaSchema] = []

class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=500)
    avatar_url: Optional[str] = Field(default=None, max_length=600)

class ImageUploadRequest(BaseModel):
    data_url: str = Field(..., min_length=20)
    kind: str = Field(default="image", max_length=40)

class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# --- Characters ---
class CharacterCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    gender: str = Field(default="Female", max_length=32)
    tagline: str = Field(..., min_length=1, max_length=240)
    category: str = Field(default="Romance", max_length=50)
    tags: list[str] = Field(default_factory=list)
    avatar_url: str = Field(default="")
    banner_url: str = Field(default="")
    accent_color: str = Field(default="#d97757")
    personality: str = Field(..., min_length=3, max_length=6000)
    backstory: str = Field(default="", max_length=8000)
    scenario: str = Field(default="", max_length=4000)
    greeting: str = Field(..., min_length=2, max_length=4000)
    example_dialogue: str = Field(default="", max_length=4000)
    default_model: str = Field(default="haru-core")
    is_public: bool = True

class CharacterResponse(BaseModel):
    id: str
    creator_id: Optional[str]
    creator_name: str
    name: str
    gender: str = "Female"
    tagline: str
    category: str
    tags: list[str]
    avatar_url: str
    banner_url: str
    accent_color: str
    personality: str
    backstory: str
    scenario: str
    greeting: str
    example_dialogue: str
    default_model: str
    is_public: bool
    chat_count: int
    message_count: int
    like_count: int
    liked_by_me: bool = False

# --- Chat Sessions & Messages ---
class SessionCreateRequest(BaseModel):
    character_id: str
    persona_id: Optional[str] = None
    selected_model: Optional[str] = None
    force_new: bool = False

class SessionUpdateRequest(BaseModel):
    selected_model: Optional[str] = None
    persona_id: Optional[str] = None
    memory_notes: Optional[str] = None
    title: Optional[str] = None

class ChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    model_used: str
    created_at: str

class ChatSessionSummary(BaseModel):
    id: str
    character_id: str
    character_name: str
    character_avatar: str
    character_tagline: str
    character_accent: str
    persona_id: Optional[str]
    title: str
    selected_model: str
    memory_notes: str
    last_message: str
    updated_at: str

class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=6000)
    model: Optional[str] = None
    persona_id: Optional[str] = None
    api_keys: Optional[dict[str, str]] = None  # Optional client BYOK keys

class RegenerateMessageRequest(BaseModel):
    model: Optional[str] = None
    api_keys: Optional[dict[str, str]] = None
