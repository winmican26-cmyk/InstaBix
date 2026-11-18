"""Optional shared-secret protection for the API.

When API_KEY is unset the starter is open on localhost, which keeps the local
loop frictionless. Deployments must set API_KEY; every /api route except the
health check then requires the X-API-Key header.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, Request


def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    expected = request.app.state.settings.api_key
    if not expected:
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(
            status_code=401,
            detail={
                "code": "unauthorized",
                "message": "A valid X-API-Key header is required.",
            },
            headers={"WWW-Authenticate": "ApiKey"},
        )
