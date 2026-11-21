"""VistaBix FastAPI application.

Run locally:

    cp .env.example .env
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Endpoints:

    POST /api/scout                qualify and store a creator
    GET  /api/scout               list creators
    POST /api/outreach            create an approval-gated draft
    POST /api/outreach/classify   classify a reply
    POST /api/outreach/{id}/approve
    GET/POST /api/products
    POST /api/products/{id}/approve
    GET  /api/whop                adapter status (no secrets)
    POST /api/whop/publish        publish via agent 4
    GET  /api/revenue             aggregate and recent sales
    POST /api/revenue/sales       record a paid sale with the locked split
    GET/PUT /api/settings
    POST /api/architect/research  capped research clustering and gap analysis
    POST /api/architect/concepts  three concepts; a human must pick one
    POST /api/architect/draft     structured draft after a human pick
    POST /api/architect/quality-gate  quality gates; never publishes
"""

from __future__ import annotations

import logging
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.agents.agent1 import qualify_creator
from app.agents.agent2 import classify_reply_detail, render_outreach
from app.agents.agent3 import (
    analyze_research,
    build_draft,
    build_toc,
    generate_concepts,
    pick_concept,
    quality_gate,
    validate_draft,
    validate_toc,
)
from app.agents.agent4 import publish_product, validate_publishable
from app.config import BRANDING, NICHES, Settings
from app.db import (
    DEFAULT_SETTINGS,
    init_db,
    make_engine,
    make_session_factory,
    seed_default_settings,
)
from app.deps import get_db, get_settings, get_whop
from app.errors import AppError, Conflict, NotFound, PublishBlocked, ValidationFailed
from app.models import Campaign, Creator, Email, Product, Sale, Setting, utcnow
from app.routers.whop import router as whop_router
from app.schemas import (
    ApprovalRequest,
    ClassifyRequest,
    OutreachCreate,
    OutreachSendRequest,
    ProductCreate,
    PublishRequest,
    RefundRequest,
    SaleCreate,
    ScoutRequest,
    ScoutSearchRequest,
    SettingsUpdate,
)
from app.security import require_api_key
from app.whop import WhopClient, calc_payouts, split_bps_for, split_for

logger = logging.getLogger(__name__)


def _slug(title: str, creator_id: int) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:100] or "product"
    return f"{base}-{creator_id}-{secrets.token_hex(3)}"


def _product_internal_id(value: int | str) -> int:
    """Normalise an internal or external product id to the internal int id.

    External ids use the ``prod_<id>`` form; a bare numeric string is also
    accepted. Anything else is rejected before a database lookup occurs.
    """
    if isinstance(value, bool):
        raise ValidationFailed("product_id must be an integer or 'prod_<id>'.")
    text = str(value).strip()
    if text.startswith("prod_"):
        text = text[len("prod_") :]
    try:
        parsed = int(text)
    except ValueError as exc:
        raise ValidationFailed("product_id must be an integer or 'prod_<id>'.") from exc
    if parsed <= 0:
        raise ValidationFailed("product_id must be positive.")
    return parsed


def _external_product_id(product_id: int) -> str:
    return f"prod_{int(product_id)}"


def _string_list(value: Any) -> list[str]:
    """Render launch assets as strings without altering stored structured data."""
    if value is None:
        return []
    items = value if isinstance(value, (list, tuple)) else [value]
    rendered: list[str] = []
    for item in items:
        if isinstance(item, str):
            rendered.append(item)
        elif isinstance(item, dict):
            text = item.get("text") or item.get("body") or item.get("caption")
            rendered.append(str(text) if text is not None else str(item))
        else:
            rendered.append(str(item))
    return rendered


def _split_payload() -> dict[str, Any]:
    first_creator, first_platform = split_for(True)
    later_creator, later_platform = split_for(False)
    return {
        "first_product": {"creator": first_creator, "vistabix": first_platform},
        "subsequent_products": {"creator": later_creator, "vistabix": later_platform},
        "unit": "fraction of net revenue",
    }


# Stage 2 vocabulary. The locked sequence is exactly three steps, sent on
# day 0, day 3 and day 7 relative to campaign creation.
TEMPLATE_STEP: dict[str, int] = {"initial": 1, "follow_up": 2, "close_loop": 3}
STEP_DELAY_DAYS: dict[int, int] = {1: 0, 2: 3, 3: 7}
REPLY_SEQUENCE_STATUS: dict[str, str] = {
    "POSITIVE": "shortlisted",
    "SOFT_POSITIVE": "nurture",
    "NEGATIVE": "do_not_contact",
}
CREATOR_STATUS_BY_VERDICT: dict[str, str] = {
    "qualified": "Qualified",
    "unqualified": "Rejected",
    "failed": "Rejected",
    "rejected": "Rejected",
    "new": "New",
}


def _decimal_cents(cents: int) -> Decimal:
    """Decimal mirror of an integer-cent amount; never used for money math."""
    return (Decimal(int(cents)) / Decimal(100)).quantize(Decimal("0.01"))


