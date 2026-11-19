from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from tests.conftest import create_product, create_qualified_creator


def test_campaign_creation_is_idempotent_and_listable(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    created = client.post("/api/campaigns", json={"creator_id": creator_id})
    assert created.status_code == 200, created.text
    campaign = created.json()
    assert campaign["creator_id"] == creator_id
    assert campaign["sequence_status"] == "active"
    assert campaign["current_step"] == 1

    # Day 0: the initial step is due at creation time.
    created_at = datetime.fromisoformat(campaign["created_at"])
    next_followup_at = datetime.fromisoformat(campaign["next_followup_at"])
    assert next_followup_at == created_at

    duplicate = client.post("/api/campaigns", json={"creator_id": creator_id})
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["detail"]["code"] == "campaign_exists"

    listed = client.get("/api/campaigns", params={"creator_id": creator_id})
    assert listed.status_code == 200, listed.text
    assert listed.json()["count"] == 1
    assert listed.json()["items"][0]["id"] == campaign["id"]


def test_product_exposes_stage2_fields_and_locked_split_mirrors(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    product = create_product(client, creator_id, price_cents=1_900, target_words=7_000)

    assert product["branding"] == "hybrid"
    assert product["word_count"] == product["target_words"] == 7_000
    assert product["price"] == product["price_cents"] / 100
    assert (
        Decimal(str(product["split_creator"])) + Decimal(str(product["split_operator"]))
        == Decimal("1.00")
    )
    assert product["whop_product_id"] is None


def test_outreach_classification_updates_campaign_and_email(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    campaign = client.post("/api/campaigns", json={"creator_id": creator_id}).json()

    created = client.post(
        "/api/outreach",
        json={
            "creator_id": creator_id,
            "campaign_id": campaign["id"],
            "template_key": "initial",
        },
    )
    assert created.status_code == 200, created.text
    email = created.json()
    assert email["campaign_id"] == campaign["id"]
    assert email["step"] == 1
    assert email["opened"] is False
    assert email["replied"] is False

    classified = client.post(
        "/api/outreach/classify",
        json={"email_id": email["id"], "text": "Yes, I'm interested — send the details"},
    )
    assert classified.status_code == 200, classified.text
    body = classified.json()
    assert body["classification"] == "POSITIVE"
    assert body["saved"] is True
    assert body["email"]["replied"] is True

    stored = client.get(
        "/api/campaigns", params={"creator_id": creator_id}
    ).json()["items"][0]
    assert stored["reply_classification"] == "POSITIVE"
    assert stored["sequence_status"] == "shortlisted"


def test_settings_branding_remains_locked(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api

    rejected = client.put("/api/settings", json={"branding": "creator_only"})
    assert rejected.status_code == 422, rejected.text
    assert rejected.json()["detail"]["code"] == "branding_locked"


def test_health_reports_ok_database(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api

    response = client.get("/api/health")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
