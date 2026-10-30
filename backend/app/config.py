from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_MODEL = "gemini-3.8-flash"
DEFAULT_CORS = ("http://localhost:5173",)


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    vision_model: str
    answer_model: str
    thinking_level: str
    database_path: str
    cors_origins: tuple[str, ...]


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if value is None else value.strip()


def get_settings() -> Settings:
    # 매 호출마다 환경 변수를 읽는다. 값이 작아 비용이 없고, 시험에서 바꾸기 쉽다.
    cors = tuple(o.strip() for o in _env("CORS_ORIGINS", "").split(",") if o.strip())
    return Settings(
        gemini_api_key=_env("GEMINI_API_KEY", ""),
        vision_model=_env("GEMINI_VISION_MODEL", "") or DEFAULT_MODEL,
        answer_model=_env("GEMINI_ANSWER_MODEL", "") or DEFAULT_MODEL,
        thinking_level=_env("GEMINI_THINKING_LEVEL", "low"),
        database_path=_env("DATABASE_PATH", "") or "./data/note.db",
        cors_origins=cors or DEFAULT_CORS,
    )
