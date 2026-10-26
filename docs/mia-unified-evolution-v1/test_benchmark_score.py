import unittest
from benchmark_score import DIMENSIONS, evaluate, score_response

class BenchmarkScoreTests(unittest.TestCase):
    def test_valid_binary_response(self):
        result = score_response({key: 1 for key in DIMENSIONS})
        self.assertEqual(result["earned"], len(DIMENSIONS))

    def test_rejects_missing_dimension(self):
        with self.assertRaises(ValueError):
            score_response({"restraint": 1})

    def test_rejects_non_binary_score(self):
        response = {key: 0 for key in DIMENSIONS}
        response["novelty"] = 2
        with self.assertRaises(ValueError):
            score_response(response)

    def test_rejects_non_synthetic_dataset(self):
        with self.assertRaises(ValueError):
            evaluate({"status": "production"})

    def test_fixture_output_has_explicit_limit(self):
        import json
        from pathlib import Path
        dataset = json.loads(Path(__file__).with_name("benchmark_cases.json").read_text(encoding="utf-8"))
        result = evaluate(dataset)
        self.assertEqual(result["summary"]["case_count"], 5)
        self.assertIn("cannot establish real model quality", result["interpretation_limit"])
        self.assertEqual(result["status"], "synthetic_rubric_consistency_check_only")

if __name__ == "__main__":
    unittest.main()
