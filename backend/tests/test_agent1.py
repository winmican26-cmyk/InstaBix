from __future__ import annotations

import pytest

from app.agents.agent1 import qualify_creator


def test_qualified_creator_hits_every_gate() -> None:
    result = qualify_creator(
        followers=120_000,
        median_views=50_000,
        recent_reel_views=[50_000] * 12,
        email="creator@example.com",
        ad_posts=0,
        niche="Sports",
    )
    assert result.qualified is True
    assert result.score == 100
    assert result.reasons == []
    assert result.checks["reels_in_range"] is True


@pytest.mark.parametrize("followers", [49_999, 200_001])
def test_follower_boundaries(followers: int) -> None:
    result = qualify_creator(
        followers=followers,
        median_views=50_000,
        recent_reel_views=[50_000] * 12,
        email="creator@example.com",
    )
    assert result.qualified is False
    assert any("Followers" in reason for reason in result.reasons)


@pytest.mark.parametrize("followers", [50_000, 200_000])
def test_follower_inclusive_edges(followers: int) -> None:
    result = qualify_creator(
        followers=followers,
        median_views=50_000,
        recent_reel_views=[50_000] * 12,
        email="creator@example.com",
    )
    assert result.qualified is True


@pytest.mark.parametrize("views", [9_999, 100_001])
def test_median_view_boundaries(views: int) -> None:
    result = qualify_creator(
        followers=80_000,
        median_views=views,
        recent_reel_views=[50_000] * 12,
        email="creator@example.com",
    )
    assert result.qualified is False
    assert any("Median views" in reason for reason in result.reasons)


@pytest.mark.parametrize("views", [10_000, 100_000])
def test_median_view_inclusive_edges(views: int) -> None:
    result = qualify_creator(
        followers=80_000,
        median_views=views,
        recent_reel_views=[50_000] * 12,
        email="creator@example.com",
    )
    assert result.qualified is True


def test_eight_of_twelve_reels_is_the_minimum() -> None:
    views = [20_000] * 8 + [500_000] * 4
    passing = qualify_creator(
        followers=80_000,
        median_views=30_000,
        recent_reel_views=views,
        email="creator@example.com",
    )
    assert passing.metrics["reels_in_range"] == 8
    assert passing.qualified is True

    failing = qualify_creator(
        followers=80_000,
        median_views=30_000,
        recent_reel_views=[20_000] * 7 + [500_000] * 5,
        email="creator@example.com",
    )
    assert failing.qualified is False
    assert any("Only 7/12" in reason for reason in failing.reasons)


def test_partial_window_cannot_pass_with_a_precomputed_count() -> None:
    result = qualify_creator(
        followers=80_000,
        median_views=30_000,
        recent_reel_views=[20_000] * 8,
        reels_in_range=8,
        email="creator@example.com",
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
    result = qualify_creator(
        followers=80_000,
        median_views=30_000,
        recent_reel_views=[30_000] * 12,
        email="ok@example.com",
        niche="Crypto",
    )
    assert result.qualified is False
    assert any("not one of the supported" in reason for reason in result.reasons)
