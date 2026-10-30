from __future__ import annotations

from fastapi.testclient import TestClient


def make_notebook(client: TestClient, title: str = "생명과학 노트") -> dict:
    res = client.post("/api/notebooks", json={"title": title, "paper": "ruled"})
    assert res.status_code == 201
    return res.json()


def test_health_and_config(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"ok": True}
    cfg = client.get("/api/config").json()
    assert cfg["serverKey"] is False
    assert cfg["visionModel"] and cfg["answerModel"]


def test_notebook_crud(client: TestClient) -> None:
    nb = make_notebook(client)
    assert nb["paper"] == "ruled"
    assert nb["pageCount"] == 1
    assert nb["createdAt"].endswith("Z")

    listed = client.get("/api/notebooks").json()
    assert [n["id"] for n in listed] == [nb["id"]]

    renamed = client.patch(f"/api/notebooks/{nb['id']}", json={"title": "물리"}).json()
    assert renamed["title"] == "물리"

    assert client.delete(f"/api/notebooks/{nb['id']}").status_code == 204
    assert client.get("/api/notebooks").json() == []
    assert client.get(f"/api/notebooks/{nb['id']}/pages").status_code == 404


def test_rejects_unknown_paper(client: TestClient) -> None:
    res = client.post("/api/notebooks", json={"title": "x", "paper": "dots"})
    assert res.status_code == 422


def test_page_insert_and_reindex(client: TestClient) -> None:
    nb = make_notebook(client)
    first = client.get(f"/api/notebooks/{nb['id']}/pages").json()[0]
    assert first["index"] == 0

    end = client.post(f"/api/notebooks/{nb['id']}/pages", json={}).json()
    assert end["index"] == 1
    assert end["data"] == {}
    assert end["notebookId"] == nb["id"]

    middle = client.post(f"/api/notebooks/{nb['id']}/pages", json={"after": 0}).json()
    assert middle["index"] == 1

    pages = client.get(f"/api/notebooks/{nb['id']}/pages").json()
    assert [p["id"] for p in pages] == [first["id"], middle["id"], end["id"]]
    assert [p["index"] for p in pages] == [0, 1, 2]

    assert client.delete(f"/api/pages/{middle['id']}").status_code == 204
    pages = client.get(f"/api/notebooks/{nb['id']}/pages").json()
    assert [(p["id"], p["index"]) for p in pages] == [(first["id"], 0), (end["id"], 1)]
    assert client.get("/api/notebooks").json()[0]["pageCount"] == 2


def test_cannot_delete_last_page(client: TestClient) -> None:
    nb = make_notebook(client)
    only = client.get(f"/api/notebooks/{nb['id']}/pages").json()[0]
    res = client.delete(f"/api/pages/{only['id']}")
    assert res.status_code == 400


def test_page_save_and_load(client: TestClient) -> None:
    nb = make_notebook(client)
    page_id = client.get(f"/api/notebooks/{nb['id']}/pages").json()[0]["id"]
    data = {"v": 1, "extraRows": 2, "strokes": [{"id": "s1", "pts": [1.5, 2, 0.5, 0]}]}
    saved = client.put(f"/api/pages/{page_id}", json={"data": data})
    assert saved.status_code == 200
    assert saved.json()["id"] == page_id
    assert client.get(f"/api/pages/{page_id}").json()["data"] == data


def test_page_save_validates_body(client: TestClient) -> None:
    nb = make_notebook(client)
    page_id = client.get(f"/api/notebooks/{nb['id']}/pages").json()[0]["id"]
    assert client.put(f"/api/pages/{page_id}", json={"data": [1, 2]}).status_code == 422
    assert client.put("/api/pages/missing", json={"data": {}}).status_code == 404


def test_page_size_limit(client: TestClient) -> None:
    nb = make_notebook(client)
    page_id = client.get(f"/api/notebooks/{nb['id']}/pages").json()[0]["id"]
    big = {"data": {"blob": "x" * (8 * 1024 * 1024 + 10)}}
    assert client.put(f"/api/pages/{page_id}", json=big).status_code == 413


def test_events(client: TestClient) -> None:
    body = {
        "events": [
            {"type": "gesture", "at": "2026-10-31T01:00:00Z", "data": {"ok": True}},
            {"type": "cancel", "at": "2026-10-31T01:00:01Z"},
        ]
    }
    res = client.post("/api/events", json=body)
    assert res.json() == {"saved": 2}
