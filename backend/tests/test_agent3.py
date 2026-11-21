from __future__ import annotations

import json
from typing import Any, Mapping

import pytest

from app.agents.agent3 import (
    MAX_COMMENTS,
    MAX_POSTS,
    MAX_WORDS,
    MIN_COMMENTS,
    MIN_POSTS,
    MIN_WORDS,
    REQUIRED_SECTIONS,
    analyze_research,
    build_draft,
    build_toc,
    export_google_doc,
    export_pdf,
    generate_concepts,
    pick_concept,
    quality_gate,
    validate_draft,
    validate_toc,
)
from app.config import NICHES


# ---------------------------------------------------------------------------
# Existing TOC contract (kept intact by the Product Architect work)
# ---------------------------------------------------------------------------


def test_all_locked_niches_generate_a_valid_toc() -> None:
    assert set(NICHES) == {
        "Sports",
        "Home",
        "Finance",
        "Parenting",
        "AI Tools for Small Business",
        "Faith & Mindset",
    }
    for niche in NICHES:
        toc = build_toc(niche, f"{niche} Field Guide")
        assert validate_toc(toc) is True
        assert toc["niche"] == niche
        assert MIN_WORDS <= toc["target_words"] <= MAX_WORDS
        assert sum(chapter["word_target"] for chapter in toc["chapters"]) == toc["target_words"]
        assert len({chapter["title"].lower() for chapter in toc["chapters"]}) == len(
            toc["chapters"]
        )
        assert all(len(chapter["sections"]) >= 3 for chapter in toc["chapters"])


@pytest.mark.parametrize("target", [MIN_WORDS, 7_000, MAX_WORDS])
def test_target_word_bounds(target: int) -> None:
    toc = build_toc("Sports", "Playbook", target_words=target)
    assert toc["total_word_target"] == target
    assert validate_toc(toc)


@pytest.mark.parametrize("target", [MIN_WORDS - 1, MAX_WORDS + 1, 0])
def test_out_of_range_word_targets_are_rejected(target: int) -> None:
    with pytest.raises(ValueError):
        build_toc("Finance", "Playbook", target_words=target)


def test_unsupported_niche_is_rejected() -> None:
    with pytest.raises(ValueError):
        build_toc("Crypto", "Playbook")


def test_tampered_outlines_fail_validation() -> None:
    toc = build_toc("Home", "Room Reset")
    bad_sum = {**toc, "chapters": [dict(chapter) for chapter in toc["chapters"]]}
    bad_sum["chapters"][0] = {**bad_sum["chapters"][0], "word_target": 1}
    with pytest.raises(ValueError):
        validate_toc(bad_sum)

    short = {**toc, "chapters": toc["chapters"][:4]}
    with pytest.raises(ValueError):
        validate_toc(short)

    duplicated = {**toc, "chapters": [dict(chapter) for chapter in toc["chapters"]]}
    duplicated["chapters"][1] = {**duplicated["chapters"][1], "title": toc["chapters"][0]["title"]}
    with pytest.raises(ValueError):
        validate_toc(duplicated)


# ---------------------------------------------------------------------------
# Phase A/B/C fixtures and tests
# ---------------------------------------------------------------------------


def make_research(
    *,
    posts: int = 50,
    comments: int = 500,
    creator_name: str = "AveryStone",
    angle: str | None = "No-BS",
    **overrides: Any,
) -> dict[str, Any]:
    """Supplied research only: 100 repeated comments per theme, no fabricated quotes."""
    research_posts = [
        {
            "id": f"p{index}",
            "caption": "A plain caption about ordinary routines.",
            "hook": "A useful hook",
            "format": "Reel",
            "cta": "Follow for more",
        }
        for index in range(posts)
    ]
    research_comments = []
    for index in range(comments):
        if index < 100:
            text = "How do I stay consistent with my routine?"
            if index == 0:
                text = f"  {text}  "  # verbatim whitespace must survive
        elif index < 200:
            text = "I struggle with meal planning every week."
        elif index < 300:
            text = "I wish I had ready templates."
        else:
            text = "How?"
        research_comments.append({"id": f"c{index}", "text": text, "likes": index % 5})

    payload: dict[str, Any] = {
        "posts": research_posts,
        "comments": research_comments,
        "creator_name": creator_name,
        "audience_angle": angle,
        "creator_phrases": ["Show the messy middle."],
        "creator_examples": ["My own week looked like this."],
        "claim_sources": [{"id": "source-1", "detail": "Creator-supplied research note"}],
        "claims": [{"text": "Avery uses a weekly review.", "source_id": "source-1"}],
    }
    payload.update(overrides)
    return payload


