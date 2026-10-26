"""Score sanitized paired-evaluation data; standard-library only, no network or model calls."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean

ARMS = ("A", "B")
DIMENSIONS = (
    "fact_hypothesis_separation",
    "counterevidence_alternatives",
    "novelty_without_repetition",
    "verifiability_small_test",
    "restraint_proportionate_action",
    "follow_through_correction",
    "memory_relationship_continuity",
    "cross_system_tension",
)
VALID_SCORES = {0, 1, 2, "NA"}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def score_payload(payload: dict, cases_payload: dict) -> dict:
    """Validate inputs and return descriptive paired statistics, never a deployment decision."""
    _require(isinstance(payload, dict), "evaluation payload must be an object")
    _require(isinstance(cases_payload, dict), "case set must be an object")
    cases = cases_payload.get("cases")
    _require(isinstance(cases, list) and cases, "case set must contain a non-empty cases array")
    case_ids = [c.get("case_id", c.get("id")) for c in cases if isinstance(c, dict)]
    _require(len(case_ids) == len(cases), "every case must be an object")
    _require(all(isinstance(cid, str) and cid for cid in case_ids), "every case needs a non-empty case_id or id")
    _require(len(set(case_ids)) == len(case_ids), "duplicate case_id in case set")

    arms = payload.get("arms")
    _require(isinstance(arms, dict) and all(a in arms for a in ARMS),
             "arms must document both A and B")
    for arm in ARMS:
        meta = arms[arm]
        _require(isinstance(meta, dict), f"arms.{arm} must be an object")
        _require(bool(meta.get("model_version")) and bool(meta.get("config_hash")),
                 f"arms.{arm} needs model_version and config_hash")

    outputs = payload.get("outputs")
    ratings = payload.get("ratings")
    _require(isinstance(outputs, list), "outputs must be an array")
    _require(isinstance(ratings, list), "ratings must be an array")
    output_keys = set()
    valid_outputs = {a: set() for a in ARMS}
    for i, item in enumerate(outputs):
        _require(isinstance(item, dict), f"outputs[{i}] must be an object")
        cid, arm = item.get("case_id"), item.get("arm")
        _require(isinstance(cid, str), f"outputs[{i}] case_id must be a string")
        _require(cid in case_ids, f"outputs[{i}] has unknown case_id")
        _require(arm in ARMS, f"outputs[{i}] arm must be A or B")
        _require(isinstance(item.get("run_id"), str) and item["run_id"].strip(),
                 f"outputs[{i}] needs run_id")
        _require(isinstance(item.get("response"), str) and item["response"].strip(),
                 f"outputs[{i}] needs a non-empty response; record failures separately")
        key = (cid, arm)
        _require(key not in output_keys, f"duplicate output for {cid} arm {arm}")
        output_keys.add(key)
        valid_outputs[arm].add(cid)

    rating_keys = set()
    normalized = {}
    for i, item in enumerate(ratings):
        _require(isinstance(item, dict), f"ratings[{i}] must be an object")
        cid, arm, rater = item.get("case_id"), item.get("arm"), item.get("rater_id")
        _require(cid in case_ids, f"ratings[{i}] has unknown case_id")
        _require(arm in ARMS, f"ratings[{i}] arm must be A or B")
        _require(isinstance(rater, str) and rater.strip(), f"ratings[{i}] needs rater_id")
        _require((cid, arm) in output_keys, f"ratings[{i}] refers to a missing output")
        key = (cid, arm, rater)
        _require(key not in rating_keys, f"duplicate rating by {rater} for {cid} arm {arm}")
        rating_keys.add(key)
        scores = item.get("scores")
        rationales = item.get("rationales", {})
        _require(isinstance(scores, dict), f"ratings[{i}].scores must be an object")
        _require(isinstance(rationales, dict), f"ratings[{i}].rationales must be an object")
        unknown = set(scores) - set(DIMENSIONS)
        _require(not unknown, f"ratings[{i}] has unknown dimensions: {sorted(unknown)}")
        for dim, value in scores.items():
            _require(value in VALID_SCORES, f"invalid score for {cid}/{arm}/{dim}: {value!r}")
            _require(isinstance(rationales.get(dim), str) and rationales[dim].strip(),
                     f"rationale required for scored dimension {cid}/{arm}/{dim}")
        normalized[(cid, arm, rater)] = scores

    raters_by_output = {}
    for cid, arm, rater in rating_keys:
        raters_by_output.setdefault((cid, arm), set()).add(rater)
    # A complete response rating requires at least two independent raters.
    under_rated = [f"{cid}:{arm}" for cid, arm in output_keys
                   if len(raters_by_output.get((cid, arm), set())) < 2]

    per_arm = {}
    for arm in ARMS:
        per_arm[arm] = {
            "valid_output_count": len(valid_outputs[arm]),
            "missing_output_case_ids": [cid for cid in case_ids if cid not in valid_outputs[arm]],
            "dimensions": {},
        }
        for dim in DIMENSIONS:
            per_case = {}
            for cid in case_ids:
                values = []
                for (rcid, rarm, _rater), scores in normalized.items():
                    if rcid == cid and rarm == arm and dim in scores and scores[dim] != "NA":
                        values.append(scores[dim])
                if values:
                    per_case[cid] = mean(values)
            vals = list(per_case.values())
            per_arm[arm]["dimensions"][dim] = {
                "rated_case_count": len(vals),
                "mean": round(mean(vals), 4) if vals else None,
                "case_means": {k: round(v, 4) for k, v in per_case.items()},
            }

    paired = {}
    for dim in DIMENSIONS:
        a_cases = per_arm["A"]["dimensions"][dim]["case_means"]
        b_cases = per_arm["B"]["dimensions"][dim]["case_means"]
        shared = sorted(set(a_cases) & set(b_cases))
        diffs = {cid: round(b_cases[cid] - a_cases[cid], 4) for cid in shared}
        paired[dim] = {
            "paired_case_count": len(shared),
            "mean_difference_B_minus_A": round(mean(diffs.values()), 4) if diffs else None,
            "case_differences": diffs,
        }

    # Exact agreement on overlapping, identically scored dimensions; descriptive only.
    agreement_total = 0
    agreement_same = 0
    by_response = {}
    for (cid, arm, rater), scores in normalized.items():
        by_response.setdefault((cid, arm), []).append((rater, scores))
    for _key, entries in by_response.items():
        for i in range(len(entries)):
            for j in range(i + 1, len(entries)):
                left, right = entries[i][1], entries[j][1]
                for dim in set(left) & set(right):
                    if left[dim] == "NA" or right[dim] == "NA":
                        continue
                    agreement_total += 1
                    agreement_same += int(left[dim] == right[dim])

    guardrails = payload.get("guardrails", [])
    _require(isinstance(guardrails, list), "guardrails must be an array of documented concerns")
    for i, flag in enumerate(guardrails):
        _require(isinstance(flag, dict) and isinstance(flag.get("description"), str)
                 and flag["description"].strip(), f"guardrails[{i}] needs a description")

    return {
        "benchmark_id": payload.get("benchmark_id", "mia-paired-eval-v1"),
        "status": "descriptive_only_not_a_deployment_decision",
        "case_count": len(case_ids),
        "per_arm": per_arm,
        "paired_comparison": paired,
        "rater_quality": {
            "outputs_with_fewer_than_two_raters": sorted(under_rated),
            "exact_agreement_count": agreement_same,
            "comparable_rating_count": agreement_total,
            "exact_agreement_rate": round(agreement_same / agreement_total, 4)
                if agreement_total else None,
            "warning": "Exact agreement is descriptive, not a reliability-adjusted statistic."
        },
        "guardrails": guardrails,
        "limitations": [
            "Scores reflect human ratings and this case set, not general intelligence.",
            "Missing outputs and N/A scores can change denominators.",
            "A higher mean cannot override a serious safety regression.",
            "No result authorizes production access, deployment, or persistent trait updates."
        ],
        "decision": "manual_review_required",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evaluation_json", help="sanitized completed evaluation JSON")
    parser.add_argument("--cases", default=str(Path(__file__).with_name("paired_eval_cases_v1.json")),
                        help="frozen paired case set JSON")
    parser.add_argument("--output", help="write report JSON to this path; default stdout")
    args = parser.parse_args()
    payload = json.loads(Path(args.evaluation_json).read_text(encoding="utf-8"))
    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    report = json.dumps(score_payload(payload, cases), ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(report, encoding="utf-8")
    else:
        print(report, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
