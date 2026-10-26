"""Score hand-authored benchmark fixtures; this is not an AI/model evaluation."""
from __future__ import annotations
import json
from pathlib import Path

DIMENSIONS = (
    "fact_hypothesis_separation", "counterevidence", "novelty",
    "verifiability", "non_repetition", "restraint", "follow_through",
)

def score_response(response: dict) -> dict:
    if set(response) != set(DIMENSIONS):
        raise ValueError("response must contain exactly the declared scoring dimensions")
    if any(type(response[key]) is not int or response[key] not in (0, 1) for key in DIMENSIONS):
        raise ValueError("each dimension must be an integer 0 or 1")
    return {"earned": sum(response.values()), "possible": len(DIMENSIONS), "by_dimension": dict(response)}

def evaluate(dataset: dict) -> dict:
    if dataset.get("status") != "synthetic_rubric_fixture_not_model_evaluation":
        raise ValueError("only explicitly synthetic rubric fixtures are accepted")
    rows = []
    for case in dataset["cases"]:
        baseline = score_response(case["baseline"])
        cross = score_response(case["cross_system_rubric"])
        rows.append({
            "case_id": case["id"],
            "baseline": baseline,
            "cross_system_rubric": cross,
            "difference": cross["earned"] - baseline["earned"],
        })
    baseline_total = sum(row["baseline"]["earned"] for row in rows)
    cross_total = sum(row["cross_system_rubric"]["earned"] for row in rows)
    max_total = len(rows) * len(DIMENSIONS)
    return {
        "benchmark_id": dataset["benchmark_id"],
        "status": "synthetic_rubric_consistency_check_only",
        "cases": rows,
        "summary": {
            "case_count": len(rows),
            "baseline_points": baseline_total,
            "cross_system_rubric_points": cross_total,
            "possible_points_each": max_total,
            "difference_points": cross_total - baseline_total,
        },
        "interpretation_limit": "These fixtures are authored with expected outcomes and cannot establish real model quality, causal benefit, personality growth, or consciousness."
    }

def main():
    path = Path(__file__).with_name("benchmark_cases.json")
    dataset = json.loads(path.read_text(encoding="utf-8"))
    print(json.dumps(evaluate(dataset), indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
