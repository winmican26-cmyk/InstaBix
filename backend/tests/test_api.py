from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
from fastapi.testclient import TestClient

from app.config import NICHES, Settings
from app.main import create_app
from tests.conftest import create_qualified_creator, make_settings, scout_payload

LOCKED_NICHES = (
    "Sports",
    "Home",
    "Finance",
    "Parenting",
    "AI Tools for Small Business",
    "Faith & Mindset",
)


def _create_product(
    client: TestClient, creator_id: int, **overrides: Any
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "creator_id": creator_id,
        "title": "The Training Blueprint",
        "price_cents": 1_900,
        "target_words": 7_000,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _approve_and_publish(client: TestClient, product_id: int) -> dict[str, Any]:
    approval = client.post(
        f"/api/products/{product_id}/approve", json={"approved_by": "creator"}
    )
    assert approval.status_code == 200, approval.text
    publish = client.post("/api/whop/publish", json={"product_id": product_id})
    assert publish.status_code == 200, publish.text
    return publish.json()


def test_health_branding_and_whop_status(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api

    response = client.get("/api/health")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["env"] == "test"
    assert body["branding"] == "hybrid"
    assert body["api_key_required"] is False
    assert body["whop"]["mode"] == "mock"
    assert body["whop"]["publish_ready"] is True
    assert response.headers["X-Request-ID"]

    assert client.get("/").json()["branding"] == "hybrid"

    whop = client.get("/api/whop").json()
    assert whop["branding"] == "hybrid"
    assert whop["mode"] == "mock"
    assert whop["configured"] is False
    assert whop["publish_endpoint"] == "/api/whop/publish"


def test_settings_are_readable_and_branding_is_locked(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api

    settings = client.get("/api/settings").json()
    assert settings["branding"] == "hybrid"
    assert tuple(settings["niches"]) == LOCKED_NICHES == NICHES
    assert settings["splits"]["first_product"] == {"creator": 0.60, "instabix": 0.40}
    assert settings["splits"]["subsequent_products"] == {
        "creator": 0.50,
        "instabix": 0.50,
    }
    assert settings["whop"]["mode"] == "mock"

    rejected = client.put("/api/settings", json={"branding": "instabix"})
    assert rejected.status_code == 422, rejected.text
    assert rejected.json()["detail"]["code"] == "branding_locked"
    assert client.get("/api/settings").json()["branding"] == "hybrid"

    updated = client.put(
        "/api/settings",
        json={"sender_name": "InstaBix Studio", "outreach_paused": True},
    )
    assert updated.status_code == 200, updated.text
    stored = updated.json()
    assert stored["sender_name"] == "InstaBix Studio"
    assert stored["outreach_paused"] is True
    assert stored["branding"] == "hybrid"


def test_scout_qualifies_and_persists_creator(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api

    response = client.post("/api/scout", json=scout_payload())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] is True
    assert body["qualification"]["qualified"] is True
    creator_id = body["creator"]["id"]

    listed = client.get("/api/scout")
    assert listed.status_code == 200
    assert listed.json()["count"] == 1
    assert listed.json()["items"][0]["id"] == creator_id
    assert listed.json()["items"][0]["status"] == "Qualified"
    assert client.get("/api/scout?status=Qualified").json()["count"] == 1
    assert client.get("/api/scout?status=Rejected").json()["count"] == 0

    fetched = client.get(f"/api/scout/{creator_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == creator_id
    assert fetched.json()["qualification"]["qualified"] is True


def test_outreach_approval_and_reply_classification(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    created = client.post(
        "/api/outreach", json={"creator_id": creator_id, "template_key": "initial"}
    )
    assert created.status_code == 200, created.text
    draft = created.json()
    draft_id = draft["id"]
    assert draft["status"] == "draft"
    assert draft["approved"] is False
    assert draft["sent_at"] is None
    assert draft["delivery"]["status"] == "not_sent"
    # Cross-atom alignment: agent2 now returns the unsubscribe URL as delivery
    # metadata instead of embedding it (or STOP) in the rendered body copy.
    assert draft["body"].strip()

    approved = client.post(
        f"/api/outreach/{draft_id}/approve?approved_by=ops"
    )
    assert approved.status_code == 200, approved.text
    approval = approved.json()
    assert approval["approved"] is True
    assert approval["approved_by"] == "ops"
    assert approval["approved_at"] is not None
    assert approval["sent_at"] is None
    assert approval["delivery"]["status"] == "not_sent"

    positive = client.post(
        "/api/outreach/classify",
        json={"email_id": draft_id, "text": "Yes, I'm interested — send the details"},
    )
    assert positive.status_code == 200, positive.text
    assert positive.json()["classification"] == "POSITIVE"
    assert positive.json()["saved"] is True
    assert positive.json()["email"]["classification"] == "POSITIVE"

    soft = client.post(
        "/api/outreach/classify", json={"text": "Maybe next quarter — circle back"}
    )
    assert soft.status_code == 200, soft.text
    assert soft.json()["classification"] == "SOFT_POSITIVE"

    negative = client.post(
        "/api/outreach/classify", json={"text": "Not interested, unsubscribe me"}
    )
    assert negative.status_code == 200, negative.text
    assert negative.json()["classification"] == "NEGATIVE"

    ambiguous = client.post(
        "/api/outreach/classify",
        json={
            "creator_id": creator_id,
            "text": "Sent you a birthday card last week",
        },
    )
    assert ambiguous.status_code == 200, ambiguous.text
    ambiguous_body = ambiguous.json()
    assert ambiguous_body["classification"] == "NEGATIVE"
    assert "consent is not assumed" in ambiguous_body["reason"].lower()
    assert ambiguous_body["email"]["direction"] == "inbound"
    assert ambiguous_body["email"]["classification"] == "NEGATIVE"
    assert ambiguous_body["email"]["approved"] is False


def test_product_ordinal_drives_locked_splits_and_rejects_override(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    first = _create_product(client, creator_id, title="First Product")
    assert first["is_first_product"] is True
    assert first["status"] == "draft"
    assert first["split"] == {
        "creator_bps": 6_000,
        "platform_bps": 4_000,
        "creator_share": 0.60,
        "platform_share": 0.40,
    }

    second = _create_product(client, creator_id, title="Second Product", price_cents=2_500)
    assert second["is_first_product"] is False
    assert second["split"] == {
        "creator_bps": 5_000,
        "platform_bps": 5_000,
        "creator_share": 0.50,
        "platform_share": 0.50,
    }

    mismatch = client.post(
        "/api/products",
        json={
            "creator_id": creator_id,
            "title": "Third Product",
            "price_cents": 3_000,
            "is_first_product": True,
        },
    )
    assert mismatch.status_code == 409, mismatch.text
    detail = mismatch.json()["detail"]
    assert detail["code"] == "split_rule_mismatch"
    assert detail["details"]["computed_is_first_product"] is False
    assert detail["details"]["existing_products"] == 2

    other_creator = create_qualified_creator(
        client, handle="@secondcreator", email="second@example.com"
    )
    first_mismatch = client.post(
        "/api/products",
        json={
            "creator_id": other_creator,
            "title": "False First",
            "price_cents": 1_900,
            "is_first_product": False,
        },
    )
    assert first_mismatch.status_code == 409, first_mismatch.text
    assert first_mismatch.json()["detail"]["code"] == "split_rule_mismatch"
    assert (
        first_mismatch.json()["detail"]["details"]["computed_is_first_product"] is True
    )
    assert client.get(f"/api/products?creator_id={creator_id}").json()["count"] == 2


def test_publish_gate_then_default_mock_publish(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    product = _create_product(client, creator_id)

    blocked = client.post("/api/whop/publish", json={"product_id": product["id"]})
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"]["code"] == "publish_blocked"

    published = _approve_and_publish(client, product["id"])
    assert published["published"] is True
    assert published["created"] is True
    assert published["whop"]["mock"] is True
    assert published["product"]["status"] == "live"
    assert published["product"]["creator_approved"] is True


def test_sales_split_idempotency_and_refund_through_api(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    first = _create_product(client, creator_id, title="First Product", price_cents=1_900)
    _approve_and_publish(client, first["id"])

    sale = client.post(
        "/api/revenue/sales",
        json={
            "product_id": first["id"],
            "whop_sale_id": "sale_first_1000",
            "gross_cents": 1_000,
            "currency": "USD",
        },
    )
    assert sale.status_code == 200, sale.text
    sale_body = sale.json()
    assert sale_body["created"] is True
    assert sale_body["payout"]["creator_cents"] == 600
    assert sale_body["payout"]["platform_cents"] == 400
    assert sale_body["sale"]["creator_cents"] == 600
    assert sale_body["sale"]["platform_cents"] == 400
    assert sale_body["sale"]["currency"] == "usd"
    sale_id = sale_body["sale"]["id"]

    duplicate = client.post(
        "/api/revenue/sales",
        json={
            "product_id": first["id"],
            "whop_sale_id": "sale_first_1000",
            "gross_cents": 9_999,
        },
    )
    assert duplicate.status_code == 200, duplicate.text
    duplicate_body = duplicate.json()
    assert duplicate_body["created"] is False
    assert duplicate_body["sale"]["id"] == sale_id
    assert duplicate_body["sale"]["gross_cents"] == 1_000
    assert duplicate_body["payout"]["creator_cents"] == 600

    refund = client.post(
        f"/api/revenue/sales/{sale_id}/refund", json={"refunded_cents": 100}
    )
    assert refund.status_code == 200, refund.text
    refund_body = refund.json()
    assert refund_body["sale"]["refunded_cents"] == 100
    assert refund_body["sale"]["status"] == "partially_refunded"
    assert refund_body["payout"]["net_cents"] == 900
    assert refund_body["payout"]["creator_cents"] == 540
    assert refund_body["payout"]["platform_cents"] == 360

    second = _create_product(client, creator_id, title="Second Product", price_cents=2_500)
    _approve_and_publish(client, second["id"])
    second_sale = client.post(
        "/api/revenue/sales",
        json={
            "product_id": second["id"],
            "whop_sale_id": "sale_second_1001",
            "gross_cents": 1_001,
        },
    )
    assert second_sale.status_code == 200, second_sale.text
    assert second_sale.json()["payout"]["creator_cents"] == 501
    assert second_sale.json()["payout"]["platform_cents"] == 500

    revenue = client.get("/api/revenue").json()
    summary = revenue["summary"]
    assert summary["sales_count"] == 2
    assert summary["gross_cents"] == 2_001
    assert summary["refunded_cents"] == 100
    assert summary["net_cents"] == 1_901
    assert summary["creator_cents"] == 1_041
    assert summary["instabix_cents"] == 860


def test_api_key_is_enforced_on_api_routes_but_not_health(tmp_path: Path) -> None:
    app = create_app(make_settings(tmp_path, api_key="test-secret-key"))
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200, health.text
        assert health.json()["api_key_required"] is True

        no_key = client.get("/api/settings")
        assert no_key.status_code == 401, no_key.text
        assert no_key.json()["detail"]["code"] == "unauthorized"

        wrong_key = client.get("/api/settings", headers={"X-API-Key": "wrong"})
        assert wrong_key.status_code == 401

        authorized = client.get(
            "/api/settings", headers={"X-API-Key": "test-secret-key"}
        )
        assert authorized.status_code == 200, authorized.text
        assert authorized.json()["branding"] == "hybrid"

        blocked_write = client.post("/api/scout", json=scout_payload())
        assert blocked_write.status_code == 401

        allowed_write = client.post(
            "/api/scout",
            json=scout_payload(),
            headers={"X-API-Key": "test-secret-key"},
        )
        assert allowed_write.status_code == 200, allowed_write.text

        blocked_publish = client.post("/api/whop/publish", json={"product_id": 1})
        assert blocked_publish.status_code == 401


def test_creator_approval_gate_still_blocks_publish(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    product = _create_product(client, creator_id)

    blocked = client.post("/api/whop/publish", json={"product_id": product["id"]})
    assert blocked.status_code == 409, blocked.text
    detail = blocked.json()["detail"]
    assert detail["code"] == "publish_blocked"
    assert detail["details"]["creator_approved"] is False


def test_ordinal_override_still_rejected_and_bps_locked(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    first = _create_product(client, creator_id, title="First")
    assert first["split"]["creator_bps"] == 6_000
    assert first["split"]["platform_bps"] == 4_000
    second = _create_product(client, creator_id, title="Second", price_cents=2_500)
    assert second["split"]["creator_bps"] == 5_000
    assert second["split"]["platform_bps"] == 5_000

    rejected = client.post(
        "/api/products",
        json={
            "creator_id": creator_id,
            "title": "Third",
            "price_cents": 3_000,
            "is_first_product": True,
        },
    )
    assert rejected.status_code == 409, rejected.text
    assert rejected.json()["detail"]["code"] == "split_rule_mismatch"


def test_production_without_key_still_fails_closed_with_503(tmp_path: Path) -> None:
    settings = make_settings(
        tmp_path,
        app_env="production",
        whop_api_key=None,
        whop_mock_mode="false",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        creator_id = create_qualified_creator(client)
        product = _create_product(client, creator_id)
        approval = client.post(
            f"/api/products/{product['id']}/approve", json={"approved_by": "creator"}
        )
        assert approval.status_code == 200, approval.text

        response = client.post("/api/whop/publish", json={"product_id": product["id"]})
        assert response.status_code == 503, response.text
        assert response.json()["detail"]["code"] == "whop_not_configured"


def test_publish_response_is_enriched_with_link_audit_and_notifications(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    product = _create_product(client, creator_id)
    body = _approve_and_publish(client, product["id"])

    assert body["whop"]["affiliate_link"] is None
    assert body["whop"]["blocked_reason"]
    assert body["whop"]["asset_mapping"] == {}
    assert body["blocked"] == []
    assert body["audit"] == []
    assert [item["kind"] for item in body["notifications"]] == ["product_ready"]
    assert body["notifications"][0]["status"] == "blocked"


def test_audit_endpoint_exposes_call_log_scoped_to_product(
    tmp_path: Path, monkeypatch: Any
) -> None:
    settings = make_settings(
        tmp_path,
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    app = create_app(settings)

    def fake_request(method: str, url: str, **kwargs: Any) -> httpx.Response:
        if url.endswith("/products"):
            return httpx.Response(200, json={"id": "prod_audit_1", "route": "audit-route"})
        if url.endswith("/variants"):
            return httpx.Response(
                200,
                json={
                    "id": "plan_audit_1",
                    "purchase_url": "https://whop.com/checkout/plan_audit_1",
                },
            )
        raise AssertionError(f"Unexpected Whop URL: {url}")

    monkeypatch.setattr(httpx, "request", fake_request)

    with TestClient(app) as client:
        creator_id = create_qualified_creator(client)
        product = _create_product(client, creator_id)
        _approve_and_publish(client, product["id"])

        all_records = client.get("/api/whop/audit").json()
        assert all_records["count"] == 2
        scoped = client.get(
            "/api/whop/audit", params={"product_id": "prod_audit_1"}
        ).json()
        assert scoped["count"] == 1
        assert scoped["items"][0]["path"] == "/variants"
        assert scoped["items"][0]["product_id"] == "prod_audit_1"

        rendered = json.dumps(all_records)
        assert "whop_test_secret" not in rendered
        assert "Authorization" not in rendered
