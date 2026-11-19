"""Idempotent Stage 2 migration for the six-table backend schema.

The runner is intentionally additive: it never drops a table or deletes a row.
It inspects the live schema, adds missing columns/objects, and backfills the
decimal mirrors from the authoritative integer columns. Fresh databases get
the full CHECK constraints from SQLAlchemy metadata instead; on Postgres the
missing CHECK constraints are added here for legacy databases.
"""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import CheckConstraint, Column, Engine, inspect, select, text
from sqlalchemy.exc import DBAPIError

from app.config import CREATOR_STATUSES
from app.models import Base

_JSON_LIST_COLUMNS = frozenset(
    {"recent_reel_views", "top_reels", "content_pillars", "story_templates", "launch_captions"}
)
_JSON_OBJECT_COLUMNS = frozenset({"qualification", "toc", "classification_detail"})
_CENTS = Decimal("100")
_BASIS_POINTS = Decimal("10000")


def _quote(connection: Any, name: str) -> str:
    return str(connection.dialect.identifier_preparer.quote(name))


def _available_columns(connection: Any, table_name: str) -> set[str]:
    return {column["name"] for column in inspect(connection).get_columns(table_name)}


def _default_sql(column: Column[Any]) -> str | None:
    """A safe DEFAULT for ALTER TABLE ADD COLUMN (never emits NOT NULL)."""
    if column.name in {"created_at", "updated_at"}:
        return "CURRENT_TIMESTAMP"
    if column.name in _JSON_LIST_COLUMNS:
        return "'[]'"
    if column.name in _JSON_OBJECT_COLUMNS or column.name == "value":
        return "'{}'"
    default = column.default
    if default is None or default.is_callable or default.is_sequence:
        return None
    value = default.arg
    if value is None:
        return None
    if isinstance(value, bool):
        # Postgres has a real BOOLEAN type and rejects integer literals here;
        # SQLite accepts TRUE/FALSE keywords, so one spelling works for both.
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None


def _ensure_columns(connection: Any) -> None:
    inspector = inspect(connection)
    for table_name, table in Base.metadata.tables.items():
        if not inspector.has_table(table_name):
            continue
        existing = _available_columns(connection, table_name)
        for column in table.columns:
            if column.name in existing:
                continue
            column_type = column.type.compile(dialect=connection.dialect)
            ddl = (
                f"ALTER TABLE {_quote(connection, table_name)} "
                f"ADD COLUMN {_quote(connection, column.name)} {column_type}"
            )
            default = _default_sql(column)
            if default is not None:
                ddl += f" DEFAULT {default}"
            connection.execute(text(ddl))


def _load_json(value: Any) -> Any:
    if isinstance(value, (dict, list, bool, int, float)) or value is None:
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            # A JSON/JSONB driver returns already-decoded Python values; a
            # scalar such as "hybrid" is a literal setting, not broken JSON.
            return value
    return value


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        cleaned = value.strip().replace("T", " ")
        for pattern in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(cleaned, pattern)
            except ValueError:
                continue
    return None


def _ensure_settings(connection: Any) -> None:
    inspector = inspect(connection)
    settings = Base.metadata.tables["settings"]
    if not inspector.has_table("settings"):
        settings.create(bind=connection)
    if not inspector.has_table("app_settings"):
        return

    legacy_columns = _available_columns(connection, "app_settings")
    if not {"key", "value"} <= legacy_columns:
        return
    column_names = [name for name in ("key", "value", "updated_at") if name in legacy_columns]
    projection = ", ".join(_quote(connection, name) for name in column_names)
    rows = connection.execute(text(f"SELECT {projection} FROM app_settings")).mappings().all()
    if not rows:
        return

    known = set(connection.execute(select(settings.c.key)).scalars().all())
    payloads: list[dict[str, Any]] = []
    for row in rows:
        key = row["key"]
        if key is None or key in known:
            continue
        payload: dict[str, Any] = {"key": key, "value": _load_json(row["value"])}
        if "updated_at" in column_names:
            updated_at = _as_datetime(row["updated_at"])
            if updated_at is not None:
                payload["updated_at"] = updated_at
        payloads.append(payload)
    if payloads:
        connection.execute(settings.insert(), payloads)


def _cents_to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return (Decimal(int(value)) / _CENTS).quantize(Decimal("0.01"))


def _bps_to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return (Decimal(int(value)) / _BASIS_POINTS).quantize(Decimal("0.01"))


