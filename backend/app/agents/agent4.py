"""Agent 4 — Integrator.

Publishes an approved product to Whop, then derives the launch kit (bio link,
story templates, launch captions). The creator approval gate is enforced here,
at the point of publication, not only in the UI.

Instagram inputs and launch analytics are deliberately offline adapters: they
only describe official Graph API requests and never fabricate metrics,
testimonials or performance data. Testimonial collection requires an explicit
permission flag.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.agents.agent3 import MAX_WORDS, MIN_WORDS, validate_toc
from app.config import BRANDING, NICHES
from app.errors import PublishBlocked
from app.models import Product, utcnow
from app.whop import WhopClient, WhopPublishResult

DISCLOSURE = "Paid partnership with InstaBix. #ad"

# Official Instagram Graph API surface only. No scraping, no unofficial hosts.
OFFICIAL_IG_GRAPH_BASE = "https://graph.facebook.com"
OFFICIAL_IG_FIELDS: tuple[str, ...] = (
    "id",
    "username",
    "name",
    "biography",
    "profile_picture_url",
    "followers_count",
    "follows_count",
    "media_count",
)


@dataclass(frozen=True)
class PublishOutcome:
    product: Product
    whop: dict[str, Any]
    assets: dict[str, Any]
    created: bool
    audit: list[dict[str, Any]] = field(default_factory=list)
    notifications: list[dict[str, Any]] = field(default_factory=list)
    blocked: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "published": True,
            "created": self.created,
            "product": self.product.to_dict(),
            "whop": self.whop,
            "assets": self.assets,
            "audit": self.audit,
            "notifications": self.notifications,
            "blocked": self.blocked,
        }


@dataclass(frozen=True)
class InstagramResult:
    status: str  # ok | blocked
    source: str | None
    request: dict[str, Any] | None
    blocked_reason: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "source": self.source,
            "request": self.request,
            "blocked_reason": self.blocked_reason,
        }


def _ig_blocked(reason: str) -> InstagramResult:
    return InstagramResult(status="blocked", source=None, request=None, blocked_reason=reason)


def collect_instagram_metrics(
    *,
    ig_user_id: str | None,
    access_token: str | None,
    fields: list[str] | None = None,
    api_version: str = "v19.0",
) -> InstagramResult:
    """Describe an official Graph API request. Never return invented metrics.

    Credentials must be supplied by the credentialed runtime; this adapter
    never stores, logs or guesses them. Only allowlisted official fields are
    accepted, so unofficial/scraped inputs are rejected.
    """
    if not ig_user_id or not access_token:
        return _ig_blocked(
            "Official Instagram Graph API credentials are required; no metrics were fabricated."
        )
    requested = list(fields) if fields else list(OFFICIAL_IG_FIELDS)
    invalid = [name for name in requested if name not in OFFICIAL_IG_FIELDS]
    if invalid:
        return _ig_blocked(
            "Only official Graph API fields are allowed; rejected: "
            + ", ".join(sorted(str(name) for name in invalid)[:20])
        )
    version = api_version.strip().strip("/")
    base = f"{OFFICIAL_IG_GRAPH_BASE}/{version}" if version else OFFICIAL_IG_GRAPH_BASE
    return InstagramResult(
        status="ok",
        source="official_instagram_graph_api",
        request={
            "method": "GET",
            "url": f"{base}/{ig_user_id}",
            "params": {"fields": ",".join(requested), "access_token": "<credentialed runtime>"},
        },
        blocked_reason=None,
    )


def collect_testimonials(
    *,
    permission_granted: bool,
    ig_user_id: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    """Collect testimonials only with explicit permission and an official source."""
    if not permission_granted:
        return {
            "status": "blocked",
            "items": [],
            "blocked_reason": (
                "Explicit creator permission is required before testimonials may be collected."
            ),
        }
    if not ig_user_id or not access_token:
        return {
            "status": "blocked",
            "items": [],
            "blocked_reason": (
                "Permission recorded, but no official credentialed source is configured; "
                "no testimonials were fabricated."
            ),
        }
    return {
        "status": "blocked",
        "items": [],
        "blocked_reason": (
            "Official testimonial retrieval is not configured in this adapter; "
            "no testimonials were fabricated."
        ),
    }


def track_launch_performance(
    *,
    access_token: str | None = None,
    product_id: int | None = None,
) -> dict[str, Any]:
    """Launch-performance tracker interface. Blocked without real credentials."""
    if not access_token:
        return {
            "status": "blocked",
            "metrics": None,
            "blocked_reason": (
                "No official analytics credentials are configured; no performance metrics "
                "were fabricated."
            ),
        }
    return {
        "status": "blocked",
        "metrics": None,
        "blocked_reason": (
            "A credentialed analytics provider is not configured in this adapter; "
            "no performance metrics were fabricated."
        ),
    }


def validate_publishable(product: Product) -> list[str]:
    """Raise PublishBlocked with every reason the product is not ready."""
    reasons: list[str] = []
    if not product.creator_approved:
        reasons.append(
            "Creator approval is required before publishing. "
            "The creator must approve the product (POST /api/products/{id}/approve)."
        )
    if not (product.title or "").strip():
        reasons.append("A product title is required.")
    if product.niche not in NICHES:
        reasons.append(f"Unsupported niche '{product.niche}'.")
    if product.price_cents < 100:
        reasons.append("The price must be at least 1.00 in the variant currency.")
    if not isinstance(product.toc, dict) or not product.toc:
        reasons.append("A generated or supplied table of contents is required.")
    else:
        try:
            validate_toc(product.toc)
        except ValueError as exc:
            reasons.append(str(exc))
        target = product.toc.get("target_words")
        if not isinstance(target, int) or not MIN_WORDS <= target <= MAX_WORDS:
            reasons.append(f"The word target must be between {MIN_WORDS} and {MAX_WORDS}.")

    if reasons:
        raise PublishBlocked(
            "Product is not ready to publish.",
            details={
                "product_id": product.id,
                "creator_approved": product.creator_approved,
                "reasons": reasons,
            },
        )
    return []


def build_bio_link(product: Product, whop_result: WhopPublishResult, public_app_url: str) -> str:
    if whop_result.checkout_url:
        return whop_result.checkout_url
    return f"{public_app_url.rstrip('/')}/p/{product.slug}"


def build_story_templates(product: Product, bio_link: str) -> list[dict[str, Any]]:
    """Four frames a creator can adapt. No earnings or result claims."""
    audience = (product.toc or {}).get("audience") or f"{product.niche} audience"
    title = product.title
    return [
        {
            "frame": 1,
            "kind": "hook",
            "text": f"I made something for {audience}. Want the honest breakdown?",
            "sticker": f"poll: Would you use a {product.niche.lower()} playbook?",
        },
        {
            "frame": 2,
            "kind": "problem",
            "text": "Most advice here is either too vague or too much. I wanted one clear path.",
            "sticker": "slider: How much time do you have each week?",
        },
        {
            "frame": 3,
            "kind": "value",
            "text": f"{title} — {len((product.toc or {}).get('chapters', []))} chapters, "
            f"a {product.target_words:,}-word plan, and no fluff.",
            "sticker": "quiz: What would you tackle first?",
        },
        {
            "frame": 4,
            "kind": "cta",
            "text": "The link is in my bio. Read the outline before you decide.",
            "sticker": "link",
            "link": bio_link,
            "disclosure": DISCLOSURE,
        },
    ]


def build_story_template_specs(product: Product, bio_link: str) -> list[dict[str, Any]]:
    """Exactly three Story template specs for the launch-asset interface.

    Distinct from the legacy four-frame `story_templates` kit retained in the
    product record; these are compact production specs.
    """
    audience = (product.toc or {}).get("audience") or f"{product.niche} audience"
    return [
        {
            "id": "teaser",
            "frame": 1,
            "format": "9:16",
            "text": f"A new {product.niche.lower()} playbook for {audience}.",
            "sticker": "poll",
            "disclosure": DISCLOSURE,
        },
        {
            "id": "proof",
            "frame": 2,
            "format": "9:16",
            "text": (
                f"{len((product.toc or {}).get('chapters', []))} chapters, "
                f"a {product.target_words:,}-word plan, no fluff."
            ),
            "sticker": "quiz",
            "disclosure": DISCLOSURE,
        },
        {
            "id": "cta",
            "frame": 3,
            "format": "9:16",
            "text": "Link in bio. Read the outline before you decide.",
            "sticker": "link",
            "link": bio_link,
            "disclosure": DISCLOSURE,
        },
    ]


def build_launch_captions(product: Product, bio_link: str) -> list[dict[str, Any]]:
    """Three captions. Every one links to the real offer and carries disclosure."""
    audience = (product.toc or {}).get("audience") or f"people into {product.niche.lower()}"
    promise = (product.toc or {}).get("promise") or "a clear, practical plan"
    price = f"${product.price_cents / 100:,.2f}"
    return [
        {
            "id": "value_first",
            "hook": f"If {audience} want one place to start, start here.",
            "body": (
                f"{product.title} is {promise}. I built it with InstaBix and approved the "
                f"outline before it went live. {price}. Link in bio."
            ),
            "cta": "Read the chapter list, then decide.",
            "hashtags": ["#ad", "#instabix", f"#{product.niche.split()[0].lower()}"],
            "link": bio_link,
            "disclosure": DISCLOSURE,
        },
        {
            "id": "behind_the_scenes",
            "hook": "Here is what I actually worked on this week.",
            "body": (
                f"I kept the chapters I would have wanted when I started: the setup, "
                f"the hard parts, and what to do when the week goes sideways. "
                f"That became {product.title}. {price}. Link in bio."
            ),
            "cta": "Questions? Reply to this post.",
            "hashtags": ["#ad", "#instabix", "#buildinpublic"],
            "link": bio_link,
            "disclosure": DISCLOSURE,
        },
        {
            "id": "direct_offer",
            "hook": f"{product.title} is live.",
            "body": (
                f"A {product.target_words:,}-word, "
                f"{len((product.toc or {}).get('chapters', []))}-chapter guide for {audience}. "
                f"I reviewed and approved every chapter. {price}."
            ),
            "cta": f"Get it here: {bio_link}",
            "hashtags": ["#ad", "#instabix"],
            "link": bio_link,
            "disclosure": DISCLOSURE,
        },
    ]


def build_launch_caption_variations(
    product: Product, bio_link: str
) -> list[dict[str, Any]]:
    """Exactly three launch caption variations for the launch-asset interface."""
    return [
        {
            "variation": index,
            "id": caption["id"],
            "hook": caption["hook"],
            "body": caption["body"],
            "link": caption["link"] or bio_link,
            "disclosure": caption["disclosure"],
        }
        for index, caption in enumerate(
            build_launch_captions(product, bio_link), start=1
        )
    ]


def _launch_assets(bio_link: str, story_templates: list[dict[str, Any]],
                   story_specs: list[dict[str, Any]], launch_captions: list[dict[str, Any]],
                   caption_variations: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "bio_link": bio_link,
        "story_templates": story_templates,
        "story_template_specs": story_specs,
        "launch_captions": launch_captions,
        "launch_caption_variations": caption_variations,
        "launch_performance": track_launch_performance(product_id=None),
    }


def publish_product(db: Session, product: Product, client: WhopClient) -> PublishOutcome:
    """Publish to Whop and persist the resulting launch kit.

    Idempotent: a product that is already published returns the stored result
    instead of creating a second Whop product. The creator-approval gate is the
    product's `creator_approved` state (set by the approval endpoint); it is
    re-checked here at the point of publication.
    """
    validate_publishable(product)

    if product.status in {"live", "published"} and product.whop_product_id and product.bio_link:
        whop = {
            "whop_product_id": product.whop_product_id,
            "whop_plan_id": product.whop_plan_id,
            "checkout_url": product.bio_link,
            "product_url": product.bio_link,
            "mock": bool((product.whop_product_id or "").startswith("prod_mock_")),
            "mode": "mock" if (product.whop_product_id or "").startswith("prod_mock_") else "live",
            "affiliate_link": None,
            "blocked_reason": (
                "Previously published product; no new Whop response was available to "
                "derive an affiliate link."
            ),
            "asset_mapping": {},
            "blocked": [],
            "audit": [],
            "notifications": [],
        }
        bio_link = product.bio_link
        story_templates = list(product.story_templates or [])
        launch_captions = list(product.launch_captions or [])
        return PublishOutcome(
            product=product,
            whop=whop,
            assets=_launch_assets(
                bio_link,
                story_templates,
                build_story_template_specs(product, bio_link),
                launch_captions,
                build_launch_caption_variations(product, bio_link),
            ),
            created=False,
        )

    toc = product.toc or {}
    description = (
        f"{toc.get('promise', 'A practical digital product')} "
        f"for {toc.get('audience', product.niche)}. "
        f"Chapters: " + "; ".join(chapter["title"] for chapter in toc.get("chapters", [])[:12])
    )
    result = client.publish_product(
        slug=product.slug,
        title=product.title,
        description=description,
        price_cents=product.price_cents,
        metadata={
            "branding": BRANDING,
            "instabix_product_id": str(product.id),
            "creator_id": str(product.creator_id),
            "niche": product.niche,
        },
    )

    bio_link = build_bio_link(product, result, client.settings.public_app_url)
    story_templates = build_story_templates(product, bio_link)
    story_specs = build_story_template_specs(product, bio_link)
    launch_captions = build_launch_captions(product, bio_link)
    caption_variations = build_launch_caption_variations(product, bio_link)

    product.whop_product_id = result.product_id
    product.whop_plan_id = result.plan_id
    product.bio_link = bio_link
    product.story_templates = story_templates
    product.launch_captions = launch_captions
    product.status = "live"
    product.published_at = utcnow()
    db.commit()
    db.refresh(product)

    return PublishOutcome(
        product=product,
        whop=result.to_dict(),
        assets=_launch_assets(
            bio_link,
            story_templates,
            story_specs,
            launch_captions,
            caption_variations,
        ),
        created=True,
        audit=result.audit,
        notifications=result.notifications,
        blocked=result.blocked,
    )
