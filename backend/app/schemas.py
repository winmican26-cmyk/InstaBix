"""Request validation. Every write is validated here before it reaches the DB."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app import config as app_config
from app.agents.agent2 import TEMPLATE_KEYS
from app.agents.agent3 import MAX_WORDS, MIN_WORDS
from app.config import NICHES

# Stage 2 vocabularies. These are mirrors of the DB CHECK constraints; the
# locked split rules and the global branding lock are deliberately untouched.
BRANDING_VALUES: tuple[str, ...] = app_config.PRODUCT_BRANDING
PRODUCT_STATUSES: tuple[str, ...] = app_config.PRODUCT_STATUSES
CREATOR_STATUSES: tuple[str, ...] = app_config.CREATOR_STATUSES
EMAIL_STEPS: tuple[int, ...] = app_config.EMAIL_STEPS


def _enum_value(value: str, values: tuple[str, ...], label: str) -> str:
    if value not in values:
        raise ValueError(f"{label} must be one of: {', '.join(values)}")
    return value


def normalize_handle(handle: str) -> str:
    return handle.strip().lstrip("@").lower()


class ScoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    handle: str = Field(min_length=1, max_length=120)
    platform: str = Field(default="instagram", min_length=1, max_length=32)
    email: EmailStr | None = None
    niche: str = Field(min_length=1, max_length=64)
    followers: int = Field(ge=0, le=100_000_000)
    median_views: int | None = Field(default=None, ge=0)
    reels_in_range: int | None = Field(default=None, ge=0, le=12)
    recent_reel_views: list[int] | None = Field(default=None, max_length=200)
    ad_posts: int = Field(default=0, ge=0, le=1_000)

    @field_validator("name", "niche", "platform")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Value cannot be blank")
        return cleaned

    @field_validator("handle")
    @classmethod
    def _handle(cls, value: str) -> str:
        cleaned = normalize_handle(value)
        if not cleaned:
            raise ValueError("A handle is required")
        return cleaned

    @field_validator("niche")
    @classmethod
    def _niche(cls, value: str) -> str:
        if value not in NICHES:
            raise ValueError(f"Niche must be one of: {', '.join(NICHES)}")
        return value

    @field_validator("recent_reel_views")
    @classmethod
    def _views(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if any(view < 0 for view in value):
            raise ValueError("Reel view counts cannot be negative")
        return value

    @model_validator(mode="after")
    def _has_signals(self) -> "ScoutRequest":
        if self.median_views is None and not self.recent_reel_views:
            raise ValueError("Provide median_views or recent_reel_views")
        if self.reels_in_range is None and not self.recent_reel_views:
            raise ValueError("Provide reels_in_range or recent_reel_views")
        return self


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    creator_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=160)
    niche: str | None = Field(default=None, max_length=64)
    price_cents: int = Field(ge=100, le=100_000_000)
    target_words: int = Field(default=7_000, ge=MIN_WORDS, le=MAX_WORDS)
    word_count: int = Field(default=7_000, ge=0)
    branding: str = Field(default="hybrid", max_length=16)
    generate_toc: bool = True
    toc: dict[str, Any] | None = None
    is_first_product: bool | None = None

    @field_validator("branding")
    @classmethod
    def _branding(cls, value: str) -> str:
        return _enum_value(value, BRANDING_VALUES, "Branding")

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("A title is required")
        return cleaned

    @field_validator("niche")
    @classmethod
    def _niche(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in NICHES:
            raise ValueError(f"Niche must be one of: {', '.join(NICHES)}")
        return value


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approved_by: str = Field(default="creator", min_length=1, max_length=160)


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0)


class OutreachCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    creator_id: int = Field(gt=0)
    template_key: Literal["initial", "follow_up", "close_loop"] = "initial"
    campaign_id: int | None = Field(default=None, gt=0)
    sender_name: str = Field(default="The InstaBix team", min_length=1, max_length=120)
    custom_note: str | None = Field(default=None, max_length=500)

    @field_validator("template_key")
    @classmethod
    def _template(cls, value: str) -> str:
        if value not in TEMPLATE_KEYS:
            raise ValueError(f"Template must be one of: {', '.join(TEMPLATE_KEYS)}")
        return value


class ClassifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str | None = Field(default=None, max_length=20_000)
    email_id: int | None = Field(default=None, gt=0)
    creator_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _has_text(self) -> "ClassifyRequest":
        if not self.email_id and not (self.text or "").strip():
            raise ValueError("Provide text or an email_id")
        return self


class SaleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0)
    whop_sale_id: str = Field(min_length=1, max_length=160)
    gross_cents: int = Field(gt=0, le=100_000_000)
    currency: str = Field(default="usd", min_length=3, max_length=8)

    @field_validator("whop_sale_id")
    @classmethod
    def _sale_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("A sale ID is required")
        return cleaned


class RefundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refunded_cents: int = Field(ge=0)


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    branding: str | None = Field(default=None, max_length=32)
    sender_name: str | None = Field(default=None, min_length=1, max_length=120)
    support_email: EmailStr | None = None
    outreach_paused: bool | None = None
