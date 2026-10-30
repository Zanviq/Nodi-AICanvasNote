from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import gemini
from app.config import Settings

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 32).decode()


def sse_payloads(text: str) -> list[dict[str, Any]]:
    frames = [f for f in text.split("\n\n") if f.strip()]
    assert all(f.startswith("data: ") for f in frames)
    return [json.loads(f[len("data: ") :]) for f in frames]


def test_no_key_for_both_routes(client: TestClient) -> None:
    res = client.post("/api/recognize", json={"image": PNG, "lineCount": 1})
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "no_key"

    res = client.post("/api/answer", json={"question": "왜?"})
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "no_key"


def test_recognize_uses_header_key_over_env(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "env-key")
    seen: dict[str, Any] = {}

    async def fake(
        api_key: str, png: bytes, line_count: int, settings: Settings
    ) -> list[gemini.RecognizedLine]:
        seen.update(key=api_key, png=png[:4], count=line_count)
        return [gemini.RecognizedLine(index=1, text="근데 캘빈 회로는")]

    monkeypatch.setattr(gemini, "recognize_lines", fake)

    res = client.post(
        "/api/recognize",
        json={"image": PNG, "lineCount": 2},
        headers={"X-Gemini-Key": "header-key"},
    )
    assert res.status_code == 200
    assert res.json() == {"lines": [{"index": 1, "text": "근데 캘빈 회로는"}]}
    assert seen == {"key": "header-key", "png": b"\x89PNG", "count": 2}

    client.post("/api/recognize", json={"image": PNG, "lineCount": 1})
    assert seen["key"] == "env-key"


def test_recognize_rejects_bad_image(client: TestClient) -> None:
    headers = {"X-Gemini-Key": "k"}
    bad = client.post("/api/recognize", json={"image": "!!!", "lineCount": 1}, headers=headers)
    assert bad.status_code == 400
    not_png = "data:image/png;base64," + base64.b64encode(b"GIF89a").decode()
    res = client.post("/api/recognize", json={"image": not_png, "lineCount": 1}, headers=headers)
    assert res.status_code == 400


def test_recognize_maps_gemini_error(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail(*_: Any) -> list[gemini.RecognizedLine]:
        raise gemini.GeminiError("Gemini API 키를 확인해 주세요.")

    monkeypatch.setattr(gemini, "recognize_lines", fail)
    res = client.post(
        "/api/recognize", json={"image": PNG, "lineCount": 1}, headers={"X-Gemini-Key": "k"}
    )
    assert res.status_code == 502
    assert res.json()["detail"] == {
        "code": "gemini_error",
        "message": "Gemini API 키를 확인해 주세요.",
    }


def test_answer_streams_sse(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def fake(
        api_key: str,
        question: str,
        nearby: str | None,
        title: str | None,
        thread: Sequence[gemini.ThreadPair],
        settings: Settings,
    ) -> AsyncIterator[str]:
        seen.update(key=api_key, question=question, title=title, thread=list(thread))
        for part in ("캘빈 회로는 ", "멈춥니다."):
            yield part

    monkeypatch.setattr(gemini, "stream_answer", fake)
    body = {
        "question": "왜 밤에는 멈추는 걸까?",
        "title": "3단원 광합성",
        "thread": [{"q": "광합성이 뭐야?", "a": "빛으로 양분을 만드는 일이에요."}],
    }
    res = client.post("/api/answer", json=body, headers={"X-Gemini-Key": "header-key"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["x-accel-buffering"] == "no"
    assert sse_payloads(res.text) == [
        {"delta": "캘빈 회로는 "},
        {"delta": "멈춥니다."},
        {"done": True},
    ]
    assert seen["key"] == "header-key"
    assert seen["title"] == "3단원 광합성"
    assert seen["thread"][0].q == "광합성이 뭐야?"


def test_answer_stream_error_frame(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail(*_: Any) -> AsyncIterator[str]:
        yield "앞부분"
        raise gemini.GeminiError("요청이 많아요. 잠시 뒤 다시 시도해 주세요.")

    monkeypatch.setattr(gemini, "stream_answer", fail)
    res = client.post("/api/answer", json={"question": "왜?"}, headers={"X-Gemini-Key": "k"})
    assert sse_payloads(res.text) == [
        {"delta": "앞부분"},
        {"error": "요청이 많아요. 잠시 뒤 다시 시도해 주세요."},
    ]


def test_thinking_config_levels() -> None:
    assert gemini._thinking("low") is not None
    assert gemini._thinking("") is None
    assert gemini._thinking("nonsense") is None
