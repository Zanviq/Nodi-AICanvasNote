from __future__ import annotations

import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.db import get_db, now_iso

router = APIRouter()


class Event(BaseModel):
    type: str = Field(min_length=1, max_length=64)
    at: str = Field(min_length=1, max_length=40)
    data: dict[str, Any] | None = None


class EventsRequest(BaseModel):
    events: list[Event] = Field(max_length=500)


@router.post("/events")
def save_events(body: EventsRequest, db: sqlite3.Connection = Depends(get_db)) -> dict[str, int]:
    ts = now_iso()
    with db:
        db.executemany(
            "INSERT INTO events (type, at, data, created_at) VALUES (?,?,?,?)",
            [(e.type, e.at, json.dumps(e.data or {}, ensure_ascii=False), ts) for e in body.events],
        )
    return {"saved": len(body.events)}
