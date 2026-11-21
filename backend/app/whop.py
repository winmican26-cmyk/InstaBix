"""Whop adapter, split rules and payout math.

Two modes:

- live: WHOP_API_KEY is present. Uses the official current Whop REST API
  (POST /products then POST /variants) with server-side credentials.
- mock: no key in a non-production environment. Returns clearly flagged
  simulated IDs so the local loop can be tested without touching Whop.

Production with no key selects "disabled". Publishing then fails closed with
503; it never fabricates a product, checkout link or sale.

Auditability and notifications:

- Every *outbound* call is recorded in an in-memory, injectable audit sink.
  Records carry only non-secret metadata (never headers, payloads or keys).
- A `notify_human` hook is invoked on terminal call failure and on lifecycle
  events. With no credentials configured it returns a structured `blocked`
  result and sends nothing.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable
from urllib.parse import quote

import httpx

from app.config import Settings
from app.errors import WhopAPIError, WhopNotConfigured

logger = logging.getLogger(__name__)

# Locked business rules. Tuple order is (creator, VistaBix).
FIRST_PRODUCT_SPLIT = (0.60, 0.40)
SUBSEQUENT_PRODUCT_SPLIT = (0.50, 0.50)

# Structured human-notification event kinds.
EVENT_FAILED_RETRY = "failed_retry"
EVENT_HOT_REPLY = "hot_reply"
EVENT_PRODUCT_READY = "product_ready"
EVENT_SALE_MADE = "sale_made"
NOTIFICATION_EVENTS = (
    EVENT_FAILED_RETRY,
    EVENT_HOT_REPLY,
    EVENT_PRODUCT_READY,
    EVENT_SALE_MADE,
)

# Substrings that must never reach an audit record or a notification event.
_SECRET_TOKENS = ("authorization", "api_key", "apikey", "token", "secret", "password", "cookie")

_ASSET_KEYS: dict[str, str] = {
    "cover": "cover_ref",
    "pdf": "pdf_ref",
}
_COMMUNITY_ALLOWED_KEYS = ("platform", "server_id", "invite_code", "name", "channel")


def split_for(is_first_product: bool) -> tuple[float, float]:
    """Return (creator_share, vistabix_share).

    Product 1 built with a creator: 60% creator / 40% VistaBix.
    Product 2 onward: 50% creator / 50% VistaBix.
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

    The remainder always goes to VistaBix, so creator + platform == net exactly.
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


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class WhopCallAudit:
    """One outbound Whop call attempt. Contains no credentials or bodies."""

    timestamp: str
    method: str
    path: str
    product_id: str | None
    reference_id: str | None
    attempt: int
    status: str  # success | retry | error
    status_code: int | None = None
    error_class: str | None = None
    request_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "method": self.method,
            "path": self.path,
            "product_id": self.product_id,
            "reference_id": self.reference_id,
            "attempt": self.attempt,
            "status": self.status,
            "status_code": self.status_code,
            "error_class": self.error_class,
            "request_id": self.request_id,
        }


class WhopAuditSink:
    """In-memory audit sink. Injectable so tests can assert on it."""

    def __init__(self) -> None:
        self._records: list[WhopCallAudit] = []

    def record(self, entry: WhopCallAudit) -> None:
        self._records.append(entry)

    @property
    def records(self) -> list[WhopCallAudit]:
        return list(self._records)

    def for_product(self, product_id: str) -> list[WhopCallAudit]:
        return [
            entry
            for entry in self._records
            if product_id in {entry.product_id, entry.reference_id}
        ]

    def to_dicts(self) -> list[dict[str, Any]]:
        return [entry.to_dict() for entry in self._records]

    def clear(self) -> None:
        self._records.clear()


@dataclass(frozen=True)
class WhopPublishResult:
    product_id: str
    plan_id: str
    checkout_url: str
    product_url: str
    mock: bool
    mode: str
    affiliate_link: str | None = None
    blocked_reason: str | None = None
    asset_mapping: dict[str, Any] = field(default_factory=dict)
    blocked: list[dict[str, Any]] = field(default_factory=list)
    audit: list[dict[str, Any]] = field(default_factory=list)
    notifications: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "whop_product_id": self.product_id,
            "whop_plan_id": self.plan_id,
            "checkout_url": self.checkout_url,
            "product_url": self.product_url,
            "mock": self.mock,
            "mode": self.mode,
            "affiliate_link": self.affiliate_link,
            "blocked_reason": self.blocked_reason,
            "asset_mapping": self.asset_mapping,
            "blocked": self.blocked,
            "audit": self.audit,
            "notifications": self.notifications,
        }


def _default_notify_human(event: dict[str, Any]) -> dict[str, Any]:
    """No-op delivery: record the structured event, send nothing, report blocked."""
    return {
        "status": "blocked",
        "delivery": "none",
        "reason": "No notification credentials are configured; no real notification was sent.",
        "event": event,
    }


