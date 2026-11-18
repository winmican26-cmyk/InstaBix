"""Agent 4 — Integrator.

Publishes an approved product to Whop, then derives the launch kit (bio link,
story templates, launch captions). The creator approval gate is enforced here,
at the point of publication, not only in the UI.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.agents.agent3 import MAX_WORDS, MIN_WORDS, validate_toc
from app.config import BRANDING, NICHES
from app.errors import PublishBlocked
from app.models import Product, utcnow
from app.whop import WhopClient, WhopPublishResult

DISCLOSURE = "Paid partnership with InstaBix. #ad"


@dataclass(frozen=True)
class PublishOutcome:
    product: Product
    whop: dict[str, Any]
    assets: dict[str, Any]
    created: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "published": True,
            "created": self.created,
            "product": self.product.to_dict(),
            "whop": self.whop,
            "assets": self.assets,
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


def publish_product(db: Session, product: Product, client: WhopClient) -> PublishOutcome:
    """Publish to Whop and persist the resulting launch kit.

    Idempotent: a product that is already published returns the stored result
    instead of creating a second Whop product.
    """
    validate_publishable(product)

    if product.status == "published" and product.whop_product_id and product.bio_link:
        whop = {
            "whop_product_id": product.whop_product_id,
            "whop_plan_id": product.whop_plan_id,
            "checkout_url": product.bio_link,
            "product_url": product.bio_link,
            "mock": bool((product.whop_product_id or "").startswith("prod_mock_")),
            "mode": "mock" if (product.whop_product_id or "").startswith("prod_mock_") else "live",
        }
        return PublishOutcome(
            product=product,
            whop=whop,
            assets={
                "bio_link": product.bio_link,
                "story_templates": list(product.story_templates or []),
                "launch_captions": list(product.launch_captions or []),
            },
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
    launch_captions = build_launch_captions(product, bio_link)

    product.whop_product_id = result.product_id
    product.whop_plan_id = result.plan_id
    product.bio_link = bio_link
    product.story_templates = story_templates
    product.launch_captions = launch_captions
    product.status = "published"
    product.published_at = utcnow()
    db.commit()
    db.refresh(product)

    return PublishOutcome(
        product=product,
        whop=result.to_dict(),
        assets={
            "bio_link": bio_link,
            "story_templates": story_templates,
            "launch_captions": launch_captions,
        },
        created=True,
    )
