"""Database schema for the InstaBix API starter.

Five business tables plus a small key/value settings table:

- creators: scouted and approved creators
- campaigns: outreach campaigns
- products: digital products built with a creator
- emails: outreach drafts / replies
- sales: money in, with the split snapshot used at sale time

Money is stored in integer cents. Split percentages are stored in basis points
so a historical sale can always be re-derived without floating point drift.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


class Base(DeclarativeBase):
    pass


class Creator(Base):
    __tablename__ = "creators"
    __table_args__ = (
        UniqueConstraint("platform", "handle", name="uq_creators_platform_handle"),
        CheckConstraint("followers >= 0", name="ck_creators_followers"),
        CheckConstraint("median_views >= 0", name="ck_creators_median_views"),
        CheckConstraint("reels_in_range >= 0 AND reels_in_range <= 12", name="ck_creators_reels"),
        CheckConstraint("ad_posts >= 0", name="ck_creators_ad_posts"),
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
    recent_reel_views: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    ad_posts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    qualified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    qualification_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    qualification: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="new", index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    products: Mapped[list["Product"]] = relationship(back_populates="creator")
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
            "qualification_score": self.qualification_score,
            "qualification": self.qualification or {},
            "status": self.status,
            "source": self.source,
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    niche: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    emails: Mapped[list["Email"]] = relationship(back_populates="campaign")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "niche": self.niche,
            "status": self.status,
            "created_at": _iso(self.created_at),
        }


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price_cents >= 0", name="ck_products_price"),
        CheckConstraint("target_words >= 0", name="ck_products_target_words"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("creators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(180), nullable=False, unique=True, index=True)
    niche: Mapped[str] = mapped_column(String(64), nullable=False)

    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    is_first_product: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    split_creator_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    split_platform_bps: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    toc: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    target_words: Mapped[int] = mapped_column(Integer, nullable=False, default=7000)

    creator_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    whop_product_id: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    whop_plan_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bio_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    story_templates: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    launch_captions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
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
            "is_first_product": self.is_first_product,
            "split": {
                "creator_bps": self.split_creator_bps,
                "platform_bps": self.split_platform_bps,
                "creator_share": self.split_creator_bps / 10_000,
                "platform_share": self.split_platform_bps / 10_000,
            },
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

    classification: Mapped[str | None] = mapped_column(String(24), nullable=True)
    classification_detail: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

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
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="usd")

    gross_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    refunded_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    creator_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    creator_share_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_share_bps: Mapped[int] = mapped_column(Integer, nullable=False)

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
            "currency": self.currency,
            "gross_cents": self.gross_cents,
            "refunded_cents": self.refunded_cents,
            "net_cents": self.net_cents,
            "creator_cents": self.creator_cents,
            "platform_cents": self.platform_cents,
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


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )
