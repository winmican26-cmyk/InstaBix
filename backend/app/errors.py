"""Domain errors with stable machine-readable codes.

The API renders these as {"detail": {"code": ..., "message": ..., "details": ...}}
so clients never have to parse prose.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        self.details = details

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            payload["details"] = self.details
        return payload


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class ValidationFailed(AppError):
    status_code = 422
    code = "validation_failed"


class PublishBlocked(Conflict):
    code = "publish_blocked"


class WhopNotConfigured(AppError):
    status_code = 503
    code = "whop_not_configured"


class WhopAPIError(AppError):
    status_code = 502
    code = "whop_api_error"
