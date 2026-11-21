"""Agent 1 — Scout qualification and Stage 1 ranking.

Hard gates, all required:

- 50,000 to 200,000 followers (inclusive)
- 10,000 to 100,000 median views (inclusive)
- 8 of the last 12 Reels have views inside the 10,000 to 100,000 range
- a public business email address
- at most 2 ad posts in the recent window
- at most 2 exact monetization signal hits across bio and recent captions

The score is diagnostic only. It can never turn a failed gate into a pass.

    Score = engagement_rate*0.4 + view_consistency*0.3 + unmonetized_score*0.3

reported on a 0-100 scale. All inputs are supplied by the caller from
official sources: Scout never scrapes and never calls an external API.

Shared normalization contract (identical in src/lib/scoring.ts): every factor
is 0..1. `engagement_rate` additionally accepts percentage-like numbers > 1,
which are divided by 100 (5.5 -> 0.055) rather than silently clamped to 1.0;
a ratio already in 0..1 (0.055) is unchanged. There is no 6% cap.
"""

from __future__ import annotations

import re
import statistics
from collections.abc import Iterable, Mapping
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
MAX_SIGNAL_HITS = 2

# Exact Stage 1 signals. Substring matching is case-insensitive; no other
# phrases (for example "#partner" or "affiliate") count as a hit.
BIO_SIGNALS: tuple[str, ...] = (
    "shop",
    "my course",
    "my ebook",
    "link to buy",
    "code [name]10",
    "ambassador",
    "discount code",
)
POST_SIGNALS: tuple[str, ...] = (
    "#ad",
    "#sponsored",
    "link in bio to buy",
)

SCORE_WEIGHTS: dict[str, float] = {
    "engagement_rate": 0.4,
    "view_consistency": 0.3,
    "unmonetized_score": 0.3,
}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _in_range(value: int, low: int, high: int) -> bool:
    return low <= value <= high


def _normalize_unit(value: float | None, default: float = 0.0) -> float:
    """Clamp a caller-supplied 0..1 factor (view_consistency); never invent signal."""
    if value is None:
        return default
    return min(1.0, max(0.0, float(value)))


def _normalize_engagement(value: float | None) -> float:
    """Normalize engagement_rate under the shared Stage 1 contract.

    Factors are 0..1. engagement_rate also accepts a percentage-like number
    > 1: 5.5 means 5.5% and becomes 0.055 (divide by 100). A ratio already in
    0..1, such as 0.055, is left unchanged. Values > 1 are NEVER silently
    clamped to 1.0. Negative values clamp to 0. There is no 6% cap.
    """
    if value is None:
        return 0.0
    rate = float(value)
    if rate > 1.0:
        rate /= 100.0
    return min(1.0, max(0.0, rate))


def _normalize_percent(value: int | float | None, default: int) -> float:
    """unmonetized_score is supplied as 0..100 and normalized to a 0..1 factor."""
    raw = default if value is None else value
    return _normalize_unit(float(raw) / 100.0)


def _count_signal_hits(bio: str | None, post_captions: list[str] | None) -> int:
    hits = 0
    if bio:
        lowered = bio.lower()
        hits += sum(1 for signal in BIO_SIGNALS if signal.lower() in lowered)
    for caption in post_captions or []:
        if not caption:
            continue
        lowered = caption.lower()
        hits += sum(1 for signal in POST_SIGNALS if signal.lower() in lowered)
    return hits


def _derive_unmonetized_score(signal_hits: int) -> int:
    """0 hits -> 100 (fully unmonetized), 1 -> 67, 2 -> 33, 3+ -> 0."""
    return round(100 * (1 - min(signal_hits, 3) / 3))


def _as_optional_int(value: Any) -> int | None:
    return None if value is None else int(value)


def _as_optional_int_list(value: Any) -> list[int] | None:
    if value is None:
        return None
    return [int(item) for item in value]


