from __future__ import annotations

import base64
import binascii
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app import gemini
from app.config import get_settings

router = APIRouter()

NO_KEY = {
    "code": "no_key",
    "message": (
        "Gemini API 키가 없습니다. 설정에서 키를 넣거나 서버 .env에 GEMINI_API_KEY를 넣어 주세요."
    ),
}
MAX_IMAGE_BYTES = 6 * 1024 * 1024


class RecognizeRequest(BaseModel):
    image: str = Field(min_length=1)
    lineCount: int = Field(ge=1, le=40)


class AnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    nearby: str | None = Field(default=None, max_length=8000)
    title: str | None = Field(default=None, max_length=400)
    thread: list[gemini.ThreadPair] | None = Field(default=None, max_length=8)


def resolve_key(header_key: str | None) -> str:
    key = (header_key or "").strip() or get_settings().gemini_api_key
    if not key:
        raise HTTPException(status_code=400, detail=NO_KEY)
    return key


def decode_png(image: str) -> bytes:
    payload = image.split(",", 1)[1] if image.startswith("data:") else image
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="이미지를 읽을 수 없어요.") from exc
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="이미지가 너무 커요.")
    if not data.startswith(b"\x89PNG"):
        raise HTTPException(status_code=400, detail="PNG 이미지가 필요해요.")
    return data


@router.post("/recognize")
async def recognize(
    body: RecognizeRequest,
    x_gemini_key: str | None = Header(default=None, alias="X-Gemini-Key"),
) -> dict[str, Any]:
    key = resolve_key(x_gemini_key)
    png = decode_png(body.image)
    try:
        lines = await gemini.recognize_lines(key, png, body.lineCount, get_settings())
    except gemini.GeminiError as exc:
        raise HTTPException(
            status_code=exc.status, detail={"code": "gemini_error", "message": exc.message}
        ) from exc
    return {"lines": [line.model_dump() for line in lines]}


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/answer")
async def answer(
    body: AnswerRequest,
    x_gemini_key: str | None = Header(default=None, alias="X-Gemini-Key"),
) -> StreamingResponse:
    key = resolve_key(x_gemini_key)
    settings = get_settings()

    async def events() -> AsyncIterator[str]:
        try:
            async for delta in gemini.stream_answer(
                key, body.question, body.nearby, body.title, body.thread or [], settings
            ):
                yield _sse({"delta": delta})
            yield _sse({"done": True})
        except gemini.GeminiError as exc:
            yield _sse({"error": exc.message})
        except Exception:  # noqa: BLE001 - 스트림 중간 오류도 같은 형식으로 알린다
            yield _sse({"error": "답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요."})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
