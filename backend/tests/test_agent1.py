from __future__ import annotations

import json
from typing import Any

import pytest

from app.agents.agent1 import (
    BIO_SIGNALS,
    POST_SIGNALS,
    qualify_creator,
    rank_creators,
)

# Literal spec values, deliberately independent of the implementation arrays.
EXPECTED_BIO_SIGNALS: tuple[str, ...] = (
    "shop",
    "my course",
    "my ebook",
    "link to buy",
    "code [name]10",
    "ambassador",
    "discount code",
)
EXPECTED_POST_SIGNALS: tuple[str, ...] = ("#ad", "#sponsored", "link in bio to buy")


def _qualified(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = dict(
        followers=100_000,
        median_views=50_000,
        recent_reel_views=[50_000] * 12,
        email="creator@example.com",
    )
    payload.update(overrides)
    return payload


def _creator(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = dict(
        handle="creator-one",
        name="Creator One",
        profile_pic="https://cdn.example.com/one.jpg",
        bio="Clean creator profile",
        followers=100_000,
        following=420,
        median_views=50_000,
        recent_reel_views=[50_000] * 12,
        top_3_reels=[
            {"id": "r1", "views": 80_000},
            {"id": "r2", "views": 60_000},
            {"id": "r3", "views": 40_000},
        ],
        content_pillars=["routines", "home"],
        business_email="creator@example.com",
        location="Austin, TX",
        source="official_api",
        niche="Home",
        engagement_rate=0.02,
    )
    payload.update(overrides)
    return payload


def test_qualified_creator_hits_every_gate() -> None:
    result = qualify_creator(**_qualified(niche="Sports"))
    assert result.qualified is True
    # engagement 0.0 (not invented), view_consistency 12/12, unmonetized 100.
    assert result.score == 60.0
    assert result.engagement_rate == 0.0
    assert result.view_consistency == 1.0
    assert result.unmonetized_score == 100
    assert result.reasons == []
    assert result.checks["reels_in_range"] is True


@pytest.mark.parametrize("followers", [49_999, 200_001])
def test_follower_boundaries(followers: int) -> None:
    result = qualify_creator(**_qualified(followers=followers))
    assert result.qualified is False
    assert any("Followers" in reason for reason in result.reasons)


@pytest.mark.parametrize("followers", [50_000, 200_000])
def test_follower_inclusive_edges(followers: int) -> None:
    result = qualify_creator(**_qualified(followers=followers))
    assert result.qualified is True


@pytest.mark.parametrize("views", [9_999, 100_001])
def test_median_view_boundaries(views: int) -> None:
    result = qualify_creator(**_qualified(median_views=views))
    assert result.qualified is False
    assert any("Median views" in reason for reason in result.reasons)


@pytest.mark.parametrize("views", [10_000, 100_000])
def test_median_view_inclusive_edges(views: int) -> None:
    result = qualify_creator(**_qualified(median_views=views))
    assert result.qualified is True


def test_eight_of_twelve_reels_is_the_minimum() -> None:
    views = [20_000] * 8 + [500_000] * 4
    passing = qualify_creator(**_qualified(median_views=30_000, recent_reel_views=views))
    assert passing.metrics["reels_in_range"] == 8
    assert passing.qualified is True

    failing = qualify_creator(
        **_qualified(median_views=30_000, recent_reel_views=[20_000] * 7 + [500_000] * 5)
    )
    assert failing.qualified is False
    assert any("Only 7/12" in reason for reason in failing.reasons)


def test_partial_window_cannot_pass_with_a_precomputed_count() -> None:
    result = qualify_creator(
        **_qualified(
            median_views=30_000,
            recent_reel_views=[20_000] * 8,
            reels_in_range=8,
        )
    )
    assert result.qualified is False
    assert result.checks["reels_window_complete"] is False


def test_email_and_ad_limits() -> None:
    base = dict(
        followers=80_000,
        median_views=30_000,
        recent_reel_views=[30_000] * 12,
    )
    assert qualify_creator(**base, email="not-an-email").qualified is False  # type: ignore[arg-type]
    assert qualify_creator(**base, email=None).qualified is False
    assert qualify_creator(**base, email="ok@example.com", ad_posts=2).qualified is True
    assert qualify_creator(**base, email="ok@example.com", ad_posts=3).qualified is False


def test_unsupported_niche_is_rejected() -> None:
    result = qualify_creator(**_qualified(niche="Crypto"))
    assert result.qualified is False
    assert any("not one of the supported" in reason for reason in result.reasons)


def test_weighted_score_math_uses_locked_formula() -> None:
    result = qualify_creator(
        **_qualified(engagement_rate=0.5, view_consistency=0.8, unmonetized_score=60)
    )
    # 0.5*0.4 + 0.8*0.3 + 0.60*0.3 = 0.62 -> 62.00
    assert result.score == 62.0
    assert result.qualified is True
    assert result.engagement_rate == 0.5
    assert result.view_consistency == 0.8
    assert result.unmonetized_score == 60


def test_scoring_inputs_are_normalized_to_unit_range() -> None:
    result = qualify_creator(
        **_qualified(engagement_rate=2.5, view_consistency=-1.0, unmonetized_score=250)
    )
    # 2.5 is percentage-like -> 0.025, never a silent clamp to 1.0.
    assert result.engagement_rate == pytest.approx(0.025)
    assert result.view_consistency == 0.0
    assert result.unmonetized_score == 100
    # 0.025*0.4 + 0.0*0.3 + 1.0*0.3 = 0.31 -> 31.00
    assert result.score == pytest.approx(31.0)


def test_engagement_percentage_input_is_divided_by_100() -> None:
    result = qualify_creator(
        **_qualified(engagement_rate=5.5, view_consistency=1.0, unmonetized_score=100)
    )
    assert result.engagement_rate == pytest.approx(0.055)
    # 0.055*0.4 + 1.0*0.3 + 1.0*0.3 = 0.622 -> 62.20
    assert result.score == pytest.approx(62.2)


def test_engagement_ratio_input_is_left_unchanged() -> None:
    result = qualify_creator(
        **_qualified(engagement_rate=0.055, view_consistency=1.0, unmonetized_score=100)
    )
    assert result.engagement_rate == pytest.approx(0.055)
    assert result.score == pytest.approx(62.2)


def test_cross_language_parity_fixture() -> None:
    # Mirrors tests/scoring.test.ts: engagement 0.02, 8/12 views in range,
    # zero monetization signals. 0.02*0.4 + (8/12)*0.3 + 1.0*0.3 = 0.508.
    result = qualify_creator(
        followers=120_000,
        median_views=50_000,
        recent_reel_views=[50_000] * 8 + [500_000] * 4,
        email="creator@example.com",
        engagement_rate=0.02,
    )
    assert result.qualified is True
    assert result.engagement_rate == pytest.approx(0.02)
    assert result.view_consistency == pytest.approx(8 / 12)
    assert result.unmonetized_score == 100
    assert result.score == 50.8


def test_view_consistency_is_derived_from_last_twelve_reels() -> None:
    result = qualify_creator(
        **_qualified(median_views=30_000, recent_reel_views=[20_000] * 8 + [500_000] * 4)
    )
    assert result.view_consistency == pytest.approx(8 / 12)
    # (8/12)*0.3 + 1.0*0.3 = 0.5 -> 50.00
    assert result.score == 50.0


def test_unmonetized_score_scale() -> None:
    assert qualify_creator(**_qualified()).unmonetized_score == 100
    assert qualify_creator(**_qualified(bio="shop my course")).unmonetized_score == 33
    assert (
        qualify_creator(**_qualified(post_captions=["#ad"])).unmonetized_score == 67
    )
    saturated = qualify_creator(**_qualified(bio="shop my course my ebook"))
    assert saturated.unmonetized_score == 0
    assert saturated.qualified is False


def test_signal_lists_match_spec_literals() -> None:
    assert BIO_SIGNALS == EXPECTED_BIO_SIGNALS
    assert POST_SIGNALS == EXPECTED_POST_SIGNALS


def test_every_bio_signal_counts() -> None:
    for signal in EXPECTED_BIO_SIGNALS:
        result = qualify_creator(**_qualified(bio=f"Hello {signal} today"))
        assert result.metrics["signal_hits"] == 1
        assert result.unmonetized_score == 67
        assert result.qualified is True


def test_every_post_signal_counts() -> None:
    for signal in EXPECTED_POST_SIGNALS:
        result = qualify_creator(**_qualified(post_captions=[f"Late post {signal}!"]))
        assert result.metrics["signal_hits"] == 1
        assert result.unmonetized_score == 67
        assert result.qualified is True


def test_legacy_signal_phrases_do_not_count() -> None:
    result = qualify_creator(
        **_qualified(
            bio="affiliate / link in bio / swipe up",
            post_captions=["#partner paid partnership use code SAVE20 shop now buy now"],
        )
    )
    assert result.metrics["signal_hits"] == 0
    assert result.unmonetized_score == 100
    assert result.qualified is True


def test_signal_matching_is_case_insensitive() -> None:
    result = qualify_creator(**_qualified(bio="MY EBOOK", post_captions=["#AD"]))
    assert result.metrics["signal_hits"] == 2
    assert result.unmonetized_score == 33
    assert result.qualified is True


def test_rank_filters_unqualified_creators() -> None:
    ranked = rank_creators([_creator(), _creator(handle="too-small", followers=10_000)])
    assert [item["handle"] for item in ranked] == ["creator-one"]


def test_rank_sorts_by_score_descending() -> None:
    ranked = rank_creators(
        [
            _creator(handle="low", engagement_rate=0.01),
            _creator(handle="high", engagement_rate=0.09),
            _creator(handle="mid", engagement_rate=0.05),
        ]
    )
    assert [item["handle"] for item in ranked] == ["high", "mid", "low"]
    scores = [item["score"] for item in ranked]
    assert scores == sorted(scores, reverse=True)


def test_rank_passes_through_enrichment_fields() -> None:
    ranked = rank_creators([_creator()])
    item = ranked[0]
    assert item["top_3_reels"] == _creator()["top_3_reels"]
    assert item["profile_pic"] == "https://cdn.example.com/one.jpg"
    assert item["following"] == 420
    assert item["content_pillars"] == ["routines", "home"]
    assert item["business_email"] == "creator@example.com"
    assert item["location"] == "Austin, TX"
    assert item["source"] == "official_api"
    assert item["niche"] == "Home"
    assert item["score"] == pytest.approx((0.02 * 0.4 + 0.3 + 0.3) * 100)
    assert item["engagement_rate"] == 0.02
    assert item["view_consistency"] == 1.0
    assert item["unmonetized_score"] == 100


def test_rank_uses_provenance_when_source_is_absent() -> None:
    creator = _creator()
    creator.pop("source")
    creator["provenance"] = "official_instagram_api"
    assert rank_creators([creator])[0]["source"] == "official_instagram_api"


def test_rank_filters_signal_saturated_creators() -> None:
    ranked = rank_creators([_creator(bio="shop my course my ebook")])
    assert ranked == []


def test_rank_output_is_json_serializable() -> None:
    json.dumps(rank_creators([_creator()]))