def _safe_details(details: dict[str, Any]) -> dict[str, Any]:
    return {
        str(key): value
        for key, value in details.items()
        if not any(token in str(key).lower() for token in _SECRET_TOKENS)
    }


def _safe_scalar(value: Any, limit: int = 500) -> str | None:
    """Return a bounded scalar for a whitelisted response field."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        return value.strip()[:limit] or None
    if isinstance(value, int):
        return str(value)[:limit]
    return None


def _safe_asset_ref(kind: str, value: Any) -> str:
    """Describe an asset without logging its bytes or inventing a URL."""
    if isinstance(value, (bytes, bytearray)):
        digest = hashlib.sha256(bytes(value)).hexdigest()[:12]
        return f"{kind}:bytes:sha256:{digest}"
    if isinstance(value, dict):
        keys = ",".join(sorted(str(key) for key in value))
        return f"{kind}:object:keys={keys[:120]}"
    text = str(value)
    if text.startswith(("https://", "http://")):
        return f"{kind}:url:{text[:500]}"
    return f"{kind}:ref:{text[:200]}"


def _derive_affiliate_link(
    product: dict[str, Any], variant: dict[str, Any]
) -> tuple[str | None, str | None]:
    """Use only a real link present in the Whop response; never fabricate one."""
    for source in (variant, product):
        for key in ("affiliate_link", "affiliate_url", "referral_link", "referral_url"):
            value = source.get(key)
            if isinstance(value, str) and value.startswith(("https://", "http://")):
                return value, None
    return (
        None,
        "Whop did not return an affiliate/access link in the create response; "
        "none was fabricated.",
    )


class WhopClient:
    """Minimal official-API adapter for publishing one priced product."""

    def __init__(
        self,
        settings: Settings,
        *,
        audit_sink: WhopAuditSink | None = None,
        notify_human: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        self.settings = settings
        self.mode = settings.whop_mode
        self.audit_sink = audit_sink if audit_sink is not None else WhopAuditSink()
        self.notify_human = notify_human if notify_human is not None else _default_notify_human
        self.notification_events: list[dict[str, Any]] = []

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
        return (base or "vistabix-product")[:80]

    def _headers(self, idempotency_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.whop_api_key}",
            "Api-Version-Date": self.settings.whop_api_version_date,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key[:255],
            "User-Agent": "VistaBix/0.1 (+https://vistabix.com)",
        }

    def _record_call(
        self,
        method: str,
        path: str,
        *,
        product_id: str | None,
        reference_id: str | None,
        attempt: int,
        status: str,
        status_code: int | None = None,
        error_class: str | None = None,
        request_id: str | None = None,
    ) -> None:
        self.audit_sink.record(
            WhopCallAudit(
                timestamp=_utc_iso(),
                method=method,
                path=path,
                product_id=product_id,
                reference_id=reference_id,
                attempt=attempt,
                status=status,
                status_code=status_code,
                error_class=error_class,
                request_id=request_id,
            )
        )

    @staticmethod
    def _request_id(response: httpx.Response) -> str | None:
        for header in ("x-request-id", "x-whop-request-id"):
            value = response.headers.get(header)
            if value:
                return value[:200]
        return None

    def notify(self, kind: str, **details: Any) -> dict[str, Any]:
        """Emit a structured human-notification event through the adapter hook."""
        event = {
            "timestamp": _utc_iso(),
            "kind": kind,
            "mode": self.mode,
            "details": _safe_details(details),
        }
        result = dict(self.notify_human(event))
        result.setdefault("event", event)
        result.setdefault("kind", kind)
        self.notification_events.append(result)
        return result

    def _notify_failure(self, path: str, product_id: str | None, error: Exception) -> None:
        logger.error("Whop call to %s failed after retry (product=%s)", path, product_id)
        self.notify(
            EVENT_FAILED_RETRY,
            path=path,
            product_id=product_id,
            error_class=type(error).__name__,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any],
        idempotency_key: str,
        product_id: str | None = None,
        reference_id: str | None = None,
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
                error_class = type(exc).__name__
                self._record_call(
                    method,
                    path,
                    product_id=product_id,
                    reference_id=reference_id,
                    attempt=attempt + 1,
                    status="retry" if attempt == 0 else "error",
                    error_class=error_class,
                )
                logger.warning("Whop request failed at %s (attempt %s)", path, attempt + 1)
                if attempt == 0:
                    time.sleep(1)
                    continue
                self._notify_failure(path, product_id, exc)
                raise WhopAPIError("Whop could not be reached. No product was published.") from exc

            request_id = self._request_id(response)
            if response.status_code in {429, 500, 502, 503, 504} and attempt == 0:
                self._record_call(
                    method,
                    path,
                    product_id=product_id,
                    reference_id=reference_id,
                    attempt=attempt + 1,
                    status="retry",
                    status_code=response.status_code,
                    error_class=f"HTTP_{response.status_code}",
                    request_id=request_id,
                )
                time.sleep(1)
                continue

            if response.status_code >= 400:
                error: Exception = WhopAPIError(f"HTTP {response.status_code}")
                self._record_call(
                    method,
                    path,
                    product_id=product_id,
                    reference_id=reference_id,
                    attempt=attempt + 1,
                    status="error",
                    status_code=response.status_code,
                    error_class=f"HTTP_{response.status_code}",
                    request_id=request_id,
                )
                self._notify_failure(path, product_id, error)
                raise WhopAPIError(
                    f"Whop rejected {method} {path} with HTTP {response.status_code}.",
                    details={"status": response.status_code, "error": self._safe_error(response)},
                )

            try:
                data = response.json()
            except ValueError as exc:
                self._record_call(
                    method,
                    path,
                    product_id=product_id,
                    reference_id=reference_id,
                    attempt=attempt + 1,
                    status="error",
                    error_class=type(exc).__name__,
                    request_id=request_id,
                )
                self._notify_failure(path, product_id, exc)
                raise WhopAPIError("Whop returned a non-JSON response.") from exc
            if not isinstance(data, dict):
                error = WhopAPIError("unexpected response shape")
                self._record_call(
                    method,
                    path,
                    product_id=product_id,
                    reference_id=reference_id,
                    attempt=attempt + 1,
                    status="error",
                    error_class=type(error).__name__,
                    request_id=request_id,
                )
                self._notify_failure(path, product_id, error)
                raise WhopAPIError("Whop returned an unexpected response shape.")
            self._record_call(
                method,
                path,
                product_id=product_id,
                reference_id=reference_id,
                attempt=attempt + 1,
                status="success",
                status_code=response.status_code,
                request_id=request_id,
            )
            return data

        error = WhopAPIError("Whop request did not succeed.")
        self._record_call(
            method,
            path,
            product_id=product_id,
            reference_id=reference_id,
            attempt=2,
            status="error",
            error_class=type(error).__name__,
        )
        self._notify_failure(path, product_id, error)
        raise error from last_error

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

    def get_product(self, whop_product_id: str) -> dict[str, Any]:
        """Read a Whop product by its id using the official v1 API.

        Live mode issues ``GET /products/{id}`` through the same audited
        request helper as publishing and returns a secret-free, whitelisted
        projection. Mock mode returns an explicit mock marker only: no
        checkout URL, product URL, plan id or price is invented. Disabled mode
        fails closed rather than falling back to mock data.
        """
        product_id = str(whop_product_id or "").strip()
        if not product_id:
            raise ValueError("A Whop product id is required.")

        if self.mode == "mock":
            return {
                "id": product_id,
                "mode": "mock",
                "mock": True,
                "note": (
                    "Mock mode: no Whop API call was made; this is an explicit "
                    "projection of the stored Whop id. No checkout URL, product "
                    "URL or price was fabricated."
                ),
            }

        self._require_publishing()

        data = self._request(
            "GET",
            f"/products/{quote(product_id, safe='')}",
            payload={},
            idempotency_key=f"vistabix-product-read-{product_id}",
            product_id=product_id,
            reference_id=product_id,
        )

        result: dict[str, Any] = {"id": product_id, "mode": "live", "mock": False}
        returned_id = _safe_scalar(data.get("id"))
        if returned_id:
            result["id"] = returned_id
        for key in (
            "title",
            "name",
            "route",
            "visibility",
            "description",
            "created_at",
            "updated_at",
        ):
            value = _safe_scalar(data.get(key))
            if value is not None:
                result[key] = value

        # Only real http(s) values present in the response are mapped; no URL
        # is constructed here and no price is inferred from a live payload.
        for target, sources in (
            ("product_url", ("url", "product_url")),
            ("checkout_url", ("checkout_url", "purchase_url")),
        ):
            for source in sources:
                value = data.get(source)
                if isinstance(value, str) and value.strip().startswith(("https://", "http://")):
                    result[target] = value.strip()[:500]
                    break
        return result

    @staticmethod
    def _map_assets(
        *,
        cover: Any,
        pdf: Any,
        community: dict[str, Any] | None,
        safe_metadata: dict[str, str],
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Map optional assets into supported product metadata only.

        The official Whop v1 asset-upload surface is not confirmed in this
        adapter, so no upload URL is guessed. References are stored in the
        documented `metadata` object and each asset gets a structured blocked
        entry explaining that direct upload is pending confirmation.
        """
        mapping: dict[str, Any] = {}
        blocked: list[dict[str, Any]] = []
        for kind, value in (("cover", cover), ("pdf", pdf)):
            if value is None:
                continue
            metadata_key = _ASSET_KEYS[kind]
            reference = _safe_asset_ref(kind, value)
            safe_metadata[metadata_key] = reference
            mapping[kind] = {"mapped_to": f"metadata.{metadata_key}", "ref": reference}
            blocked.append(
                {
                    "kind": kind,
                    "status": "blocked",
                    "reason": (
                        "The official Whop v1 asset-upload endpoint for this asset type is "
                        "not confirmed; the reference was stored in product metadata only. "
                        "No upload URL was invented."
                    ),
                }
            )
        if community is not None:
            safe_community = {
                str(key): str(value)[:200]
                for key, value in community.items()
                if key in _COMMUNITY_ALLOWED_KEYS
            }
            safe_metadata["community"] = ",".join(
                f"{key}={value}" for key, value in sorted(safe_community.items())
            )
            mapping["community"] = {"mapped_to": "metadata.community", "config": safe_community}
            blocked.append(
                {
                    "kind": "community",
                    "status": "blocked",
                    "reason": (
                        "Linking a Discord community requires an official Whop API surface "
                        "that is not confirmed here; configuration was stored in product "
                        "metadata only. No endpoint was guessed."
                    ),
                }
            )
        return mapping, blocked

    def publish_product(
        self,
        *,
        slug: str,
        title: str,
        description: str,
        price_cents: int,
        metadata: dict[str, Any] | None = None,
        cover: str | bytes | None = None,
        pdf: str | bytes | None = None,
        community: dict[str, Any] | None = None,
    ) -> WhopPublishResult:
        """Create a Whop product and its one-time paid variant.

        Stable idempotency keys make a retry safe: Whop returns the original
        resources instead of duplicating them. Optional cover/pdf/community
        inputs are mapped into documented metadata; unconfirmed asset-upload
        surfaces are reported as structured `blocked` entries.
        """
        self._require_publishing()
        if price_cents < 100:
            raise ValueError("Whop requires a paid variant of at least 1.00 in its currency.")
        if not title.strip():
            raise ValueError("A product title is required.")

        stable_key = f"vistabix-product-{slug}"
        safe_metadata = {str(key): str(value) for key, value in (metadata or {}).items()}
        asset_mapping, blocked = self._map_assets(
            cover=cover, pdf=pdf, community=community, safe_metadata=safe_metadata
        )

        if self.mode == "mock":
            digest = hashlib.sha256(f"{slug}|{title}|{price_cents}".encode("utf-8")).hexdigest()[:12]
            product_id = f"prod_mock_{digest}"
            plan_id = f"plan_mock_{digest}"
            result = WhopPublishResult(
                product_id=product_id,
                plan_id=plan_id,
                checkout_url=f"https://whop.com/checkout/{plan_id}",
                product_url=f"https://whop.com/{self._slug(slug)}",
                mock=True,
                mode="mock",
                affiliate_link=None,
                blocked_reason=(
                    "Mock mode: no real Whop response exists; no affiliate link was fabricated."
                ),
                asset_mapping=asset_mapping,
                blocked=blocked,
                audit=[],
                notifications=[],
            )
            ready = self.notify(EVENT_PRODUCT_READY, product_id=product_id, mock=True)
            return replace(result, notifications=[ready])

        account_id = self.settings.whop_account_id

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
            "POST",
            "/products",
            payload=product_payload,
            idempotency_key=stable_key,
            reference_id=stable_key,
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
            "metadata": {**safe_metadata, "vistabix_product_id": stable_key},
        }
        if account_id:
            variant_payload["account_id"] = account_id

        variant = self._request(
            "POST",
            "/variants",
            payload=variant_payload,
            idempotency_key=f"{stable_key}-variant",
            product_id=product_id,
            reference_id=stable_key,
        )
        plan_id = str(variant.get("id") or "")
        checkout_url = str(variant.get("purchase_url") or "")
        if not checkout_url:
            route = str(product.get("route") or self._slug(slug))
            checkout_url = f"https://whop.com/{route}"
        affiliate_link, blocked_reason = _derive_affiliate_link(product, variant)
        audit = [entry.to_dict() for entry in self.audit_sink.for_product(stable_key)]
        result = WhopPublishResult(
            product_id=product_id,
            plan_id=plan_id or f"plan_unknown_{product_id}",
            checkout_url=checkout_url,
            product_url=f"https://whop.com/{str(product.get('route') or self._slug(slug))}",
            mock=False,
            mode="live",
            affiliate_link=affiliate_link,
            blocked_reason=blocked_reason,
            asset_mapping=asset_mapping,
            blocked=blocked,
            audit=audit,
            notifications=[],
        )
        ready = self.notify(EVENT_PRODUCT_READY, product_id=product_id, mock=False)
        return replace(result, notifications=[ready])
