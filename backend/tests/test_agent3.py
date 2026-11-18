from __future__ import annotations

import pytest

from app.agents.agent3 import (
    MAX_WORDS,
    MIN_WORDS,
    build_toc,
    validate_toc,
)
from app.config import NICHES


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
