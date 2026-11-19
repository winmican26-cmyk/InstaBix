"""Stage 3 API surface and the exact Whop publish contract."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.conftest import create_product, create_qualified_creator, make_settings, scout_payload

FLAT_PUBLISH_KEYS = {
    "product_id",
    "whop_product_id",
    "whop_url",
    "split_creator",
    "split_operator",
    "bio_link",
    "story_templates",
    "launch_captions",
    "status",
}
NESTED_PUBLISH_KEYS = {
    "published",
    "created",
    "product",
    "whop",
    "assets",
    "audit",
    "notifications",
    "blocked",
}


def _store_creator(
    client: TestClient,
    handle: str,
    *,
    niche: str = "Sports",
    followers: int = 80_000,
    views: int = 12_000,
) -> int:
    """Store a real creator row; qualification is irrelevant to search filters."""
    response = client.post(
        "/api/scout",
        json=scout_payload(
            handle=handle,
            email=f"{handle.lstrip('@')}@example.com",
            niche=niche,
            followers=followers,
            median_views=views,
            recent_reel_views=[views] * 12,
        ),
    )
    assert response.status_code == 200, response.text
    return int(response.json()["creator"]["id"])


def _approve(client: TestClient, product_id: int) -> None:
    response = client.post(
        f"/api/products/{product_id}/approve", json={"approved_by": "creator"}
    )
    assert response.status_code == 200, response.text


def _generate(client: TestClient, creator_id: int, title: str) -> dict[str, Any]:
    response = client.post(
        "/api/products/generate",
        json={
            "creator_id": creator_id,
            "title": title,
            "price_cents": 1_900,
            "target_words": 7_000,
            "generate_toc": False,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _all_routes(router: Any) -> list[Any]:
    """Flatten routes, including this FastAPI version's lazy included routers."""
    routes: list[Any] = []
    for route in getattr(router, "routes", []):
        routes.append(route)
        original = getattr(route, "original_router", None)
        if original is not None:
            routes.extend(_all_routes(original))
    return routes


def test_health_alias_is_api_key_exempt_and_publish_route_is_unique(
    tmp_path: Any,
) -> None:
    app = create_app(make_settings(tmp_path, api_key="stage3-secret"))
    publish_routes = [
        route
        for route in _all_routes(app)
        if getattr(route, "path", None) == "/api/whop/publish"
        and "POST" in getattr(route, "methods", set())
    ]
    assert len(publish_routes) == 1

    with TestClient(app) as client:
        alias = client.get("/health")
        assert alias.status_code == 200, alias.text
        canonical = client.get("/api/health")
        assert canonical.status_code == 200, canonical.text
        assert alias.json() == canonical.json()
        assert alias.json()["status"] == "ok"

        # The canonical API remains protected; only health is exempt.
        assert client.get("/api/settings").status_code == 401


