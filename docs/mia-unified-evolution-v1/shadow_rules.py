"""Synthetic-only decision rules for Mia's shadow prototype.

No database, network, model, persistent storage, or external actions.
"""
from dataclasses import dataclass
from typing import Iterable

SYSTEMS = (
    "cognition",
    "emotion",
    "relationship",
    "motivation_action",
    "memory_time",
    "value_personality",
)
SEED_KINDS = {"discovery", "question", "connection", "creative", "improvement"}


@dataclass(frozen=True)
class CandidateSeed:
    kind: str
    statement: str
    origin_refs: tuple[str, ...]
    known_facts: tuple[str, ...] = ()
    hypotheses: tuple[str, ...] = ()
    unknowns: tuple[str, ...] = ()
    support_refs: tuple[str, ...] = ()
    counter_refs: tuple[str, ...] = ()
    status: str = "candidate"
    confidence: float = 0.0


def make_candidate(
    kind: str,
    statement: str,
    origin_refs: Iterable[str],
    *,
    known_facts: Iterable[str] = (),
    hypotheses: Iterable[str] = (),
    unknowns: Iterable[str] = (),
    support_refs: Iterable[str] = (),
    counter_refs: Iterable[str] = (),
    confidence: float = 0.0,
) -> CandidateSeed:
    if kind not in SEED_KINDS:
        raise ValueError("unsupported seed kind")
    if not statement.strip():
        raise ValueError("statement must not be empty")
    return CandidateSeed(
        kind=kind,
        statement=statement.strip(),
        origin_refs=tuple(sorted(set(origin_refs))),
        known_facts=tuple(known_facts),
        hypotheses=tuple(hypotheses),
        unknowns=tuple(unknowns),
        support_refs=tuple(sorted(set(support_refs))),
        counter_refs=tuple(sorted(set(counter_refs))),
        confidence=max(0.0, min(0.5, float(confidence))),
    )


def distinct_source_refs(refs: Iterable[str]) -> bool:
    """A necessary check only; distinct IDs alone do not prove independence."""
    values = set(refs)
    return len(values) >= 2


def contradiction_ratio(support_count: int, counter_count: int) -> float:
    total = support_count + counter_count
    return 0.0 if total == 0 else counter_count / total


def adjust_confidence_for_contradiction(
    confidence: float, support_count: int, counter_count: int
) -> float:
    """Illustrative conservative rule; must be calibrated before any real use."""
    ratio = contradiction_ratio(support_count, counter_count)
    adjusted = confidence * (1.0 - 0.75 * ratio)
    return max(0.0, min(1.0, adjusted))


def bounded_trait_delta(delta: float, limit: float = 0.02) -> float:
    if limit < 0:
        raise ValueError("limit must be non-negative")
    return max(-limit, min(limit, delta))


def choose_next_step(
    confidence: float,
    risk: str,
    has_counter_evidence: bool,
    *,
    external_or_user_impact: bool = False,
) -> str:
    """Never executes actions; returns a decision label for the shadow report."""
    if external_or_user_impact:
        return "await_authorization"
    if risk == "high":
        return "stay_silent"
    if has_counter_evidence or confidence < 0.25:
        return "wait_for_evidence"
    if confidence < 0.60:
        return "cultivate"
    return "propose"


def empty_system_assessments() -> dict:
    """No evidence is invented: each system starts explicitly unassessed."""
    return {
        name: {
            "observations": [],
            "evidence_refs": [],
            "counter_evidence_refs": [],
            "confidence": 0.0,
            "unknowns": ["not assessed in synthetic prototype"],
            "recommendation": "wait",
        }
        for name in SYSTEMS
    }
