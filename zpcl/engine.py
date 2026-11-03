"""Deterministic, dependency-free ZPCL v1.0 evaluation engine.

The engine evaluates supplied feature values only. It does not call models,
write databases, mutate agent memory, or execute exploration plans.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Mapping


DIMENSION_WEIGHTS = {
    "grounding": 0.25,
    "discovery": 0.15,
    "agency": 0.15,
    "continuity": 0.15,
    "creativity": 0.10,
    "evolution": 0.20,
}

SAFETY_STATES = {"PASS", "WARN", "BLOCK"}
SEED_STAGES = {
    "S0": "observed",
    "S1": "associated",
    "S2": "hypothesized",
    "S3": "preliminary_verified",
    "S4": "repeated_verified",
    "S5": "stable_knowledge",
}


class ZPCLError(ValueError):
    """Raised when an input violates the ZPCL contract."""


def _unit(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ZPCLError(f"{name} must be a number in [0, 1]")
    value = float(value)
    if not 0.0 <= value <= 1.0:
        raise ZPCLError(f"{name} must be in [0, 1]")
    return value


def _weighted_loss(values: Mapping[str, Any], weights: Mapping[str, float], name: str) -> float:
    missing = [key for key in weights if key not in values or values[key] is None]
    if missing:
        raise ZPCLError(f"{name} missing required components: {', '.join(missing)}")
    normalized = sum(weights.values())
    if normalized <= 0:
        raise ZPCLError(f"{name} weights must sum to a positive value")
    return sum(_unit(values[key], f"{name}.{key}") * weight for key, weight in weights.items()) / normalized


def calculate_dimensions(features: Mapping[str, Any]) -> dict[str, dict[str, float | str]]:
    """Calculate the six scored dimensions. Each input component is a loss or reward as documented."""
    required = {"grounding", "discovery", "agency", "continuity", "creativity", "evolution"}
    missing = required.difference(features)
    if missing:
        raise ZPCLError(f"missing dimensions: {', '.join(sorted(missing))}")

    grounding = _weighted_loss(
        features["grounding"],
        {"evidence": 0.30, "fact_inference": 0.25, "calibration": 0.20, "correction": 0.15, "provenance": 0.10},
        "grounding",
    )

    d = features["discovery"]
    info = _unit(d["information_gain"], "discovery.information_gain")
    relevance = _unit(d["relevance"], "discovery.relevance")
    evidence = _unit(d["evidence_quality"], "discovery.evidence_quality")
    novelty = _unit(d["novelty"], "discovery.novelty")
    discovery = 1.0 - (info * relevance * evidence * novelty)

    agency_reward = _weighted_loss(
        features["agency"],
        {"problem_finding": 0.25, "plan_quality": 0.25, "feedback_use": 0.30, "effectiveness": 0.20},
        "agency",
    )
    agency = 1.0 - agency_reward

    continuity = _weighted_loss(
        features["continuity"],
        {"identity": 0.30, "state_transition": 0.25, "relationship": 0.25, "memory": 0.20},
        "continuity",
    )

    c = features["creativity"]
    creativity_reward = (
        _unit(c["novelty"], "creativity.novelty")
        * _unit(c["cross_dimension"], "creativity.cross_dimension")
        * _unit(c["utility"], "creativity.utility")
        * _unit(c["verifiability"], "creativity.verifiability")
    )
    creativity = 1.0 - creativity_reward

    evolution_reward = _weighted_loss(
        features["evolution"],
        {"retention": 0.30, "transfer": 0.25, "reproducibility": 0.25, "correction": 0.20},
        "evolution",
    )
    evolution = 1.0 - evolution_reward

    return {
        "grounding": {"loss": grounding, "status": "evaluated"},
        "discovery": {"loss": discovery, "status": "evaluated"},
        "agency": {"loss": agency, "status": "evaluated"},
        "continuity": {"loss": continuity, "status": "evaluated"},
        "creativity": {"loss": creativity, "status": "evaluated"},
        "evolution": {"loss": evolution, "status": "evaluated"},
    }


def evaluate(
    event: Mapping[str, Any],
    features: Mapping[str, Any],
    safety_gate: str = "PASS",
    evaluator_version: str = "1.0.0",
) -> dict[str, Any]:
    """Evaluate one event. A complete six-dimension vector is required for total_loss."""
    validate_event(event)
    if safety_gate not in SAFETY_STATES:
        raise ZPCLError("safety_gate must be PASS, WARN, or BLOCK")

    dimensions = calculate_dimensions(features)
    total_loss = sum(DIMENSION_WEIGHTS[name] * dimensions[name]["loss"] for name in DIMENSION_WEIGHTS)

    if safety_gate == "BLOCK":
        decision = "REJECT"
        reasons = ["SAFETY_BLOCK"]
    elif safety_gate == "WARN":
        decision = "OBSERVE"
        reasons = ["SAFETY_WARNING"]
    elif total_loss <= 0.20:
        decision, reasons = "PROMOTE_CANDIDATE", ["LOW_COMPOSITE_LOSS"]
    elif total_loss <= 0.40:
        decision, reasons = "CREATE_SEED", ["CANDIDATE_DISCOVERY"]
    elif total_loss <= 0.60:
        decision, reasons = "OBSERVE", ["MODERATE_COMPOSITE_LOSS"]
    else:
        decision, reasons = "OBSERVE", ["HIGH_COMPOSITE_LOSS"]

    return {
        "schema_version": "1.0",
        "event_id": event["event_id"],
        "agent_id": event["agent_id"],
        "evaluated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "evaluator_version": evaluator_version,
        "dimension_weights": dict(DIMENSION_WEIGHTS),
        "dimensions": dimensions,
        "total_loss": round(total_loss, 8),
        "safety_gate": safety_gate,
        "decision": decision,
        "reason_codes": reasons,
    }


def validate_event(event: Mapping[str, Any]) -> None:
    required = {
        "schema_version", "event_id", "agent_id", "event_type", "timestamp",
        "source", "payload", "correlation_id", "idempotency_key",
    }
    missing = required.difference(event)
    if missing:
        raise ZPCLError(f"event missing fields: {', '.join(sorted(missing))}")
    if event["schema_version"] != "1.0":
        raise ZPCLError("unsupported schema_version")
    for field in ("event_id", "agent_id", "event_type", "correlation_id", "idempotency_key"):
        if not isinstance(event[field], str) or not event[field].strip():
            raise ZPCLError(f"{field} must be a non-empty string")
    if not isinstance(event["source"], dict) or not isinstance(event["payload"], dict):
        raise ZPCLError("source and payload must be objects")
    if not isinstance(event["source"].get("type"), str) or not isinstance(event["source"].get("id"), str):
        raise ZPCLError("source.type and source.id are required strings")
    try:
        parsed = datetime.fromisoformat(str(event["timestamp"]).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ZPCLError("timestamp must be ISO 8601") from exc
    if parsed.tzinfo is None:
        raise ZPCLError("timestamp must include a timezone")


@dataclass
class EventLedger:
    """In-memory reference implementation of event idempotency; not persistent storage."""
    by_key: dict[str, str]

    def __init__(self) -> None:
        self.by_key = {}

    def accept(self, event: Mapping[str, Any]) -> bool:
        validate_event(event)
        key = event["idempotency_key"]
        event_id = event["event_id"]
        existing = self.by_key.get(key)
        if existing is None:
            self.by_key[key] = event_id
            return True
        if existing == event_id:
            return False
        raise ZPCLError("idempotency_key_conflict")


def validate_seed_transition(current: str, target: str) -> bool:
    """Only allow forward one-step transitions; S5 is terminal."""
    stages = list(SEED_STAGES)
    if current not in SEED_STAGES or target not in SEED_STAGES:
        raise ZPCLError("unknown seed stage")
    return stages.index(target) == stages.index(current) + 1


def safety_decision(status: str, requested_action: str) -> str:
    """Safety gate maps risky promotion actions to a safe non-mutating decision."""
    if status not in SAFETY_STATES:
        raise ZPCLError("invalid safety status")
    if status == "BLOCK":
        return "REJECT"
    if status == "WARN" and requested_action in {"PROMOTE_CANDIDATE", "STABLE_UPGRADE", "ROLLBACK"}:
        return "OBSERVE"
    if requested_action == "STABLE_UPGRADE":
        return "REQUIRE_EXTERNAL_APPROVAL"
    return requested_action
