import json
import unittest
from pathlib import Path

from paired_eval_score import DIMENSIONS, score_payload


def fixture():
    cases = {"cases": [{"case_id": "c1"}, {"case_id": "c2"}]}
    payload = {
        "benchmark_id": "unit-test",
        "arms": {
            "A": {"model_version": "test-model", "config_hash": "sha256:a"},
            "B": {"model_version": "test-model", "config_hash": "sha256:b"},
        },
        "outputs": [
            {"case_id": cid, "arm": arm, "run_id": f"{cid}-{arm}", "response": f"synthetic {cid} {arm}"}
            for cid in ("c1", "c2") for arm in ("A", "B")
        ],
        "ratings": [],
        "guardrails": [],
    }
    for cid in ("c1", "c2"):
        for arm in ("A", "B"):
            for rater in ("r1", "r2"):
                scores = {dim: (1 if arm == "A" else 2) for dim in DIMENSIONS}
                payload["ratings"].append({
                    "case_id": cid, "arm": arm, "rater_id": rater,
                    "scores": scores,
                    "rationales": {dim: "synthetic unit-test rationale" for dim in DIMENSIONS},
                })
    return payload, cases


class PairedEvalScoreTests(unittest.TestCase):
    def test_reports_paired_differences_without_deployment_claim(self):
        payload, cases = fixture()
        report = score_payload(payload, cases)
        self.assertEqual(report["status"], "descriptive_only_not_a_deployment_decision")
        self.assertEqual(report["case_count"], 2)
        self.assertEqual(report["paired_comparison"][DIMENSIONS[0]]["mean_difference_B_minus_A"], 1.0)
        self.assertEqual(report["rater_quality"]["exact_agreement_rate"], 1.0)
        self.assertEqual(report["decision"], "manual_review_required")

    def test_accepts_frozen_case_set_id_schema(self):
        cases_path = Path(__file__).with_name("paired_eval_cases_v1.json")
        cases = json.loads(cases_path.read_text(encoding="utf-8"))
        payload = {
            "arms": {
                "A": {"model_version": "test-model", "config_hash": "sha256:a"},
                "B": {"model_version": "test-model", "config_hash": "sha256:b"},
            },
            "outputs": [],
            "ratings": [],
            "guardrails": [],
        }
        report = score_payload(payload, cases)
        self.assertEqual(report["case_count"], 12)
        self.assertEqual(report["per_arm"]["A"]["valid_output_count"], 0)

    def test_rejects_duplicate_output(self):
        payload, cases = fixture()
        payload["outputs"].append(dict(payload["outputs"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate output"):
            score_payload(payload, cases)

    def test_rejects_missing_rationale(self):
        payload, cases = fixture()
        payload["ratings"][0]["rationales"][DIMENSIONS[0]] = ""
        with self.assertRaisesRegex(ValueError, "rationale required"):
            score_payload(payload, cases)

    def test_flags_outputs_with_insufficient_raters(self):
        payload, cases = fixture()
        payload["ratings"] = [r for r in payload["ratings"]
                              if not (r["case_id"] == "c1" and r["arm"] == "A" and r["rater_id"] == "r2")]
        report = score_payload(payload, cases)
        self.assertIn("c1:A", report["rater_quality"]["outputs_with_fewer_than_two_raters"])

    def test_rejects_unknown_case(self):
        payload, cases = fixture()
        payload["outputs"][0]["case_id"] = "not-in-frozen-set"
        with self.assertRaisesRegex(ValueError, "unknown case_id"):
            score_payload(payload, cases)


if __name__ == "__main__":
    unittest.main()
