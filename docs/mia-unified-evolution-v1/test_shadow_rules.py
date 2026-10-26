import unittest

from shadow_rules import (
    SYSTEMS,
    adjust_confidence_for_contradiction,
    bounded_trait_delta,
    choose_next_step,
    contradiction_ratio,
    distinct_source_refs,
    empty_system_assessments,
    make_candidate,
)


class ShadowRuleTests(unittest.TestCase):
    def test_candidate_is_not_asserted_as_fact(self):
        seed = make_candidate(
            "question", "Could there be another explanation?", ["synthetic-1"],
            hypotheses=["unverified hypothesis"], unknowns=["cause"],
            confidence=0.9,
        )
        self.assertEqual(seed.status, "candidate")
        self.assertEqual(seed.confidence, 0.5)
        self.assertEqual(seed.known_facts, ())

    def test_single_or_duplicate_source_is_not_independent_support(self):
        self.assertFalse(distinct_source_refs(["event-1"]))
        self.assertFalse(distinct_source_refs(["event-1", "event-1"]))

    def test_distinct_ids_are_only_a_necessary_check(self):
        self.assertTrue(distinct_source_refs(["event-1", "event-2"]))

    def test_contradictions_reduce_confidence(self):
        self.assertLess(adjust_confidence_for_contradiction(0.8, 2, 2), 0.8)

    def test_contradiction_ratio(self):
        self.assertAlmostEqual(contradiction_ratio(3, 2), 0.4)

    def test_trait_delta_is_bounded(self):
        self.assertEqual(bounded_trait_delta(1.0), 0.02)
        self.assertEqual(bounded_trait_delta(-1.0), -0.02)
        self.assertEqual(bounded_trait_delta(0.01), 0.01)

    def test_negative_delta_limit_is_rejected(self):
        with self.assertRaises(ValueError):
            bounded_trait_delta(0.1, -0.1)

    def test_six_systems_start_without_invented_evidence(self):
        assessments = empty_system_assessments()
        self.assertEqual(set(assessments), set(SYSTEMS))
        for item in assessments.values():
            self.assertEqual(item["evidence_refs"], [])
            self.assertEqual(item["confidence"], 0.0)

    def test_high_risk_never_executes(self):
        self.assertEqual(choose_next_step(0.95, "high", False), "stay_silent")

    def test_external_impact_requires_authorization(self):
        self.assertEqual(
            choose_next_step(0.99, "low", False, external_or_user_impact=True),
            "await_authorization",
        )

    def test_low_confidence_waits(self):
        self.assertEqual(choose_next_step(0.1, "low", False), "wait_for_evidence")

    def test_counter_evidence_waits(self):
        self.assertEqual(choose_next_step(0.9, "low", True), "wait_for_evidence")

    def test_medium_confidence_cultivates(self):
        self.assertEqual(choose_next_step(0.4, "low", False), "cultivate")

    def test_invalid_seed_kind_rejected(self):
        with self.assertRaises(ValueError):
            make_candidate("magic", "test", ["event-1"])

    def test_empty_statement_rejected(self):
        with self.assertRaises(ValueError):
            make_candidate("question", "  ", ["event-1"])


if __name__ == "__main__":
    unittest.main()