def test_scout_search_filters_stored_rows_only(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    alpha = _store_creator(client, "@alpha", niche="Sports", followers=80_000, views=12_000)
    beta = _store_creator(client, "@beta", niche="Home", followers=150_000, views=50_000)
    gamma = _store_creator(client, "@gamma", niche="Sports", followers=60_000, views=9_000)

    def ids(**filters: Any) -> set[int]:
        response = client.post("/api/scout/search", json=filters)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["count"] == len(body["items"])
        return {item["id"] for item in body["items"]}

    assert ids() == {alpha, beta, gamma}
    assert ids(niche="Sports") == {alpha, gamma}
    assert ids(niche="sports") == {alpha, gamma}
    assert ids(min_followers=100_000) == {beta}
    assert ids(max_followers=70_000) == {gamma}
    assert ids(min_views=40_000) == {beta}
    assert ids(min_views=10_000, max_views=20_000) == {alpha}
    assert ids(niche="Sports", min_followers=70_000) == {alpha}

    rejected = client.post("/api/scout/search", json={"min_views": 20_000, "max_views": 10_000})
    assert rejected.status_code == 422, rejected.text


def test_creators_alias_supports_niche_and_status_filters(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    sports_id = _store_creator(client, "@alpha", niche="Sports")
    _store_creator(client, "@beta", niche="Home")

    all_rows = client.get("/api/creators")
    assert all_rows.status_code == 200, all_rows.text
    assert all_rows.json()["count"] == 2

    niches = client.get("/api/creators", params={"niche": "Sports"})
    assert niches.json()["count"] == 1
    assert niches.json()["items"][0]["id"] == sports_id

    qualified = client.get(
        "/api/creators", params={"niche": "Sports", "status": "Qualified"}
    )
    assert qualified.json()["count"] == 1
    assert client.get(
        "/api/creators", params={"niche": "Sports", "status": "Rejected"}
    ).json()["count"] == 0
    assert client.get("/api/scout").json()["count"] == 2


def test_creator_approve_uses_qualified_status_and_is_idempotent(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    first = client.post(f"/api/creators/{creator_id}/approve", json={})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["status"] == "Qualified"
    assert body["qualified"] is True
    assert body["approved"] is True
    assert body["approval_status"] == "Qualified"

    # One campaign per creator is ensured without violating the UNIQUE key.
    again = client.post(f"/api/creators/{creator_id}/approve")
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "Qualified"
    campaigns = client.get("/api/campaigns", params={"creator_id": creator_id}).json()
    assert campaigns["count"] == 1

    missing = client.post("/api/creators/9999/approve", json={})
    assert missing.status_code == 404, missing.text


def test_outreach_send_creates_draft_only_without_provider(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    created = client.post(
        "/api/outreach/send", json={"creator_id": creator_id, "template_key": 2}
    )
    assert created.status_code == 200, created.text
    draft = created.json()
    assert draft["status"] == "draft_needs_approval"
    assert draft["step"] == 2
    assert draft["opened"] is False
    assert draft["replied"] is False
    assert draft["approved"] is False
    assert draft["sent_at"] is None
    assert draft["delivery"]["status"] == "not_sent"
    assert draft["approval"]["required"] is True
    assert f"/api/outreach/{draft['id']}/approve" == draft["approval"]["endpoint"]

    stored = client.get(
        "/api/outreach", params={"status": "draft_needs_approval"}
    ).json()
    assert stored["count"] == 1
    assert stored["items"][0]["id"] == draft["id"]

    # Numeric-string and template-name keys map to the same locked steps.
    third = client.post(
        "/api/outreach/send", json={"creator_id": creator_id, "template_key": "close_loop"}
    )
    assert third.json()["step"] == 3
    named = client.post(
        "/api/outreach/send", json={"creator_id": creator_id, "template_key": "1"}
    )
    assert named.json()["step"] == 1

    # The untouched legacy route still produces its original draft status.
    legacy = client.post(
        "/api/outreach", json={"creator_id": creator_id, "template_key": "initial"}
    )
    assert legacy.json()["status"] == "draft"


def test_products_generate_forces_toc_and_server_derived_splits(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    first = _generate(client, creator_id, "Generated One")
    assert first["branding"] == "hybrid"
    assert first["is_first_product"] is True
    assert first["split"]["creator_bps"] == 6_000
    assert first["split"]["platform_bps"] == 4_000
    assert first["split_creator"] == 0.6
    assert first["split_operator"] == 0.4
    assert isinstance(first["toc"], dict) and first["toc"]

    # A client ordinal is ignored here as well: the stored ordinal wins.
    second = client.post(
        "/api/products/generate",
        json={
            "creator_id": creator_id,
            "title": "Generated Two",
            "price_cents": 2_500,
            "is_first_product": True,
            "branding": "creator_only",
        },
    )
    assert second.status_code == 200, second.text
    body = second.json()
    assert body["branding"] == "hybrid"
    assert body["is_first_product"] is False
    assert body["split"]["creator_bps"] == 5_000
    assert body["split"]["platform_bps"] == 5_000
    assert body["toc"]


def test_publish_flat_contract_accepts_both_ids_and_ignores_client_ordinal(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)

    first = _generate(client, creator_id, "Flat Contract One")
    assert first["id"] == 1
    _approve(client, first["id"])
    published = client.post(
        "/api/whop/publish",
        json={"product_id": first["id"], "is_first_product": False},
    )
    assert published.status_code == 200, published.text
    body = published.json()

    assert FLAT_PUBLISH_KEYS <= body.keys()
    assert NESTED_PUBLISH_KEYS <= body.keys()
    assert body["product_id"] == "prod_1"
    assert body["whop_product_id"] == body["whop"]["whop_product_id"]
    assert body["whop_product_id"].startswith("prod_mock_")
    assert body["whop_url"] == body["product"]["whop_url"]
    assert body["status"] == "live"
    assert body["published"] is True
    assert body["created"] is True

    # Stored ordinal, not the client's False, is echoed and determines splits.
    assert body["is_first_product"] is True
    assert body["split_creator"] == 0.6
    assert body["split_operator"] == 0.4
    assert body["bio_link"] == body["assets"]["bio_link"]
    assert body["story_templates"] and all(
        isinstance(item, str) for item in body["story_templates"]
    )
    assert body["launch_captions"] and all(
        isinstance(item, str) for item in body["launch_captions"]
    )
    # Disclosure is compliance content: renderers must not drop it.
    assert any("Paid partnership" in item for item in body["story_templates"])
    assert any("Paid partnership" in item for item in body["launch_captions"])

    second = _generate(client, creator_id, "Flat Contract Two")
    assert second["id"] == 2
    _approve(client, second["id"])
    external = f"prod_{second['id']}"
    assert external == "prod_2"
    published_second = client.post(
        "/api/whop/publish",
        json={"product_id": external, "is_first_product": True},
    )
    assert published_second.status_code == 200, published_second.text
    second_body = published_second.json()
    assert second_body["product_id"] == "prod_2"
    assert second_body["is_first_product"] is False
    assert second_body["split_creator"] == 0.5
    assert second_body["split_operator"] == 0.5

    unparseable = client.post("/api/whop/publish", json={"product_id": "prod_x"})
    assert unparseable.status_code == 422, unparseable.text


def test_whop_products_get_resolves_ids_and_reports_not_published(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    product = _generate(client, creator_id, "Lookup Product")
    _approve(client, product["id"])
    published = client.post(
        "/api/whop/publish", json={"product_id": f"prod_{product['id']}"}
    )
    assert published.status_code == 200, published.text
    whop_product_id = published.json()["whop_product_id"]

    for identifier in (f"prod_{product['id']}", str(product["id"])):
        response = client.get(f"/api/whop/products/{identifier}")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["product_id"] == "prod_1"
        assert body["whop_product_id"] == whop_product_id
        assert body["mode"] == "mock"
        assert body["status"] == "live"
        assert body["whop"]["id"] == whop_product_id
        # Mock mode must not invent a URL.
        assert "checkout_url" not in body["whop"]
        assert "product_url" not in body["whop"]

    unpublished = create_product(client, creator_id, title="Unpublished")
    blocked = client.get(f"/api/whop/products/prod_{unpublished['id']}")
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"]["code"] == "not_published"

    missing = client.get("/api/whop/products/prod_9999")
    assert missing.status_code == 404, missing.text


def test_whop_webhook_is_a_fail_closed_next_stub(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api

    response = client.post("/api/whop/webhook", json={"event": "payment.succeeded"})
    assert response.status_code == 501, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "webhook_next_cut"
    assert "/api/revenue/sales" in detail["message"]
    assert client.get("/api/revenue").json()["summary"]["sales_count"] == 0


def test_revenue_adds_payouts_due_without_dropping_existing_keys(
    api: tuple[TestClient, Any, Settings],
) -> None:
    client, _, _ = api
    creator_id = create_qualified_creator(client)
    product = create_product(client, creator_id, title="Revenue Product")
    _approve(client, product["id"])
    assert client.post(
        "/api/whop/publish", json={"product_id": product["id"]}
    ).status_code == 200

    sale = client.post(
        "/api/revenue/sales",
        json={"product_id": product["id"], "whop_sale_id": "stage3_sale_1", "gross_cents": 1_000},
    )
    assert sale.status_code == 200, sale.text

    summary = client.get("/api/revenue").json()["summary"]
    assert {
        "sales_count",
        "gross_cents",
        "refunded_cents",
        "net_cents",
        "creator_cents",
        "instabix_cents",
    } <= summary.keys()
    assert summary["creator_cents"] == 600
    assert summary["payouts_due_cents"] == 600
    assert summary["payouts_due"] == 6.0


def test_settings_payload_exposes_configured_email_domain_and_daily_cap(
    tmp_path: Any,
) -> None:
    settings = make_settings(
        tmp_path, email_from_domain="mail.instabix.test", outreach_daily_cap=25
    )
    with TestClient(create_app(settings)) as client:
        body = client.get("/api/settings").json()
        assert body["branding"] == "hybrid"
        assert body["email_domain"] == settings.email_from_domain
        assert body["daily_cap"] == settings.outreach_daily_cap == 25
