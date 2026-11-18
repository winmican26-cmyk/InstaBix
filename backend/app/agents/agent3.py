"""Agent 3 — deterministic product outline generator.

The outline targets 4,500–10,000 words of finished product. Chapter word
targets always add up to the requested target exactly, so downstream generation
has a real budget rather than a vague promise.

This is intentionally not an LLM call: the starter must produce a usable,
auditable outline with no API key. The niche profiles below are the editorial
source of truth and can be versioned like prompt templates.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import NICHES

MIN_WORDS = 4_500
MAX_WORDS = 10_000
DEFAULT_WORDS = 7_000
OUTLINE_VERSION = "instabix-toc-v1"
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
