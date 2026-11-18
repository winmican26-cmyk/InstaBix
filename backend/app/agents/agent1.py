"""Agent 1 — Scout qualification.

Hard gates, all required:

- 50,000 to 200,000 followers (inclusive)
- 10,000 to 100,000 median views (inclusive)
- 8 of the last 12 Reels have views inside the 10,000 to 100,000 range
- a contactable email address
- at most 2 ad posts in the recent window

The score is diagnostic only. It can never turn a failed gate into a pass.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from typing import Any

from app.config import NICHES

FOLLOWER_MIN = 50_000
FOLLOWER_MAX = 200_000
MEDIAN_VIEWS_MIN = 10_000
MEDIAN_VIEWS_MAX = 100_000
REELS_WINDOW = 12
REELS_IN_RANGE_MIN = 8
MAX_AD_POSTS = 2

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _in_range(value: int, low: int, high: int) -> bool:
    return low <= value <= high


@dataclass(frozen=True)
class QualificationResult:
    qualified: bool
    score: int
    reasons: list[str] = field(default_factory=list)
    checks: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)

    @property
    def thresholds(self) -> dict[str, Any]:
        return {
            "followers": [FOLLOWER_MIN, FOLLOWER_MAX],
            "median_views": [MEDIAN_VIEWS_MIN, MEDIAN_VIEWS_MAX],
            "reels_in_range": f"{REELS_IN_RANGE_MIN}/{REELS_WINDOW}",
            "max_ad_posts": MAX_AD_POSTS,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "qualified": self.qualified,
            "score": self.score,
            "reasons": list(self.reasons),
            "checks": dict(self.checks),
            "metrics": dict(self.metrics),
            "thresholds": self.thresholds,
        }


def _derive_median_views(recent_reel_views: list[int] | None) -> int | None:
    if not recent_reel_views:
        return None
    window = recent_reel_views[-REELS_WINDOW:]
    return int(statistics.median(window))


def _count_reels_in_range(recent_reel_views: list[int] | None) -> int | None:
    if not recent_reel_views or len(recent_reel_views) < REELS_WINDOW:
        return None
    window = recent_reel_views[-REELS_WINDOW:]
    return sum(1 for views in window if _in_range(views, MEDIAN_VIEWS_MIN, MEDIAN_VIEWS_MAX))


def qualify_creator(
    *,
    followers: int,
    median_views: int | None = None,
    recent_reel_views: list[int] | None = None,
    reels_in_range: int | None = None,
    email: str | None = None,
    ad_posts: int = 0,
    niche: str | None = None,
) -> QualificationResult:
    """Evaluate a creator against the locked Scout gates.

    `recent_reel_views` is the preferred signal: the last 12 values are used and
    the median / in-range count are derived from them. `reels_in_range` is
    accepted as a pre-computed value for callers with an existing sync, but a
    full 12-Reel window is still required for the gate to pass.
    """
    if followers < 0 or ad_posts < 0:
        raise ValueError("followers and ad_posts must be non-negative")
    if median_views is not None and median_views < 0:
        raise ValueError("median_views must be non-negative")
    if reels_in_range is not None and not 0 <= reels_in_range <= REELS_WINDOW:
        raise ValueError("reels_in_range must be between 0 and 12")
    if recent_reel_views is not None and any(v < 0 for v in recent_reel_views):
        raise ValueError("recent_reel_views cannot contain negative values")

    window = list(recent_reel_views or [])
    computed_median = _derive_median_views(window)
    effective_median = median_views if median_views is not None else computed_median

    if window:
        # A partial window is not evidence of an 8/12 record, even when the
        # caller also sends a pre-computed count.
        computed_reels = _count_reels_in_range(window)
        effective_reels = computed_reels
        window_complete = computed_reels is not None
    else:
        effective_reels = reels_in_range
        window_complete = reels_in_range is not None

    email_clean = (email or "").strip()
    has_email = bool(_EMAIL_RE.match(email_clean))

    checks: dict[str, Any] = {}
    reasons: list[str] = []

    follower_ok = _in_range(followers, FOLLOWER_MIN, FOLLOWER_MAX)
    checks["followers_in_range"] = follower_ok
    if not follower_ok:
        reasons.append(
            f"Followers {followers:,} are outside the {FOLLOWER_MIN:,}–{FOLLOWER_MAX:,} range."
        )

    if effective_median is None:
        checks["median_views_in_range"] = False
        reasons.append("Median views were not supplied and cannot be derived from fewer than 12 Reels.")
        median_ok = False
    else:
        median_ok = _in_range(effective_median, MEDIAN_VIEWS_MIN, MEDIAN_VIEWS_MAX)
        checks["median_views_in_range"] = median_ok
        if not median_ok:
            reasons.append(
                f"Median views {effective_median:,} are outside the "
                f"{MEDIAN_VIEWS_MIN:,}–{MEDIAN_VIEWS_MAX:,} range."
            )

    if effective_reels is None:
        checks["reels_window_complete"] = False
        checks["reels_in_range"] = False
        reasons.append("A complete 12-Reel window is required to verify the 8/12 gate.")
        reels_ok = False
    else:
        checks["reels_window_complete"] = window_complete
        checks["reels_in_range"] = effective_reels >= REELS_IN_RANGE_MIN
        reels_ok = effective_reels >= REELS_IN_RANGE_MIN
        if not reels_ok:
            reasons.append(
                f"Only {effective_reels}/{REELS_WINDOW} Reels are in the "
                f"{MEDIAN_VIEWS_MIN:,}–{MEDIAN_VIEWS_MAX:,} view range; 8 are required."
            )

    checks["has_email"] = has_email
    if not has_email:
        reasons.append("No valid contact email is on file.")

    ads_ok = ad_posts <= MAX_AD_POSTS
    checks["ad_posts_within_limit"] = ads_ok
    if not ads_ok:
        reasons.append(f"{ad_posts} ad posts found; the limit is {MAX_AD_POSTS}.")

    if niche is not None:
        niche_ok = niche in NICHES
        checks["niche_supported"] = niche_ok
        if not niche_ok:
            reasons.append(f"Niche '{niche}' is not one of the supported InstaBix niches.")

    score = 0
    if follower_ok:
        score += 25
    if median_ok:
        score += 25
    if effective_reels is not None:
        score += min(25, round(effective_reels / REELS_WINDOW * 25))
    if has_email:
        score += 15
    if ad_posts == 0:
        score += 10
    elif ad_posts == 1:
        score += 7
    elif ad_posts == 2:
        score += 4

    hard_failures = (
        not follower_ok
        or not median_ok
        or not reels_ok
        or not has_email
        or not ads_ok
        or ("niche_supported" in checks and not checks["niche_supported"])
    )

    return QualificationResult(
        qualified=not hard_failures,
        score=score,
        reasons=reasons,
        checks=checks,
        metrics={
            "followers": followers,
            "median_views": effective_median,
            "recent_reel_views": window[-REELS_WINDOW:],
            "reels_in_range": effective_reels,
            "ad_posts": ad_posts,
            "email_present": has_email,
            "niche": niche,
        },
    )
