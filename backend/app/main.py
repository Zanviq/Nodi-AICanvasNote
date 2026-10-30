from __future__ import annotations

import hmac
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import init_db
from app.routers import ai, events, notebooks, pages


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="AI Canvas Note API", version="0.1.0", lifespan=lifespan)

OPEN_PATHS = {"/api/health", "/api/config"}
ACCESS_DENIED = {
    "code": "access",
    "message": "접근 코드가 필요해요. 설정에서 접근 코드를 넣어 주세요.",
}


@app.middleware("http")
async def require_access_token(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    # APP_ACCESS_TOKEN을 설정하면 모든 API가 X-Access-Token 헤더를 요구한다 (공개 배포용).
    token = get_settings().access_token
    path = request.url.path
    if (
        token
        and request.method != "OPTIONS"
        and path.startswith("/api/")
        and path not in OPEN_PATHS
    ):
        given = request.headers.get("x-access-token", "")
        if not hmac.compare_digest(given.encode(), token.encode()):
            return JSONResponse(status_code=401, content={"detail": ACCESS_DENIED})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (notebooks, pages, ai, events):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/config")
def config() -> dict[str, Any]:
    settings = get_settings()
    return {
        "serverKey": bool(settings.gemini_api_key),
        "visionModel": settings.vision_model,
        "answerModel": settings.answer_model,
        "accessRequired": bool(settings.access_token),
    }