def _selected_draft(research: dict[str, Any], concept_id: str = "concept-1") -> dict[str, Any]:
    analysis = analyze_research(research)
    generated = generate_concepts(analysis)
    picked = pick_concept(generated, concept_id)
    assert picked["awaiting_human_pick"] is False
    draft = build_draft(picked["selected_concept"], analysis)
    assert validate_draft(draft, draft["price"]) is True
    return draft


def _with_actual_words(draft: dict[str, Any], total: int) -> dict[str, Any]:
    """Set the real body length while leaving the target label unchanged."""
    updated = dict(draft)
    sections = [dict(section) for section in draft["sections"]]
    first_words = max(total - (len(sections) - 1), 1)
    sections[0]["body"] = " ".join(["word"] * first_words)
    for section in sections[1:]:
        section["body"] = "word"
    updated["sections"] = sections
    updated["actual_word_count"] = total
    return updated


def test_research_caps_and_partial_status() -> None:
    complete = analyze_research(make_research())
    assert complete["research_complete"] is True
    assert complete["status"] == "complete"
    assert complete["posts_supplied"] == MIN_POSTS
    assert complete["comments_supplied"] == MIN_COMMENTS

    partial = analyze_research(make_research(posts=49, comments=499))
    assert partial["research_complete"] is False
    assert partial["status"] == "PARTIAL"

    capped = analyze_research(make_research(posts=60, comments=520))
    assert capped["research_complete"] is True
    assert capped["posts_supplied"] == 60
    assert capped["posts_used"] == MAX_POSTS
    assert capped["comments_supplied"] == 520
    assert capped["comments_used"] == MAX_COMMENTS
    assert capped["posts_capped"] is True
    assert capped["comments_capped"] is True


def test_clustering_counts_and_gap_analysis() -> None:
    analysis = analyze_research(make_research())
    themes = {theme["theme"]: theme for theme in analysis["themes"]}
    assert themes["meal planning"]["count"] == 100
    assert themes["meal planning"]["comment_count"] == 100
    assert themes["meal planning"]["post_count"] == 0
    assert themes["meal planning"]["cta_count"] == 0
    assert themes["meal planning"]["kind"] in {"question", "pain point", "desire", "theme"}

    gap_themes = {gap["theme"] for gap in analysis["gaps"]}
    assert "meal planning" in gap_themes
    assert "ready templates" in gap_themes

    ranked = [(theme["count"], len(theme["theme"].split()), theme["theme"]) for theme in analysis["themes"]]
    assert ranked == sorted(ranked, key=lambda item: (-item[0], -item[1], item[2]))


def test_angle_uses_explicit_input_or_conservative_evidence() -> None:
    explicit = analyze_research(make_research(angle="Faith-based"))
    assert explicit["audience_angle"] == "Faith-based"
    assert explicit["angle_evidence"] == ["explicit research input"]

    research = make_research(angle=None)
    research["comments"][0]["text"] = "I write a prayer every morning."
    research["comments"][1]["text"] = "Prayer helps me stay consistent."
    detected = analyze_research(research)
    assert detected["audience_angle"] == "Faith-based"

    with pytest.raises(ValueError):
        analyze_research(make_research(angle="Made-up angle"))