def _backfill_creators(connection: Any) -> None:
    if not inspect(connection).has_table("creators"):
        return
    available = _available_columns(connection, "creators")
    names = [
        name
        for name in (
            "id",
            "qualification",
            "engagement_rate",
            "monetization_score",
            "status",
        )
        if name in available
    ]
    if "id" not in names or "qualification" not in names:
        return
    table = Base.metadata.tables["creators"]
    rows = connection.execute(select(*(table.c[name] for name in names))).mappings().all()
    for row in rows:
        qualification = _load_json(row.get("qualification"))
        if not isinstance(qualification, dict):
            continue
        values: dict[str, Any] = {}

        engagement = qualification.get("engagement_rate")
        current_engagement = row.get("engagement_rate")
        if "engagement_rate" in available and engagement is not None:
            if current_engagement is None or Decimal(str(current_engagement)) == 0:
                try:
                    normalized = Decimal(str(engagement)).quantize(Decimal("0.000001"))
                except (InvalidOperation, ValueError):
                    normalized = None
                if normalized is not None and Decimal("0") <= normalized <= Decimal("1"):
                    values["engagement_rate"] = normalized

        monetization = qualification.get("monetization_score")
        if monetization is None:
            monetization = qualification.get("unmonetized_score")
        if monetization is None and qualification.get("score") is not None:
            try:
                monetization = float(qualification["score"]) * 100
            except (TypeError, ValueError):
                monetization = None
        current_score = row.get("monetization_score")
        if "monetization_score" in available and monetization is not None:
            if current_score is None or current_score == 100:
                try:
                    score = int(round(float(monetization)))
                except (TypeError, ValueError):
                    score = None
                if score is not None:
                    values["monetization_score"] = max(0, min(100, score))

        # Stage 1 used lowercase statuses that violate ck_creators_status.
        # Map every known legacy value onto the Stage 2 title-case vocabulary
        # before the CHECK is added, so upgrades with existing rows succeed.
        legacy_status = row.get("status")
        if "status" in available and legacy_status not in CREATOR_STATUSES:
            status_map = {
                "new": "New",
                "reviewing": "New",
                "qualified": "Qualified",
                "unqualified": "Rejected",
                "approved": "Shortlisted",
                "contacted": "Contacted",
                "negotiating": "Shortlisted",
                "partnered": "Partnered",
                "declined": "Rejected",
                "suppressed": "Rejected",
            }
            values["status"] = status_map.get(str(legacy_status).lower(), "New")
        if values:
            connection.execute(table.update().where(table.c.id == row["id"]).values(**values))


def _backfill_products(connection: Any) -> None:
    if not inspect(connection).has_table("products"):
        return
    available = _available_columns(connection, "products")
    if not {"id", "price_cents", "split_creator_bps", "split_platform_bps"} <= available:
        return
    names = [
        name
        for name in (
            "id",
            "price_cents",
            "target_words",
            "split_creator_bps",
            "split_platform_bps",
            "status",
            "price",
            "word_count",
            "split_creator",
            "split_operator",
        )
        if name in available
    ]
    table = Base.metadata.tables["products"]
    rows = connection.execute(select(*(table.c[name] for name in names))).mappings().all()
    status_map = {"approved": "creator_approved", "published": "live"}
    for row in rows:
        values: dict[str, Any] = {}
        if "price" in available and row.get("price") is None:
            price = _cents_to_decimal(row.get("price_cents"))
            if price is not None:
                values["price"] = price
        if "word_count" in available and "target_words" in available:
            target = row.get("target_words")
            if target is not None and row.get("word_count") != target:
                values["word_count"] = int(target)
        if "split_creator" in available and row.get("split_creator") is None:
            share = _bps_to_decimal(row.get("split_creator_bps"))
            if share is not None:
                values["split_creator"] = share
        if "split_operator" in available and row.get("split_operator") is None:
            share = _bps_to_decimal(row.get("split_platform_bps"))
            if share is not None:
                values["split_operator"] = share
        mapped_status = status_map.get(row.get("status"))
        if mapped_status is not None and "status" in available:
            values["status"] = mapped_status
        if values:
            connection.execute(table.update().where(table.c.id == row["id"]).values(**values))


def _backfill_sales(connection: Any) -> None:
    if not inspect(connection).has_table("sales"):
        return
    available = _available_columns(connection, "sales")
    if not {"id", "gross_cents", "creator_cents", "platform_cents"} <= available:
        return
    names = [
        name
        for name in (
            "id",
            "gross_cents",
            "creator_cents",
            "platform_cents",
            "amount",
            "payout_creator",
            "payout_operator",
        )
        if name in available
    ]
    table = Base.metadata.tables["sales"]
    rows = connection.execute(select(*(table.c[name] for name in names))).mappings().all()
    for row in rows:
        values: dict[str, Any] = {}
        for target, source in (
            ("amount", "gross_cents"),
            ("payout_creator", "creator_cents"),
            ("payout_operator", "platform_cents"),
        ):
            if target in available and row.get(target) is None:
                mirror = _cents_to_decimal(row.get(source))
                if mirror is not None:
                    values[target] = mirror
        if values:
            connection.execute(table.update().where(table.c.id == row["id"]).values(**values))

    if {"whop_order_id", "whop_sale_id"} <= available:
        connection.execute(
            table.update()
            .where(table.c.whop_order_id.is_(None))
            .values(whop_order_id=table.c.whop_sale_id)
        )
    if {"sold_at", "created_at"} <= available:
        connection.execute(
            table.update().where(table.c.sold_at.is_(None)).values(sold_at=table.c.created_at)
        )


def _add_postgres_checks(connection: Any) -> None:
    """Legacy Postgres databases do not get metadata CHECKs, so add them here."""
    if connection.dialect.name != "postgresql":
        return
    for table_name, table in Base.metadata.tables.items():
        if not inspect(connection).has_table(table_name):
            continue
        existing = {
            row[0]
            for row in connection.execute(
                text("SELECT conname FROM pg_constraint WHERE conrelid = to_regclass(:name)"),
                {"name": table_name},
            )
        }
        for constraint in table.constraints:
            if not isinstance(constraint, CheckConstraint) or not constraint.name:
                continue
            if constraint.name in existing:
                continue
            ddl = (
                f"ALTER TABLE {_quote(connection, table_name)} "
                f"ADD CONSTRAINT {_quote(connection, constraint.name)} "
                f"CHECK ({constraint.sqltext})"
            )
            try:
                connection.execute(text(ddl))
            except DBAPIError as exc:
                if "already exists" not in str(exc).lower():
                    raise


def migrate_schema(engine: Engine) -> None:
    """Bring an existing database up to the Stage 2 shape without data loss."""
    with engine.begin() as connection:
        _ensure_columns(connection)
        _ensure_settings(connection)
        _backfill_creators(connection)
        _backfill_products(connection)
        _backfill_sales(connection)
        _add_postgres_checks(connection)