@dataclass(frozen=True)
class QualificationResult:
    qualified: bool
    score: float
    reasons: list[str] = field(default_factory=list)
    checks: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)
    engagement_rate: float = 0.0
    view_consistency: float = 0.0
    unmonetized_score: int = 100

    @property
    def thresholds(self) -> dict[str, Any]:
        return {
            "followers": [FOLLOWER_MIN, FOLLOWER_MAX],
            "median_views": [MEDIAN_VIEWS_MIN, MEDIAN_VIEWS_MAX],
            "reels_in_range": f"{REELS_IN_RANGE_MIN}/{REELS_WINDOW}",
            "max_ad_posts": MAX_AD_POSTS,
            "max_signal_hits": MAX_SIGNAL_HITS,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "qualified": self.qualified,
            "score": self.score,
            "engagement_rate": self.engagement_rate,
            "view_consistency": self.view_consistency,
            "unmonetized_score": self.unmonetized_score,
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
    engagement_rate: float | None = None,
    view_consistency: float | None = None,
    unmonetized_score: int | None = None,
    bio: str | None = None,
    post_captions: list[str] | None = None,
) -> QualificationResult:
    """Evaluate a creator against the locked Scout gates and Stage 1 score.

    `recent_reel_views` is the preferred signal: the last 12 values are used and
    the median / in-range count are derived from them. `reels_in_range` is
    accepted as a pre-computed value for callers with an existing sync, but a
    full 12-Reel window is still required for the gate to pass.

    The three scoring factors are never inferred from nothing: a missing
    `view_consistency` falls back to count_in_range / 12, a missing
    `engagement_rate` contributes 0.0, and a missing `unmonetized_score` is
    derived from the exact bio / post signals.

    Normalization contract (shared with src/lib/scoring.ts): all factors are
    0..1. `engagement_rate` accepts either a 0..1 ratio (0.055) or a
    percentage-like number > 1 (5.5 -> 0.055 by dividing by 100); it is never
    silently clamped to 1.0. `view_consistency` is clamped to 0..1 and
    `unmonetized_score` is supplied as 0..100 then divided by 100. No 6% cap.
    """
    if followers < 0 or ad_posts < 0:
        raise ValueError("followers and ad_posts must be non-negative")
    if median_views is not None and median_views < 0:
        raise ValueError("median_views must be non-negative")
    if reels_in_range is not None and not 0 <= reels_in_range <= REELS_WINDOW:
        raise ValueError(f"reels_in_range must be between 0 and {REELS_WINDOW}")
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

    signal_hits = _count_signal_hits(bio, post_captions)
    derived_unmonetized = _derive_unmonetized_score(signal_hits)
    if unmonetized_score is None:
        effective_unmonetized = derived_unmonetized
    else:
        effective_unmonetized = int(min(100, max(0, round(float(unmonetized_score)))))

    derived_consistency = (effective_reels / REELS_WINDOW) if effective_reels is not None else 0.0
    engagement_norm = _normalize_engagement(engagement_rate)
    consistency_norm = _normalize_unit(view_consistency, default=derived_consistency)
    unmonetized_norm = _normalize_percent(effective_unmonetized, derived_unmonetized)

    score = round(
        (
            engagement_norm * SCORE_WEIGHTS["engagement_rate"]
            + consistency_norm * SCORE_WEIGHTS["view_consistency"]
            + unmonetized_norm * SCORE_WEIGHTS["unmonetized_score"]
        )
        * 100,
        2,
    )

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
        reasons.append(f"A complete {REELS_WINDOW}-Reel window is required to verify the 8/12 gate.")
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
        reasons.append("No valid public business email is on file.")

    ads_ok = ad_posts <= MAX_AD_POSTS
    checks["ad_posts_within_limit"] = ads_ok
    if not ads_ok:
        reasons.append(f"{ad_posts} ad posts found; the limit is {MAX_AD_POSTS}.")

    signals_ok = signal_hits <= MAX_SIGNAL_HITS
    checks["signal_hits_within_limit"] = signals_ok
    if not signals_ok:
        reasons.append(
            f"{signal_hits} exact monetization signal hits found; the limit is {MAX_SIGNAL_HITS}."
        )

    if niche is not None:
        niche_ok = niche in NICHES
        checks["niche_supported"] = niche_ok
        if not niche_ok:
            reasons.append(f"Niche '{niche}' is not one of the supported VistaBix niches.")

    hard_failures = (
        not follower_ok
        or not median_ok
        or not reels_ok
        or not has_email
        or not ads_ok
        or not signals_ok
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
            "signal_hits": signal_hits,
        },
        engagement_rate=engagement_norm,
        view_consistency=consistency_norm,
        unmonetized_score=effective_unmonetized,
    )