def test_concepts_are_exactly_three_with_valid_prices_and_chapters() -> None:
    generated = generate_concepts(analyze_research(make_research()))
    assert generated["count"] == 3
    assert generated["requires_human_pick"] is True
    assert generated["awaiting_human_pick"] is True
    for concept in generated["concepts"]:
        assert concept["price"] in {19, 29, 49, 97}
        assert 8 <= len(concept["table_of_contents"]) <= 12
        assert concept["title"]
        assert concept["promise"]
        assert len(concept["why_will_sell"]) == 3


def test_quotes_are_verbatim_supplied_comments_only() -> None:
    research = make_research()
    supplied_texts = {comment["text"] for comment in research["comments"]}
    concepts = generate_concepts(analyze_research(research))["concepts"]
    quotes = [quote for concept in concepts for quote in concept["why_will_sell"]]
    assert quotes
    for quote in quotes:
        assert quote["text"] in supplied_texts
        assert "comment_id" in quote
        assert "comment_index" in quote
    assert any(quote["text"].startswith("  How do I stay consistent") for quote in quotes)


def test_human_pick_is_required_and_never_defaulted() -> None:
    generated = generate_concepts(analyze_research(make_research()))
    unpicked = pick_concept(generated, None)
    assert unpicked["selected_concept"] is None
    assert unpicked["awaiting_human_pick"] is True
    assert unpicked["human_pick_required"] is True

    picked = pick_concept(generated, "concept-2")
    assert picked["chosen_id"] == "concept-2"
    assert picked["selected_concept"]["id"] == "concept-2"
    assert picked["awaiting_human_pick"] is False

    with pytest.raises(ValueError):
        pick_concept(generated, "not-a-concept")


@pytest.mark.parametrize(
    ("price", "target_label", "actual_words", "valid"),
    [
        (29, 4_500, 4_499, False),
        (29, 4_500, 4_500, True),
        (97, 10_000, 10_000, True),
        (97, 10_000, 10_001, False),
    ],
)
def test_word_count_validation_boundaries(
    price: int, target_label: int, actual_words: int, valid: bool
) -> None:
    draft = _with_actual_words(_selected_draft(make_research()), actual_words)
    draft["price"] = price
    draft["word_count"] = target_label
    if valid:
        assert validate_draft(draft, price) is True
    else:
        with pytest.raises(ValueError):
            validate_draft(draft, price)


def test_validate_rejects_short_outline_even_with_target_label() -> None:
    draft = _with_actual_words(_selected_draft(make_research()), 222)
    draft["price"] = 29
    draft["word_count"] = 4_500
    with pytest.raises(ValueError, match="actual prose"):
        validate_draft(draft, 29)


def test_required_section_order_and_generated_draft_contract() -> None:
    draft = _selected_draft(make_research())
    assert tuple(section["name"] for section in draft["sections"]) == REQUIRED_SECTIONS
    assert draft["creator_approved"] is False
    assert draft["publishing"] == "never_auto_published"
    assert "VistaBix" in draft["co_branding"]
    assert draft["creator_name"] in draft["co_branding"]

    reordered = {**draft, "sections": list(reversed(draft["sections"]))}
    with pytest.raises(ValueError):
        validate_draft(reordered, reordered["price"])

    missing = {**draft, "sections": draft["sections"][:-1]}
    with pytest.raises(ValueError):
        validate_draft(missing, missing["price"])


def test_illustrations_are_placeholders_with_placement() -> None:
    draft = _selected_draft(make_research())
    kinds = {item["type"] for item in draft["illustrations"]}
    assert kinds == {
        "checklist",
        "framework diagram",
        "before/after",
        "step-by-step infographic",
    }
    for item in draft["illustrations"]:
        assert item["status"] == "placeholder"
        assert item["section"] in REQUIRED_SECTIONS
        assert item["placement"]


