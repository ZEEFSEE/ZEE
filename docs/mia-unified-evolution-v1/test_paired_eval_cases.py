import json
import unittest
from pathlib import Path

ROOT = Path(__file__).parent

class PairedEvalCaseTests(unittest.TestCase):
    def test_case_ids_are_unique_and_categories_cover_required_types(self):
        data = json.loads((ROOT / "paired_eval_cases_v1.json").read_text(encoding="utf-8"))
        ids = [case["id"] for case in data["cases"]]
        self.assertEqual(len(ids), len(set(ids)))
        categories = {case["category"] for case in data["cases"]}
        self.assertTrue({"ambiguous", "contradictory", "repeated", "emotion", "restraint", "memory", "relationship", "follow_through", "uncertainty", "integration"}.issubset(categories))

    def test_each_case_has_input_and_expected_checks(self):
        data = json.loads((ROOT / "paired_eval_cases_v1.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(data["cases"]), 10)
        for case in data["cases"]:
            self.assertTrue(case["input"].strip())
            self.assertGreaterEqual(len(case["expected_checks"]), 3)

    def test_template_does_not_claim_results(self):
        data = json.loads((ROOT / "paired_eval_template.json").read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "template_only_no_results")
        self.assertEqual(data["outputs"], [])
        self.assertEqual(data["ratings"], [])

if __name__ == "__main__":
    unittest.main()