def _split_mirrors(creator_bps: int) -> tuple[Decimal, Decimal]:
    """Mirror the server-derived basis points to decimals that sum to 1.00."""
    creator = (Decimal(int(creator_bps)) / Decimal(10_000)).quantize(Decimal("0.01"))
    operator = (Decimal("1.00") - creator).quantize(Decimal("0.01"))
    return creator, operator


def _next_followup_at(created_at: datetime, step: int) -> datetime:
    """Deterministic follow-up timestamp from creation time and the step delay."""
    return created_at + timedelta(days=STEP_DELAY_DAYS.get(step, 0))


def _qualification_int(result: Any, key: str, default: int = 0) -> int:
    data = result.to_dict() if hasattr(result, "to_dict") else {}
    value = data.get(key, getattr(result, key, default))
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _campaign_for_creator(db: Session, creator_id: int) -> Campaign | None:
    """One campaign per creator (the UNIQUE creator_id constraint)."""
    return db.scalar(select(Campaign).where(Campaign.creator_id == creator_id))


def _new_campaign(db: Session, creator: Creator, *, now: datetime | None = None) -> Campaign:
    created_at = now or utcnow()
    campaign = Campaign(
        name="Creator partnerships",
        niche=creator.niche,
        creator_id=creator.id,
        status="active",
        sequence_status="active",
        current_step=1,
        next_followup_at=_next_followup_at(created_at, 1),
        created_at=created_at,
    )
    db.add(campaign)
    db.flush()
    return campaign


def _settings_values(db: Session) -> dict[str, Any]:
    stored = {row.key: row.value for row in db.scalars(select(Setting)).all()}
    return {**DEFAULT_SETTINGS, **stored}


def _settings_payload(db: Session, settings: Settings, whop: WhopClient) -> dict[str, Any]:
    values = _settings_values(db)
    return {
        "branding": BRANDING,
        "niches": list(NICHES),
        "splits": _split_payload(),
        "whop": whop.status(),
        "sender_name": values.get("sender_name", DEFAULT_SETTINGS["sender_name"]),
        "support_email": values.get("support_email", DEFAULT_SETTINGS["support_email"]),
        "outreach_paused": bool(values.get("outreach_paused", False)),
        "public_app_url": settings.public_app_url,
        # Stage 3 config mirrors. ``getattr`` keeps the payload stable while
        # the Stage 3 config keys are introduced by the config atom.
        "email_domain": getattr(settings, "email_from_domain", ""),
        "daily_cap": getattr(settings, "outreach_daily_cap", 50),
    }


def _upsert_setting(db: Session, key: str, value: Any) -> None:
    # `Setting.key` is unique, not the primary key, so look it up by column.
    row = db.scalar(select(Setting).where(Setting.key == key))
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value


class CampaignCreateRequest(BaseModel):
    """Create the single sequence campaign for one creator."""

    model_config = ConfigDict(extra="forbid")

    creator_id: int = Field(gt=0)


class ArchitectResearchRequest(BaseModel):
    """Supplied research only. Caps are applied inside the pure Agent 3 core."""

    model_config = ConfigDict(extra="forbid")

    posts: list[dict[str, Any]] = Field(default_factory=list, max_length=10_000)
    comments: list[dict[str, Any]] = Field(default_factory=list, max_length=10_000)
    creator_name: str | None = Field(default=None, max_length=120)
    audience_angle: str | None = Field(default=None, max_length=64)
    creator_phrases: list[str] = Field(default_factory=list, max_length=200)
    creator_examples: list[str] = Field(default_factory=list, max_length=200)
    claim_sources: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    claims: list[dict[str, Any]] = Field(default_factory=list, max_length=200)