def test_creator_phrases_are_passed_through_not_invented() -> None:
    research = make_research(creator_phrases=["Show the messy middle."])
    draft = _selected_draft(research)
    assert "Show the messy middle." in draft["markdown"]
    assert "creator-supplied" in draft["markdown"].lower()


def test_offline_writer_reaches_each_price_target() -> None:
    research = make_research()
    cases = (
        ("concept-1", None, 4_500),
        ("concept-2", None, 4_500),
        ("concept-3", None, 6_500),
        ("concept-3", 97, 10_000),
    )
    for concept_id, price_override, expected in cases:
        analysis = analyze_research(research)
        generated = generate_concepts(analysis)
        picked = pick_concept(generated, concept_id)
        concept = dict(picked["selected_concept"])
        if price_override is not None:
            concept["price"] = price_override
        draft = build_draft(concept, analysis)
        assert draft["word_count"] == expected
        assert draft["actual_word_count"] == expected
        assert MIN_WORDS <= draft["actual_word_count"] <= MAX_WORDS
        assert validate_draft(draft, concept["price"]) is True


def test_generated_prose_has_no_scaffolding_and_keeps_verbatim_quotes() -> None:
    research = make_research()
    draft = _selected_draft(research)
    bodies = " ".join(section["body"] for section in draft["sections"])
    for forbidden in (
        "Chapters to expand",
        "Insert the four approved illustration placeholders",
        "passed through verbatim",
    ):
        assert forbidden not in bodies

    analysis = analyze_research(research)
    concepts = generate_concepts(analysis)["concepts"]
    for concept in concepts:
        for quote in concept["why_will_sell"]:
            assert quote["text"] in bodies


def test_writer_adapter_is_used_and_its_output_validated() -> None:
    research = make_research()
    analysis = analyze_research(research)
    generated = generate_concepts(analysis)
    picked = pick_concept(generated, "concept-1")

    class ConfiguredWriter:
        def __init__(self) -> None:
            self.payload: dict[str, Any] | None = None

        def is_configured(self) -> bool:
            return True

        def expand(self, payload: Mapping[str, Any]) -> dict[str, Any]:
            self.payload = dict(payload)
            body = ("The supplied evidence supports this section. " * 117).strip()
            return {
                "sections": [
                    {"name": name, "body": body}
                    for name in REQUIRED_SECTIONS
                ]
            }

    writer = ConfiguredWriter()
    draft = build_draft(picked["selected_concept"], analysis, writer)
    assert writer.payload is not None
    for key in (
        "toc",
        "quotes",
        "creator_phrases",
        "creator_examples",
        "chapter_word_targets",
        "required_section_order",
    ):
        assert key in writer.payload
    assert writer.payload["required_section_order"] == REQUIRED_SECTIONS
    assert draft["actual_word_count"] > 4_500
    assert validate_draft(draft, draft["price"]) is True

    class ShortWriter(ConfiguredWriter):
        def expand(self, payload: Mapping[str, Any]) -> dict[str, Any]:
            return {
                "sections": [
                    {"name": name, "body": "Too short."}
                    for name in REQUIRED_SECTIONS
                ]
            }

    with pytest.raises(ValueError, match="Writer adapter produced"):
        build_draft(picked["selected_concept"], analysis, ShortWriter())


def test_no_creator_phrases_are_not_claimed_as_creator_voice() -> None:
    no_voice = _selected_draft(make_research(creator_phrases=[], creator_examples=[]))
    assert "No creator phrase was supplied" in no_voice["markdown"]


def test_exporters_are_blocked_without_configured_adapters() -> None:
    draft = _selected_draft(make_research())
    google = export_google_doc(draft)
    pdf = export_pdf(draft)
    assert google["status"] == "blocked"
    assert pdf["status"] == "blocked"
    assert google["fake_success"] is False
    assert pdf["fake_success"] is False
    assert "credentials" in google["reason"].lower()
    assert "credentials" in pdf["reason"].lower()

    class ConfiguredAdapter:
        def is_configured(self) -> bool:
            return True

        def create_google_doc(self, supplied: dict[str, Any]) -> dict[str, Any]:
            return {"document_url": "https://docs.example.invalid/d/1"}

        def create_pdf(self, supplied: dict[str, Any]) -> dict[str, Any]:
            return {"file_url": "https://files.example.invalid/draft.pdf"}

    assert export_google_doc(draft, ConfiguredAdapter())["status"] == "exported"
    assert export_pdf(draft, ConfiguredAdapter())["status"] == "exported"


