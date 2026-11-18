"""Engine and session helpers."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import AppSetting, Base


def make_engine(database_url: str) -> Engine:
    kwargs: dict[str, object] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in database_url:
            kwargs["poolclass"] = StaticPool
    engine = create_engine(database_url, **kwargs)

    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)


DEFAULT_SETTINGS: dict[str, object] = {
    "branding": "hybrid",
    "sender_name": "The InstaBix team",
    "support_email": "support@instabix.com",
    "outreach_paused": False,
}


def seed_default_settings(session: Session) -> None:
    existing = set(session.scalars(select(AppSetting.key)).all())
    for key, value in DEFAULT_SETTINGS.items():
        if key not in existing:
            session.add(AppSetting(key=key, value=value))
    session.commit()


def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    session = factory()
    try:
        yield session
    finally:
        session.close()
