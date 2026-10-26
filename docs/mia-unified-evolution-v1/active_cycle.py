"""Synthetic-only proactive cycle for the Mia shadow prototype.

This module never reads production data, calls an LLM, sends messages, or writes to a database.
It turns explicitly supplied synthetic observations into candidate seeds and review proposals.
"""
from dataclasses import dataclass, asdict
from hashlib import sha256
from typing import Iterable, Sequence
import json

from shadow_rules import SYSTEMS, CandidateSeed, make_candidate


@dataclass(frozen=True)
class SyntheticObservation:
    event_ref: str
    text: str
    source_kind: str = "synthetic"
    known_fact: bool = False


@dataclass(frozen=True)
class ShadowProposal:
    proposal_id: str
    seed_id: str
    problem_or_opportunity: str
    rationale: str
    evidence_refs: tuple[str, ...]
    counter_evidence_refs: tuple[str, ...]
    unknowns: tuple[str, ...]
    steps: tuple[str, ...]
    risks: tuple[str, ...]
    success_criteria: tuple[str, ...]
    required_permission: str = "none; shadow-only"
    status: str = "shadow_reviewed"


def _id(prefix: str, value: str) -> str:
    return prefix + "-" + sha256(value.encode("utf-8")).hexdigest()[:12]


def normalize_observations(observations: Iterable[SyntheticObservation]) -> list[SyntheticObservation]:
    """Deduplicate exact event refs; preserve first occurrence and never merge distinct claims."""
    result = []
    seen = set()
    for obs in observations:
        if obs.source_kind != "synthetic":
            raise ValueError("This prototype accepts synthetic observations only")
        if not obs.event_ref.strip() or not obs.text.strip():
            raise ValueError("event_ref and text are required")
        if obs.event_ref in seen:
            continue
        seen.add(obs.event_ref)
        result.append(obs)
    return result


def reflect_on_observations(observations: Sequence[SyntheticObservation]) -> dict:
    """A deterministic scaffold, not an AI-generated interpretation."""
    normalized = normalize_observations(observations)
    repeated_texts = {}
    for obs in normalized:
        key = " ".join(obs.text.lower().split())
        repeated_texts.setdefault(key, []).append(obs.event_ref)
    repeated = {text: refs for text, refs in repeated_texts.items() if len(refs) > 1}
    return {
        "observation_count": len(normalized),
        "known_fact_refs": [o.event_ref for o in normalized if o.known_fact],
        "hypothesis_refs": [o.event_ref for o in normalized if not o.known_fact],
        "repeated_observations": repeated,
        "reflection_questions": [
            "What is directly observed, and what is only an interpretation?",
            "What counter-evidence or alternative explanation is missing?",
            "What small, reversible check would reduce uncertainty?",
            "Is there a reason to act now, or should this remain quiet?",
        ],
    }


def create_candidate_seeds(observations: Sequence[SyntheticObservation]) -> list[CandidateSeed]:
    normalized = normalize_observations(observations)
    if not normalized:
        return []
    refs = [o.event_ref for o in normalized]
    facts = [o.text for o in normalized if o.known_fact]
    hypotheses = [o.text for o in normalized if not o.known_fact]
    seeds = []
    seeds.append(make_candidate(
        "question",
        "What remains unresolved in these observations?",
        refs,
        known_facts=facts,
        hypotheses=hypotheses,
        unknowns=["Which interpretations are correct", "Whether more evidence exists"],
        confidence=0.2,
    ))
    if len(normalized) >= 2:
        seeds.append(make_candidate(
            "connection",
            "Is there a meaningful connection between these separate observations?",
            refs,
            known_facts=facts,
            hypotheses=hypotheses,
            unknowns=["Whether the observations share a cause or are coincidental"],
            confidence=0.2,
        ))
    return seeds


def build_shadow_proposal(seed: CandidateSeed) -> ShadowProposal:
    """Proposal only. It cannot authorize or execute real actions."""
    payload = seed.kind + "|" + seed.statement
    return ShadowProposal(
        proposal_id=_id("proposal", payload),
        seed_id=_id("seed", payload),
        problem_or_opportunity=seed.statement,
        rationale="Candidate generated from synthetic input; requires evidence review before any real-world use.",
        evidence_refs=seed.support_refs,
        counter_evidence_refs=seed.counter_refs,
        unknowns=seed.unknowns or ("Evidence quality and alternative explanations remain unassessed.",),
        steps=(
            "List the facts and hypotheses separately.",
            "Identify at least one counter-hypothesis.",
            "Specify one small, reversible synthetic test.",
            "Review the result before changing candidate status.",
        ),
        risks=(
            "The candidate may be repetitive or based on insufficient evidence.",
            "No external action is permitted in this prototype.",
        ),
        success_criteria=(
            "The test distinguishes at least two plausible explanations, or records that evidence remains insufficient.",
            "No production state, user message, or external service is changed.",
        ),
    )


def run_synthetic_cycle(observations: Sequence[SyntheticObservation]) -> dict:
    normalized = normalize_observations(observations)
    reflection = reflect_on_observations(normalized)
    seeds = create_candidate_seeds(normalized)
    proposals = [build_shadow_proposal(seed) for seed in seeds]
    return {
        "mode": "synthetic_shadow_only",
        "production_access": False,
        "external_actions": False,
        "reflection": reflection,
        "system_names": list(SYSTEMS),
        "system_assessments": {
            name: {
                "observations": [],
                "evidence_refs": [],
                "counter_evidence_refs": [],
                "confidence": 0.0,
                "unknowns": ["No real system assessment is performed in this deterministic scaffold."],
                "recommendation": "wait",
            }
            for name in SYSTEMS
        },
        "candidate_seeds": [asdict(seed) for seed in seeds],
        "proposals": [asdict(proposal) for proposal in proposals],
        "decision": "wait_for_evidence",
        "note": "A candidate is not a fact; a proposal is not authorization.",
    }


def dump_report(report: dict) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2)
