from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

import app.whop as whop_module
from app.agents.agent4 import (
    DISCLOSURE,
    collect_instagram_metrics,
    collect_testimonials,
    track_launch_performance,
)
from app.config import Settings
from app.errors import WhopAPIError
from app.main import create_app
from app.whop import EVENT_FAILED_RETRY, EVENT_PRODUCT_READY, WhopClient
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
    assert stored["status"] == "live"
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
        assert stored["status"] == "creator_approved"
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


def test_live_publish_maps_optional_assets_and_reports_blocked(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = make_settings(
        tmp_path,
        app_env="production",
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    events: list[dict[str, Any]] = []

    def fake_notify(event: dict[str, Any]) -> dict[str, Any]:
        events.append(event)
        return {"status": "sent", "channel": "test"}

    whop = WhopClient(settings, notify_human=fake_notify)
    calls: list[dict[str, Any]] = []

    def fake_request(method: str, url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"method": method, "url": url, **kwargs})
        if url.endswith("/products"):
            return httpx.Response(
                200,
                json={
                    "id": "prod_asset_1",
                    "route": "asset-route",
                    "affiliate_link": "https://whop.com/aff/creator42",
                },
            )
        if url.endswith("/variants"):
            return httpx.Response(
                200,
                json={"id": "plan_asset_1", "purchase_url": "https://whop.com/checkout/plan_asset_1"},
            )
        raise AssertionError(f"Unexpected Whop URL: {url}")

    monkeypatch.setattr(httpx, "request", fake_request)

    result = whop.publish_product(
        slug="asset-slug",
        title="Asset Product",
        description="A description",
        price_cents=1_900,
        metadata={"creator_id": "42"},
        cover="https://cdn.example/cover.png",
        pdf="/files/guide.pdf",
        community={"platform": "discord", "server_id": "123", "api_key": "must-not-leak"},
    )

    assert result.affiliate_link == "https://whop.com/aff/creator42"
    assert result.blocked_reason is None
    assert set(result.asset_mapping) == {"cover", "pdf", "community"}
    assert {item["kind"] for item in result.blocked} == {"cover", "pdf", "community"}
    assert all(item["status"] == "blocked" for item in result.blocked)
    assert all("No upload URL was invented" in item["reason"] or "No endpoint was guessed" in item["reason"]
               for item in result.blocked)

    product_metadata = calls[0]["json"]["metadata"]
    assert product_metadata["cover_ref"].startswith("cover:url:")
    assert product_metadata["pdf_ref"].startswith("pdf:ref:")
    assert "platform=discord" in product_metadata["community"]
    assert "api_key" not in product_metadata["community"]
    assert "must-not-leak" not in product_metadata["community"]
    assert len(calls) == 2


def test_missing_affiliate_link_returns_null_and_blocked_reason(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = make_settings(
        tmp_path,
        app_env="production",
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    whop = WhopClient(settings)
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(httpx, "request", _fake_whop_transport(calls))

    result = whop.publish_product(
        slug="no-affiliate",
        title="No Affiliate",
        description="A description",
        price_cents=1_900,
    )
    assert result.affiliate_link is None
    assert result.blocked_reason
    assert "none was fabricated" in result.blocked_reason

    mock_client = WhopClient(make_settings(tmp_path))
    mock_result = mock_client.publish_product(
        slug="mock-no-affiliate",
        title="Mock No Affiliate",
        description="A description",
        price_cents=1_900,
    )
    assert mock_result.affiliate_link is None
    assert "Mock mode" in mock_result.blocked_reason


def test_audit_records_every_call_without_secrets(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = make_settings(
        tmp_path,
        app_env="production",
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    whop = WhopClient(settings)
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(httpx, "request", _fake_whop_transport(calls))

    result = whop.publish_product(
        slug="audit-slug",
        title="Audit Product",
        description="A description",
        price_cents=1_900,
    )

    records = whop.audit_sink.records
    assert len(records) == 2 == len(result.audit)
    assert [entry.method for entry in records] == ["POST", "POST"]
    assert [entry.path for entry in records] == ["/products", "/variants"]
    assert [entry.attempt for entry in records] == [1, 1]
    assert all(entry.status == "success" for entry in records)
    assert all(entry.reference_id == "instabix-product-audit-slug" for entry in records)
    assert records[1].product_id == "prod_live_1"
    for record in records:
        payload = record.to_dict()
        for key in (
            "timestamp",
            "method",
            "path",
            "product_id",
            "attempt",
            "status",
            "error_class",
            "request_id",
        ):
            assert key in payload

    rendered = json.dumps([entry.to_dict() for entry in records])
    assert "whop_test_secret" not in rendered
    assert "Authorization" not in rendered
    assert "Idempotency-Key" not in rendered
    assert "Bearer" not in rendered

    assert [item["kind"] for item in result.notifications] == [EVENT_PRODUCT_READY]
    assert result.notifications[0]["status"] == "blocked"


def test_retry_once_then_notify_human(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = make_settings(
        tmp_path,
        app_env="production",
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    events: list[dict[str, Any]] = []

    def fake_notify(event: dict[str, Any]) -> dict[str, Any]:
        events.append(event)
        return {"status": "blocked"}

    whop = WhopClient(settings, notify_human=fake_notify)
    monkeypatch.setattr(whop_module.time, "sleep", lambda _seconds: None)
    attempts: list[str] = []

    def always_busy(method: str, url: str, **kwargs: Any) -> httpx.Response:
        attempts.append(url)
        return httpx.Response(503, json={"message": "busy"})

    monkeypatch.setattr(httpx, "request", always_busy)

    with pytest.raises(WhopAPIError):
        whop.publish_product(
            slug="retry-slug",
            title="Retry Product",
            description="A description",
            price_cents=1_900,
        )

    assert attempts == ["https://api.whop.com/api/v1/products"] * 2
    assert [entry.attempt for entry in whop.audit_sink.records] == [1, 2]
    assert [entry.status for entry in whop.audit_sink.records] == ["retry", "error"]
    failed = [event for event in events if event["kind"] == EVENT_FAILED_RETRY]
    assert len(failed) == 1
    assert failed[0]["details"]["path"] == "/products"
    assert failed[0]["details"]["error_class"] == "WhopAPIError"


def test_instagram_inputs_are_official_and_testimonials_need_permission() -> None:
    blocked = collect_instagram_metrics(ig_user_id=None, access_token=None)
    assert blocked.status == "blocked"
    assert blocked.request is None

    good = collect_instagram_metrics(
        ig_user_id="1789", access_token="secret-token", fields=["followers_count"]
    )
    assert good.status == "ok"
    assert good.source == "official_instagram_graph_api"
    assert good.request is not None
    assert good.request["url"].startswith("https://graph.facebook.com/")
    assert good.request["params"]["fields"] == "followers_count"
    assert "secret-token" not in json.dumps(good.to_dict())

    unofficial = collect_instagram_metrics(
        ig_user_id="1789", access_token="secret-token", fields=["scraped_likes"]
    )
    assert unofficial.status == "blocked"
    assert "official Graph API fields" in unofficial.blocked_reason

    no_permission = collect_testimonials(permission_granted=False)
    assert no_permission["status"] == "blocked"
    assert no_permission["items"] == []
    assert "permission" in no_permission["blocked_reason"].lower()

    with_permission = collect_testimonials(permission_granted=True)
    assert with_permission["status"] == "blocked"
    assert with_permission["items"] == []


def test_launch_asset_specs_and_tracker_are_blocked_without_credentials(
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

    assert len(assets["story_template_specs"]) == 3
    assert [item["id"] for item in assets["story_template_specs"]] == [
        "teaser",
        "proof",
        "cta",
    ]
    assert len(assets["launch_caption_variations"]) == 3
    tracker = assets["launch_performance"]
    assert tracker == track_launch_performance()
    assert tracker["status"] == "blocked"
    assert tracker["metrics"] is None
    assert "credentials" in tracker["blocked_reason"]

    assert [item["kind"] for item in body["notifications"]] == [EVENT_PRODUCT_READY]
    assert all(item["status"] == "blocked" for item in body["notifications"])
