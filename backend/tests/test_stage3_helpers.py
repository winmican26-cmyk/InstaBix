"""Deterministic unit tests for the Stage 3 pure helper logic."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from app.agents.agent1 import search_creators
from app.agents.agent4 import (
    DISCLOSURE,
    PublishOutcome,
    build_launch_caption_variations,
    build_launch_captions,
    build_story_template_specs,
    build_story_templates,
    render_launch_captions,
    render_story_templates,
)
from app.config import Settings
from app.errors import WhopAPIError
from app.models import Creator
from app.whop import WhopClient


def _row(row_id: int, niche: str, followers: int, median_views: int) -> dict[str, Any]:
    return {
        "id": row_id,
        "niche": niche,
        "followers": followers,
        "median_views": median_views,
    }


def test_search_creators_filters_dict_rows_in_stable_order() -> None:
    rows = [
        _row(1, "Sports", 80_000, 12_000),
        _row(2, "sports", 120_000, 40_000),
        _row(3, "Home", 80_000, 12_000),
        _row(4, "Sports", 49_999, 12_000),
        _row(5, "Sports", 80_000, 9_999),
    ]

    assert search_creators(rows) == rows
    assert search_creators(rows, niche="SPORTS") == [rows[0], rows[1], rows[3], rows[4]]
    assert search_creators(
        rows, niche="Sports", min_followers=80_000, max_followers=100_000
    ) == [rows[0], rows[4]]
    assert search_creators(rows, min_views=12_000, max_views=12_000) == [
        rows[0],
        rows[2],
        rows[3],
    ]
    assert search_creators(rows, niche="Home", min_followers=80_000, min_views=12_000) == [
        rows[2]
    ]
    # Bounds are inclusive on both ends.
    assert search_creators(rows, min_followers=49_999, max_followers=49_999) == [rows[3]]


def test_search_creators_skips_bad_rows_without_crashing() -> None:
    good = _row(1, "Sports", 80_000, 12_000)
    rows: list[Any] = [
        None,
        object(),
        "not-a-row",
        {"niche": "Sports", "followers": "oops", "median_views": 12_000},
        {"niche": "Sports", "followers": 80_000, "median_views": None},
        {"followers": 80_000, "median_views": 12_000},  # no niche for a niche filter
        good,
    ]

    assert search_creators(
        rows, niche="sports", min_followers=70_000, min_views=10_000
    ) == [good]
    assert search_creators([object(), good]) == [good]


def test_search_creators_accepts_orm_rows_without_converting_them() -> None:
    first = Creator(
        name="First Creator", handle="@first", niche="Sports", followers=80_000, median_views=12_000
    )
    second = Creator(
        name="Second Creator", handle="@second", niche="Home", followers=90_000, median_views=20_000
    )

    found = search_creators([first, second], niche="sports", max_followers=85_000)
    assert found == [first]
    assert found[0] is first


def _structured_assets() -> tuple[SimpleNamespace, str, dict[str, Any]]:
    product = SimpleNamespace(
        title="The Training Blueprint",
        slug="the-training-blueprint",
        niche="Sports",
        price_cents=1_900,
        target_words=7_000,
        toc={
            "audience": "coaches",
            "promise": "a clear plan",
            "chapters": [{"title": "One"}, {"title": "Two"}],
        },
    )
    bio_link = "https://whop.com/checkout/plan_mock_stage3"
    assets: dict[str, Any] = {
        "bio_link": bio_link,
        "story_templates": build_story_templates(product, bio_link),
        "story_template_specs": build_story_template_specs(product, bio_link),
        "launch_captions": build_launch_captions(product, bio_link),
        "launch_caption_variations": build_launch_caption_variations(product, bio_link),
        "launch_performance": {"status": "blocked"},
    }
    return product, bio_link, assets


def test_render_story_templates_preserves_disclosure_and_links() -> None:
    _, bio_link, assets = _structured_assets()

    rendered = render_story_templates(assets)
    assert len(rendered) == 4
    assert all(isinstance(item, str) and item for item in rendered)
    assert rendered[0].startswith("Story 1:")
    assert any(DISCLOSURE in item for item in rendered)
    assert any(bio_link in item for item in rendered)
    assert all("{'" not in item for item in rendered)
    assert render_story_templates(assets["story_templates"]) == rendered

    specs = render_story_templates(
        {"story_template_specs": assets["story_template_specs"]}
    )
    assert len(specs) == 3
    assert any(DISCLOSURE in item for item in specs)
    assert any(bio_link in item for item in specs)
    assert all("{'" not in item for item in specs)


def test_render_launch_captions_preserves_disclosure_links_and_hashtags() -> None:
    _, bio_link, assets = _structured_assets()

    rendered = render_launch_captions(assets)
    assert len(rendered) == 3
    assert all(item.startswith("NEW:") and item for item in rendered)
    assert all(DISCLOSURE in item for item in rendered)
    assert all(bio_link in item for item in rendered)
    assert all("#ad" in item for item in rendered)
    assert all("{'" not in item for item in rendered)
    assert render_launch_captions(assets["launch_captions"]) == rendered

    variations = render_launch_captions(
        {"launch_caption_variations": assets["launch_caption_variations"]}
    )
    assert len(variations) == 3
    assert all(DISCLOSURE in item for item in variations)
    assert all(bio_link in item for item in variations)


def test_renderers_work_on_publish_outcome_assets() -> None:
    product, _, assets = _structured_assets()
    outcome = PublishOutcome(
        product=product, whop={}, assets=assets, created=True  # type: ignore[arg-type]
    )

    stories = render_story_templates(outcome.assets)
    captions = render_launch_captions(outcome.assets)
    assert stories and captions
    assert any(DISCLOSURE in item for item in stories + captions)
    # The structured assets remain structured for disclosure/link auditing.
    assert all(isinstance(item, dict) for item in outcome.assets["story_templates"])
    assert all(isinstance(item, dict) for item in outcome.assets["launch_captions"])


def test_get_product_mock_mode_never_invents_urls_or_prices() -> None:
    settings = Settings(_env_file=None, app_env="test", whop_mock_mode="true")
    client = WhopClient(settings)

    result = client.get_product("prod_1")
    assert result["id"] == "prod_1"
    assert result["mode"] == "mock"
    assert result["mock"] is True
    assert result["note"]
    for key in (
        "checkout_url",
        "product_url",
        "price",
        "price_cents",
        "plan_id",
        "whop_api_key",
    ):
        assert key not in result
    assert client.audit_sink.records == []


def test_get_product_live_uses_audited_get_and_whitelists_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        _env_file=None,
        app_env="test",
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    client = WhopClient(settings)
    calls: list[dict[str, Any]] = []

    def fake_request(method: str, url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"method": method, "url": url, **kwargs})
        return httpx.Response(
            200,
            json={
                "id": "prod_live_1",
                "title": "Real product",
                "route": "real-product",
                "api_key": "must-not-leak",
                "metadata": {"secret": "must-not-leak"},
            },
        )

    monkeypatch.setattr(httpx, "request", fake_request)
    result = client.get_product("prod_1")

    assert [call["method"] for call in calls] == ["GET"]
    assert calls[0]["url"] == "https://api.whop.com/api/v1/products/prod_1"
    assert calls[0]["headers"]["Authorization"] == "Bearer whop_test_secret"
    assert result["id"] == "prod_live_1"
    assert result["mode"] == "live"
    assert result["mock"] is False
    assert result["title"] == "Real product"
    assert "checkout_url" not in result
    assert "must-not-leak" not in str(result)
    assert "whop_test_secret" not in str(result)
    record = client.audit_sink.records[0]
    assert record.method == "GET"
    assert record.path == "/products/prod_1"


def test_get_product_http_failure_raises_whop_api_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        _env_file=None,
        app_env="test",
        whop_api_key="whop_test_secret",
        whop_mock_mode="false",
    )
    client = WhopClient(settings)

    def fake_request(method: str, url: str, **kwargs: Any) -> httpx.Response:
        return httpx.Response(404, json={"message": "not found"})

    monkeypatch.setattr(httpx, "request", fake_request)
    with pytest.raises(WhopAPIError):
        client.get_product("missing")

    assert client.audit_sink.records[-1].status == "error"


def test_config_stage3_settings_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OUTREACH_DAILY_CAP", raising=False)
    monkeypatch.delenv("EMAIL_FROM_DOMAIN", raising=False)

    settings = Settings(_env_file=None)
    assert settings.outreach_daily_cap == 50
    assert settings.email_from_domain is None
    with pytest.raises(ValidationError):
        Settings(_env_file=None, outreach_daily_cap=0)
