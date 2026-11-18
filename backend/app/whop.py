"""Whop adapter, split rules and payout math.

Two modes:

- live: WHOP_API_KEY is present. Uses the official current Whop REST API
  (POST /products then POST /variants) with server-side credentials.
- mock: no key in a non-production environment. Returns clearly flagged
  simulated IDs so the local loop can be tested without touching Whop.

Production with no key selects "disabled". Publishing then fails closed with
503; it never fabricates a product, checkout link or sale.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

import httpx

from app.config import Settings
from app.errors import WhopAPIError, WhopNotConfigured

logger = logging.getLogger(__name__)

# Locked business rules. Tuple order is (creator, InstaBix).
FIRST_PRODUCT_SPLIT = (0.60, 0.40)
SUBSEQUENT_PRODUCT_SPLIT = (0.50, 0.50)


def split_for(is_first_product: bool) -> tuple[float, float]:
    """Return (creator_share, instabix_share).

    Product 1 built with a creator: 60% creator / 40% InstaBix.
    Product 2 onward: 50% creator / 50% InstaBix.
    """
    return FIRST_PRODUCT_SPLIT if is_first_product else SUBSEQUENT_PRODUCT_SPLIT


def split_bps_for(is_first_product: bool) -> tuple[int, int]:
    creator_share, platform_share = split_for(is_first_product)
    return int(round(creator_share * 10_000)), int(round(platform_share * 10_000))


def calc_payouts(
    gross_cents: int,
    is_first_product: bool,
    refunded_cents: int = 0,
) -> dict[str, Any]:
    """Split money in integer cents with half-up rounding on the creator side.

    The remainder always goes to InstaBix, so creator + platform == net exactly.
    """
    if not isinstance(gross_cents, int) or isinstance(gross_cents, bool):
        raise TypeError("gross_cents must be an integer number of cents")
    if not isinstance(refunded_cents, int) or isinstance(refunded_cents, bool):
        raise TypeError("refunded_cents must be an integer number of cents")
    if gross_cents < 0:
        raise ValueError("gross_cents cannot be negative")
    if not 0 <= refunded_cents <= gross_cents:
        raise ValueError("refunded_cents must be between 0 and gross_cents")

    creator_share, platform_share = split_for(is_first_product)
    net_cents = gross_cents - refunded_cents
    creator_cents = int(
        (Decimal(net_cents) * Decimal(str(creator_share))).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    platform_cents = net_cents - creator_cents
    return {
        "gross_cents": gross_cents,
        "refunded_cents": refunded_cents,
        "net_cents": net_cents,
        "creator_share": creator_share,
        "platform_share": platform_share,
        "creator_cents": creator_cents,
        "platform_cents": platform_cents,
        "is_first_product": is_first_product,
    }


@dataclass(frozen=True)
class WhopPublishResult:
    product_id: str
    plan_id: str
    checkout_url: str
    product_url: str
    mock: bool
    mode: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "whop_product_id": self.product_id,
            "whop_plan_id": self.plan_id,
            "checkout_url": self.checkout_url,
            "product_url": self.product_url,
            "mock": self.mock,
            "mode": self.mode,
        }


class WhopClient:
    """Minimal official-API adapter for publishing one priced product."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.mode = settings.whop_mode

    def status(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "configured": bool(self.settings.whop_api_key),
            "mock": self.mode == "mock",
            "publish_ready": self.mode in {"live", "mock"},
            "account_id": self.settings.whop_account_id,
            "api_base": self.settings.whop_api_base if self.mode == "live" else None,
            "api_version_date": self.settings.whop_api_version_date if self.mode == "live" else None,
            "note": (
                "Mock mode: no Whop API calls are made and all IDs are simulated."
                if self.mode == "mock"
                else "Publishing is disabled: set WHOP_API_KEY (never mock in production)."
                if self.mode == "disabled"
                else "Live Whop API calls with server-side credentials."
            ),
        }

    def _require_publishing(self) -> None:
        if self.mode == "disabled":
            hint = (
                "Set WHOP_API_KEY for this production deployment."
                if self.settings.is_production
                else "Set WHOP_API_KEY, or allow local mock mode with APP_ENV=development."
            )
            raise WhopNotConfigured(f"Whop publishing is disabled. {hint}")

    @staticmethod
    def _slug(value: str) -> str:
        base = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
        while "--" in base:
            base = base.replace("--", "-")
        return (base or "instabix-product")[:80]

    def _headers(self, idempotency_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.whop_api_key}",
            "Api-Version-Date": self.settings.whop_api_version_date,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key[:255],
            "User-Agent": "InstaBix/0.1 (+https://instabix.com)",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> dict[str, Any]:
        url = f"{self.settings.whop_api_base.rstrip('/')}{path}"
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = httpx.request(
                    method,
                    url,
                    json=payload,
                    headers=self._headers(idempotency_key),
                    timeout=self.settings.whop_timeout_seconds,
                )
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning("Whop request failed at %s (attempt %s)", path, attempt + 1)
                if attempt == 0:
                    time.sleep(1)
                    continue
                raise WhopAPIError("Whop could not be reached. No product was published.") from exc

            if response.status_code in {429, 500, 502, 503, 504} and attempt == 0:
                time.sleep(1)
                continue

            if response.status_code >= 400:
                raise WhopAPIError(
                    f"Whop rejected {method} {path} with HTTP {response.status_code}.",
                    details={"status": response.status_code, "error": self._safe_error(response)},
                )

            try:
                data = response.json()
            except ValueError as exc:
                raise WhopAPIError("Whop returned a non-JSON response.") from exc
            if not isinstance(data, dict):
                raise WhopAPIError("Whop returned an unexpected response shape.")
            return data

        raise WhopAPIError("Whop request did not succeed.") from last_error

    @staticmethod
    def _safe_error(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return "no JSON error body"
        if isinstance(payload, dict):
            message = payload.get("message") or payload.get("error") or payload.get("detail")
            if isinstance(message, str):
                return message[:500]
        return "unknown error"

    def publish_product(
        self,
        *,
        slug: str,
        title: str,
        description: str,
        price_cents: int,
        metadata: dict[str, Any] | None = None,
    ) -> WhopPublishResult:
        """Create a Whop product and its one-time paid variant.

        Stable idempotency keys make a retry safe: Whop returns the original
        resources instead of duplicating them.
        """
        self._require_publishing()
        if price_cents < 100:
            raise ValueError("Whop requires a paid variant of at least 1.00 in its currency.")
        if not title.strip():
            raise ValueError("A product title is required.")

        stable_key = f"instabix-product-{slug}"
        if self.mode == "mock":
            digest = hashlib.sha256(f"{slug}|{title}|{price_cents}".encode("utf-8")).hexdigest()[:12]
            product_id = f"prod_mock_{digest}"
            plan_id = f"plan_mock_{digest}"
            return WhopPublishResult(
                product_id=product_id,
                plan_id=plan_id,
                checkout_url=f"https://whop.com/checkout/{plan_id}",
                product_url=f"https://whop.com/{self._slug(slug)}",
                mock=True,
                mode="mock",
            )

        account_id = self.settings.whop_account_id
        safe_metadata = {str(key): str(value) for key, value in (metadata or {}).items()}

        product_payload: dict[str, Any] = {
            "title": title.strip()[:80],
            "description": description.strip()[:1500],
            "route": self._slug(slug),
            "visibility": "visible",
            "metadata": safe_metadata,
        }
        if account_id:
            product_payload["account_id"] = account_id

        product = self._request(
            "POST", "/products", payload=product_payload, idempotency_key=stable_key
        )
        product_id = str(product.get("id") or "")
        if not product_id:
            raise WhopAPIError("Whop created a product without returning an ID.")

        variant_payload: dict[str, Any] = {
            "product_id": product_id,
            "title": "Standard access",
            "initial_price": price_cents / 100,
            "billing_type": "one_time",
            "currency": "usd",
            "release_method": "buy_now",
            "visibility": "visible",
            "unlimited_stock": True,
            "metadata": {**safe_metadata, "instabix_product_id": stable_key},
        }
        if account_id:
            variant_payload["account_id"] = account_id

        variant = self._request(
            "POST",
            "/variants",
            payload=variant_payload,
            idempotency_key=f"{stable_key}-variant",
        )
        plan_id = str(variant.get("id") or "")
        checkout_url = str(variant.get("purchase_url") or "")
        if not checkout_url:
            route = str(product.get("route") or self._slug(slug))
            checkout_url = f"https://whop.com/{route}"
        return WhopPublishResult(
            product_id=product_id,
            plan_id=plan_id or f"plan_unknown_{product_id}",
            checkout_url=checkout_url,
            product_url=f"https://whop.com/{str(product.get('route') or self._slug(slug))}",
            mock=False,
            mode="live",
        )
