"""Agent 2 — outreach copy and reply classification.

Consent rules baked in:

- every template contains a working opt-out
- no invented audience metrics, earnings, testimonials or deadlines
- an ambiguous reply is NEGATIVE, because silence and ambiguity are not consent
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

POSITIVE = "POSITIVE"
SOFT_POSITIVE = "SOFT_POSITIVE"
NEGATIVE = "NEGATIVE"
NO_RESPONSE = "NO_RESPONSE"

TEMPLATE_KEYS: tuple[str, ...] = ("initial", "follow_up", "close_loop")

# Stage-1 copy. No template contains an unsubscribe URL: that belongs in the
# compliance footer appended by the sender (src/lib/email/resend.ts).
TEMPLATES: dict[str, dict[str, str]] = {
    "initial": {
        "subject": "Quick idea for your {niche} audience",
        "body": (
            "Hi {first_name},\n\n"
            "I watched \"{reel_title}\" and noticed {audience_insight}.\n\n"
            "We build the product, you promote it to the audience that already knows you. "
            "Zero upfront cost: 60/40 on the first product in your favour, then 50/50 after that.\n\n"
            "Want the one-page outline? Reply INTERESTED.\n\n"
            "— {sender_name}"
        ),
    },
    "follow_up": {
        "subject": "Re: Quick idea...",
        "body": (
            "Hi {first_name},\n\n"
            "Quick follow-up on the idea for your {niche} audience. "
            "We did this for a creator in a similar niche and it sold from their existing audience in week 1.\n\n"
            "Want the one-page outline? Reply INTERESTED.\n\n"
            "— {sender_name}"
        ),
    },
    "close_loop": {
        "subject": "Closing the loop?",
        "body": (
            "Hi {first_name},\n\n"
            "Totally get it if timing is off. Should I close your file or keep you on the list for next month?\n\n"
            "— {sender_name}"
        ),
    },
}


def _creator_value(creator: Any, key: str, default: str = "") -> str:
    if isinstance(creator, Mapping):
        value = creator.get(key, default)
    else:
        value = getattr(creator, key, default)
    return str(value) if value is not None else default


def first_name(creator: Any) -> str:
    name = _creator_value(creator, "name").strip()
    return name.split()[0] if name else "there"


def render_outreach(
    creator: Any,
    template_key: str = "initial",
    *,
    sender_name: str = "The VistaBix team",
    unsubscribe_url: str = "https://vistabix.com/unsubscribe",
    reel_title: str | None = None,
    audience_insight: str | None = None,
) -> dict[str, str]:
    """Render one outreach draft. Returns subject/body plus its metadata.

    The caller is responsible for a human approval step before any send. This
    function never sends and never invents a creator metric, quote or deadline.
    The unsubscribe URL is metadata only; the sender appends it to the footer.
    """
    if template_key not in TEMPLATES:
        raise ValueError(f"Unknown template '{template_key}'. Choose one of {TEMPLATE_KEYS}.")

    niche = _creator_value(creator, "niche", "creator") or "creator"
    # Explicit argument wins, then a real creator field, then an honest
    # placeholder. We never fabricate specifics about the creator's content.
    resolved_reel_title = (
        (reel_title or "").strip()
        or _creator_value(creator, "reel_title", "").strip()
        or "your recent Reel"
    )
    resolved_audience_insight = (
        (audience_insight or "").strip()
        or _creator_value(creator, "audience_insight", "").strip()
        or "your audience's recurring question"
    )
    context = {
        "first_name": first_name(creator),
        "niche": niche,
        "sender_name": sender_name,
        "reel_title": resolved_reel_title,
        "audience_insight": resolved_audience_insight,
    }
    template = TEMPLATES[template_key]
    return {
        "template_key": template_key,
        "subject": template["subject"].format(**context),
        "body": template["body"].format(**context),
        "unsubscribe_url": unsubscribe_url,
    }


@dataclass(frozen=True)
class ReplyDetail:
    label: str
    confidence: float
    matched: list[str] = field(default_factory=list)
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "classification": self.label,
            "confidence": self.confidence,
            "matched": list(self.matched),
            "reason": self.reason,
        }


# Opt-outs and explicit refusals always win, even if positive words appear too.
_NEGATIVE_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bunsubscribe\b", "explicit unsubscribe"),
    (r"^\s*stop[.!]?\s*$", "stop request"),
    (r"^\s*pass[.!]?\s*$", "declined"),
    (r"\bremove me\b", "explicit removal request"),
    (r"\b(?:stop|quit)\s+(?:emailing|contacting|messaging|sending)\b", "stop request"),
    (r"\b(?:do not|don'?t|never)\s+(?:contact|email|message|send)\b", "do-not-contact"),
    (r"\bnot\s+(?:\w+\s+){0,2}interested\b", "stated not interested"),
    (r"\bno\s+(?:thanks|thank you)\b", "declined"),
    (r"^\s*no[.!]?\s*$", "declined"),
    (r"\bhard pass\b", "declined"),
    (r"\b(?:i'?ll|we'?ll|i will|we will|gonna|going to|have to)\s+pass\b", "declined"),
    (r"\b(?:isn'?t|not)\s+a\s+(?:good\s+)?fit\b", "not a fit"),
    (r"\bdecline[ds]?\b", "declined"),
    (r"\bnot for (?:me|us)\b", "not a fit"),
    (r"\bleave me alone\b", "hostile opt-out"),
    (r"\bspam\b", "spam complaint"),
    (r"\bno longer interested\b", "withdrew interest"),
    (r"\bplease stop\b", "stop request"),
    (r"\bi don'?t (?:want|need) (?:this|it|your)\b", "explicit refusal"),
    (r"\bnot looking\b", "not looking"),
)

# Clear commitment. Checked before soft signals so "interested — send details"
# is not downgraded to a maybe.
_POSITIVE_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\byes\b", "yes"),
    (r"\byeah\b", "yes"),
    (r"\byep\b", "yes"),
    (r"\binterested\b", "interest"),
    (r"\blet'?s do it\b", "commitment"),
    (r"\bi'?m in\b", "commitment"),
    (r"\bcount me in\b", "commitment"),
    (r"\bsign me up\b", "commitment"),
    (r"\bsounds good\b", "agreement"),
    (r"\bhappy to\b", "agreement"),
    (r"\bready to (?:go|start|move)\b", "commitment"),
    (r"\bwhen can we (?:start|talk|meet)\b", "scheduling"),
    (r"\b(?:book|schedule) (?:a )?(?:call|meeting|time)\b", "scheduling"),
    (r"\bcall me\b", "scheduling"),
    (r"\bdm me\b", "scheduling"),
    (r"\bsend (?:over )?(?:the )?(?:contract|agreement)\b", "contract request"),
    (r"\bsend it over\b", "details request"),
    (r"\bexcited\b", "enthusiasm"),
)

# Non-committal interest. Useful, but not approval and not consent to publish.
_SOFT_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bmaybe\b", "maybe"),
    (r"\bperhaps\b", "maybe"),
    (r"\bnot\s+(?:right\s+)?now\b", "deferred"),
    (r"\bnot yet\b", "deferred"),
    (r"\blater\b", "deferred"),
    (r"\bnext\s+(?:quarter|month|year|week)\b", "deferred"),
    (r"\bcircle back\b", "follow up later"),
    (r"\bfollow up\b", "follow up later"),
    (r"\bsend\s+(?:me\s+)?(?:more\s+)?(?:info|details|information)\b", "wants details"),
    (r"\bmore details\b", "wants details"),
    (r"\btell me more\b", "wants details"),
    (r"\bcan you (?:send|share)\b", "wants details"),
    (r"\bcurious\b", "curious"),
    (r"\bsounds interesting\b", "curious"),
    (r"\bopen to\b", "open"),
    (r"\bpossibly\b", "maybe"),
    (r"\bnot sure\b", "uncertain"),
    (r"\bneed to (?:think|check|talk)\b", "needs time"),
    (r"\btalk to (?:my|our) (?:team|manager|partner)\b", "needs approval"),
    (r"\bhow much\b", "pricing question"),
    (r"\bpricing\b", "pricing question"),
    (r"\bbudget\b", "pricing question"),
    (r"\bwhat would (?:that|this) look like\b", "wants details"),
    (r"\bwould love\b", "enthusiasm"),
)


def _match_any(text: str, patterns: tuple[tuple[str, str], ...]) -> list[str]:
    matched: list[str] = []
    for pattern, label in patterns:
        if re.search(pattern, text, flags=re.IGNORECASE):
            matched.append(label)
    return matched


def classify_reply_detail(text: str) -> ReplyDetail:
    normalized = " ".join((text or "").split())
    if not normalized:
        return ReplyDetail(
            label=NEGATIVE,
            confidence=0.65,
            reason="Empty reply; no consent can be inferred.",
        )

    negative = _match_any(normalized, _NEGATIVE_PATTERNS)
    if negative:
        return ReplyDetail(
            label=NEGATIVE,
            confidence=0.97,
            matched=negative,
            reason="Explicit refusal or opt-out language.",
        )

    positive = _match_any(normalized, _POSITIVE_PATTERNS)
    soft = _match_any(normalized, _SOFT_PATTERNS)
    if positive:
        deferrals = {
            "maybe",
            "deferred",
            "uncertain",
            "needs time",
            "needs approval",
            "follow up later",
        }
        if deferrals.intersection(soft):
            return ReplyDetail(
                label=SOFT_POSITIVE,
                confidence=0.72,
                matched=positive + soft,
                reason="Affirmative language is qualified by a deferral; needs a human follow-up.",
            )
        return ReplyDetail(
            label=POSITIVE,
            confidence=0.9,
            matched=positive,
            reason="Clear affirmative language.",
        )

    if soft:
        return ReplyDetail(
            label=SOFT_POSITIVE,
            confidence=0.75,
            matched=soft,
            reason="Interest without commitment; needs a human follow-up.",
        )

    return ReplyDetail(
        label=NEGATIVE,
        confidence=0.55,
        matched=[],
        reason="No clear affirmative signal; consent is not assumed.",
    )


def classify_reply(text: str) -> str:
    """Return exactly POSITIVE, SOFT_POSITIVE or NEGATIVE."""
    return classify_reply_detail(text).label


def reply_action(classification: str) -> dict[str, Any]:
    """Map a reply class to one concrete Stage-1 workflow action (pure).

    Week 1-2 still requires a human approval step before any external send.
    """
    if classification == POSITIVE:
        return {"status": "SHORTLISTED-Hot", "notify_human": True, "draft_reply": "calendly_link"}
    if classification == SOFT_POSITIVE:
        return {"status": "Nurture", "notify_human": False, "send": "product_one_pager"}
    if classification == NEGATIVE:
        return {"status": "Do Not Contact", "notify_human": True, "unsubscribe": True}
    if classification == NO_RESPONSE:
        return {"status": "Cold", "retarget_days": 60}
    return {"status": "Needs Human Review", "notify_human": True}
