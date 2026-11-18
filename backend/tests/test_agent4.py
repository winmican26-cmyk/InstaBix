from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.agents.agent4 import DISCLOSURE
from app.config import Settings
from app.main import create_app
from app.whop import WhopClient
from tests.conftest import create_product, create_qualified_creator, make_settings


def _approve_product(client: TestClient, product_id: int) -> dict[str, Any]:
    response = client.post(
        f"/api/products/{product_id}/approve", json={"approved_by": "creator"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_publish_blocked_until_creator_approves(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    product = create_product(client, creator_id)

    response = client.post("/api/whop/publish", json={"product_id": product["id"]})

    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "publish_blocked"
    assert detail["details"]["product_id"] == product["id"]
    assert detail["details"]["creator_approved"] is False
    reasons = detail["details"]["reasons"]
    assert any("Creator approval" in reason for reason in reasons)

    stored = client.get(f"/api/products/{product['id']}").json()
    assert stored["status"] == "draft"
    assert stored["creator_approved"] is False
    assert stored["whop_product_id"] is None
    assert stored["published_at"] is None


def test_mock_publish_succeeds_after_approval(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    status = client.get("/api/whop").json()
    assert status["mode"] == "mock"
    assert status["configured"] is False
    assert status["mock"] is True
    assert status["publish_ready"] is True

    creator_id = create_qualified_creator(client)
    product = create_product(client, creator_id, price_cents=1_900)
    _approve_product(client, product["id"])

    response = client.post("/api/whop/publish", json={"product_id": product["id"]})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["published"] is True
    assert body["created"] is True
    assert body["whop"]["mock"] is True
    assert body["whop"]["mode"] == "mock"
    assert body["whop"]["whop_product_id"].startswith("prod_mock_")

    stored = client.get(f"/api/products/{product['id']}").json()
    assert stored["status"] == "published"
    assert stored["published_at"] is not None
    assert stored["whop_product_id"] == body["whop"]["whop_product_id"]
    assert stored["whop_plan_id"] == body["whop"]["whop_plan_id"]


def test_repeat_publish_is_idempotent(
    api: tuple[TestClient, Any, Settings], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, app, _ = api
    creator_id = create_qualified_creator(client)
    product = create_product(client, creator_id)
    _approve_product(client, product["id"])

    first = client.post("/api/whop/publish", json={"product_id": product["id"]})
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["created"] is True

    def _must_not_call_whop(**kwargs: Any) -> None:
        raise AssertionError("A repeat publish must not create a second Whop product.")

    monkeypatch.setattr(app.state.whop, "publish_product", _must_not_call_whop)

    second = client.post("/api/whop/publish", json={"product_id": product["id"]})
    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["published"] is True
    assert second_body["created"] is False
    for key in (
        "whop_product_id",
        "whop_plan_id",
        "checkout_url",
        "mock",
        "mode",
    ):
        assert second_body["whop"][key] == first_body["whop"][key]
    assert second_body["assets"] == first_body["assets"]

    products = client.get("/api/products").json()
    assert products["count"] == 1


def test_launch_assets_include_links_templates_and_disclosure(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    product = create_product(client, creator_id, price_cents=1_900)
    _approve_product(client, product["id"])

    response = client.post("/api/whop/publish", json={"product_id": product["id"]})
    assert response.status_code == 200, response.text
    body = response.json()
    assets = body["assets"]
    assert set(assets) >= {"bio_link", "story_templates", "launch_captions"}
    assert assets["bio_link"] == body["whop"]["checkout_url"]
    assert assets["bio_link"].startswith("https://whop.com/checkout/")

    story_templates = assets["story_templates"]
    launch_captions = assets["launch_captions"]
    assert len(story_templates) == 4
    assert len(launch_captions) == 3
    assert [item["frame"] for item in story_templates] == [1, 2, 3, 4]
    assert [item["id"] for item in launch_captions] == [
        "value_first",
        "behind_the_scenes",
        "direct_offer",
    ]
    for caption in launch_captions:
        assert "#ad" in caption["disclosure"]
        assert caption["disclosure"] == DISCLOSURE
        assert "#ad" in caption["hashtags"]
        assert caption["link"] == assets["bio_link"]
    assert story_templates[-1]["kind"] == "cta"
    assert story_templates[-1]["disclosure"] == DISCLOSURE
    assert "#ad" in story_templates[-1]["disclosure"]
    assert story_templates[-1]["link"] == assets["bio_link"]

    stored = client.get(f"/api/products/{product['id']}").json()
    assert stored["bio_link"] == assets["bio_link"]
    assert stored["story_templates"] == story_templates
    assert stored["launch_captions"] == launch_captions


@pytest.mark.parametrize("mock_mode", ["auto", "true"])
def test_production_without_key_is_disabled_and_publish_fails_closed(
    tmp_path: Path, mock_mode: str
) -> None:
    settings = make_settings(
        tmp_path,
        app_env="production",
        whop_api_key=None,
        whop_mock_mode=mock_mode,
    )
    assert settings.whop_mode == "disabled"
    app = create_app(settings)
    with TestClient(app) as client:
        status = client.get("/api/whop").json()
        assert status["mode"] == "disabled"
        assert status["configured"] is False
        assert status["mock"] is False
        assert status["publish_ready"] is False
        assert client.get("/api/health").json()["whop"]["mode"] == "disabled"

        creator_id = create_qualified_creator(client)
        product = create_product(client, creator_id)
        _approve_product(client, product["id"])

        response = client.post("/api/whop/publish", json={"product_id": product["id"]})
        assert response.status_code == 503, response.text
        detail = response.json()["detail"]
        assert detail["code"] == "whop_not_configured"

        stored = client.get(f"/api/products/{product['id']}").json()
        assert stored["status"] == "approved"
        assert stored["whop_product_id"] is None
        assert stored["bio_link"] is None
        assert stored["published_at"] is None


def _fake_whop_transport(calls: list[dict[str, Any]]):  # type: ignore[no-untyped-def]
    def fake_request(method: str, url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"method": method, "url": url, **kwargs})
        if url.endswith("/products"):
            return httpx.Response(
                200, json={"id": "prod_live_1", "route": "training-blueprint"}
            )
        if url.endswith("/variants"):
            return httpx.Response(
                200,
                json={
                    "id": "plan_live_1",
                    "purchase_url": "https://whop.com/checkout/plan_live_1",
                },
            )
        raise AssertionError(f"Unexpected Whop URL: {url}")

    return fake_request


def test_live_whop_payload_posts_product_then_one_time_variant(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = make_settings(
        tmp_path,
        app_env="production",
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
        whop_account_id="acct_test",
    )
    whop = WhopClient(settings)
    assert whop.mode == "live"

    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(httpx, "request", _fake_whop_transport(calls))

    result = whop.publish_product(
        slug="the-training-blueprint-42-abc123",
        title="The Training Blueprint",
        description="A practical training plan with a clear 12-week structure.",
        price_cents=1_900,
        metadata={"branding": "hybrid", "creator_id": "42"},
    )

    assert result.mock is False
    assert result.mode == "live"
    assert result.product_id == "prod_live_1"
    assert result.plan_id == "plan_live_1"
    assert result.checkout_url == "https://whop.com/checkout/plan_live_1"

    assert [call["method"] for call in calls] == ["POST", "POST"]
    assert calls[0]["url"] == "https://api.whop.com/api/v1/products"
    assert calls[1]["url"] == "https://api.whop.com/api/v1/variants"
    assert calls[0]["timeout"] == settings.whop_timeout_seconds

    for call in calls:
        headers = call["headers"]
        assert headers["Authorization"] == "Bearer whop_test_secret"
        assert headers["Api-Version-Date"] == settings.whop_api_version_date
        assert headers["Content-Type"] == "application/json"
        assert headers["Idempotency-Key"]

    product_key = calls[0]["headers"]["Idempotency-Key"]
    variant_key = calls[1]["headers"]["Idempotency-Key"]
    assert variant_key.startswith(product_key)
    assert variant_key != product_key

    product_payload = calls[0]["json"]
    assert product_payload["title"] == "The Training Blueprint"
    assert product_payload["route"] == "the-training-blueprint-42-abc123"
    assert product_payload["visibility"] == "visible"
    assert product_payload["account_id"] == "acct_test"
    assert product_payload["metadata"] == {"branding": "hybrid", "creator_id": "42"}

    variant_payload = calls[1]["json"]
    assert variant_payload["product_id"] == "prod_live_1"
    assert variant_payload["billing_type"] == "one_time"
    assert variant_payload["initial_price"] == 1_900 / 100
    assert variant_payload["currency"] == "usd"
    assert variant_payload["account_id"] == "acct_test"
    assert variant_payload["metadata"]["instabix_product_id"] == product_key
    assert [call["url"] for call in calls if call["url"].endswith("/variants")] == [
        "https://api.whop.com/api/v1/variants"
    ]


def test_api_publish_uses_live_whop_when_key_is_configured(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = make_settings(
        tmp_path,
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    app = create_app(settings)
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(httpx, "request", _fake_whop_transport(calls))

    with TestClient(app) as client:
        whop_status = client.get("/api/settings").json()["whop"]
        assert whop_status["mode"] == "live"
        assert whop_status["configured"] is True

        creator_id = create_qualified_creator(client)
        product = create_product(client, creator_id, price_cents=1_900)
        _approve_product(client, product["id"])

        response = client.post("/api/whop/publish", json={"product_id": product["id"]})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["created"] is True
        assert body["whop"]["mock"] is False
        assert body["whop"]["whop_product_id"] == "prod_live_1"
        assert body["assets"]["bio_link"] == "https://whop.com/checkout/plan_live_1"

    assert [call["method"] for call in calls] == ["POST", "POST"]
    assert [call["url"] for call in calls] == [
        "https://api.whop.com/api/v1/products",
        "https://api.whop.com/api/v1/variants",
    ]
    assert calls[1]["json"]["product_id"] == "prod_live_1"
    assert calls[1]["json"]["initial_price"] == 19.0
