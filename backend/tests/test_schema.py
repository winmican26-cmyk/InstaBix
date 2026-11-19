"""Stage 2 six-table schema: metadata shape, CHECK enforcement and migration."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import CheckConstraint, UniqueConstraint, create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import CREATOR_STATUSES, PRODUCT_BRANDING, PRODUCT_STATUSES
from app.migrate import _default_sql, migrate_schema
from app.models import Base, Campaign, Creator, Email, Product, Sale, Setting

TABLES = ("creators", "campaigns", "products", "emails", "sales", "settings")

EXPECTED_COLUMNS = {
    "creators": {
        "id", "name", "handle", "platform", "email", "niche", "followers", "median_views",
        "reels_in_range", "recent_reel_views", "ad_posts", "qualified", "qualification_score",
        "qualification", "engagement_rate", "monetization_score", "top_reels",
        "content_pillars", "status", "source", "created_at", "updated_at",
    },
    "campaigns": {
        "id", "name", "niche", "status", "creator_id", "sequence_status",
        "reply_classification", "current_step", "next_followup_at", "created_at",
    },
    "products": {
        "id", "creator_id", "title", "slug", "niche", "price_cents", "price",
        "is_first_product", "split_creator_bps", "split_platform_bps", "split_creator",
        "split_operator", "status", "toc", "target_words", "word_count", "branding",
        "whop_url", "content_md", "creator_approved", "approved_by", "approved_at",
        "whop_product_id", "whop_plan_id", "bio_link", "story_templates",
        "launch_captions", "published_at", "created_at", "updated_at",
    },
    "emails": {
        "id", "creator_id", "campaign_id", "direction", "status", "template_key",
        "subject", "body", "step", "opened", "replied", "classification",
        "classification_detail", "approved", "approved_by", "approved_at", "sent_at",
        "created_at",
    },
    "sales": {
        "id", "product_id", "creator_id", "whop_sale_id", "whop_order_id", "currency",
        "gross_cents", "refunded_cents", "net_cents", "creator_cents", "platform_cents",
        "creator_share_bps", "platform_share_bps", "amount", "payout_creator",
        "payout_operator", "sold_at", "status", "created_at", "updated_at",
    },
    "settings": {"id", "key", "value", "updated_at"},
}

REQUIRED_CHECKS = {
    "creators": {
        "ck_creators_niche", "ck_creators_status", "ck_creators_monetization_score",
    },
    "campaigns": {"ck_campaigns_current_step"},
    "products": {
        "ck_products_branding", "ck_products_status", "ck_products_split_bps_sum",
        "ck_products_split_mirror_sum",
    },
    "emails": {"ck_emails_step"},
}


def _unique_column_sets(table: Any) -> set[tuple[str, ...]]:
    result = {tuple(column.name for column in table.primary_key.columns)}
    for constraint in table.constraints:
        if isinstance(constraint, UniqueConstraint):
            result.add(tuple(column.name for column in constraint.columns))
    for column in table.columns:
        if column.unique:
            result.add((column.name,))
    return result


def test_metadata_has_all_six_tables_and_columns() -> None:
    assert set(Base.metadata.tables) >= set(TABLES)
    for table_name, expected in EXPECTED_COLUMNS.items():
        actual = {column.name for column in Base.metadata.tables[table_name].columns}
        assert actual == expected, table_name


def test_metadata_unique_constraints() -> None:
    creators = Base.metadata.tables["creators"]
    campaigns = Base.metadata.tables["campaigns"]
    settings = Base.metadata.tables["settings"]
    assert ("handle",) in _unique_column_sets(creators)
    assert ("platform", "handle") in _unique_column_sets(creators)
    assert ("creator_id",) in _unique_column_sets(campaigns)
    assert ("id",) in _unique_column_sets(settings)
    assert ("key",) in _unique_column_sets(settings)


def test_metadata_check_constraints() -> None:
    for table_name, expected in REQUIRED_CHECKS.items():
        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in Base.metadata.tables[table_name].constraints
            if isinstance(constraint, CheckConstraint)
        }
        assert expected <= set(checks), table_name
    products = Base.metadata.tables["products"]
    product_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in products.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "10000" in product_checks["ck_products_split_bps_sum"]
    assert "1.00" in product_checks["ck_products_split_mirror_sum"]
    creators = Base.metadata.tables["creators"]
    creator_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in creators.constraints
        if isinstance(constraint, CheckConstraint)
    }
    for status in CREATOR_STATUSES:
        assert f"'{status}'" in creator_checks["ck_creators_status"]
    for status in PRODUCT_STATUSES:
        assert f"'{status}'" in product_checks["ck_products_status"]
    for branding in PRODUCT_BRANDING:
        assert f"'{branding}'" in product_checks["ck_products_branding"]


def _fresh_engine() -> Any:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return engine


def _creator(handle: str, **overrides: Any) -> Creator:
    values: dict[str, Any] = {
        "name": "Test Creator", "handle": handle, "niche": "Sports",
        "followers": 1_000, "median_views": 500,
    }
    values.update(overrides)
    return Creator(**values)


def _product(creator_id: int, slug: str, **overrides: Any) -> Product:
    values: dict[str, Any] = {
        "creator_id": creator_id, "title": "Test Product", "slug": slug, "niche": "Sports",
        "price_cents": 1_900, "split_creator_bps": 6_000, "split_platform_bps": 4_000,
    }
    values.update(overrides)
    return Product(**values)


def test_fresh_sqlite_enforces_stage2_checks() -> None:
    engine = _fresh_engine()
    with Session(engine) as session:
        session.add(_creator("valid-creator"))
        session.commit()

        creator_id = session.execute(
            text("SELECT id FROM creators WHERE handle = 'valid-creator'")
        ).scalar_one()

        # Valid stage-2 values are accepted.
        session.add(_product(creator_id, "valid-product", split_creator=Decimal("0.60"), split_operator=Decimal("0.40")))
        session.add(Email(creator_id=creator_id, subject="Hello", body="Body", step=2))
        session.commit()

        invalid_rows = (
            _creator("bad-niche", niche="Unknown"),
            _creator("bad-status", status="new"),
            _product(creator_id, "bad-branding", branding="unknown"),
            _product(creator_id, "bad-status-product", status="approved"),
            _product(creator_id, "bad-bps", split_platform_bps=5_000),
            _product(creator_id, "bad-mirror", split_creator=Decimal("0.60"), split_operator=Decimal("0.50")),
            Email(creator_id=creator_id, subject="Bad step", body="Body", step=4),
        )
        for row in invalid_rows:
            session.add(row)
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()


def test_campaign_creator_id_is_unique() -> None:
    engine = _fresh_engine()
    with Session(engine) as session:
        session.add(_creator("campaign-creator"))
        session.commit()
        creator_id = session.execute(text("SELECT id FROM creators WHERE handle = 'campaign-creator'")).scalar_one()
        session.add(Campaign(name="One", niche="Sports", creator_id=creator_id))
        session.commit()
        session.add(Campaign(name="Two", niche="Sports", creator_id=creator_id))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


LEGACY_DDL = (
    """CREATE TABLE creators (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL,
        platform TEXT NOT NULL, email TEXT, niche TEXT NOT NULL,
        followers INTEGER NOT NULL, median_views INTEGER NOT NULL,
        reels_in_range INTEGER NOT NULL, recent_reel_views TEXT NOT NULL,
        ad_posts INTEGER NOT NULL, qualified INTEGER NOT NULL,
        qualification_score INTEGER NOT NULL, qualification TEXT NOT NULL,
        status TEXT NOT NULL, source TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
    """CREATE TABLE campaigns (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, niche TEXT NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL)""",
    """CREATE TABLE products (
        id INTEGER PRIMARY KEY, creator_id INTEGER NOT NULL, title TEXT NOT NULL,
        slug TEXT NOT NULL, niche TEXT NOT NULL, price_cents INTEGER NOT NULL,
        is_first_product INTEGER NOT NULL, split_creator_bps INTEGER NOT NULL,
        split_platform_bps INTEGER NOT NULL, status TEXT NOT NULL, toc TEXT,
        target_words INTEGER NOT NULL, creator_approved INTEGER NOT NULL,
        approved_by TEXT, approved_at TEXT, whop_product_id TEXT, whop_plan_id TEXT,
        bio_link TEXT, story_templates TEXT NOT NULL, launch_captions TEXT NOT NULL,
        published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
    """CREATE TABLE emails (
        id INTEGER PRIMARY KEY, creator_id INTEGER NOT NULL, campaign_id INTEGER,
        direction TEXT NOT NULL, status TEXT NOT NULL, template_key TEXT,
        subject TEXT NOT NULL, body TEXT NOT NULL, classification TEXT,
        classification_detail TEXT, approved INTEGER NOT NULL, approved_by TEXT,
        approved_at TEXT, sent_at TEXT, created_at TEXT NOT NULL)""",
    """CREATE TABLE sales (
        id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, creator_id INTEGER NOT NULL,
        whop_sale_id TEXT NOT NULL, currency TEXT NOT NULL, gross_cents INTEGER NOT NULL,
        refunded_cents INTEGER NOT NULL, net_cents INTEGER NOT NULL,
        creator_cents INTEGER NOT NULL, platform_cents INTEGER NOT NULL,
        creator_share_bps INTEGER NOT NULL, platform_share_bps INTEGER NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
    "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
)


def _legacy_engine() -> Any:
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        for ddl in LEGACY_DDL:
            connection.execute(text(ddl))
        connection.execute(
            text(
                "INSERT INTO creators (id, name, handle, platform, email, niche, followers, "
                "median_views, reels_in_range, recent_reel_views, ad_posts, qualified, "
                "qualification_score, qualification, status, source, created_at, updated_at) "
                "VALUES (1, 'Legacy', 'legacy', 'instagram', NULL, 'Sports', 1000, 500, 3, "
                "'[500]', 0, 1, 50.8, :qualification, 'qualified', 'manual', "
                "'2026-01-01 00:00:00', '2026-01-01 00:00:00')"
            ),
            {"qualification": '{"score": 50.8, "engagement_rate": 0.055, "unmonetized_score": 80}'},
        )
        for row in (
            (1, 1, "First", "first", "Sports", 1900, 1, 6000, 4000, "approved", 6500),
            (2, 1, "Second", "second", "Sports", 2500, 0, 5000, 5000, "published", 7000),
        ):
            connection.execute(
                text(
                    "INSERT INTO products (id, creator_id, title, slug, niche, price_cents, "
                    "is_first_product, split_creator_bps, split_platform_bps, status, toc, "
                    "target_words, creator_approved, approved_by, approved_at, whop_product_id, "
                    "whop_plan_id, bio_link, story_templates, launch_captions, published_at, "
                    "created_at, updated_at) VALUES (:id, :creator_id, :title, :slug, :niche, "
                    ":price_cents, :is_first_product, :split_creator_bps, :split_platform_bps, "
                    ":status, NULL, :target_words, 0, NULL, NULL, NULL, NULL, NULL, '[]', '[]', "
                    "NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
                ),
                dict(
                    zip(
                        ("id", "creator_id", "title", "slug", "niche", "price_cents",
                         "is_first_product", "split_creator_bps", "split_platform_bps",
                         "status", "target_words"),
                        row,
                    )
                ),
            )
        connection.execute(
            text(
                "INSERT INTO sales (id, product_id, creator_id, whop_sale_id, currency, "
                "gross_cents, refunded_cents, net_cents, creator_cents, platform_cents, "
                "creator_share_bps, platform_share_bps, status, created_at, updated_at) "
                "VALUES (1, 1, 1, 'sale-1', 'usd', 1900, 0, 1900, 1140, 760, 6000, 4000, "
                "'paid', '2026-01-05 00:00:00', '2026-01-05 00:00:00')"
            )
        )
        connection.execute(
            text("INSERT INTO app_settings (key, value, updated_at) VALUES ('branding', '\"hybrid\"', '2026-01-01 00:00:00')")
        )
    return engine


def _snapshot(engine: Any) -> dict[str, tuple[tuple[Any, ...], ...]]:
    present = set(inspect(engine).get_table_names())
    with engine.connect() as connection:
        return {
            table_name: tuple(
                tuple(row) for row in connection.execute(text(f"SELECT * FROM {table_name} ORDER BY 1"))
            )
            for table_name in TABLES + ("app_settings",)
            if table_name in present
        }


def test_migrate_schema_is_idempotent_and_backfills_mirrors() -> None:
    engine = _legacy_engine()
    assert set(inspect(engine).get_table_names()) >= {"creators", "campaigns", "products", "emails", "sales", "app_settings"}
    assert "settings" not in inspect(engine).get_table_names()

    migrate_schema(engine)
    after_first = _snapshot(engine)

    # Idempotency: a second run changes neither schema nor rows.
    migrate_schema(engine)
    assert _snapshot(engine) == after_first
    assert {column["name"] for column in inspect(engine).get_columns("products")} == EXPECTED_COLUMNS["products"]
    assert "app_settings" in inspect(engine).get_table_names()  # legacy table is left in place

    with engine.connect() as connection:
        products = connection.execute(
            text("SELECT price, word_count, split_creator, split_operator, status FROM products ORDER BY id")
        ).all()
        assert [(float(row[0]), row[1], float(row[2]), float(row[3]), row[4]) for row in products] == [
            (19.0, 6500, 0.6, 0.4, "creator_approved"),
            (25.0, 7000, 0.5, 0.5, "live"),
        ]

        sale = connection.execute(
            text(
                "SELECT amount, payout_creator, payout_operator, whop_order_id, sold_at "
                "FROM sales WHERE id = 1"
            )
        ).one()
        assert float(sale[0]) == 19.0
        assert float(sale[1]) == 11.4
        assert float(sale[2]) == 7.6
        assert sale[3] == "sale-1"
        assert str(sale[4]).startswith("2026-01-05")

        creator = connection.execute(
            text("SELECT status, engagement_rate, monetization_score FROM creators WHERE id = 1")
        ).one()
        assert creator[0] == "Qualified"  # legacy lowercase status must be remapped
        assert float(creator[1]) == pytest.approx(0.055)
        assert creator[2] == 80

        settings = connection.execute(text("SELECT key, value FROM settings ORDER BY key")).all()
        assert settings == [("branding", '"hybrid"')]
        # The JSON value must survive both raw-string and driver-decoded forms.
        with Session(engine) as session:
            assert session.scalar(select(Setting.value).where(Setting.key == "branding")) == "hybrid"


def test_migration_boolean_defaults_are_portable() -> None:
    """Postgres BOOLEAN columns reject the integer 0/1 defaults SQLite tolerates."""
    emails = Base.metadata.tables["emails"]
    products = Base.metadata.tables["products"]
    assert _default_sql(emails.c.opened) == "FALSE"
    assert _default_sql(emails.c.replied) == "FALSE"
    assert _default_sql(products.c.is_first_product) == "TRUE"


def test_migrate_schema_on_fresh_metadata_database_is_noop() -> None:
    engine = _fresh_engine()
    before = _snapshot(engine)
    migrate_schema(engine)
    migrate_schema(engine)
    assert _snapshot(engine) == before
