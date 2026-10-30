from __future__ import annotations

import sqlite3
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.db import get_db, new_id, now_iso

router = APIRouter()

Paper = Literal["ruled", "grid", "plain"]


class NotebookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    paper: Paper


class NotebookUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


def notebook_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "paper": row["paper"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "pageCount": row["page_count"],
    }


_SELECT = """
SELECT n.*, (SELECT COUNT(*) FROM pages p WHERE p.notebook_id = n.id) AS page_count
FROM notebooks n
"""


def fetch_notebook(db: sqlite3.Connection, notebook_id: str) -> sqlite3.Row:
    row: sqlite3.Row | None = db.execute(_SELECT + " WHERE n.id = ?", (notebook_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="노트를 찾을 수 없어요.")
    return row


@router.get("/notebooks")
def list_notebooks(db: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(_SELECT + " ORDER BY n.updated_at DESC").fetchall()
    return [notebook_json(r) for r in rows]


@router.post("/notebooks", status_code=201)
def create_notebook(
    body: NotebookCreate, db: sqlite3.Connection = Depends(get_db)
) -> dict[str, Any]:
    notebook_id, ts = new_id(), now_iso()
    with db:
        db.execute(
            "INSERT INTO notebooks (id, title, paper, created_at, updated_at) VALUES (?,?,?,?,?)",
            (notebook_id, body.title.strip(), body.paper, ts, ts),
        )
        db.execute(
            "INSERT INTO pages (id, notebook_id, idx, data, updated_at) VALUES (?,?,?,?,?)",
            (new_id(), notebook_id, 0, "{}", ts),
        )
    return notebook_json(fetch_notebook(db, notebook_id))


@router.patch("/notebooks/{notebook_id}")
def update_notebook(
    notebook_id: str, body: NotebookUpdate, db: sqlite3.Connection = Depends(get_db)
) -> dict[str, Any]:
    fetch_notebook(db, notebook_id)
    with db:
        db.execute(
            "UPDATE notebooks SET title = ?, updated_at = ? WHERE id = ?",
            (body.title.strip(), now_iso(), notebook_id),
        )
    return notebook_json(fetch_notebook(db, notebook_id))


@router.delete("/notebooks/{notebook_id}", status_code=204)
def delete_notebook(notebook_id: str, db: sqlite3.Connection = Depends(get_db)) -> Response:
    fetch_notebook(db, notebook_id)
    with db:
        db.execute("DELETE FROM notebooks WHERE id = ?", (notebook_id,))
    return Response(status_code=204)
