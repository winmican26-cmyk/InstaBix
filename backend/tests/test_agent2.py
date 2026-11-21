from __future__ import annotations

import re

import pytest

from app.agents.agent2 import (
    NEGATIVE,
    NO_RESPONSE,
    POSITIVE,
    SOFT_POSITIVE,
    TEMPLATE_KEYS,
    TEMPLATES,
    classify_reply,
    classify_reply_detail,
    render_outreach,
    reply_action,
)

CREATOR = {"name": "Jordan Reyes", "niche": "Finance", "handle": "jordan"}
UNSUBSCRIBE_URL = "https://vistabix.com/unsubscribe?email=x"
SOCIAL_PROOF = (
    "We did this for a creator in a similar niche and it sold from their existing audience in week 1."
)
CLOSE_LOOP_BODY = (
    "Totally get it if timing is off. Should I close your file or keep you on the list for next month?"
)


def render(key: str, **kwargs: object) -> dict[str, str]:
    return render_outreach(CREATOR, key, sender_name="VistaBix", unsubscribe_url=UNSUBSCRIBE_URL, **kwargs)


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


def test_exact_template_subjects() -> None:
    assert set(TEMPLATES) == set(TEMPLATE_KEYS)
    assert TEMPLATES["initial"]["subject"] == "Quick idea for your {niche} audience"
    assert TEMPLATES["follow_up"]["subject"] == "Re: Quick idea..."
    assert TEMPLATES["close_loop"]["subject"] == "Closing the loop?"


@pytest.mark.parametrize(
    ("key", "expected"),
    [
        ("initial", "Quick idea for your Finance audience"),
        ("follow_up", "Re: Quick idea..."),
        ("close_loop", "Closing the loop?"),
    ],
)
def test_rendered_subjects(key: str, expected: str) -> None:
    assert render(key)["subject"] == expected


def test_email1_references_reel_and_insight() -> None:
    body = render(
        "initial",
        reel_title="My 30-day meal plan Reel",
        audience_insight="viewers keep asking for the grocery list",
    )["body"]
    assert '"My 30-day meal plan Reel"' in body
    assert "viewers keep asking for the grocery list" in body


def test_email1_defaults_are_honest_placeholders() -> None:
    body = render("initial")["body"]
    assert "your recent Reel" in body
    assert "your audience's recurring question" in body


def test_email1_uses_creator_fields_when_present() -> None:
    creator = {
        "name": "Alex",
        "niche": "Home",
        "reel_title": "Kitchen tour",
        "audience_insight": "asks about small-space storage",
    }
    body = render_outreach(creator, "initial")["body"]
    assert "Kitchen tour" in body
    assert "asks about small-space storage" in body


def test_email1_under_120_words_excluding_signature() -> None:
    body = render("initial")["body"]
    without_signature = re.split(r"\n\n— ", body, maxsplit=1)[0]
    assert len(without_signature.split()) < 120


def test_email1_has_no_url_or_link() -> None:
    body = render("initial")["body"]
    assert not re.search(r"https?://|www\.|\b[a-z0-9-]+\.(?:com|io|co|net)\b", body, flags=re.IGNORECASE)
    assert UNSUBSCRIBE_URL not in body


def test_email1_value_line_and_single_cta() -> None:
    body = render("initial")["body"]
    assert "Zero upfront cost: 60/40 on the first product in your favour, then 50/50 after that." in body
    assert body.upper().count("INTERESTED") == 1
    assert "Reply INTERESTED" in body


def test_email2_has_exactly_one_social_proof_sentence_then_repeat_cta() -> None:
    body = render("follow_up")["body"]
    assert body.count(SOCIAL_PROOF) == 1
    assert body.count("sold from") == 1
    assert "Reply INTERESTED" in body


def test_email3_subject_and_body() -> None:
    rendered = render("close_loop")
    assert rendered["subject"] == "Closing the loop?"
    assert CLOSE_LOOP_BODY in rendered["body"]


def test_unsubscribe_url_is_metadata_only_not_in_any_body() -> None:
    for key in TEMPLATE_KEYS:
        rendered = render(key)
        assert rendered["unsubscribe_url"] == UNSUBSCRIBE_URL
        assert "unsubscribe" not in rendered["body"].lower()
        assert UNSUBSCRIBE_URL not in rendered["body"]


def test_templates_have_no_invented_metrics_or_guarantees() -> None:
    for key in TEMPLATE_KEYS:
        body = render(key)["body"].lower()
        assert "guarantee" not in body
        assert "views" not in body
        assert "earned" not in body


def test_unknown_template_raises() -> None:
    with pytest.raises(ValueError):
        render_outreach({"name": "A", "niche": "Home"}, "spam_blast")


@pytest.mark.parametrize(
    ("classification", "expected"),
    [
        (POSITIVE, {"status": "SHORTLISTED-Hot", "notify_human": True, "draft_reply": "calendly_link"}),
        (SOFT_POSITIVE, {"status": "Nurture", "notify_human": False, "send": "product_one_pager"}),
        (NEGATIVE, {"status": "Do Not Contact", "notify_human": True, "unsubscribe": True}),
        (NO_RESPONSE, {"status": "Cold", "retarget_days": 60}),
        ("unknown", {"status": "Needs Human Review", "notify_human": True}),
        ("positive", {"status": "Needs Human Review", "notify_human": True}),
        ("", {"status": "Needs Human Review", "notify_human": True}),
    ],
)
def test_reply_action_mappings(classification: str, expected: dict[str, object]) -> None:
    assert reply_action(classification) == expected


def test_reply_action_is_pure() -> None:
    first = reply_action(POSITIVE)
    first["status"] = "mutated"
    assert reply_action(POSITIVE) == {
        "status": "SHORTLISTED-Hot",
        "notify_human": True,
        "draft_reply": "calendly_link",
    }
