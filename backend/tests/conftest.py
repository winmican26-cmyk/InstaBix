from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_settings(tmp_path: Path, **overrides: object) -> Settings:
    defaults: dict[str, object] = {
        "_env_file": None,
        "app_env": "test",
        "database_url": f"sqlite:///{tmp_path / 'instabix-test.db'}",
        "api_key": None,
        "whop_api_key": None,
        "whop_mock_mode": "auto",
        "public_app_url": "http://testserver",
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


@pytest.fixture
def api(tmp_path: Path) -> Iterator[tuple[TestClient, FastAPI, Settings]]:
    settings = make_settings(tmp_path)
    app = create_app(settings)
    with TestClient(app) as client:
        yield client, app, settings


def scout_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Jordan Reyes",
        "handle": "@jordanreyes",
        "platform": "instagram",
        "email": "jordan@example.com",
        "niche": "Sports",
        "followers": 80_000,
        "median_views": 12_000,
        "recent_reel_views": [12_000] * 12,
        "ad_posts": 0,
    }
    payload.update(overrides)
    return payload


def create_qualified_creator(client: TestClient, **overrides: object) -> int:
    response = client.post("/api/scout", json=scout_payload(**overrides))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["qualification"]["qualified"] is True
    return int(body["creator"]["id"])


def create_product(
    client: TestClient,
    creator_id: int,
    *,
    title: str = "The Training Blueprint",
    price_cents: int = 1_900,
    target_words: int = 7_000,
) -> dict[str, object]:
    response = client.post(
        "/api/products",
        json={
            "creator_id": creator_id,
            "title": title,
            "price_cents": price_cents,
            "target_words": target_words,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()
