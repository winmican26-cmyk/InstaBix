"""Agent 3 — deterministic product outline generator.

The outline targets 4,500–10,000 words of finished product. Chapter word
targets always add up to the requested target exactly, so downstream generation
has a real budget rather than a vague promise.

This is intentionally not an LLM call: the starter must produce a usable,
auditable outline with no API key. The niche profiles below are the editorial
source of truth and can be versioned like prompt templates.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from app.config import NICHES

MIN_WORDS = 4_500
MAX_WORDS = 10_000
DEFAULT_WORDS = 7_000
OUTLINE_VERSION = "vistabix-toc-v1"
MIN_CHAPTERS = 8


@dataclass(frozen=True)
class ChapterSeed:
    title: str
    summary: str
    sections: tuple[str, str, str]
    outcome: str


@dataclass(frozen=True)
class NicheProfile:
    audience: str
    promise: str
    angle: str
    chapters: tuple[ChapterSeed, ...]


NICHE_PROFILES: dict[str, NicheProfile] = {
    "Sports": NicheProfile(
        audience="committed amateur athletes and fans who want to train with a plan",
        promise="a realistic training system that fits a working life",
        angle="performance built on fundamentals, recovery and consistency",
        chapters=(
            ChapterSeed(
                "Pick the Lane You Can Own",
                "Choose one sport, one level and one outcome so the plan has an edge.",
                (
                    "The cost of training for everything",
                    "A one-page athlete positioning statement",
                    "Choose your 12-week priority",
                ),
                "The reader can name the single performance goal the next 12 weeks serve.",
            ),
            ChapterSeed(
                "Know the Person Behind the Jersey",
                "Map current fitness, schedule, injury history and support before writing a plan.",
                (
                    "The five-part baseline audit",
                    "Honest capacity versus wishful capacity",
                    "Set guardrails for sleep, work and travel",
                ),
                "The reader has a written baseline and knows which constraints are non-negotiable.",
            ),
            ChapterSeed(
                "The 12-Week Training Blueprint",
                "Build a week that alternates stress and recovery instead of chasing daily fatigue.",
                (
                    "Three anchor sessions and their purpose",
                    "How to progress load without breaking down",
                    "A deload week that is actually a deload",
                ),
                "The reader can run a repeatable week and explain why each session exists.",
            ),
            ChapterSeed(
                "Technique Before Volume",
                "Use movement quality as the gate for adding reps, weight or speed.",
                (
                    "The four technique checkpoints",
                    "Video feedback without over-analysis",
                    "When to stop a set early",
                ),
                "The reader can self-assess technique and make a conservative progression call.",
            ),
            ChapterSeed(
                "Fuel, Sleep and Recovery",
                "Treat recovery as part of training, not a reward for finishing it.",
                (
                    "A simple plate and hydration framework",
                    "Sleep routines for early and late schedules",
                    "Recovery signals worth tracking",
                ),
                "The reader has a recovery routine that survives a busy week.",
            ),
            ChapterSeed(
                "Building the Mental Game",
                "Prepare for the moments when the plan feels boring, painful or slow.",
                (
                    "Process goals versus outcome goals",
                    "A pre-session reset routine",
                    "Handling a bad performance without abandoning the plan",
                ),
                "The reader can reset after a setback and return to the next session.",
            ),
            ChapterSeed(
                "Track Progress Without Obsession",
                "Choose a small set of measures that answer whether the plan is working.",
                (
                    "Leading and lagging indicators",
                    "A weekly five-minute review",
                    "When the data says change the plan",
                ),
                "The reader can run a weekly review and make one evidence-based adjustment.",
            ),
            ChapterSeed(
                "The Home Setup That Gets Used",
                "Spend on the few pieces of equipment that remove friction.",
                (
                    "The minimum viable training space",
                    "Buying used without buying junk",
                    "Storage and setup habits",
                ),
                "The reader has a training space they can use in under five minutes.",
            ),
            ChapterSeed(
                "Consistency When Life Interferes",
                "Design fallback sessions for travel, illness and heavy work weeks.",
                (
                    "The 20-minute minimum session",
                    "Travel and hotel-room options",
                    "Returning after illness or a missed block",
                ),
                "The reader has a written fallback plan for the three most likely disruptions.",
            ),
            ChapterSeed(
                "Your First 30 Days and What Comes Next",
                "Turn the blueprint into a dated first month and a review point.",
                (
                    "Week-by-week first-month calendar",
                    "The first progress review",
                    "Choosing the next 12-week block",
                ),
                "The reader can start tomorrow and knows the date of their first review.",
            ),
        ),
    ),
    "Home": NicheProfile(
        audience="busy households that want a calmer, more functional home",
        promise="a home system that is easier to maintain than to reset",
        angle="fewer decisions, better zones and routines that survive real life",
        chapters=(
            ChapterSeed(
                "Define the Home You Actually Live In",
                "Start with how the household uses each room, not with a catalogue photo.",
                (
                    "The room-by-room lifestyle audit",
                    "Name the job of every room",
                    "Choose three problems worth solving first",
                ),
                "The reader can describe what each room must do for the household.",
            ),
            ChapterSeed(
                "The 30-Minute Room Reset",
                "Use one repeatable reset sequence instead of an all-day clean.",
                (
                    "Clear, group, clean, return",
                    "The five-item emergency reset",
                    "A reset kit for each floor",
                ),
                "The reader can reset a shared room in half an hour without a planning session.",
            ),
            ChapterSeed(
                "Declutter Without Regret",
                "Make keep-or-go decisions with rules instead of mood.",
                (
                    "The four-question decision tree",
                    "Sentimental items and the memory box",
                    "Where discards actually go",
                ),
                "The reader can clear one category without stalling or second-guessing.",
            ),
            ChapterSeed(
                "Storage That Survives Real Life",
                "Put storage where the item is used, and make the return path obvious.",
                (
                    "Zones, landing spots and drop points",
                    "Containers that fit the shelf",
                    "Labels the whole household understands",
                ),
                "The reader has a storage plan for the three busiest zones in the home.",
            ),
            ChapterSeed(
                "A Cleaning Rhythm, Not a Marathon",
                "Split cleaning into daily, weekly and seasonal layers.",
                (
                    "The 10-minute daily list",
                    "A weekly room rotation",
                    "Seasonal jobs worth scheduling",
                ),
                "The reader has a cleaning calendar they can keep for a month.",
            ),
            ChapterSeed(
                "Make Small Rooms Feel Bigger",
                "Use layout, light and colour to reduce visual weight.",
                (
                    "Traffic paths and furniture scale",
                    "Light layers for day and night",
                    "Colour and contrast without repainting everything",
                ),
                "The reader can choose one layout and one light change for a small room.",
            ),
            ChapterSeed(
                "Repairs, Renting and Who Pays",
                "Separate quick fixes from jobs that need a professional or a landlord.",
                (
                    "The renter's repair request script",
                    "Five safe fixes and five jobs to escalate",
                    "A home maintenance calendar",
                ),
                "The reader knows which repairs to attempt and how to document the rest.",
            ),
            ChapterSeed(
                "Kid-, Pet- and Guest-Ready Spaces",
                "Design shared spaces for the people and animals who actually use them.",
                (
                    "Low-friction entry and exit",
                    "Washable, reachable and safe",
                    "Guest space in a small home",
                ),
                "The reader has one practical change for each member of the household.",
            ),
            ChapterSeed(
                "Budget Makeovers That Look Expensive",
                "Spend on impact: light, hardware, textiles and paint.",
                (
                    "The high-impact spend list",
                    "What not to cheap out on",
                    "A room refresh under a fixed budget",
                ),
                "The reader can plan a refresh with a cap and a prioritised shopping list.",
            ),
            ChapterSeed(
                "Your 30-Day Home Reset",
                "Sequence the work so momentum builds instead of overwhelm.",
                (
                    "Week-by-week reset plan",
                    "The household kick-off conversation",
                    "The 30-day review and maintenance handoff",
                ),
                "The reader has a dated plan and a shared definition of done.",
            ),
        ),
    ),
    "Finance": NicheProfile(
        audience="working adults who want a stable money system without jargon",
        promise="a clear cash-flow and saving plan that survives an imperfect month",
        angle="boring, repeatable decisions instead of hot tips",
        chapters=(
            ChapterSeed(
                "Money Rules That Match Your Real Life",
                "Agree on the values and trade-offs before optimising percentages.",
                (
                    "What money is for in your household",
                    "Three non-negotiables and three flexibilities",
                    "A one-page money agreement",
                ),
                "The reader has written priorities to guide the next four chapters.",
            ),
            ChapterSeed(
                "See Every Dollar: The 20-Minute Money Map",
                "Build a current picture from statements, not from memory.",
                (
                    "Accounts, debts and recurring charges",
                    "The spending categories that matter",
                    "A 20-minute monthly update",
                ),
                "The reader has a complete starting map and a repeatable update habit.",
            ),
            ChapterSeed(
                "Build the Buffer Before the Bet",
                "Set a starter emergency fund before taking on investing risk.",
                (
                    "How much buffer is enough to start",
                    "Where to keep it",
                    "Refilling after a withdrawal",
                ),
                "The reader has a buffer target and an automatic route to reach it.",
            ),
            ChapterSeed(
                "Debt: Order, Interest and Momentum",
                "Choose an order that balances maths with the motivation to continue.",
                (
                    "Listing every balance and rate",
                    "Avalanche, snowball and a hybrid",
                    "Negotiation and hardship scripts",
                ),
                "The reader has a debt order and one next payment to make.",
            ),
            ChapterSeed(
                "Spending Plans That Survive the Month",
                "Budget for irregular costs and human life, not a perfect four weeks.",
                (
                    "Fixed, flexible and sinking funds",
                    "A weekly check-in that takes ten minutes",
                    "What to do when the plan breaks",
                ),
                "The reader can build a monthly plan with a buffer for irregular costs.",
            ),
            ChapterSeed(
                "Saving Without White-Knuckle Discipline",
                "Automate the decision and remove the monthly negotiation.",
                (
                    "Pay-yourself-first mechanics",
                    "Separate accounts and named goals",
                    "Raising the amount without a raise",
                ),
                "The reader has at least one automatic transfer tied to a named goal.",
            ),
            ChapterSeed(
                "Investing Basics Without the Hype",
                "Understand risk, time horizon and fees before choosing a product.",
                (
                    "Risk and time horizon",
                    "Diversification in plain language",
                    "Fees, platforms and fraud checks",
                ),
                "The reader can explain their investing approach and spot a bad pitch.",
            ),
            ChapterSeed(
                "Big Decisions: Home, Car, Career",
                "Compare the total cost and the life cost, not just the monthly payment.",
                (
                    "Total cost of ownership",
                    "Stress-testing a payment",
                    "When to wait and what to prepare",
                ),
                "The reader has a decision template for the next large commitment.",
            ),
            ChapterSeed(
                "Insurance, Taxes and the Boring Safety Net",
                "Cover the risks that would undo the plan.",
                (
                    "The policies worth reviewing",
                    "Tax admin for irregular income",
                    "Documents and who knows where they are",
                ),
                "The reader has a short list of cover and admin gaps to close.",
            ),
            ChapterSeed(
                "Your 90-Day Money Reset",
                "Sequence the first three months so the system is running by day 90.",
                (
                    "Month one: map and buffer",
                    "Month two: debt and automation",
                    "Month three: review and raise the bar",
                ),
                "The reader has a dated 90-day plan with one measurable finish line.",
            ),
        ),
    ),
    "Parenting": NicheProfile(
        audience="parents of young children who want fewer battles and more connection",
        promise="practical routines and scripts for calmer family days",
        angle="connection first, boundaries always, no shame",
        chapters=(
            ChapterSeed(
                "Choose the Parent You Want to Be",
                "Name the values that should show up even on a hard day.",
                (
                    "The behaviour you want to model",
                    "Your triggers and early warning signs",
                    "A repair ritual for after a rupture",
                ),
                "The reader can name two values and one repair phrase to use this week.",
            ),
            ChapterSeed(
                "Routines That Lower the Temperature",
                "Use predictable sequences for the transitions that go wrong most often.",
                (
                    "Morning, after-school and bedtime anchors",
                    "Visual schedules for younger children",
                    "When a routine needs simplifying",
                ),
                "The reader has one visual or spoken routine for the hardest transition.",
            ),
            ChapterSeed(
                "Connect Before You Correct",
                "Regulate and acknowledge before teaching the lesson.",
                (
                    "The 30-second connection habit",
                    "Scripts for big feelings",
                    "Repair when you get it wrong",
                ),
                "The reader can use a connection script before correcting behaviour.",
            ),
            ChapterSeed(
                "Boundaries Without Battles",
                "Hold a limit calmly while leaving room for the feeling.",
                (
                    "The difference between boundary and threat",
                    "Choices that are both real",
                    "Following through without escalating",
                ),
                "The reader has one boundary and a follow-through plan for this week.",
            ),
            ChapterSeed(
                "The Screen Plan Your Family Can Keep",
                "Agree on context, transitions and adult modelling before the next request.",
                (
                    "A family screen agreement",
                    "Transition warnings that work",
                    "What to do when the plan is broken",
                ),
                "The reader has a written screen plan the adults can actually enforce.",
            ),
            ChapterSeed(
                "Sleep, Food and the Basics That Drive Behaviour",
                "Check the boring inputs before treating the behaviour as a character problem.",
                (
                    "Sleep and wind-down basics",
                    "Food, hydration and timing",
                    "A basic needs checklist",
                ),
                "The reader can run a quick basics check before responding to a hard moment.",
            ),
            ChapterSeed(
                "Talking About Big Feelings",
                "Build the vocabulary and safety to name what is happening.",
                (
                    "Naming feelings without fixing them",
                    "Books, play and drawing as tools",
                    "When to seek extra support",
                ),
                "The reader has two age-appropriate ways to help a child name a feeling.",
            ),
            ChapterSeed(
                "School, Activities and the Over-Scheduled Child",
                "Protect unstructured time and choose activities with a clear reason.",
                (
                    "The weekly load audit",
                    "Saying no without guilt",
                    "Signs the schedule is too full",
                ),
                "The reader can remove or defer one commitment that is not serving the family.",
            ),
            ChapterSeed(
                "Partnering With Your Co-Parent",
                "Agree on the few rules that matter and present a united front.",
                (
                    "The weekly ten-minute handover",
                    "Dividing invisible labour",
                    "Disagreeing privately",
                ),
                "The reader has a shared plan for one recurring friction point.",
            ),
            ChapterSeed(
                "Your 30-Day Calmer Home Plan",
                "Pick one routine, one script and one repair habit to practise.",
                (
                    "Week-by-week practice plan",
                    "Tracking what changed",
                    "Reviewing without judging yourself",
                ),
                "The reader has a four-week practice plan with one thing to measure.",
            ),
        ),
    ),
    "AI Tools for Small Business": NicheProfile(
        audience="small-business owners and small teams who need leverage without enterprise overhead",
        promise="a safe, useful AI workflow that saves hours on real business tasks",
        angle="one audited workflow at a time, human review before anything ships",
        chapters=(
            ChapterSeed(
                "Find the Hours AI Should Give Back",
                "Audit recurring work before buying another tool.",
                (
                    "The time-leak inventory",
                    "Scoring tasks by frequency and risk",
                    "Choosing the first workflow",
                ),
                "The reader has a ranked list and knows the first task to test.",
            ),
            ChapterSeed(
                "The Small-Business AI Stack",
                "Choose the smallest set of tools that covers writing, operations and support.",
                (
                    "Core categories and what they are for",
                    "Buying criteria and data terms",
                    "What you can run without paying",
                ),
                "The reader has a short stack with a cost ceiling and a data policy.",
            ),
            ChapterSeed(
                "Write a Prompt That Produces Usable Work",
                "Give context, constraints, examples and a definition of done.",
                (
                    "The five-part prompt frame",
                    "Reusable templates for common tasks",
                    "Testing and comparing outputs",
                ),
                "The reader can write and test a reusable prompt for one recurring task.",
            ),
            ChapterSeed(
                "Customer Replies, Proposals and Follow-Ups",
                "Speed up sales admin without sounding like a robot or inventing facts.",
                (
                    "A reply drafting workflow with human review",
                    "Proposal skeletons and scope language",
                    "Follow-up sequences that respect opt-outs",
                ),
                "The reader has a reviewed template for one customer communication.",
            ),
            ChapterSeed(
                "Content and Marketing Without the Blank Page",
                "Turn real expertise into drafts while keeping claims accurate.",
                (
                    "Source material and content pillars",
                    "A draft-review-publish loop",
                    "Claims, testimonials and disclosure checks",
                ),
                "The reader can produce one on-brand draft from their own source material.",
            ),
            ChapterSeed(
                "Automate the Repetitive Back Office",
                "Connect tools only after the manual process is documented and stable.",
                (
                    "Mapping the manual workflow",
                    "Where automation saves real time",
                    "Failure alerts and a manual fallback",
                ),
                "The reader has a documented workflow and one safe automation candidate.",
            ),
            ChapterSeed(
                "Keep Customer Data Safe",
                "Decide what may enter a tool before the first customer record does.",
                (
                    "Data classification for a small team",
                    "Vendor and retention questions",
                    "A one-page AI use policy",
                ),
                "The reader has a written rule for what data is allowed in AI tools.",
            ),
            ChapterSeed(
                "Check AI Work Before It Ships",
                "Treat every output as a draft from a fast, confident intern.",
                (
                    "The four-point review checklist",
                    "Fact, quote and number verification",
                    "Logging corrections for next time",
                ),
                "The reader can review an AI draft against a repeatable checklist.",
            ),
            ChapterSeed(
                "Train Your Team Without a Course",
                "Turn one good workflow into a short, repeatable internal guide.",
                (
                    "The one-page SOP format",
                    "A 30-minute team walkthrough",
                    "Collecting failures and improving the prompt",
                ),
                "The reader has a one-page SOP for the first workflow.",
            ),
            ChapterSeed(
                "Your 30-Day AI Pilot",
                "Run one workflow for four weeks and measure whether it earned its place.",
                (
                    "Week-by-week pilot plan",
                    "Baseline and success measures",
                    "Scale, revise or stop",
                ),
                "The reader has a dated pilot with a go/no-go review.",
            ),
        ),
    ),
    "Faith & Mindset": NicheProfile(
        audience="people who want a grounded spiritual and mental rhythm for ordinary days",
        promise="a gentle, repeatable practice that holds up when life is noisy",
        angle="honest reflection, small faithful steps and no performance",
        chapters=(
            ChapterSeed(
                "Start With What You Actually Believe",
                "Name the convictions and questions you are bringing to this season.",
                (
                    "A honest beliefs inventory",
                    "Values versus shoulds",
                    "Choosing one practice to begin",
                ),
                "The reader has a short, honest starting point for the next 30 days.",
            ),
            ChapterSeed(
                "A Morning That Anchors the Day",
                "Build a morning rhythm that works on ordinary and difficult days.",
                (
                    "The ten-minute anchor",
                    "Silence, scripture or journaling",
                    "A travel and emergency version",
                ),
                "The reader has a morning practice they can complete in ten minutes.",
            ),
            ChapterSeed(
                "Prayer, Journaling and Reflection That Stick",
                "Use simple structures so reflection does not become another task to fail.",
                (
                    "Three prayer postures",
                    "A one-page journal format",
                    "When words will not come",
                ),
                "The reader can sit down and begin without deciding how to begin.",
            ),
            ChapterSeed(
                "Renewing the Mind When Thoughts Loop",
                "Notice, name and redirect recurring thoughts without pretending they are gone.",
                (
                    "The thought loop map",
                    "Truth, evidence and next action",
                    "When to ask for outside help",
                ),
                "The reader has one redirect phrase and one person to call when stuck.",
            ),
            ChapterSeed(
                "Boundaries, Service and Saying No",
                "Serve from a full heart instead of an empty tank.",
                (
                    "Capacity and calling",
                    "A kind no without a long story",
                    "Serving without rescuing",
                ),
                "The reader can decline one request and offer one clear alternative.",
            ),
            ChapterSeed(
                "Gratitude Without Pretending",
                "Practise gratitude without minimising real pain.",
                (
                    "Lament and gratitude together",
                    "A nightly three-line practice",
                    "Gratitude that leads to action",
                ),
                "The reader has a gratitude practice honest enough to use on a hard day.",
            ),
            ChapterSeed(
                "Walking Through Doubt and Dry Seasons",
                "Stay present to the questions instead of rushing to a tidy answer.",
                (
                    "Naming doubt without shame",
                    "What to do when prayer feels flat",
                    "Wisdom for waiting",
                ),
                "The reader has a plan for a dry season that does not require pretending.",
            ),
            ChapterSeed(
                "Community, Accountability and Wise Counsel",
                "Choose a small circle that can tell you the truth with love.",
                (
                    "The three kinds of support",
                    "Questions to ask a mentor",
                    "Being the friend you need",
                ),
                "The reader can name one person to invite into the next 30 days.",
            ),
            ChapterSeed(
                "Rest, Sabbath and Sustainable Rhythms",
                "Build rest into the week before exhaustion forces it.",
                (
                    "What rest actually restores you",
                    "A realistic Sabbath block",
                    "Protecting rest from urgency",
                ),
                "The reader has a weekly rest block they can defend.",
            ),
            ChapterSeed(
                "Your 30-Day Reset",
                "Choose one anchor, one reflection and one act of service for four weeks.",
                (
                    "Week-by-week practice plan",
                    "A simple review at day 14",
                    "Continuing after day 30",
                ),
                "The reader has a dated plan and a way to continue without starting over.",
            ),
        ),
    ),
}


class TocValidationError(ValueError):
    pass


def normalize_niche(niche: str) -> str:
    cleaned = " ".join((niche or "").split())
    if cleaned not in NICHE_PROFILES:
        raise ValueError(f"Niche '{cleaned}' is not supported. Choose one of: {', '.join(NICHES)}.")
    return cleaned


def build_toc(
    niche: str,
    title: str,
    *,
    target_words: int = DEFAULT_WORDS,
    audience: str | None = None,
) -> dict[str, Any]:
    """Build a complete outline whose chapter targets sum to target_words."""
    profile = NICHE_PROFILES[normalize_niche(niche)]
    cleaned_title = " ".join((title or "").split())
    if not cleaned_title:
        raise ValueError("A product title is required.")
    if not isinstance(target_words, int) or isinstance(target_words, bool):
        raise ValueError("target_words must be an integer.")
    if not MIN_WORDS <= target_words <= MAX_WORDS:
        raise ValueError(f"target_words must be between {MIN_WORDS} and {MAX_WORDS}.")

    chapter_count = len(profile.chapters)
    base, remainder = divmod(target_words, chapter_count)
    chapters: list[dict[str, Any]] = []
    for index, seed in enumerate(profile.chapters):
        word_target = base + (1 if index < remainder else 0)
        chapters.append(
            {
                "number": index + 1,
                "title": seed.title,
                "summary": seed.summary,
                "sections": list(seed.sections),
                "outcome": seed.outcome,
                "word_target": word_target,
            }
        )

    toc = {
        "title": cleaned_title,
        "niche": niche,
        "audience": audience or profile.audience,
        "promise": profile.promise,
        "angle": profile.angle,
        "target_words": target_words,
        "min_words": MIN_WORDS,
        "max_words": MAX_WORDS,
        "total_word_target": sum(chapter["word_target"] for chapter in chapters),
        "chapters": chapters,
        "generated_by": OUTLINE_VERSION,
    }
    validate_toc(toc)
    return toc


def validate_toc(toc: dict[str, Any]) -> bool:
    """Fail closed when an outline cannot support a 4,500–10,000 word product."""
    if not isinstance(toc, dict):
        raise TocValidationError("TOC must be an object.")
    target = toc.get("target_words")
    if not isinstance(target, int) or isinstance(target, bool):
        raise TocValidationError("TOC target_words must be an integer.")
    if not MIN_WORDS <= target <= MAX_WORDS:
        raise TocValidationError(f"TOC target_words must be between {MIN_WORDS} and {MAX_WORDS}.")

    chapters = toc.get("chapters")
    if not isinstance(chapters, list) or len(chapters) < MIN_CHAPTERS:
        raise TocValidationError(f"TOC needs at least {MIN_CHAPTERS} chapters.")
    if len(chapters) > 40:
        raise TocValidationError("TOC has too many chapters for a single product.")

    total = 0
    seen_titles: set[str] = set()
    for index, chapter in enumerate(chapters, start=1):
        if not isinstance(chapter, dict):
            raise TocValidationError(f"Chapter {index} must be an object.")
        title = chapter.get("title")
        if not isinstance(title, str) or not title.strip():
            raise TocValidationError(f"Chapter {index} needs a title.")
        normalized_title = title.strip().lower()
        if normalized_title in seen_titles:
            raise TocValidationError(f"Chapter title '{title}' is duplicated.")
        seen_titles.add(normalized_title)

        word_target = chapter.get("word_target")
        if not isinstance(word_target, int) or isinstance(word_target, bool) or word_target <= 0:
            raise TocValidationError(f"Chapter {index} needs a positive word_target.")
        total += word_target

        sections = chapter.get("sections")
        if not isinstance(sections, list) or len(sections) < 3:
            raise TocValidationError(f"Chapter {index} needs at least three sections.")
        if not all(isinstance(section, str) and section.strip() for section in sections):
            raise TocValidationError(f"Chapter {index} has an empty section title.")

    if total != target:
        raise TocValidationError(f"Chapter word targets sum to {total}, not {target}.")
    if toc.get("total_word_target") != target:
        raise TocValidationError("TOC total_word_target must equal target_words.")
    return True


# ---------------------------------------------------------------------------
# Agent 3 — Product Architect (Phase A/B/C + quality gates)
#
# Every function in this section is pure. Research is supplied by the caller:
# there is no scraping, no unofficial endpoint and no invented audience data.
# Adapters are injected by the caller and fail closed when unconfigured.
# ---------------------------------------------------------------------------

MAX_POSTS = 50
MAX_COMMENTS = 500
MIN_POSTS = MAX_POSTS
MIN_COMMENTS = MAX_COMMENTS
ALLOWED_PRICES = (19, 29, 49, 97)
PRICE_WORD_TARGETS = {19: MIN_WORDS, 29: MIN_WORDS, 49: 6_500, 97: MAX_WORDS}
CONCEPT_PRICES = (19, 29, 49)
REQUIRED_SECTIONS: tuple[str, ...] = (
    "Intro",
    "Problem",
    "Framework (Creator's Method)",
    "Step-by-Step Playbook",
    "Templates/Checklists",
    "FAQ (from real comments)",
    "Next Steps",
)
AUDIENCE_ANGLES: tuple[str, ...] = (
    "No-BS",
    "Faith-based",
    "Luxury on a budget",
    "Beginner-friendly",
)
ANGLE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "No-BS": ("no bs", "no fluff", "straight talk", "no sugarcoat", "brutally honest"),
    "Faith-based": ("faith", "prayer", "scripture", "bible", "church"),
    "Luxury on a budget": (
        "luxury on a budget",
        "affordable luxury",
        "high end on a budget",
        "budget friendly luxury",
        "dupe",
    ),
    "Beginner-friendly": (
        "beginner",
        "start here",
        "new to this",
        "step by step",
        "absolute beginner",
    ),
}
STOPWORDS = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do",
        "does", "for", "from", "get", "had", "has", "have", "how", "i", "if",
        "in", "is", "it", "me", "my", "of", "on", "or", "our", "so", "that",
        "the", "their", "them", "then", "there", "this", "to", "was", "we",
        "were", "what", "when", "where", "which", "who", "why", "will", "with",
        "you", "your", "just", "really", "please", "thanks", "thank", "love",
    }
)
QUESTION_MARKERS = ("?", "how", "what", "why", "when", "where", "which", "can")
PAIN_MARKERS = (
    "struggle", "stuck", "hard", "confus", "overwhelm", "problem", "fail",
    "cannot", "can't", "don't", "doesn't", "hate", "tired", "frustrat",
)
DESIRE_MARKERS = ("wish", "want", "hope", "dream", "need", "goal", "wanting")
KIND_ORDER = ("question", "pain point", "desire", "theme")
ILLUSTRATION_TYPES = ("checklist", "framework diagram", "before/after", "step-by-step infographic")


class DraftValidationError(ValueError):
    pass


def _as_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object.")
    return dict(value)


def _as_sequence(value: Any, label: str) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (str, bytes, Mapping)) or not isinstance(value, (list, tuple)):
        raise ValueError(f"{label} must be a list.")
    return list(value)


def _text(value: Any, label: str, *, required: bool = False) -> str:
    if value is None:
        if required:
            raise ValueError(f"{label} is required.")
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a string.")
    if required and not value.strip():
        raise ValueError(f"{label} cannot be blank.")
    return value


def _identifier(value: Any, fallback: str) -> str:
    if value is None:
        return fallback
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError("Source ids must be strings or integers.")
    cleaned = str(value).strip()
    return cleaned or fallback


def _likes(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError("Comment likes must be a non-negative integer.")
    return value


def _tokens(text: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]+", text.lower())
    return [token for token in raw if len(token) >= 2 and token not in STOPWORDS]


def _grams(tokens: list[str]) -> tuple[str, ...]:
    grams = set(tokens)
    grams.update(f"{left} {right}" for left, right in zip(tokens, tokens[1:]))
    return tuple(sorted(grams))


def _classify(text: str) -> str:
    lowered = text.lower()
    if any(marker in lowered for marker in QUESTION_MARKERS):
        return "question"
    if any(marker in lowered for marker in PAIN_MARKERS):
        return "pain point"
    if any(marker in lowered for marker in DESIRE_MARKERS):
        return "desire"
    return "theme"


def _specificity(theme: str) -> int:
    return 2 if " " in theme else 1


def _theme_sort_key(theme: str, hits: set[int]) -> tuple[Any, ...]:
    return (-len(hits), -_specificity(theme), theme)


def _detect_angle(posts: list[dict[str, Any]], comments: list[dict[str, Any]], explicit: Any) -> tuple[str, list[str]]:
    if explicit is not None and str(explicit).strip():
        name = " ".join(str(explicit).split())
        if name not in AUDIENCE_ANGLES:
            raise ValueError(f"audience_angle must be one of: {', '.join(AUDIENCE_ANGLES)}")
        return name, ["explicit research input"]

    sources: list[tuple[str, str]] = []
    for post in posts:
        sources.append(("post", " ".join(str(post.get(field, "")) for field in ("caption", "hook", "cta"))))
    for comment in comments:
        sources.append(("comment", str(comment.get("text", ""))))

    scores: dict[str, int] = {}
    evidence: dict[str, list[str]] = {}
    for angle, phrases in ANGLE_KEYWORDS.items():
        matched: list[str] = []
        for kind, text in sources:
            lowered = text.lower()
            if any(phrase in lowered for phrase in phrases):
                label = kind
                matched.append(label)
        scores[angle] = len(matched)
        evidence[angle] = matched
    best_score = max(scores.values(), default=0)
    if best_score < 2:
        return "Undetermined", []
    winners = [angle for angle, score in scores.items() if score == best_score]
    if len(winners) != 1:
        return "Undetermined", []
    winner = winners[0]
    return winner, evidence[winner]


def analyze_research(research: Mapping[str, Any]) -> dict[str, Any]:
    """Phase A: cap, cluster, rank and gap-check supplied research only."""
    payload = _as_mapping(research, "research")
    raw_posts = _as_sequence(payload.get("posts"), "posts")
    raw_comments = _as_sequence(payload.get("comments"), "comments")
    posts_supplied, comments_supplied = len(raw_posts), len(raw_comments)
    capped_posts = raw_posts[:MAX_POSTS]
    capped_comments = raw_comments[:MAX_COMMENTS]

    posts: list[dict[str, Any]] = []
    for index, raw in enumerate(capped_posts):
        post = _as_mapping(raw, f"posts[{index}]")
        post_id = _identifier(post.get("id") or post.get("post_id"), f"post-{index}")
        posts.append(
            {
                "id": post_id,
                "index": index,
                "caption": _text(post.get("caption"), f"posts[{index}].caption"),
                "hook": _text(post.get("hook"), f"posts[{index}].hook"),
                "format": _text(post.get("format"), f"posts[{index}].format"),
                "cta": _text(post.get("cta"), f"posts[{index}].cta"),
            }
        )

    comments: list[dict[str, Any]] = []
    for index, raw in enumerate(capped_comments):
        comment = _as_mapping(raw, f"comments[{index}]")
        comment_id = _identifier(
            comment.get("id") or comment.get("comment_id"), f"comment-{index}"
        )
        comments.append(
            {
                "id": comment_id,
                "index": index,
                # Never trim or rewrite a quote: verbatim means exactly as supplied.
                "text": _text(comment.get("text"), f"comments[{index}].text", required=True),
                "likes": _likes(comment.get("likes")),
            }
        )

    claim_sources: list[dict[str, Any]] = []
    for index, raw in enumerate(_as_sequence(payload.get("claim_sources"), "claim_sources")):
        source = _as_mapping(raw, f"claim_sources[{index}]")
        source_id = _identifier(
            source.get("id") or source.get("source_id"), f"source-{index}"
        )
        claim_sources.append({"id": source_id, "detail": _text(source.get("detail"), f"claim_sources[{index}].detail")})

    comment_hits: dict[str, set[int]] = defaultdict(set)
    post_hits: dict[str, set[int]] = defaultdict(set)
    cta_hits: dict[str, set[int]] = defaultdict(set)
    kind_votes: dict[str, Counter[str]] = defaultdict(Counter)

    for comment in comments:
        kind = _classify(comment["text"])
        for gram in _grams(_tokens(comment["text"])):
            comment_hits[gram].add(comment["index"])
            kind_votes[gram][kind] += 1
    for post in posts:
        all_text = " ".join((post["caption"], post["hook"], post["format"], post["cta"]))
        for gram in _grams(_tokens(all_text)):
            post_hits[gram].add(post["index"])
        for gram in _grams(_tokens(post["cta"])):
            cta_hits[gram].add(post["index"])

    themes: list[dict[str, Any]] = []
    for theme, hits in sorted(comment_hits.items(), key=lambda item: _theme_sort_key(item[0], item[1]))[:12]:
        votes = kind_votes[theme]
        kind = max(KIND_ORDER, key=lambda candidate: (votes[candidate], -KIND_ORDER.index(candidate)))
        evidence_ids = [
            comment["id"]
            for comment in comments
            if comment["index"] in sorted(hits)[:3]
        ]
        themes.append(
            {
                "theme": theme,
                "count": len(hits),
                "comment_count": len(hits),
                "post_count": len(post_hits.get(theme, set())),
                "cta_count": len(cta_hits.get(theme, set())),
                "kind": kind,
                "evidence_comment_ids": evidence_ids,
            }
        )

    gaps = [
        {
            "theme": theme["theme"],
            "comment_count": theme["comment_count"],
            "evidence_comment_ids": theme["evidence_comment_ids"],
        }
        for theme in themes
        if theme["comment_count"] > 0 and theme["post_count"] == 0 and theme["cta_count"] == 0
    ][:8]

    angle, angle_evidence = _detect_angle(posts, comments, payload.get("audience_angle"))
    research_complete = posts_supplied >= MAX_POSTS and comments_supplied >= MAX_COMMENTS
    source_ids = (
        [post["id"] for post in posts]
        + [comment["id"] for comment in comments]
        + [source["id"] for source in claim_sources]
    )
    creator_phrases = [
        _text(value, "creator_phrases", required=True)
        for value in _as_sequence(payload.get("creator_phrases"), "creator_phrases")
    ]
    creator_examples = [
        _text(value, "creator_examples", required=True)
        for value in _as_sequence(payload.get("creator_examples"), "creator_examples")
    ]

    return {
        "status": "complete" if research_complete else "PARTIAL",
        "research_complete": research_complete,
        "posts_supplied": posts_supplied,
        "posts_used": len(posts),
        "comments_supplied": comments_supplied,
        "comments_used": len(comments),
        "posts_capped": posts_supplied > MAX_POSTS,
        "comments_capped": comments_supplied > MAX_COMMENTS,
        "audience_angle": angle,
        "angle_evidence": angle_evidence,
        "themes": themes,
        "gaps": gaps,
        "source_ids": source_ids,
        "creator_name": " ".join(_text(payload.get("creator_name"), "creator_name").split()) or None,
        "creator_phrases": creator_phrases,
        "creator_examples": creator_examples,
        "claims": [
            _as_mapping(raw, f"claims[{index}]")
            for index, raw in enumerate(_as_sequence(payload.get("claims"), "claims"))
        ],
        "normalized": {"posts": posts, "comments": comments, "claim_sources": claim_sources},
    }


def _ensure_analysis(research: Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(research, Mapping) and "themes" in research and "normalized" in research:
        return dict(research)
    return analyze_research(research)


def _quote(comment: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "text": comment["text"],
        "comment_id": comment["id"],
        "comment_index": comment["index"],
    }


def _quotes_for_theme(analysis: dict[str, Any], theme: Mapping[str, Any], count: int = 3) -> list[dict[str, Any]]:
    comments = analysis["normalized"]["comments"]
    by_id = {comment["id"]: comment for comment in comments}
    chosen: list[dict[str, Any]] = []
    for comment_id in theme.get("evidence_comment_ids", []):
        if comment_id in by_id and len(chosen) < count:
            chosen.append(_quote(by_id[comment_id]))
    if len(chosen) < count:
        for comment in sorted(comments, key=lambda item: (-item["likes"], item["index"])):
            if all(quote["comment_id"] != comment["id"] for quote in chosen):
                chosen.append(_quote(comment))
            if len(chosen) == count:
                break
    return chosen[:count]


def _toc_for_theme(theme: Mapping[str, Any], angle: str, comment_ids: list[str]) -> list[dict[str, Any]]:
    label = str(theme["theme"])
    chapter_titles = (
        f"Start With Real {label} Questions",
        f"Diagnose Your Current {label}",
        f"The {angle} Framework",
        f"Build Your {label} Baseline",
        f"Step-by-Step {label} Playbook",
        "Templates and Checklists",
        "FAQ From Real Comments",
        f"Measure and Adjust Your {label}",
        "Next 30 Days",
    )
    return [
        {
            "number": number,
            "title": title,
            "source_comment_ids": comment_ids[:3],
        }
        for number, title in enumerate(chapter_titles, start=1)
    ]


def generate_concepts(research: Mapping[str, Any]) -> dict[str, Any]:
    """Phase B: three deterministic concepts, each tied to real comment evidence."""
    analysis = _ensure_analysis(research)
    themes = analysis["themes"]
    comments = analysis["normalized"]["comments"]
    if len(themes) < 3:
        raise ValueError("Three recurring themes from supplied comments are required before ideation.")
    if len(comments) < 3:
        raise ValueError("Three verbatim comments are required before ideation.")

    concepts: list[dict[str, Any]] = []
    for rank, theme in enumerate(themes[:3]):
        comment_ids = theme["evidence_comment_ids"]
        quotes = _quotes_for_theme(analysis, theme)
        price = CONCEPT_PRICES[rank]
        concepts.append(
            {
                "id": f"concept-{rank + 1}",
                "title": f"{theme['theme'].title()} Field Guide",
                "promise": (
                    f"A practical guide to {theme['theme']}, built from "
                    f"{theme['comment_count']} recurring audience questions."
                ),
                "price": price,
                "price_label": f"${price}",
                "target_buyer": (
                    f"People in the supplied comments asking about {theme['theme']} "
                    f"(comment ids: {', '.join(comment_ids)})"
                ),
                "table_of_contents": _toc_for_theme(theme, analysis["audience_angle"], comment_ids),
                "why_will_sell": quotes,
                "evidence": {
                    "theme": theme["theme"],
                    "theme_comment_count": theme["comment_count"],
                    "comment_ids": comment_ids,
                    "research_status": analysis["status"],
                },
                "awaiting_human_pick": True,
                "human_pick_confirmed": False,
            }
        )

    return {
        "concepts": concepts,
        "count": len(concepts),
        "requires_human_pick": True,
        "awaiting_human_pick": True,
        "research_status": analysis["status"],
        "research_complete": analysis["research_complete"],
    }


def pick_concept(concepts: Any, chosen_id: Any) -> dict[str, Any]:
    """Require an explicit human choice. Never default to a generated concept."""
    if isinstance(concepts, Mapping) and "concepts" in concepts:
        items = concepts["concepts"]
    else:
        items = concepts
    items = _as_sequence(items, "concepts")

    if chosen_id is None or (isinstance(chosen_id, str) and not chosen_id.strip()):
        return {
            "selected_concept": None,
            "chosen_id": None,
            "awaiting_human_pick": True,
            "human_pick_required": True,
            "reason": "A human must explicitly choose one of the three concepts.",
        }
    clean_id = str(chosen_id).strip()
    match = next(
        (item for item in items if isinstance(item, Mapping) and str(item.get("id")) == clean_id),
        None,
    )
    if match is None:
        raise ValueError(f"Concept '{clean_id}' does not exist. A human must choose a valid concept.")
    selected = dict(match)
    selected["awaiting_human_pick"] = False
    selected["human_pick_confirmed"] = True
    return {
        "selected_concept": selected,
        "chosen_id": clean_id,
        "awaiting_human_pick": False,
        "human_pick_required": True,
        "reason": "Human concept choice recorded.",
    }


class WriterAdapter(Protocol):
    """Optional external prose writer. `expand` receives evidence, never credentials."""

    def expand(self, payload: Mapping[str, Any]) -> Mapping[str, Any]: ...


def _count_words(text: Any) -> int:
    return len(re.findall(r"\b[\w'-]+\b", str(text)))


def _adapter_is_configured(adapter: Any) -> bool:
    if adapter is None:
        return False
    configured = getattr(adapter, "is_configured", None)
    if callable(configured):
        return bool(configured())
    if hasattr(adapter, "configured"):
        return bool(adapter.configured)
    return False


def _normalize_writer_sections(result: Any) -> list[dict[str, Any]]:
    if isinstance(result, Mapping):
        raw_sections = result.get("sections")
    else:
        raw_sections = result
    if isinstance(raw_sections, Mapping):
        items = [{"name": name, "body": body} for name, body in raw_sections.items()]
    elif isinstance(raw_sections, (list, tuple)):
        items = []
        for raw in raw_sections:
            if not isinstance(raw, Mapping) or "name" not in raw or "body" not in raw:
                raise ValueError("Writer sections must carry a name and a body.")
            items.append({"name": raw["name"], "body": raw["body"]})
    else:
        raise ValueError("Writer output must contain sections.")

    names = tuple(item["name"] for item in items)
    if names != REQUIRED_SECTIONS:
        raise ValueError("Writer output must use the required section order exactly.")
    for item in items:
        if not isinstance(item["body"], str) or not item["body"].strip():
            raise ValueError("Every writer section needs a non-empty body.")
    return items


def _source_anchor_fill(needed: int, source_ids: list[str], offset: int) -> str:
    """A traceability sentence with an exact word count, built only from supplied ids."""
    lead = "The source anchors reviewed for this section are"
    lead_count = _count_words(lead)
    extra = needed - lead_count
    if extra <= 0 or not source_ids:
        words = ["Evidence", "stays", "traceable", "to", "the", "supplied", "research", "record"]
        return " ".join(words[: max(needed, 1)]) + "."
    anchors = [str(source_ids[(offset + index) % len(source_ids)]) for index in range(extra)]
    return f"{lead} {' '.join(anchors)}."


def _expand_offline(payload: Mapping[str, Any]) -> dict[str, str]:
    """Write section-by-section prose from supplied evidence, with no invented facts."""
    chapters = list(payload.get("toc") or [])
    if not chapters:
        chapters = [{"number": 1, "title": str(payload.get("title") or "The product")}]
    quotes = [dict(quote) for quote in (payload.get("quotes") or [])]
    for extra in payload.get("research_quotes") or []:
        candidate = dict(extra)
        if not any(
            candidate.get("comment_id") == existing.get("comment_id")
            and candidate.get("comment_index") == existing.get("comment_index")
            for existing in quotes
        ):
            quotes.append(candidate)
    if not quotes:
        quotes = [{"text": "", "comment_id": "unknown", "comment_index": 0}]
    phrases = list(payload.get("creator_phrases") or [""])
    examples = list(payload.get("creator_examples") or [""])
    themes = list(payload.get("themes") or [])
    gaps = list(payload.get("gaps") or [])
    source_ids = [str(value) for value in (payload.get("source_ids") or [])]
    creator_name = str(payload.get("creator_name") or "the creator")
    angle = str(payload.get("audience_angle") or "Undetermined")
    status = str(payload.get("research_status") or "PARTIAL")
    theme_label = str(payload.get("theme") or "the supplied comments")

    anchors: list[dict[str, Any]] = []
    for item in themes:
        anchors.append(
            {
                "label": str(item.get("theme", "")),
                "count": int(item.get("count", 0) or 0),
                "kind": str(item.get("kind", "theme")),
                "ids": ", ".join(str(value) for value in item.get("evidence_comment_ids", [])),
                "gap": False,
            }
        )
    for item in gaps:
        anchors.append(
            {
                "label": str(item.get("theme", "")),
                "count": int(item.get("comment_count", 0) or 0),
                "kind": "gap",
                "ids": ", ".join(str(value) for value in item.get("evidence_comment_ids", [])),
                "gap": True,
            }
        )
    if not anchors:
        anchors = [
            {"label": theme_label, "count": 0, "kind": "theme", "ids": "the supplied record", "gap": False}
        ]

    def frame_interpretation(index, chapter, anchor, quote, phrase, example):
        count_clause = (
            f"{anchor['count']} supplied comments" if anchor["count"] else "the supplied comments"
        )
        return (
            f"Chapter {chapter['number']}, {chapter['title']}, starts from the audience record rather than a guess. "
            f"In this record, {anchor['label']} appears in {count_clause} and is treated here as a {anchor['kind']}. "
            f"The supporting ids are {anchor['ids']}. That is an observation about the supplied data, not a claim "
            f"about every reader. Use it to decide what this chapter needs to answer. The chosen angle is {angle}; "
            f"keep that lens visible without turning it into a promise. VistaBix supplies the structure and the audit "
            f"trail, while creator wording stays attributed to {creator_name}. No result, testimonial or metric has "
            f"been added beyond the research."
        )

    def frame_quote(index, chapter, anchor, quote, phrase, example):
        phrase_clause = (
            f"When a creator-supplied phrase fits, keep it exactly as supplied: '{phrase}'."
            if phrase
            else "No creator phrase was supplied for this passage, so none is attributed."
        )
        return (
            f"One supplied comment reads, verbatim: '{quote['text']}'. Its source is comment "
            f"{quote['comment_id']} at index {quote['comment_index']}. In {chapter['title']}, treat that line as "
            f"the question to answer, not as a slogan to repeat. {phrase_clause} The comment belongs to the evidence "
            f"set; it does not establish a fact about people outside that set. Restate the question in your own "
            f"words, then show the decision the reader can make with the information available here."
        )

    def frame_gap(index, chapter, anchor, quote, phrase, example):
        gap_clause = (
            f"The gap register records {anchor['label']} in comments but not in the supplied posts or calls to action."
            if anchor["gap"]
            else f"The theme {anchor['label']} is present in the supplied comments."
        )
        return (
            f"{gap_clause} Chapter {chapter['number']} exists to close that gap in the reader's understanding, not "
            f"to pretend the posts already covered it. A useful check is whether a reader who only saw the posts "
            f"could answer the question behind '{quote['text']}' (comment {quote['comment_id']}). If they could "
            f"not, the chapter has earned its place. Keep the wording tied to {anchor['ids'] or 'the supplied record'} "
            f"and avoid turning a recurring comment into an unmeasured claim about the market."
        )

    def frame_framework(index, chapter, anchor, quote, phrase, example):
        example_clause = (
            f"Creator example supplied for this project: '{example}'."
            if example
            else "No creator example was supplied, so no example is attributed to the creator."
        )
        return (
            f"For {chapter['title']}, the framework is deliberately plain: name the situation, name the constraint, "
            f"then show the next decision. This matches the {angle} angle and avoids selling a shortcut the research "
            f"never described. Anchor the explanation in {anchor['label']} ({anchor['count']} supplied comments) and "
            f"cite comment {quote['comment_id']} where the wording helps. {example_clause} Use it as an illustration "
            f"of method, never as proof of an outcome. The VistaBix layer keeps citations and sequence visible so "
            f"{creator_name} can review the reasoning before anything is approved."
        )

    def frame_step(index, chapter, anchor, quote, phrase, example):
        phrase_clause = (
            f"Where {creator_name} supplied the phrase '{phrase}', use it as a model rather than a guarantee."
            if phrase
            else "No creator phrase was supplied for this step, so the wording remains instructional only."
        )
        return (
            f"Step {index % 9 + 1} of the playbook asks the reader to write one sentence describing their own "
            f"version of {anchor['label']}. This is an exercise, not a claim that the method works for everyone. "
            f"The supplied record shows {anchor['count']} comments on the theme, and the quote '{quote['text']}' "
            f"(comment {quote['comment_id']}) shows how the problem was phrased. Keep the language concrete. "
            f"{phrase_clause} When the reader has written the sentence, ask them to identify the single decision it "
            f"changes. If no decision changes, the step needs a clearer prompt before publication."
        )

    def frame_template(index, chapter, anchor, quote, phrase, example):
        illustration = ILLUSTRATION_TYPES[index % len(ILLUSTRATION_TYPES)]
        placement = REQUIRED_SECTIONS[index % len(REQUIRED_SECTIONS)]
        return (
            f"The template for {chapter['title']} has three fields: the question from the comment record, the "
            f"decision the reader must make, and the source id that supports the wording. Fill the first field with "
            f"'{quote['text']}' (comment {quote['comment_id']}). Fill the second from the {angle} angle. Fill the "
            f"third from {anchor['ids'] or 'the supplied record'}. This keeps the work auditable. Illustration "
            f"placeholder: {illustration}; placement: {placement}. It is a marked space for artwork, not generated "
            f"image data, and the surrounding prose must remain readable without it."
        )

    def frame_faq(index, chapter, anchor, quote, phrase, example):
        gap_sentence = (
            "The posts did not address it in the supplied set."
            if anchor["gap"]
            else "The post record is separate from the comment record; do not assume it covered the question."
        )
        phrase_clause = (
            f"Creator-supplied wording is quoted here exactly as supplied: '{phrase}'."
            if phrase
            else "No creator wording was supplied for this answer, so none is claimed."
        )
        return (
            f"FAQ item {index % 3 + 1} comes from comment {quote['comment_id']} at index "
            f"{quote['comment_index']}: '{quote['text']}'. Answer it by restating the evidence, not by widening the "
            f"claim. The theme {anchor['label']} occurs {anchor['count']} times in the supplied comments. "
            f"{gap_sentence} {phrase_clause} If the answer needs a number, a testimonial or a guarantee that the "
            f"research does not contain, leave it out and return the question to {creator_name} for a decision."
        )

    def frame_review(index, chapter, anchor, quote, phrase, example):
        return (
            f"Before publication, {creator_name} should review this passage for voice. VistaBix has kept the "
            f"structure, citations and section order; creator-supplied phrases are quoted exactly as provided. "
            f"Research status is {status}, so any part of {anchor['label']} that rests on fewer comments should be "
            f"softened rather than asserted. The evidence ids {anchor['ids'] or 'in the supplied record'} point back "
            f"to the source material and allow a reviewer to verify each sentence without opening an external "
            f"source. This review step is mandatory and is separate from the creator approval gate."
        )

    section_frames = {
        "Intro": (frame_interpretation, frame_review),
        "Problem": (frame_gap, frame_interpretation),
        "Framework (Creator's Method)": (frame_framework, frame_interpretation),
        "Step-by-Step Playbook": (frame_step, frame_framework, frame_template),
        "Templates/Checklists": (frame_template, frame_step),
        "FAQ (from real comments)": (frame_faq, frame_gap),
        "Next Steps": (frame_review, frame_faq),
    }
    weights = (0.08, 0.12, 0.15, 0.30, 0.12, 0.13, 0.10)
    target = int(payload.get("word_target", MIN_WORDS))
    reserves = 400
    bodies: dict[str, str] = {}

    for section_index, section_name in enumerate(REQUIRED_SECTIONS):
        budget = max(120, int(weights[section_index] * max(target - reserves, 500)))
        frames = section_frames[section_name]
        paragraphs: list[str] = []
        current = 0
        attempt = 0
        while current < budget and attempt < 1_000:
            frame = frames[attempt % len(frames)]
            chapter = chapters[attempt % len(chapters)]
            anchor = anchors[(attempt + section_index) % len(anchors)]
            quote = quotes[attempt % len(quotes)]
            phrase = phrases[attempt % len(phrases)]
            example = examples[attempt % len(examples)]
            paragraph = frame(attempt, chapter, anchor, quote, phrase, example)
            size = _count_words(paragraph)
            if current + size <= budget + 25:
                paragraphs.append(paragraph)
                current += size
            attempt += 1
        if not paragraphs:
            paragraphs.append(frame_interpretation(0, chapters[0], anchors[0], quotes[0], phrases[0], examples[0]))
        bodies[section_name] = "\n\n".join(paragraphs)

    written = sum(_count_words(body) for body in bodies.values())
    remaining = target - written
    if remaining > 0:
        offset = _count_words(payload.get("title", ""))
        bodies[REQUIRED_SECTIONS[-1]] += "\n\n" + _source_anchor_fill(remaining, source_ids, offset)
    return bodies


def build_draft(
    concept: Mapping[str, Any],
    research: Mapping[str, Any],
    writer_adapter: WriterAdapter | None = None,
) -> dict[str, Any]:
    """Phase C: a structured, co-branded draft with real prose and no binary generation."""
    selected = _as_mapping(concept, "concept")
    analysis = _ensure_analysis(research)
    creator_name = analysis.get("creator_name")
    if not creator_name or not str(creator_name).strip():
        raise ValueError("creator_name is required for a hybrid VistaBix + creator draft.")

    price = selected.get("price")
    if price not in ALLOWED_PRICES:
        raise ValueError(f"Concept price must be one of: {', '.join(str(value) for value in ALLOWED_PRICES)}")
    word_target = PRICE_WORD_TARGETS[int(price)]
    angle = analysis["audience_angle"]
    evidence = selected.get("evidence", {})
    theme = str(evidence.get("theme", "")) if isinstance(evidence, Mapping) else ""
    quotes = selected.get("why_will_sell", [])
    if not isinstance(quotes, (list, tuple)) or len(quotes) != 3:
        raise ValueError("A concept needs three verbatim comment quotes before drafting.")
    if not all(
        isinstance(quote, Mapping)
        and all(key in quote for key in ("text", "comment_id", "comment_index"))
        for quote in quotes
    ):
        raise ValueError("Every quote must carry verbatim text plus a comment id and index.")

    creator_phrases = analysis["creator_phrases"]
    creator_examples = analysis["creator_examples"]
    chapters = list(selected.get("table_of_contents") or [])
    chapter_count = max(len(chapters), 1)
    base, remainder = divmod(word_target, chapter_count)
    chapter_word_targets = [base + (1 if index < remainder else 0) for index in range(chapter_count)]
    weights = (0.08, 0.12, 0.15, 0.30, 0.12, 0.13, 0.10)
    section_word_targets = {
        name: max(1, int(weight * word_target))
        for name, weight in zip(REQUIRED_SECTIONS, weights)
    }
    writer_payload = {
        "title": selected.get("title", ""),
        "promise": selected.get("promise", ""),
        "price": int(price),
        "word_target": word_target,
        "creator_name": creator_name,
        "co_branding": f"VistaBix x {creator_name}",
        "audience_angle": angle,
        "research_status": analysis["status"],
        "theme": theme,
        "toc": chapters,
        "chapter_word_targets": chapter_word_targets,
        "required_section_order": REQUIRED_SECTIONS,
        "section_word_targets": section_word_targets,
        "quotes": [dict(quote) for quote in quotes],
        "research_quotes": [
            {
                "text": comment["text"],
                "comment_id": comment["id"],
                "comment_index": comment["index"],
            }
            for comment in analysis["normalized"]["comments"]
            if comment["id"] in {
                evidence_id
                for theme in analysis["themes"]
                for evidence_id in theme["evidence_comment_ids"][:3]
            }
        ][:24],
        "creator_phrases": creator_phrases,
        "creator_examples": creator_examples,
        "themes": analysis["themes"],
        "gaps": analysis["gaps"],
        "source_ids": analysis["source_ids"],
        "illustration_types": ILLUSTRATION_TYPES,
    }

    if _adapter_is_configured(writer_adapter):
        try:
            writer_result = writer_adapter.expand(writer_payload)
        except Exception as exc:
            raise ValueError(f"Writer adapter failed ({type(exc).__name__}); no draft was generated.") from exc
        sections = _normalize_writer_sections(writer_result)
        writer_words = _count_words(" ".join(section["body"] for section in sections))
        if not MIN_WORDS <= writer_words <= MAX_WORDS:
            raise ValueError(
                f"Writer adapter produced {writer_words} words; the draft must contain "
                f"{MIN_WORDS}-{MAX_WORDS} words of actual prose."
            )
    else:
        offline_bodies = _expand_offline(writer_payload)
        sections = [{"name": name, "body": offline_bodies[name]} for name in REQUIRED_SECTIONS]
    illustrations = [
        {"type": kind, "section": section, "status": "placeholder", "placement": f"within {section}"}
        for kind, section in zip(
            ILLUSTRATION_TYPES,
            ("Intro", "Framework (Creator's Method)", "Problem", "Step-by-Step Playbook"),
        )
    ]
    claims = [
        {
            "text": str(claim.get("text", "")),
            "source_id": claim.get("source_id"),
        }
        for claim in analysis["claims"]
        if isinstance(claim, Mapping)
    ]

    draft = {
        "title": selected.get("title", ""),
        "promise": selected.get("promise", ""),
        "price": int(price),
        "price_label": f"${int(price)}",
        "creator_name": creator_name,
        "co_branding": f"VistaBix x {creator_name}",
        "audience_angle": angle,
        "research_status": analysis["status"],
        "selected_concept_id": selected.get("id"),
        "human_pick_recorded": selected.get("human_pick_confirmed") is True,
        "awaiting_human_pick": selected.get("awaiting_human_pick", True) is not False,
        "creator_approved": False,
        "word_count": word_target,
        "word_count_basis": "target; actual_word_count is measured from the generated prose",
        "sections": sections,
        "illustrations": illustrations,
        "claims": claims,
        "exports": {
            "whop_markdown": "always_available",
            "google_doc": "adapter_required",
            "pdf": "adapter_required",
        },
        "publishing": "never_auto_published",
    }
    draft["actual_word_count"] = _count_words(" ".join(section["body"] for section in sections))
    draft["markdown"] = render_whop_markdown(draft)
    return draft


def validate_draft(draft: Mapping[str, Any], price: Any) -> bool:
    """Fail closed on price, target label, actual prose length or section order."""
    if not isinstance(draft, Mapping):
        raise DraftValidationError("Draft must be an object.")
    if price not in ALLOWED_PRICES:
        raise DraftValidationError(f"price must be one of: {', '.join(str(value) for value in ALLOWED_PRICES)}")
    word_count = draft.get("word_count")
    if isinstance(word_count, bool) or not isinstance(word_count, int) or not MIN_WORDS <= word_count <= MAX_WORDS:
        raise DraftValidationError(f"Draft word_count must be between {MIN_WORDS} and {MAX_WORDS}.")
    sections = draft.get("sections")
    if not isinstance(sections, (list, tuple)):
        raise DraftValidationError("Draft sections must be a list.")
    names = tuple(section.get("name") if isinstance(section, Mapping) else None for section in sections)
    if names != REQUIRED_SECTIONS:
        raise DraftValidationError("Draft sections must match the required order exactly.")
    for index, section in enumerate(sections):
        if not isinstance(section.get("body"), str) or not section["body"].strip():
            raise DraftValidationError(f"Section {index + 1} needs a body.")
    actual = _count_words(" ".join(section["body"] for section in sections))
    if not MIN_WORDS <= actual <= MAX_WORDS:
        raise DraftValidationError(
            f"Draft body contains {actual} words; actual prose must be between "
            f"{MIN_WORDS} and {MAX_WORDS} words."
        )
    return True


def render_whop_markdown(draft: Mapping[str, Any]) -> str:
    """Whop-ready Markdown is always generated locally; no network is involved."""
    doc = _as_mapping(draft, "draft")
    lines = [
        f"# {doc.get('title', '')}",
        "",
        f"**{doc.get('co_branding', 'VistaBix')}**",
        "",
        f"Promise: {doc.get('promise', '')}",
        f"Audience angle: {doc.get('audience_angle', 'Undetermined')}",
        f"Research status: {doc.get('research_status', 'PARTIAL')}",
        f"Target word count: {doc.get('word_count', MIN_WORDS)}",
        f"Actual word count: {doc.get('actual_word_count', _count_words(' '.join(str(s.get('body', '')) for s in doc.get('sections', []) if isinstance(s, Mapping))))}",
        "",
    ]
    for section in doc.get("sections", []):
        if isinstance(section, Mapping):
            lines.extend((f"## {section.get('name', '')}", str(section.get("body", "")), ""))
    lines.append("## Illustration placeholders")
    for item in doc.get("illustrations", []):
        if isinstance(item, Mapping):
            lines.append(
                f"- [{item.get('type', 'placeholder')}] {item.get('placement', '')} "
                f"(section: {item.get('section', '')})"
            )
    lines.extend(("", "Creator approval is required before publishing."))
    return "\n".join(lines)


def _adapter_result(adapter: Any, method: str, reason: str, draft: Mapping[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    if adapter is None:
        return None, reason
    configured = getattr(adapter, "is_configured", None)
    if callable(configured):
        ok = bool(configured())
    elif hasattr(adapter, "configured"):
        ok = bool(adapter.configured)
    else:
        ok = False
    if not ok:
        return None, reason
    handler = getattr(adapter, method, None)
    if not callable(handler):
        return None, f"Adapter does not implement {method}; no export was created."
    try:
        result = handler(draft)
    except Exception as exc:  # adapters are external and must never fake success
        return None, f"Adapter failed ({type(exc).__name__}); no export was created."
    if not isinstance(result, Mapping):
        return None, f"Adapter returned an invalid result from {method}; no export was created."
    return dict(result), None


def export_google_doc(draft: Mapping[str, Any], adapter: Any | None = None) -> dict[str, Any]:
    reason = "Google Docs credentials are not configured; no document was created."
    result, failure = _adapter_result(adapter, "create_google_doc", reason, draft)
    if failure:
        return {"status": "blocked", "provider": "google_docs", "reason": failure, "fake_success": False}
    return {
        "status": result.get("status", "exported"),
        "provider": "google_docs",
        "result": result,
        "fake_success": False,
    }


def export_pdf(draft: Mapping[str, Any], adapter: Any | None = None) -> dict[str, Any]:
    reason = "PDF credentials are not configured; no PDF was created."
    result, failure = _adapter_result(adapter, "create_pdf", reason, draft)
    if failure:
        return {"status": "blocked", "provider": "pdf", "reason": failure, "fake_success": False}
    return {
        "status": result.get("status", "exported"),
        "provider": "pdf",
        "result": result,
        "fake_success": False,
    }


def _checker_result(checker: Any, draft: Mapping[str, Any]) -> dict[str, Any]:
    reason = "External plagiarism/AI-detection checker is not configured; no self-assessment is permitted."
    result, failure = _adapter_result(checker, "check", reason, draft)
    if failure:
        return {
            "name": "plagiarism_ai_detection",
            "passed": False,
            "status": "blocked",
            "evidence": {"reason": failure},
        }
    passed = result.get("passed") is True or result.get("status") == "pass"
    evidence = result.get("evidence", result)
    return {
        "name": "plagiarism_ai_detection",
        "passed": passed,
        "status": "pass" if passed else "fail",
        "evidence": evidence,
    }


def quality_gate(
    draft: Mapping[str, Any],
    research: Mapping[str, Any],
    approval: Mapping[str, Any],
) -> dict[str, Any]:
    """Pure quality gates. `ready_to_publish` is the AND of every gate."""
    doc = _as_mapping(draft, "draft")
    analysis = _ensure_analysis(_as_mapping(research, "research"))
    recorded = _as_mapping(approval, "approval")

    checker = doc.get("checker_adapter")
    plagiarism_gate = _checker_result(checker, doc)

    source_ids = set(analysis["source_ids"])
    claims = doc.get("claims", [])
    if not isinstance(claims, (list, tuple)):
        claims = []
    unverified: list[dict[str, Any]] = []
    for index, claim in enumerate(claims):
        if not isinstance(claim, Mapping):
            unverified.append({"index": index, "reason": "Claim is not an object."})
            continue
        source_id = claim.get("source_id")
        if source_id is None or source_id not in source_ids:
            unverified.append(
                {"index": index, "text": claim.get("text", ""), "reason": "unverified: no supplied source id"}
            )
    fact_gate = {
        "name": "fact_check",
        "passed": not unverified,
        "status": "pass" if not unverified else "fail",
        "evidence": {
            "claims_checked": len(claims),
            "unverified_claims": unverified,
            "supplied_source_ids": len(source_ids),
        },
    }

    explicitly_approved = recorded.get("creator_approved") is True
    approval_gate = {
        "name": "creator_approval",
        "passed": explicitly_approved,
        "status": "pass" if explicitly_approved else "fail",
        "evidence": {
            "creator_approved": explicitly_approved,
            "approved_by": recorded.get("approved_by"),
            "approved_at": recorded.get("approved_at"),
        },
    }

    pick_recorded = doc.get("human_pick_recorded") is True and doc.get("awaiting_human_pick") is False
    pick_gate = {
        "name": "human_concept_pick",
        "passed": pick_recorded,
        "status": "pass" if pick_recorded else "fail",
        "evidence": {
            "selected_concept_id": doc.get("selected_concept_id"),
            "human_pick_recorded": doc.get("human_pick_recorded", False),
            "awaiting_human_pick": doc.get("awaiting_human_pick", True),
        },
    }

    try:
        valid_draft = validate_draft(doc, doc.get("price"))
        structure_gate = {
            "name": "draft_structure",
            "passed": bool(valid_draft),
            "status": "pass",
            "evidence": {
                "target_word_count": doc.get("word_count"),
                "actual_word_count": _count_words(
                    " ".join(str(section.get("body", "")) for section in doc.get("sections", []) if isinstance(section, Mapping))
                ),
                "sections": REQUIRED_SECTIONS,
            },
        }
    except ValueError as exc:
        structure_gate = {
            "name": "draft_structure",
            "passed": False,
            "status": "fail",
            "evidence": {"reason": str(exc)},
        }

    gates = [plagiarism_gate, fact_gate, approval_gate, pick_gate, structure_gate]
    ready = all(gate["passed"] for gate in gates)
    return {
        "gates": {gate["name"]: gate for gate in gates},
        "ready_to_publish": ready,
        "publish_action": "none",
        "note": "No endpoint in this module publishes; creator approval is mandatory.",
    }