def test_quality_gate_fails_closed_and_ands_all_gates() -> None:
    draft = _selected_draft(make_research())
    blocked = quality_gate(draft, make_research(), {"creator_approved": False})
    assert blocked["ready_to_publish"] is False
    assert blocked["gates"]["plagiarism_ai_detection"]["passed"] is False
    assert blocked["gates"]["plagiarism_ai_detection"]["status"] == "blocked"
    assert blocked["gates"]["creator_approval"]["passed"] is False
    assert blocked["publish_action"] == "none"

    class ExternalChecker:
        def is_configured(self) -> bool:
            return True

        def check(self, supplied: dict[str, Any]) -> dict[str, Any]:
            return {"passed": True, "evidence": {"provider": "external-checker"}}

    approved = {**draft, "checker_adapter": ExternalChecker()}
    ready = quality_gate(
        approved,
        make_research(),
        {"creator_approved": True, "approved_by": "AveryStone"},
    )
    assert ready["ready_to_publish"] is True
    assert all(gate["passed"] for gate in ready["gates"].values())
    assert ready["publish_action"] == "none"


def test_fact_check_flags_unverified_claims() -> None:
    research = make_research(
        claims=[
            {"text": "Supported claim", "source_id": "source-1"},
            {"text": "Unsupported claim", "source_id": "missing-source"},
        ]
    )
    draft = _selected_draft(research)
    result = quality_gate(
        draft,
        research,
        {"creator_approved": True, "approved_by": "AveryStone"},
    )
    fact_gate = result["gates"]["fact_check"]
    assert fact_gate["passed"] is False
    assert len(fact_gate["evidence"]["unverified_claims"]) == 1
    assert result["ready_to_publish"] is False


def test_generated_text_contains_no_legacy_brand() -> None:
    # Constructed from parts so the forbidden string is not written into this file.
    legacy_brand = "".join(("Part", "ner", "For", "ge"))
    research = make_research()
    analysis = analyze_research(research)
    concepts = generate_concepts(analysis)
    draft = _selected_draft(research)
    generated = json.dumps(
        {"analysis": analysis, "concepts": concepts, "draft": draft},
        default=str,
    ).lower()
    assert legacy_brand.lower() not in generated
    assert "vistabix" in generated


def test_architect_endpoints_are_narrow_and_gated(api: Any) -> None:
    client = api[0]
    research = make_research()

    researched = client.post("/api/architect/research", json=research)
    assert researched.status_code == 200, researched.text
    assert researched.json()["research_complete"] is True

    concepts = client.post("/api/architect/concepts", json={"research": research})
    assert concepts.status_code == 200, concepts.text
    assert concepts.json()["awaiting_human_pick"] is True

    unpicked = client.post("/api/architect/draft", json={"research": research})
    assert unpicked.status_code == 422, unpicked.text

    drafted = client.post(
        "/api/architect/draft", json={"research": research, "chosen_id": "concept-1"}
    )
    assert drafted.status_code == 200, drafted.text
    draft = drafted.json()["draft"]
    assert drafted.json()["publishing"] == "blocked"
    assert draft["creator_approved"] is False

    gated = client.post(
        "/api/architect/quality-gate",
        json={
            "draft": draft,
            "research": research,
            "approval": {"creator_approved": False},
        },
    )
    assert gated.status_code == 200, gated.text
    assert gated.json()["ready_to_publish"] is False
    assert gated.json()["publish_action"] == "none"
