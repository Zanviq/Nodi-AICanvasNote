from __future__ import annotations

import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.db import get_db, new_id, now_iso
from app.routers.notebooks import fetch_notebook

router = APIRouter()

MAX_PAGE_BYTES = 8 * 1024 * 1024


class PageCreate(BaseModel):
    after: int | None = None


def page_json(row: sqlite3.Row, with_data: bool = True) -> dict[str, Any]:
    out: dict[str, Any] = {"id": row["id"], "index": row["idx"], "updatedAt": row["updated_at"]}
    if with_data:
        out["notebookId"] = row["notebook_id"]
        out["data"] = json.loads(row["data"])
    return out


def fetch_page(db: sqlite3.Connection, page_id: str) -> sqlite3.Row:
    row: sqlite3.Row | None = db.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="쪽을 찾을 수 없어요.")
    return row


@router.get("/notebooks/{notebook_id}/pages")
def list_pages(notebook_id: str, db: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    fetch_notebook(db, notebook_id)
    rows = db.execute(
        "SELECT * FROM pages WHERE notebook_id = ? ORDER BY idx", (notebook_id,)
    ).fetchall()
    return [page_json(r, with_data=False) for r in rows]


@router.post("/notebooks/{notebook_id}/pages", status_code=201)
def create_page(
    notebook_id: str,
    body: PageCreate | None = None,
    db: sqlite3.Connection = Depends(get_db),
) -> dict[str, Any]:
    fetch_notebook(db, notebook_id)
    last = db.execute(
        "SELECT COALESCE(MAX(idx), -1) AS m FROM pages WHERE notebook_id = ?", (notebook_id,)
    ).fetchone()["m"]
    after = body.after if body and body.after is not None else last
    index = max(0, min(after + 1, last + 1))
    page_id, ts = new_id(), now_iso()
    with db:
        db.execute(
            "UPDATE pages SET idx = idx + 1 WHERE notebook_id = ? AND idx >= ?",
            (notebook_id, index),
        )
        db.execute(
            "INSERT INTO pages (id, notebook_id, idx, data, updated_at) VALUES (?,?,?,?,?)",
            (page_id, notebook_id, index, "{}", ts),
        )
        db.execute("UPDATE notebooks SET updated_at = ? WHERE id = ?", (ts, notebook_id))
    return page_json(fetch_page(db, page_id))


@router.get("/pages/{page_id}")
def get_page(page_id: str, db: sqlite3.Connection = Depends(get_db)) -> dict[str, Any]:
    return page_json(fetch_page(db, page_id))


def _save(db: sqlite3.Connection, page_id: str, data: str) -> dict[str, Any]:
    row = fetch_page(db, page_id)
    ts = now_iso()
    with db:
        db.execute("UPDATE pages SET data = ?, updated_at = ? WHERE id = ?", (data, ts, page_id))
        db.execute("UPDATE notebooks SET updated_at = ? WHERE id = ?", (ts, row["notebook_id"]))
    return {"id": page_id, "updatedAt": ts}


@router.put("/pages/{page_id}")
async def put_page(
    page_id: str, request: Request, db: sqlite3.Connection = Depends(get_db)
) -> dict[str, Any]:
    # 본문 크기를 먼저 확인해야 해서 pydantic 본문 대신 직접 읽는다.
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_PAGE_BYTES:
        raise HTTPException(status_code=413, detail="쪽이 너무 커서 저장할 수 없어요.")
    raw = await request.body()
    if len(raw) > MAX_PAGE_BYTES:
        raise HTTPException(status_code=413, detail="쪽이 너무 커서 저장할 수 없어요.")
    try:
        body = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="JSON 형식이 아니에요.") from exc
    if not isinstance(body, dict) or not isinstance(body.get("data"), dict):
        raise HTTPException(status_code=422, detail="data 객체가 필요해요.")
    data = json.dumps(body["data"], ensure_ascii=False, separators=(",", ":"))
    return await run_in_threadpool(_save, db, page_id, data)


@router.delete("/pages/{page_id}", status_code=204)
def delete_page(page_id: str, db: sqlite3.Connection = Depends(get_db)) -> Response:
    row = fetch_page(db, page_id)
    count = db.execute(
        "SELECT COUNT(*) AS c FROM pages WHERE notebook_id = ?", (row["notebook_id"],)
    ).fetchone()["c"]
    if count <= 1:
        raise HTTPException(status_code=400, detail="마지막 한 쪽은 지울 수 없어요.")
    with db:
        db.execute("DELETE FROM pages WHERE id = ?", (page_id,))
        db.execute(
            "UPDATE pages SET idx = idx - 1 WHERE notebook_id = ? AND idx > ?",
            (row["notebook_id"], row["idx"]),
        )
        db.execute(
            "UPDATE notebooks SET updated_at = ? WHERE id = ?", (now_iso(), row["notebook_id"])
        )
    return Response(status_code=204)
