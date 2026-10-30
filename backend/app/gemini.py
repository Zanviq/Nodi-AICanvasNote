"""Gemini 호출을 한곳에 모은다. 라우터와 시험은 이 모듈의 함수만 쓴다."""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel

from app import prompts
from app.config import Settings


class RecognizedLine(BaseModel):
    index: int
    text: str


class RecognizeResult(BaseModel):
    lines: list[RecognizedLine]


class ThreadPair(BaseModel):
    q: str
    a: str


class GeminiError(Exception):
    """사용자에게 보여 줄 짧은 한국어 메시지를 담는다. 키나 원문 오류는 담지 않는다."""

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


_LEVELS = {
    "minimal": types.ThinkingLevel.MINIMAL,
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}


def _thinking(level: str) -> types.ThinkingConfig | None:
    found = _LEVELS.get(level.lower()) if level else None
    return types.ThinkingConfig(thinking_level=found) if found else None


def _client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


def _friendly(exc: Exception, fallback: str) -> GeminiError:
    if isinstance(exc, genai_errors.APIError):
        code = exc.code or 0
        bad_key = code == 400 and "key" in str(exc.message or "").lower()
        if bad_key or code in (401, 403):
            return GeminiError("Gemini API 키를 확인해 주세요.")
        if code == 429:
            return GeminiError("요청이 많아요. 잠시 뒤 다시 시도해 주세요.")
        if code == 404:
            return GeminiError("설정한 Gemini 모델을 찾을 수 없어요. 모델 이름을 확인해 주세요.")
    return GeminiError(fallback)


async def recognize_lines(
    api_key: str, png: bytes, line_count: int, settings: Settings
) -> list[RecognizedLine]:
    config = types.GenerateContentConfig(
        temperature=0,
        response_mime_type="application/json",
        response_schema=RecognizeResult,
        thinking_config=_thinking(settings.thinking_level),
    )
    try:
        response = await _client(api_key).aio.models.generate_content(
            model=settings.vision_model,
            contents=[
                types.Part.from_bytes(data=png, mime_type="image/png"),
                prompts.RECOGNIZE_PROMPT.format(line_count=line_count),
            ],
            config=config,
        )
    except Exception as exc:  # noqa: BLE001 - SDK 오류 종류가 많아 한곳에서 바꾼다
        raise _friendly(exc, "글씨를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.") from exc

    parsed = response.parsed
    try:
        result = (
            parsed
            if isinstance(parsed, RecognizeResult)
            else RecognizeResult.model_validate_json(response.text or "")
        )
    except ValueError as exc:
        raise GeminiError("글씨를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.") from exc

    by_index = {line.index: line.text.strip() for line in result.lines}
    return [RecognizedLine(index=i, text=by_index.get(i, "")) for i in range(1, line_count + 1)]


async def stream_answer(
    api_key: str,
    question: str,
    nearby: str | None,
    title: str | None,
    thread: Sequence[ThreadPair],
    settings: Settings,
) -> AsyncIterator[str]:
    contents: list[types.Content] = []
    for pair in thread:
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=pair.q)]))
        contents.append(types.Content(role="model", parts=[types.Part.from_text(text=pair.a)]))
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompts.answer_user_message(question, nearby, title))],
        )
    )
    config = types.GenerateContentConfig(
        system_instruction=prompts.ANSWER_SYSTEM,
        temperature=0.4,
        thinking_config=_thinking(settings.thinking_level),
    )
    try:
        stream = await _client(api_key).aio.models.generate_content_stream(
            model=settings.answer_model, contents=contents, config=config
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
    except Exception as exc:  # noqa: BLE001
        raise _friendly(exc, "답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.") from exc
