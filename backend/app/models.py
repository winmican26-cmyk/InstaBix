"""Database schema for the InstaBix API starter.

Six tables:

- creators: scouted and approved creators
- campaigns: outreach campaigns (one per creator)
- products: digital products built with a creator
- emails: outreach drafts / replies
- sales: money in, with the split snapshot used at sale time
- settings: small key/value table with an integer primary key

Money is stored in integer cents. Split percentages are stored in basis points
so a historical sale can always be re-derived without floating point drift.
Decimal price/payout/share columns are mirrors of those authoritative values;
no arithmetic is ever performed on them.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.config import CREATOR_STATUSES, EMAIL_STEPS, NICHES, PRODUCT_BRANDING, PRODUCT_STATUSES

try:
    from sqlalchemy.dialects.postgresql import JSONB
except ImportError:  # pragma: no cover - the dialect ships with SQLAlchemy
    JSONB = None  # type: ignore[assignment, misc]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _json_type() -> Any:
    """Portable JSON column: JSONB on Postgres, plain JSON on SQLite."""
    json_type = JSON()
    if JSONB is not None:
        json_type = json_type.with_variant(JSONB(), "postgresql")
    return json_type


def _in_sql(values: tuple[str, ...]) -> str:
    """Render a tuple of literal values for a SQL IN clause."""
    return ", ".join("'" + value.replace("'", "''") + "'" for value in values)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _as_float(value: Decimal | float | int | None) -> float | None:
    return float(value) if value is not None else None


class Base(DeclarativeBase):
    pass


class Creator(Base):
    __tablename__ = "creators"
    __table_args__ = (
        UniqueConstraint("platform", "handle", name="uq_creators_platform_handle"),
        UniqueConstraint("handle", name="uq_creators_handle"),
        CheckConstraint("followers >= 0", name="ck_creators_followers"),
        CheckConstraint("median_views >= 0", name="ck_creators_median_views"),
        CheckConstraint("reels_in_range >= 0 AND reels_in_range <= 12", name="ck_creators_reels"),
        CheckConstraint("ad_posts >= 0", name="ck_creators_ad_posts"),
        CheckConstraint(f"niche IN ({_in_sql(NICHES)})", name="ck_creators_niche"),
        CheckConstraint(f"status IN ({_in_sql(CREATOR_STATUSES)})", name="ck_creators_status"),
        CheckConstraint(
            "monetization_score >= 0 AND monetization_score <= 100",
            name="ck_creators_monetization_score",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    handle: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="instagram")
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    niche: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    followers: Mapped[int] = mapped_column(Integer, nullable=False)
    median_views: Mapped[int] = mapped_column(Integer, nullable=False)
    reels_in_range: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recent_reel_views: Mapped[list[int]] = mapped_column(_json_type(), nullable=False, default=list)
    ad_posts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    qualified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    qualification_score: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0")
    )
    qualification: Mapped[dict[str, Any]] = mapped_column(
        _json_type(), nullable=False, default=dict
    )

    engagement_rate: Mapped[Decimal] = mapped_column(
        Numeric(10, 6), nullable=False, default=Decimal("0")
    )
    monetization_score: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    top_reels: Mapped[list[Any]] = mapped_column(_json_type(), nullable=False, default=list)
    content_pillars: Mapped[list[str]] = mapped_column(_json_type(), nullable=False, default=list)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="New", index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    products: Mapped[list["Product"]] = relationship(back_populates="creator")
    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="creator")
    emails: Mapped[list["Email"]] = relationship(back_populates="creator")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "handle": self.handle,
            "platform": self.platform,
            "email": self.email,
            "niche": self.niche,
            "followers": self.followers,
            "median_views": self.median_views,
            "reels_in_range": self.reels_in_range,
            "recent_reel_views": list(self.recent_reel_views or []),
            "ad_posts": self.ad_posts,
            "qualified": self.qualified,
            "qualification_score": _as_float(self.qualification_score),
            "qualification": self.qualification or {},
            "engagement_rate": _as_float(self.engagement_rate),
            "monetization_score": self.monetization_score,
            "top_reels": list(self.top_reels or []),
            "content_pillars": list(self.content_pillars or []),
            "status": self.status,
            "source": self.source,
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }


class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        UniqueConstraint("creator_id", name="uq_campaigns_creator_id"),
        CheckConstraint(
            "current_step >= 1 AND current_step <= 3", name="ck_campaigns_current_step"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    niche: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")

    creator_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("creators.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sequence_status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    reply_classification: Mapped[str | None] = mapped_column(String(32), nullable=True)
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    creator: Mapped[Creator | None] = relationship(back_populates="campaigns", lazy="selectin")
    emails: Mapped[list["Email"]] = relationship(back_populates="campaign")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "niche": self.niche,
            "status": self.status,
            "creator_id": self.creator_id,
            "sequence_status": self.sequence_status,
            "reply_classification": self.reply_classification,
            "current_step": self.current_step,
            "next_followup_at": _iso(self.next_followup_at),
            "created_at": _iso(self.created_at),
        }


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price_cents >= 0", name="ck_products_price"),
        CheckConstraint("target_words >= 0", name="ck_products_target_words"),
        CheckConstraint("word_count >= 0", name="ck_products_word_count"),
        CheckConstraint("split_creator_bps + split_platform_bps = 10000", name="ck_products_split_bps_sum"),
        CheckConstraint("split_creator + split_operator = 1.00", name="ck_products_split_mirror_sum"),
        CheckConstraint(f"branding IN ({_in_sql(PRODUCT_BRANDING)})", name="ck_products_branding"),
        CheckConstraint(f"status IN ({_in_sql(PRODUCT_STATUSES)})", name="ck_products_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(180), nullable=False, unique=True, index=True)
    niche: Mapped[str] = mapped_column(String(64), nullable=False)

    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_first_product: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    split_creator_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    split_platform_bps: Mapped[int] = mapped_column(Integer, nullable=False)

    split_creator: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    split_operator: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    toc: Mapped[dict[str, Any] | None] = mapped_column(_json_type(), nullable=True)
    target_words: Mapped[int] = mapped_column(Integer, nullable=False, default=7000)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=7000)
    branding: Mapped[str] = mapped_column(String(16), nullable=False, default="hybrid")
    whop_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content_md: Mapped[str | None] = mapped_column(Text, nullable=True)

    creator_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    whop_product_id: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    whop_plan_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bio_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    story_templates: Mapped[list[dict[str, Any]]] = mapped_column(
        _json_type(), nullable=False, default=list
    )
    launch_captions: Mapped[list[dict[str, Any]]] = mapped_column(
        _json_type(), nullable=False, default=list
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    creator: Mapped[Creator] = relationship(back_populates="products", lazy="selectin")
    sales: Mapped[list["Sale"]] = relationship(back_populates="product")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "creator_id": self.creator_id,
            "creator_name": self.creator.name if self.creator is not None else None,
            "title": self.title,
            "slug": self.slug,
            "niche": self.niche,
            "price_cents": self.price_cents,
            "price": _as_float(self.price),
            "word_count": self.word_count,
            "branding": self.branding,
            "whop_url": self.whop_url,
            "content_md": self.content_md,
            "is_first_product": self.is_first_product,
            "split": {
                "creator_bps": self.split_creator_bps,
                "platform_bps": self.split_platform_bps,
                "creator_share": self.split_creator_bps / 10_000,
                "platform_share": self.split_platform_bps / 10_000,
            },
            "split_creator": _as_float(self.split_creator),
            "split_operator": _as_float(self.split_operator),
            "status": self.status,
            "toc": self.toc,
            "target_words": self.target_words,
            "creator_approved": self.creator_approved,
            "approved_by": self.approved_by,
            "approved_at": _iso(self.approved_at),
            "whop_product_id": self.whop_product_id,
            "whop_plan_id": self.whop_plan_id,
            "bio_link": self.bio_link,
            "story_templates": list(self.story_templates or []),
            "launch_captions": list(self.launch_captions or []),
            "published_at": _iso(self.published_at),
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }


class Email(Base):
    __tablename__ = "emails"
    __table_args__ = (
        CheckConstraint(
            f"step >= {EMAIL_STEPS[0]} AND step <= {EMAIL_STEPS[-1]}", name="ck_emails_step"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True
    )

    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="outbound")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)
    template_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    opened: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    replied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    classification: Mapped[str | None] = mapped_column(String(24), nullable=True)
    classification_detail: Mapped[dict[str, Any] | None] = mapped_column(_json_type(), nullable=True)

    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    creator: Mapped[Creator] = relationship(back_populates="emails", lazy="selectin")
    campaign: Mapped[Campaign | None] = relationship(back_populates="emails", lazy="selectin")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "creator_id": self.creator_id,
            "creator_name": self.creator.name if self.creator is not None else None,
            "campaign_id": self.campaign_id,
            "direction": self.direction,
            "status": self.status,
            "template_key": self.template_key,
            "subject": self.subject,
            "body": self.body,
            "step": self.step,
            "opened": self.opened,
            "replied": self.replied,
            "classification": self.classification,
            "classification_detail": self.classification_detail,
            "approved": self.approved,
            "approved_by": self.approved_by,
            "approved_at": _iso(self.approved_at),
            "sent_at": _iso(self.sent_at),
            "created_at": _iso(self.created_at),
        }


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        CheckConstraint("gross_cents >= 0", name="ck_sales_gross"),
        CheckConstraint("refunded_cents >= 0 AND refunded_cents <= gross_cents", name="ck_sales_refunded"),
        CheckConstraint("creator_cents >= 0 AND platform_cents >= 0", name="ck_sales_split"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    whop_sale_id: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    whop_order_id: Mapped[str | None] = mapped_column(String(160), nullable=True, unique=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="usd")

    gross_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    refunded_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    creator_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    creator_share_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_share_bps: Mapped[int] = mapped_column(Integer, nullable=False)

    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    payout_creator: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    payout_operator: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    sold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(String(24), nullable=False, default="paid", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    product: Mapped[Product] = relationship(back_populates="sales", lazy="selectin")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_title": self.product.title if self.product is not None else None,
            "creator_id": self.creator_id,
            "whop_sale_id": self.whop_sale_id,
            "whop_order_id": self.whop_order_id,
            "currency": self.currency,
            "gross_cents": self.gross_cents,
            "refunded_cents": self.refunded_cents,
            "net_cents": self.net_cents,
            "creator_cents": self.creator_cents,
            "platform_cents": self.platform_cents,
            "amount": _as_float(self.amount),
            "payout_creator": _as_float(self.payout_creator),
            "payout_operator": _as_float(self.payout_operator),
            "sold_at": _iso(self.sold_at),
            "split": {
                "creator_bps": self.creator_share_bps,
                "platform_bps": self.platform_share_bps,
                "creator_share": self.creator_share_bps / 10_000,
                "platform_share": self.platform_share_bps / 10_000,
            },
            "status": self.status,
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }


class Setting(Base):
    __tablename__ = "settings"
    __table_args__ = (UniqueConstraint("key", name="uq_settings_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    value: Mapped[Any] = mapped_column(_json_type(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )


# Compatibility alias: application code is migrated to ``Setting`` by a
# separate atom; the alias keeps existing imports importable in the meantime.
AppSetting = Setting
