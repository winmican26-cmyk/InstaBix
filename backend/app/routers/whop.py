"""Whop publication endpoint.

This is the key endpoint: it is the only path that can create a live Whop
product. Agent 4 re-checks creator approval at the point of publication.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.agents.agent4 import publish_product
from app.deps import get_db, get_whop
from app.errors import NotFound
from app.models import Product
from app.schemas import PublishRequest
from app.security import require_api_key
from app.whop import WhopClient

router = APIRouter(tags=["whop"], dependencies=[Depends(require_api_key)])


@router.post("/api/whop/publish")
def publish(
    payload: PublishRequest,
    db: Session = Depends(get_db),
    client: WhopClient = Depends(get_whop),
) -> dict[str, object]:
    product = db.get(Product, payload.product_id)
    if product is None:
        raise NotFound(f"Product {payload.product_id} does not exist.")
    return publish_product(db, product, client).to_dict()


@router.get("/api/whop/audit")
def whop_call_audit(
    product_id: str | None = Query(default=None),
    client: WhopClient = Depends(get_whop),
) -> dict[str, object]:
    """Read the in-memory call-audit log (no credentials or request bodies).

    Scoped by the router's existing API-key dependency. When `product_id` is
    supplied, only records for that Whop/reference product id are returned.
    """
    records = (
        client.audit_sink.for_product(product_id)
        if product_id
        else client.audit_sink.records
    )
    items = [record.to_dict() for record in records]
    return {"count": len(items), "items": items}
