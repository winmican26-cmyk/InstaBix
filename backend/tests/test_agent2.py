from __future__ import annotations

import pytest

from app.agents.agent2 import (
    NEGATIVE,
    POSITIVE,
    SOFT_POSITIVE,
    TEMPLATE_KEYS,
    classify_reply,
    classify_reply_detail,
    render_outreach,
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Yes, I'm interested — send the details", POSITIVE),
        ("Let's do it", POSITIVE),
        ("Sign me up", POSITIVE),
        ("No problem, send it over", POSITIVE),
        ("Maybe next quarter — circle back", SOFT_POSITIVE),
        ("Not right now, but send me more info", SOFT_POSITIVE),
        ("Sounds interesting, tell me more", SOFT_POSITIVE),
        ("Interested, but not right now", SOFT_POSITIVE),
        ("Not interested, unsubscribe me", NEGATIVE),
        ("No thanks", NEGATIVE),
        ("I'm not interested", NEGATIVE),
        ("Please remove me from this list", NEGATIVE),
        ("STOP", NEGATIVE),
        ("This is spam", NEGATIVE),
        ("", NEGATIVE),
        ("Sent you a birthday card last week", NEGATIVE),
    ],
)
def test_reply_classification(text: str, expected: str) -> None:
    assert classify_reply(text) == expected
    assert classify_reply_detail(text).label in {POSITIVE, SOFT_POSITIVE, NEGATIVE}


def test_classification_detail_exposes_signals() -> None:
    detail = classify_reply_detail("Yes please — interested")
    assert detail.label == POSITIVE
    assert detail.matched
    assert detail.confidence > 0


def test_templates_include_opt_out_and_no_invented_claims() -> None:
    creator = {"name": "Jordan Reyes", "niche": "Finance", "handle": "jordan"}
    for key in TEMPLATE_KEYS:
        rendered = render_outreach(
            creator,
            key,
            sender_name="InstaBix",
            unsubscribe_url="https://instabix.com/unsubscribe?email=x",
        )
        assert "https://instabix.com/unsubscribe" in rendered["body"]
        assert "Jordan" in rendered["body"]
        assert "Finance" in rendered["subject"]
        assert "guarantee" not in rendered["body"].lower()
        assert "views" not in rendered["body"].lower()


def test_unknown_template_raises() -> None:
    with pytest.raises(ValueError):
        render_outreach({"name": "A", "niche": "Home"}, "spam_blast")
