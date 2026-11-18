"""FastAPI dependencies shared by the routers."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from app.config import Settings
from app.whop import WhopClient


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    factory = request.app.state.session_factory
    with factory() as session:
        yield session


def get_whop(request: Request) -> WhopClient:
    return request.app.state.whop
