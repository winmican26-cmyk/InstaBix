"""InstaBix FastAPI application.

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
"""

from __future__ import annotations

import logging
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.agents.agent1 import qualify_creator
from app.agents.agent2 import classify_reply_detail, render_outreach
from app.agents.agent3 import build_toc, validate_toc
from app.config import BRANDING, NICHES, Settings
from app.db import (
    DEFAULT_SETTINGS,
    init_db,
    make_engine,
    make_session_factory,
    seed_default_settings,
)
from app.deps import get_db, get_settings, get_whop
from app.errors import AppError, Conflict, NotFound, ValidationFailed
from app.models import AppSetting, Campaign, Creator, Email, Product, Sale, utcnow
from app.routers.whop import router as whop_router
from app.schemas import (
    ApprovalRequest,
    ClassifyRequest,
    OutreachCreate,
    ProductCreate,
    RefundRequest,
    SaleCreate,
    ScoutRequest,
    SettingsUpdate,
)
from app.security import require_api_key
from app.whop import WhopClient, calc_payouts, split_bps_for, split_for

logger = logging.getLogger(__name__)


def _slug(title: str, creator_id: int) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:100] or "product"
    return f"{base}-{creator_id}-{secrets.token_hex(3)}"


def _split_payload() -> dict[str, Any]:
    first_creator, first_platform = split_for(True)
    later_creator, later_platform = split_for(False)
    return {
        "first_product": {"creator": first_creator, "instabix": first_platform},
        "subsequent_products": {"creator": later_creator, "instabix": later_platform},
        "unit": "fraction of net revenue",
    }


def _settings_values(db: Session) -> dict[str, Any]:
    stored = {row.key: row.value for row in db.scalars(select(AppSetting)).all()}
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
    }


def _upsert_setting(db: Session, key: str, value: Any) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


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
        logger.info("InstaBix API ready (env=%s, whop=%s)", settings.app_env, whop.mode)
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
            )
            db.add(creator)

        protected_statuses = {"approved", "contacted", "negotiating", "partnered", "suppressed"}
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
        creator.qualification = result.to_dict()
        if creator.status not in protected_statuses:
            creator.status = "qualified" if result.qualified else "unqualified"

        db.commit()
        db.refresh(creator)
        return {
            "created": created,
            "creator": creator.to_dict(),
            "qualification": result.to_dict(),
        }

    @api.get("/scout/{creator_id}")
    def get_creator(creator_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
        creator = db.get(Creator, creator_id)
        if creator is None:
            raise NotFound(f"Creator {creator_id} does not exist.")
        return creator.to_dict()

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
        if not creator.qualified and creator.status not in {"approved", "partnered"}:
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
            campaign = db.scalar(select(Campaign).where(Campaign.name == "Creator partnerships"))
            if campaign is None:
                campaign = Campaign(
                    name="Creator partnerships", niche=creator.niche, status="active"
                )
                db.add(campaign)
                db.flush()

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
        if not creator.qualified and creator.status not in {"approved", "partnered"}:
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
            creator_approved=False,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.to_dict()

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
            if product.status == "draft":
                product.status = "approved"
            db.commit()
            db.refresh(product)
        return product.to_dict()

    # ---- Whop status -----------------------------------------------------
    @api.get("/whop")
    def whop_status(client: WhopClient = Depends(get_whop)) -> dict[str, Any]:
        return {
            **client.status(),
            "branding": BRANDING,
            "publish_endpoint": "/api/whop/publish",
        }

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
                "instabix_cents": int(row[5]),
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
        if product.status != "published":
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
            currency=payload.currency.lower(),
            gross_cents=payload.gross_cents,
            refunded_cents=0,
            net_cents=payout["net_cents"],
            creator_cents=payout["creator_cents"],
            platform_cents=payout["platform_cents"],
            creator_share_bps=creator_bps,
            platform_share_bps=platform_bps,
            status="paid",
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

    app.include_router(api)
    app.include_router(whop_router)
    return app


app = create_app()
