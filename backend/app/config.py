"""Environment-backed settings.

The defaults are local-development safe. Production must set APP_ENV,
DATABASE_URL, API_KEY and WHOP_API_KEY explicitly.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent

NICHES: tuple[str, ...] = (
    "Sports",
    "Home",
    "Finance",
    "Parenting",
    "AI Tools for Small Business",
    "Faith & Mindset",
)
BRANDING = "hybrid"

# Stage 2 schema vocabularies. ``BRANDING`` above stays locked to "hybrid";
# these tuples describe the allowed per-product / per-creator field values.
PRODUCT_BRANDING: tuple[str, ...] = ("hybrid", "creator_only", "instabix_only")
CREATOR_STATUSES: tuple[str, ...] = (
    "New",
    "Qualified",
    "Contacted",
    "Replied",
    "Shortlisted",
    "Partnered",
    "Rejected",
)
PRODUCT_STATUSES: tuple[str, ...] = (
    "idea",
    "toc_approved",
    "draft",
    "creator_approved",
    "live",
    "rejected",
)
EMAIL_STEPS: tuple[int, ...] = (1, 2, 3)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "InstaBix API"
    app_env: str = "development"
    app_version: str = "0.1.0"

    database_url: str = "sqlite:///./instabix.db"
    api_key: str | None = None

    cors_origins: str = "http://localhost:3100,http://127.0.0.1:3100"
    public_app_url: str = "http://localhost:3100"

    # Stage 3 settings. The outreach cap mirrors the locked 50/day workspace
    # limit (D12); these are server-owned and never client-writable here.
    email_from_domain: str | None = None
    outreach_daily_cap: int = Field(default=50, gt=0)

    whop_api_key: str | None = None
    whop_account_id: str | None = None
    whop_api_base: str = "https://api.whop.com/api/v1"
    whop_api_version_date: str = "2026-11-17-3"
    whop_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    whop_mock_mode: str | None = "auto"

    @field_validator("app_env")
    @classmethod
    def _normalize_env(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("whop_mock_mode")
    @classmethod
    def _normalize_mock_mode(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized in {"", "auto"}:
            return "auto"
        if normalized in {"true", "1", "yes", "on"}:
            return "true"
        if normalized in {"false", "0", "no", "off"}:
            return "false"
        raise ValueError("WHOP_MOCK_MODE must be auto, true or false")

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def whop_mode(self) -> str:
        """Return "live", "mock" or "disabled".

        Mock is never selected in production, even if requested. A missing key
        in production is a configuration error, not a licence to fabricate data.
        """
        if self.whop_mock_mode == "true":
            return "disabled" if self.is_production else "mock"
        if self.whop_api_key:
            return "live"
        if self.whop_mock_mode == "false":
            return "disabled"
        return "disabled" if self.is_production else "mock"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


def get_settings() -> Settings:
    return Settings()
