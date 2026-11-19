from __future__ import annotations

import pytest

from app.config import Settings


def settings_for(app_env: str, whop_api_key: str | None, whop_mock_mode: str) -> Settings:
    return Settings(
        _env_file=None,
        app_env=app_env,
        database_url="sqlite://",
        whop_api_key=whop_api_key,
        whop_mock_mode=whop_mock_mode,
    )


@pytest.mark.parametrize(
    ("app_env", "whop_api_key", "whop_mock_mode", "expected"),
    [
        ("development", None, "auto", "mock"),
        ("development", "", "auto", "mock"),
        ("development", "test-key", "auto", "live"),
        ("development", "test-key", "true", "mock"),
        ("development", None, "false", "disabled"),
        ("development", "test-key", "false", "live"),
        ("production", None, "auto", "disabled"),
        ("production", "", "auto", "disabled"),
        ("production", "test-key", "auto", "live"),
        ("production", "test-key", "true", "disabled"),
    ],
)
def test_whop_mode_transitions(
    app_env: str, whop_api_key: str | None, whop_mock_mode: str, expected: str
) -> None:
    assert settings_for(app_env, whop_api_key, whop_mock_mode).whop_mode == expected


def test_invalid_mock_mode_is_rejected() -> None:
    with pytest.raises(ValueError, match="WHOP_MOCK_MODE"):
        settings_for("development", None, "sometimes")