def rank_creators(creators: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Qualify and rank creators, returning only qualified rows, score-descending.

    Every value is caller-supplied enrichment or a derived number. No scraping,
    no unofficial source, no outbound API call. `source` is a pure passthrough
    (falling back to `provenance`) so provenance stays explicit and auditable.
    """
    ranked: list[dict[str, Any]] = []
    for creator in creators:
        email = creator.get("email") or creator.get("business_email")
        result = qualify_creator(
            followers=int(creator.get("followers") or 0),
            median_views=_as_optional_int(creator.get("median_views")),
            recent_reel_views=_as_optional_int_list(creator.get("recent_reel_views")),
            reels_in_range=_as_optional_int(creator.get("reels_in_range")),
            email=str(email) if email else None,
            ad_posts=int(creator.get("ad_posts") or 0),
            niche=creator.get("niche"),
            engagement_rate=creator.get("engagement_rate"),
            view_consistency=creator.get("view_consistency"),
            unmonetized_score=creator.get("unmonetized_score"),
            bio=creator.get("bio"),
            post_captions=creator.get("post_captions") or creator.get("captions"),
        )
        if not result.qualified:
            continue

        item: dict[str, Any] = dict(creator)
        item.update(
            {
                "score": result.score,
                "engagement_rate": result.engagement_rate,
                "view_consistency": result.view_consistency,
                "unmonetized_score": result.unmonetized_score,
                "source": creator.get("source", creator.get("provenance")),
            }
        )
        ranked.append(item)

    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked


_MISSING = object()


def _row_value(row: Any, name: str) -> Any:
    """Read one field from a mapping or an ORM row without raising."""
    try:
        if isinstance(row, Mapping):
            return row.get(name)
        return getattr(row, name, _MISSING)
    except (AttributeError, KeyError, TypeError, ValueError):
        return _MISSING


def _row_int(value: Any) -> int | None:
    if value is _MISSING or value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _readable_row(row: Any) -> bool:
    """Only mappings and rows exposing at least one searchable field count."""
    if isinstance(row, Mapping):
        return True
    return any(
        _row_value(row, key) is not _MISSING
        for key in ("niche", "followers", "median_views", "views")
    )


def _bound(name: str, value: int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} must be an integer")
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f"{name} must be an integer") from exc


def _canonical_niche(value: str) -> str:
    """Accept case variants of a locked niche without inventing a new one."""
    text = value.strip()
    for locked in NICHES:
        if text.casefold() == locked.casefold():
            return locked
    return text


def search_creators(
    rows: Iterable[Any],
    *,
    niche: str | None = None,
    min_followers: int | None = None,
    max_followers: int | None = None,
    min_views: int | None = None,
    max_views: int | None = None,
) -> list[Any]:
    """Filter supplied creator rows by niche and inclusive metric ranges.

    Pure and read-only: the original rows are returned in stable input order;
    nothing is fabricated, ranked or fetched from an external API. ``None``
    means no bound. Rows that cannot supply a value for a requested filter are
    skipped rather than crashing the search.
    """
    wanted = _canonical_niche(niche) if niche is not None else None
    follower_low = _bound("min_followers", min_followers)
    follower_high = _bound("max_followers", max_followers)
    view_low = _bound("min_views", min_views)
    view_high = _bound("max_views", max_views)

    matched: list[Any] = []
    for row in rows:
        if not _readable_row(row):
            continue

        if wanted is not None:
            row_niche = _row_value(row, "niche")
            if not isinstance(row_niche, str) or row_niche.strip().casefold() != wanted.casefold():
                continue

        if follower_low is not None or follower_high is not None:
            followers = _row_int(_row_value(row, "followers"))
            if followers is None:
                continue
            if follower_low is not None and followers < follower_low:
                continue
            if follower_high is not None and followers > follower_high:
                continue

        if view_low is not None or view_high is not None:
            raw_views = _row_value(row, "median_views")
            if raw_views is _MISSING:
                raw_views = _row_value(row, "views")
            views = _row_int(raw_views)
            if views is None:
                continue
            if view_low is not None and views < view_low:
                continue
            if view_high is not None and views > view_high:
                continue

        matched.append(row)

    return matched