def _architect_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Accept either a nested `research` object or top-level research fields."""
    supplied = payload.get("research", payload)
    if not isinstance(supplied, dict):
        raise ValidationFailed("research must be an object.")
    return supplied


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory. Tests pass isolated settings and a temp SQLite URL."""
    settings = settings or Settings()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    whop = WhopClient(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        init_db(engine)
        with session_factory() as session:
            seed_default_settings(session)
        logger.info("VistaBix API ready (env=%s, whop=%s)", settings.app_env, whop.mode)
        if settings.is_production and not settings.api_key:
            logger.warning("Production is running without API_KEY; /api is unprotected.")
        if not settings.is_production:
            logger.warning(
                "Development defaults: database=%s, whop_mode=%s",
                settings.database_url,
                whop.mode,
            )
        yield
        engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Creator partnership operations API. Branding: hybrid. No mock data in live mode.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.whop = whop

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "%s %s -> %s (%sms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response

    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.to_dict()})

    @app.exception_handler(ValueError)
    async def _value_error(_request: Request, exc: ValueError) -> JSONResponse:
        detail = ValidationFailed(str(exc) or "Invalid value.")
        return JSONResponse(status_code=detail.status_code, content={"detail": detail.to_dict()})

    @app.exception_handler(RequestValidationError)
    async def _request_validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        safe_errors = [
            {
                "loc": list(error.get("loc", [])),
                "msg": error.get("msg", "Invalid value"),
                "type": error.get("type", "value_error"),
            }
            for error in exc.errors()
        ]
        detail = ValidationFailed("Request validation failed.", details=safe_errors)
        return JSONResponse(status_code=detail.status_code, content={"detail": detail.to_dict()})

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, Any]:
        return {
            "service": settings.app_name,
            "branding": BRANDING,
            "version": settings.app_version,
            "docs": "/docs",
        }

    @app.get("/api/health")
    def health(db: Session = Depends(get_db)) -> dict[str, Any]:
        try:
            db.execute(text("SELECT 1"))
            db_ok = True
        except SQLAlchemyError:
            db_ok = False
        return {
            "status": "ok" if db_ok else "degraded",
            "version": settings.app_version,
            "env": settings.app_env,
            "branding": BRANDING,
            "database": "ok" if db_ok else "unavailable",
            "whop": whop.status(),
            "api_key_required": bool(settings.api_key),
        }

    @app.get("/health")
    def health_alias(db: Session = Depends(get_db)) -> dict[str, Any]:
        """API-key-exempt alias of /api/health; the body is identical."""
        return health(db)

    api = APIRouter(prefix="/api", dependencies=[Depends(require_api_key)])

    # ---- Scout -----------------------------------------------------------
    @api.get("/scout")
    def list_creators(
        status: str | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        query = select(Creator)
        if status:
            query = query.where(Creator.status == status)
        creators = db.scalars(query.order_by(Creator.created_at.desc())).all()
        return {"items": [creator.to_dict() for creator in creators], "count": len(creators)}

    @api.get("/creators")
    def list_creators_alias(
        status: str | None = Query(default=None),
        niche: str | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        """Stage 3 alias of the creator list with an additional niche filter."""
        query = select(Creator)
        if status:
            query = query.where(Creator.status == status)
        if niche:
            query = query.where(Creator.niche == niche)
        creators = db.scalars(query.order_by(Creator.created_at.desc())).all()
        return {"items": [creator.to_dict() for creator in creators], "count": len(creators)}

    @api.post("/creators/{creator_id}/approve")
    def approve_creator(
        creator_id: int,
        payload: ApprovalRequest | None = None,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        """Map 'approved for outreach' to the locked Stage 2 status vocabulary."""
        creator = db.get(Creator, creator_id)
        if creator is None:
            raise NotFound(f"Creator {creator_id} does not exist.")

        if _campaign_for_creator(db, creator.id) is None:
            try:
                _new_campaign(db, creator)
            except IntegrityError:
                db.rollback()

        # The DB CHECK forbids the legacy lowercase value. Qualified + True is
        # the only representation of outreach approval in Stage 2/3.
        creator.status = "Qualified"
        creator.qualified = True
        db.commit()
        db.refresh(creator)
        approved_by = payload.approved_by if payload is not None else "creator"
        return {
            **creator.to_dict(),
            "approved": True,
            "approval_status": creator.status,
            "approved_by": approved_by,
        }

    @api.post("/scout")
    def scout(payload: ScoutRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
        result = qualify_creator(
            followers=payload.followers,
            median_views=payload.median_views,
            recent_reel_views=payload.recent_reel_views,
            reels_in_range=payload.reels_in_range,
            email=str(payload.email) if payload.email else None,
            ad_posts=payload.ad_posts,
            niche=payload.niche,
            engagement_rate=getattr(payload, "engagement_rate", None),
            view_consistency=getattr(payload, "view_consistency", None),
            unmonetized_score=getattr(payload, "unmonetized_score", None),
            bio=getattr(payload, "bio", None),
            post_captions=getattr(payload, "post_captions", None),
        )
        creator = db.scalar(
            select(Creator).where(
                Creator.platform == payload.platform,
                Creator.handle == payload.handle,
            )
        )
        created = creator is None
        if creator is None:
            creator = Creator(
                name=payload.name,
                handle=payload.handle,
                platform=payload.platform,
                niche=payload.niche,
                status="New",
            )
            db.add(creator)

        protected_statuses = {
            "approved", "contacted", "negotiating", "partnered", "suppressed",
            "Contacted", "Replied", "Shortlisted", "Partnered",
        }
        creator.name = payload.name
        creator.email = str(payload.email) if payload.email else None
        creator.niche = payload.niche
        creator.followers = payload.followers
        creator.median_views = result.metrics["median_views"] or 0
        creator.recent_reel_views = list(result.metrics["recent_reel_views"] or [])
        creator.reels_in_range = int(result.metrics["reels_in_range"] or 0)
        creator.ad_posts = payload.ad_posts
        creator.qualified = result.qualified
        creator.qualification_score = result.score
        qualification = result.to_dict()
        creator.qualification = qualification
        creator.engagement_rate = result.engagement_rate
        creator.monetization_score = _qualification_int(
            result, "monetization_score", _qualification_int(result, "unmonetized_score")
        )
        payload_data = payload.model_dump() if hasattr(payload, "model_dump") else {}
        top_reels = qualification.get("top_reels", payload_data.get("top_reels"))
        content_pillars = qualification.get("content_pillars", payload_data.get("content_pillars"))
        if top_reels is not None:
            creator.top_reels = top_reels
        if content_pillars is not None:
            creator.content_pillars = content_pillars
        if creator.status not in protected_statuses:
            verdict = str(getattr(result, "verdict", "") or "").lower()
            creator.status = CREATOR_STATUS_BY_VERDICT.get(
                verdict, "Qualified" if result.qualified else "Rejected"
            )

        db.commit()
        db.refresh(creator)
        return {
            "created": created,
            "creator": creator.to_dict(),
            "qualification": qualification,
        }

    @api.post("/scout/search")
    def search_scout(
        payload: ScoutSearchRequest, db: Session = Depends(get_db)
    ) -> dict[str, Any]:
        """Filter stored Creator rows only; never invent or rank synthetic data."""
        from app.agents.agent1 import search_creators

        rows = db.scalars(select(Creator).order_by(Creator.created_at.desc())).all()
        matches = search_creators(
            list(rows),
            niche=payload.niche,
            min_followers=payload.min_followers,
            max_followers=payload.max_followers,
            min_views=payload.min_views,
            max_views=payload.max_views,
        )
        items = [
            item.to_dict() if hasattr(item, "to_dict") else dict(item)
            for item in matches
        ]
        return {"items": items, "count": len(items)}

    @api.get("/scout/{creator_id}")
    def get_creator(creator_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
        creator = db.get(Creator, creator_id)
        if creator is None:
            raise NotFound(f"Creator {creator_id} does not exist.")
        return creator.to_dict()

    # ---- Campaigns --------------------------------------------------------
    @api.get("/campaigns")
    def list_campaigns(
        creator_id: int | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        query = select(Campaign)
        if creator_id is not None:
            query = query.where(Campaign.creator_id == creator_id)
        campaigns = db.scalars(query.order_by(Campaign.created_at.desc())).all()
        return {"items": [campaign.to_dict() for campaign in campaigns], "count": len(campaigns)}

    @api.post("/campaigns")
    def create_campaign(
        payload: CampaignCreateRequest,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        creator = db.get(Creator, payload.creator_id)
        if creator is None:
            raise NotFound(f"Creator {payload.creator_id} does not exist.")
        if _campaign_for_creator(db, creator.id) is not None:
            raise Conflict(
                "A campaign already exists for this creator.",
                code="campaign_exists",
                details={"creator_id": creator.id},
            )
        campaign = _new_campaign(db, creator)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise Conflict(
                "A campaign already exists for this creator.",
                code="campaign_exists",
                details={"creator_id": creator.id},
            ) from exc
        db.refresh(campaign)
        return campaign.to_dict()

    # ---- Outreach --------------------------------------------------------
    @api.get("/outreach/templates")
    def outreach_templates() -> dict[str, Any]:
        from app.agents.agent2 import TEMPLATES

        return {
            "items": [
                {"key": key, "subject_template": value["subject"]}
                for key, value in TEMPLATES.items()
            ],
            "human_approval_required": True,
        }

    @api.get("/outreach")
    def list_emails(
        creator_id: int | None = Query(default=None),
        status: str | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        query = select(Email)
        if creator_id is not None:
            query = query.where(Email.creator_id == creator_id)
        if status:
            query = query.where(Email.status == status)
        emails = db.scalars(query.order_by(Email.created_at.desc())).all()
        return {"items": [email.to_dict() for email in emails], "count": len(emails)}

    @api.post("/outreach")
    def create_outreach(
        payload: OutreachCreate,
        settings: Settings = Depends(get_settings),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        creator = db.get(Creator, payload.creator_id)
        if creator is None:
            raise NotFound(f"Creator {payload.creator_id} does not exist.")
        if not creator.qualified and creator.status not in {"approved", "partnered", "Partnered"}:
            raise Conflict(
                "Outreach requires a qualified creator.",
                details={"creator_id": creator.id, "qualified": creator.qualified},
            )

        campaign = None
        if payload.campaign_id is not None:
            campaign = db.get(Campaign, payload.campaign_id)
            if campaign is None:
                raise NotFound(f"Campaign {payload.campaign_id} does not exist.")
        else:
            campaign = _campaign_for_creator(db, creator.id)
            if campaign is None:
                try:
                    campaign = _new_campaign(db, creator)
                except IntegrityError as exc:
                    db.rollback()
                    raise Conflict(
                        "A campaign already exists for this creator.",
                        code="campaign_exists",
                        details={"creator_id": creator.id},
                    ) from exc

        unsubscribe_url = (
            f"{settings.public_app_url.rstrip('/')}/unsubscribe"
            f"?email={quote(creator.email or '')}"
        )
        rendered = render_outreach(
            creator,
            payload.template_key,
            sender_name=payload.sender_name,
            unsubscribe_url=unsubscribe_url,
        )
        body = rendered["body"]
        if payload.custom_note:
            body = f"{body}\n\n{payload.custom_note.strip()}"

        email = Email(
            creator_id=creator.id,
            campaign_id=campaign.id,
            direction="outbound",
            status="draft",
            template_key=payload.template_key,
            step=TEMPLATE_STEP.get(payload.template_key, 1),
            opened=False,
            replied=False,
            subject=rendered["subject"][:300],
            body=body,
            approved=False,
        )
        db.add(email)
        db.commit()
        db.refresh(email)
        return {
            **email.to_dict(),
            "delivery": {
                "status": "not_sent",
                "reason": "A human must approve the draft; this starter has no email provider.",
            },
        }

    @api.post("/outreach/send")
    def send_outreach(
        payload: OutreachSendRequest,
        settings: Settings = Depends(get_settings),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        """Stage 3 draft-only outreach write. Nothing is sent to any provider."""
        # Reuse the existing outreach route's validation, campaign handling and
        # rendering verbatim, then relabel the persisted draft. No provider is
        # called by either route.
        created = create_outreach(
            OutreachCreate(
                creator_id=payload.creator_id,
                template_key=payload.template_key,
                campaign_id=payload.campaign_id,
                sender_name=payload.sender_name,
                custom_note=payload.custom_note,
            ),
            settings,
            db,
        )
        email = db.get(Email, int(created["id"]))
        if email is None:
            raise NotFound(f"Email {created['id']} does not exist.")
        email.status = "draft_needs_approval"
        email.approved = False
        email.opened = False
        email.replied = False
        email.sent_at = None
        db.commit()
        db.refresh(email)
        return {
            **email.to_dict(),
            "step": TEMPLATE_STEP.get(payload.template_key, 1),
            "delivery": {
                "status": "not_sent",
                "reason": "This endpoint only creates a draft; no email provider is called.",
            },
            "approval": {
                "required": True,
                "endpoint": f"/api/outreach/{email.id}/approve",
                "guidance": (
                    "A human must approve this draft before it can be sent. "
                    "Approval does not send anything in this starter."
                ),
            },
        }

    @api.post("/outreach/classify")
    def classify(
        payload: ClassifyRequest,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        email = None
        if payload.email_id is not None:
            email = db.get(Email, payload.email_id)
            if email is None:
                raise NotFound(f"Email {payload.email_id} does not exist.")
            text = payload.text if payload.text is not None else email.body
        else:
            text = payload.text or ""

        detail = classify_reply_detail(text)
        if email is None and payload.creator_id is not None:
            creator = db.get(Creator, payload.creator_id)
            if creator is None:
                raise NotFound(f"Creator {payload.creator_id} does not exist.")
            email = Email(
                creator_id=creator.id,
                direction="inbound",
                status="received",
                subject="Reply",
                body=text,
            )
            db.add(email)

        saved = False
        if email is not None:
            email.classification = detail.label
            email.classification_detail = detail.to_dict()
            email.replied = True
            campaign = None
            if email.campaign_id is not None:
                campaign = db.get(Campaign, email.campaign_id)
            if campaign is None and email.creator_id is not None:
                campaign = _campaign_for_creator(db, email.creator_id)
            if campaign is not None:
                campaign.reply_classification = detail.label
                campaign.sequence_status = REPLY_SEQUENCE_STATUS.get(detail.label, "needs_review")
            saved = True
            db.commit()
            db.refresh(email)
        return {
            **detail.to_dict(),
            "saved": saved,
            "email": email.to_dict() if email is not None else None,
        }

    @api.post("/outreach/{email_id}/approve")
    def approve_outreach(
        email_id: int,
        approved_by: str = Query(default="operator"),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        email = db.get(Email, email_id)
        if email is None:
            raise NotFound(f"Email {email_id} does not exist.")
        if email.direction != "outbound":
            raise Conflict("Only outbound drafts can be approved.")
        if not email.approved:
            email.approved = True
            email.status = "approved"
            email.approved_at = utcnow()
            email.approved_by = approved_by  # type: ignore[attr-defined]
            db.commit()
            db.refresh(email)
        return {
            **email.to_dict(),
            "delivery": {
                "status": "not_sent",
                "reason": "Approval is recorded; no provider is configured in this starter.",
            },
        }

    # ---- Products --------------------------------------------------------
    @api.get("/products")
    def list_products(
        creator_id: int | None = Query(default=None),
        status: str | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        query = select(Product)
        if creator_id is not None:
            query = query.where(Product.creator_id == creator_id)
        if status:
            query = query.where(Product.status == status)
        products = db.scalars(query.order_by(Product.created_at.desc())).all()
        return {"items": [product.to_dict() for product in products], "count": len(products)}

    @api.post("/products")
    def create_product(payload: ProductCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
        creator = db.get(Creator, payload.creator_id)
        if creator is None:
            raise NotFound(f"Creator {payload.creator_id} does not exist.")
        if not creator.qualified and creator.status not in {"approved", "partnered", "Partnered"}:
            raise Conflict(
                "Products can only be built for qualified or approved creators.",
                details={"creator_id": creator.id},
            )

        existing_count = int(
            db.scalar(
                select(func.count()).select_from(Product).where(Product.creator_id == creator.id)
            )
            or 0
        )
        is_first_product = existing_count == 0
        if payload.is_first_product is not None and payload.is_first_product != is_first_product:
            raise Conflict(
                "The product ordinal is derived from stored products and cannot be overridden.",
                code="split_rule_mismatch",
                details={
                    "computed_is_first_product": is_first_product,
                    "existing_products": existing_count,
                    "split": _split_payload()[
                        "first_product" if is_first_product else "subsequent_products"
                    ],
                },
            )

        niche = payload.niche or creator.niche
        if niche not in NICHES:
            raise ValidationFailed(f"Niche '{niche}' is not supported.")

        if payload.toc is not None:
            try:
                validate_toc(payload.toc)
            except ValueError as exc:
                raise ValidationFailed(str(exc)) from exc
            if payload.toc.get("target_words") != payload.target_words:
                raise ValidationFailed("TOC target_words must match the product target_words.")
            toc = payload.toc
        elif payload.generate_toc:
            try:
                toc = build_toc(niche, payload.title, target_words=payload.target_words)
            except ValueError as exc:
                raise ValidationFailed(str(exc)) from exc
        else:
            raise ValidationFailed("Provide a TOC or set generate_toc=true.")

        creator_bps, platform_bps = split_bps_for(is_first_product)
        creator_split, operator_split = _split_mirrors(creator_bps)
        product = Product(
            creator_id=creator.id,
            title=payload.title,
            slug=_slug(payload.title, creator.id),
            niche=niche,
            price_cents=payload.price_cents,
            is_first_product=is_first_product,
            split_creator_bps=creator_bps,
            split_platform_bps=platform_bps,
            status="draft",
            toc=toc,
            target_words=payload.target_words,
            word_count=payload.target_words,
            branding="hybrid",
            price=_decimal_cents(payload.price_cents),
            split_creator=creator_split,
            split_operator=operator_split,
            creator_approved=False,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.to_dict()

    @api.post("/products/generate")
    def generate_product(
        payload: ProductCreate, db: Session = Depends(get_db)
    ) -> dict[str, Any]:
        """Alias of the locked product path with TOC generation forced on.

        Branding stays locked to ``hybrid`` and the ordinal/split are derived
        by the existing creation helper; no split math is repeated here.
        """
        data = payload.model_dump()
        data["generate_toc"] = True
        data["toc"] = None
        data["branding"] = BRANDING
        data["is_first_product"] = None
        return create_product(ProductCreate(**data), db)

    @api.get("/products/{product_id}")
    def get_product(product_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
        product = db.get(Product, product_id)
        if product is None:
            raise NotFound(f"Product {product_id} does not exist.")
        return product.to_dict()

    @api.post("/products/{product_id}/approve")
    def approve_product(
        product_id: int,
        payload: ApprovalRequest,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        product = db.get(Product, product_id)
        if product is None:
            raise NotFound(f"Product {product_id} does not exist.")
        if not product.creator_approved:
            product.creator_approved = True
            product.approved_by = payload.approved_by
            product.approved_at = utcnow()
            product.status = "creator_approved"
            db.commit()
            db.refresh(product)
        return product.to_dict()

    # ---- Whop publish (Stage 2 status gate) -------------------------------
    # Sole handler for POST /api/whop/publish. It preserves agent4's approval
    # gate, production-without-key 503, retry and audit behaviour and adds the
    # Stage 2 status/whop_url persistence around the same call.
    @api.post("/whop/publish")
    def publish_stage2(
        payload: PublishRequest,
        db: Session = Depends(get_db),
        client: WhopClient = Depends(get_whop),
    ) -> dict[str, Any]:
        # Both internal and external ids are normalised by the request schema;
        # the helper also protects direct callers of this function.
        product_id = _product_internal_id(payload.product_id)
        product = db.get(Product, product_id)
        if product is None:
            raise NotFound(f"Product {product_id} does not exist.")
        # agent4's validator raises PublishBlocked with the complete list of
        # unmet preconditions (creator approval, title, niche, price, TOC).
        # Reuse it so API callers get the same `details.reasons` contract.
        validate_publishable(product)
        if product.status not in {"creator_approved", "live"}:
            raise PublishBlocked(
                "A creator_approved product status is required before publishing.",
                details={
                    "product_id": product.id,
                    "creator_approved": bool(product.creator_approved),
                    "status": product.status,
                    "reasons": [
                        "Product status must be creator_approved before publishing."
                    ],
                },
            )

        # `payload.is_first_product` is deliberately not consulted: the stored
        # ordinal and its basis points are the only source of split math.

        # agent4 keys its idempotency branch on `live` (and still accepts the
        # legacy value for pre-migration rows), so a repeat publish makes no
        # second Whop call and invents no URL.
        outcome = publish_product(db, product, client)
        whop = outcome.whop or {}
        whop_url = product.whop_url or whop.get("checkout_url") or whop.get("product_url")
        if whop_url and not product.whop_url:
            product.whop_url = str(whop_url)
        product.status = "live"
        db.commit()
        db.refresh(product)

        creator_split, operator_split = _split_mirrors(product.split_creator_bps)
        if product.split_creator is not None:
            creator_split = Decimal(str(product.split_creator))
        if product.split_operator is not None:
            operator_split = Decimal(str(product.split_operator))

        from app.agents.agent4 import render_launch_captions, render_story_templates

        assets = outcome.assets or {}
        # Structured assets remain in `assets`; the flat keys are string
        # renderings derived from those same stored structures.
        story_templates = _string_list(render_story_templates(assets))
        launch_captions = _string_list(render_launch_captions(assets))

        return {
            **outcome.to_dict(),
            "product_id": _external_product_id(product.id),
            "whop_product_id": whop.get("whop_product_id") or product.whop_product_id,
            "whop_url": str(whop_url) if whop_url else None,
            "is_first_product": bool(product.is_first_product),
            "split_creator": float(creator_split),
            "split_operator": float(operator_split),
            "bio_link": assets.get("bio_link") or product.bio_link,
            "story_templates": story_templates,
            "launch_captions": launch_captions,
            "status": "live",
        }

    # ---- Whop status -----------------------------------------------------
    @api.get("/whop")
    def whop_status(client: WhopClient = Depends(get_whop)) -> dict[str, Any]:
        return {
            **client.status(),
            "branding": BRANDING,
            "publish_endpoint": "/api/whop/publish",
        }

    @api.get("/whop/products/{product_id}")
    def whop_product(
        product_id: str,
        db: Session = Depends(get_db),
        client: WhopClient = Depends(get_whop),
    ) -> dict[str, Any]:
        """Read a published product through the Whop adapter (no invented URL)."""
        internal_id = _product_internal_id(product_id)
        product = db.get(Product, internal_id)
        if product is None:
            raise NotFound(f"Product {internal_id} does not exist.")
        if not product.whop_product_id:
            raise Conflict(
                "This product has not been published to Whop.",
                code="not_published",
                details={"product_id": internal_id, "status": product.status},
            )
        whop = client.get_product(product.whop_product_id)
        return {
            "product_id": _external_product_id(product.id),
            "whop_product_id": product.whop_product_id,
            "whop": whop,
            "mode": client.mode,
            "status": product.status,
        }

    @api.post("/whop/webhook")
    def whop_webhook() -> JSONResponse:
        """Explicitly deferred (Next): no sale row is created by this stub."""
        return JSONResponse(
            status_code=501,
            content={
                "detail": {
                    "code": "webhook_next_cut",
                    "message": (
                        "Whop webhooks are deferred to a later cut: no signature "
                        "verification, idempotency or sale/payout ledger exists yet. "
                        "Record paid sales manually via POST /api/revenue/sales, which "
                        "remains the current sale writer alongside calc_payouts."
                    ),
                }
            },
        )

    # ---- Revenue ---------------------------------------------------------
    @api.get("/revenue")
    def revenue(db: Session = Depends(get_db)) -> dict[str, Any]:
        row = db.execute(
            select(
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.gross_cents), 0),
                func.coalesce(func.sum(Sale.refunded_cents), 0),
                func.coalesce(func.sum(Sale.net_cents), 0),
                func.coalesce(func.sum(Sale.creator_cents), 0),
                func.coalesce(func.sum(Sale.platform_cents), 0),
            )
        ).one()
        sales = db.scalars(select(Sale).order_by(Sale.created_at.desc()).limit(50)).all()
        return {
            "summary": {
                "sales_count": int(row[0]),
                "gross_cents": int(row[1]),
                "refunded_cents": int(row[2]),
                "net_cents": int(row[3]),
                "creator_cents": int(row[4]),
                "vistabix_cents": int(row[5]),
                "payouts_due_cents": int(row[4]),
                "payouts_due": float(_decimal_cents(int(row[4]))),
            },
            "splits": _split_payload(),
            "items": [sale.to_dict() for sale in sales],
        }

    @api.post("/revenue/sales")
    def record_sale(payload: SaleCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
        existing = db.scalar(select(Sale).where(Sale.whop_sale_id == payload.whop_sale_id))
        if existing is not None:
            is_first = existing.creator_share_bps == split_bps_for(True)[0]
            return {
                "created": False,
                "sale": existing.to_dict(),
                "payout": calc_payouts(
                    existing.gross_cents, is_first, existing.refunded_cents
                ),
            }

        product = db.get(Product, payload.product_id)
        if product is None:
            raise NotFound(f"Product {payload.product_id} does not exist.")
        if product.status not in {"live", "published"}:
            raise Conflict(
                "Sales can only be recorded for a published product.",
                code="product_not_published",
                details={"product_id": product.id, "status": product.status},
            )

        payout = calc_payouts(payload.gross_cents, product.is_first_product)
        creator_bps, platform_bps = split_bps_for(product.is_first_product)
        sale = Sale(
            product_id=product.id,
            creator_id=product.creator_id,
            whop_sale_id=payload.whop_sale_id,
            whop_order_id=payload.whop_sale_id,
            currency=payload.currency.lower(),
            gross_cents=payload.gross_cents,
            refunded_cents=0,
            net_cents=payout["net_cents"],
            creator_cents=payout["creator_cents"],
            platform_cents=payout["platform_cents"],
            creator_share_bps=creator_bps,
            platform_share_bps=platform_bps,
            amount=_decimal_cents(payload.gross_cents),
            payout_creator=_decimal_cents(payout["creator_cents"]),
            payout_operator=_decimal_cents(payout["platform_cents"]),
            status="paid",
            sold_at=utcnow(),
        )
        db.add(sale)
        db.commit()
        db.refresh(sale)
        return {"created": True, "sale": sale.to_dict(), "payout": payout}

    @api.post("/revenue/sales/{sale_id}/refund")
    def refund_sale(
        sale_id: int, payload: RefundRequest, db: Session = Depends(get_db)
    ) -> dict[str, Any]:
        sale = db.get(Sale, sale_id)
        if sale is None:
            raise NotFound(f"Sale {sale_id} does not exist.")
        if payload.refunded_cents > sale.gross_cents:
            raise ValidationFailed("refunded_cents cannot exceed the original sale.")
        payout = calc_payouts(
            sale.gross_cents,
            sale.creator_share_bps == split_bps_for(True)[0],
            payload.refunded_cents,
        )
        sale.refunded_cents = payload.refunded_cents
        sale.net_cents = payout["net_cents"]
        sale.creator_cents = payout["creator_cents"]
        sale.platform_cents = payout["platform_cents"]
        sale.amount = _decimal_cents(sale.gross_cents)
        sale.payout_creator = _decimal_cents(sale.creator_cents)
        sale.payout_operator = _decimal_cents(sale.platform_cents)
        sale.status = (
            "refunded"
            if payload.refunded_cents == sale.gross_cents
            else "partially_refunded"
            if payload.refunded_cents > 0
            else "paid"
        )
        db.commit()
        db.refresh(sale)
        return {"sale": sale.to_dict(), "payout": payout}

    # ---- Settings --------------------------------------------------------
    @api.get("/settings")
    def get_settings_endpoint(
        db: Session = Depends(get_db),
        settings: Settings = Depends(get_settings),
        client: WhopClient = Depends(get_whop),
    ) -> dict[str, Any]:
        return _settings_payload(db, settings, client)

    @api.put("/settings")
    def update_settings(
        payload: SettingsUpdate,
        db: Session = Depends(get_db),
        settings: Settings = Depends(get_settings),
        client: WhopClient = Depends(get_whop),
    ) -> dict[str, Any]:
        if payload.branding is not None and payload.branding != BRANDING:
            raise ValidationFailed(
                f"Branding is locked to '{BRANDING}'.",
                code="branding_locked",
                details={"requested": payload.branding, "allowed": BRANDING},
            )
        updates: dict[str, Any] = {}
        if payload.sender_name is not None:
            updates["sender_name"] = payload.sender_name.strip()
        if payload.support_email is not None:
            updates["support_email"] = str(payload.support_email)
        if payload.outreach_paused is not None:
            updates["outreach_paused"] = payload.outreach_paused
        for key, value in updates.items():
            _upsert_setting(db, key, value)
        if updates:
            db.commit()
        return _settings_payload(db, settings, client)

    # ---- Agent 3: Product Architect --------------------------------------
    # These endpoints are plan/draft/gate only. They never publish and never
    # override creator approval, split locking or consent checks.

    @api.post("/architect/research")
    def architect_research(payload: ArchitectResearchRequest) -> dict[str, Any]:
        try:
            return analyze_research(payload.model_dump())
        except (TypeError, ValueError) as exc:
            raise ValidationFailed(str(exc)) from exc

    @api.post("/architect/concepts")
    def architect_concepts(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            analysis = analyze_research(_architect_input(payload))
            return generate_concepts(analysis)
        except (TypeError, ValueError) as exc:
            raise ValidationFailed(str(exc)) from exc

    @api.post("/architect/draft")
    def architect_draft(
        payload: dict[str, Any], db: Session = Depends(get_db)
    ) -> dict[str, Any]:
        try:
            analysis = analyze_research(_architect_input(payload))
            generated = generate_concepts(analysis)
            picked = pick_concept(generated, payload.get("chosen_id") or payload.get("concept_id"))
            if picked["awaiting_human_pick"]:
                raise ValidationFailed("A human must choose one of the three concepts before drafting.")
            selected = picked["selected_concept"]
            draft = build_draft(selected, analysis)
            validate_draft(draft, selected["price"])
        except ValidationFailed:
            raise
        except (TypeError, ValueError) as exc:
            raise ValidationFailed(str(exc)) from exc

        product_id = payload.get("product_id")
        if product_id is not None:
            product = db.get(Product, int(product_id))
            if product is None:
                raise NotFound(f"Product {product_id} does not exist.")
            if draft.get("actual_word_count") is not None:
                product.word_count = int(draft["actual_word_count"])
            if draft.get("markdown"):
                product.content_md = str(draft["markdown"])
            db.commit()
            db.refresh(product)
        return {
            "draft": draft,
            "valid": True,
            "requires_creator_approval": True,
            "publishing": "blocked",
        }

    @api.post("/architect/quality-gate")
    def architect_quality_gate(payload: dict[str, Any]) -> dict[str, Any]:
        draft = payload.get("draft")
        approval = payload.get("approval")
        if not isinstance(draft, dict):
            raise ValidationFailed("draft must be an object.")
        if not isinstance(approval, dict):
            raise ValidationFailed("approval must be an object.")
        try:
            return quality_gate(draft, _architect_input(payload), approval)
        except (TypeError, ValueError) as exc:
            raise ValidationFailed(str(exc)) from exc

    app.include_router(api)
    app.include_router(whop_router)
    return app


app = create_app()
