import importlib.util

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


@pytest.mark.skipif(importlib.util.find_spec("es_core_news_md") is None, reason="spaCy model es_core_news_md not installed")
def test_annotate_fixture():
    r = client.post("/annotate", json={"text": "Hoy Ana va al mercado. Necesita fruta, pan y queso.", "language": "es"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["sentences"]) == 2
    first = body["sentences"][0]
    assert first["tokens"][0]["text"] == "Hoy"
    va = next(t for t in first["tokens"] if t["text"] == "va")
    assert va["lemma"] == "ir" and va["pos"] == "verb"
    punct = first["tokens"][-1]
    assert punct["isWord"] is False
    assert "".join(t["text"] + t["ws"] for t in first["tokens"]).strip() == "Hoy Ana va al mercado."


def test_annotate_rejects_empty():
    assert client.post("/annotate", json={"text": "", "language": "es"}).status_code == 422
