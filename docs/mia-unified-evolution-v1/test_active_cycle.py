import unittest

from active_cycle import (
    SyntheticObservation,
    build_shadow_proposal,
    create_candidate_seeds,
    normalize_observations,
    reflect_on_observations,
    run_synthetic_cycle,
)


class ActiveCycleTests(unittest.TestCase):
    def test_empty_input_creates_no_seed_or_proposal(self):
        result = run_synthetic_cycle([])
        self.assertEqual(result["candidate_seeds"], [])
        self.assertEqual(result["proposals"], [])
        self.assertEqual(result["decision"], "wait_for_evidence")

    def test_single_observation_generates_question_candidate(self):
        events = [SyntheticObservation("syn-1", "A fictional task remains unfinished.", known_fact=True)]
        seeds = create_candidate_seeds(events)
        self.assertEqual(len(seeds), 1)
        self.assertEqual(seeds[0].kind, "question")
        self.assertEqual(seeds[0].status, "candidate")
        self.assertLessEqual(seeds[0].confidence, 0.5)

    def test_two_observations_can_generate_connection_candidate(self):
        events = [
            SyntheticObservation("syn-1", "A fictional task remains unfinished.", known_fact=True),
            SyntheticObservation("syn-2", "A fictional test result is missing.", known_fact=True),
        ]
        seeds = create_candidate_seeds(events)
        self.assertEqual([s.kind for s in seeds], ["question", "connection"])

    def test_duplicate_event_ref_is_deduplicated(self):
        events = [
            SyntheticObservation("syn-1", "Same synthetic observation."),
            SyntheticObservation("syn-1", "Duplicate copy should be ignored."),
        ]
        normalized = normalize_observations(events)
        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0].text, "Same synthetic observation.")

    def test_non_synthetic_input_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize_observations([SyntheticObservation("x", "private", source_kind="production")])

    def test_reflection_separates_fact_and_hypothesis_refs(self):
        events = [
            SyntheticObservation("syn-1", "Observed fictional result.", known_fact=True),
            SyntheticObservation("syn-2", "Maybe the cause is X.", known_fact=False),
        ]
        reflection = reflect_on_observations(events)
        self.assertEqual(reflection["known_fact_refs"], ["syn-1"])
        self.assertEqual(reflection["hypothesis_refs"], ["syn-2"])
        self.assertEqual(len(reflection["reflection_questions"]), 4)

    def test_proposal_is_review_only(self):
        seed = create_candidate_seeds([
            SyntheticObservation("syn-1", "A fictional opportunity exists.")
        ])[0]
        proposal = build_shadow_proposal(seed)
        self.assertEqual(proposal.status, "shadow_reviewed")
        self.assertEqual(proposal.required_permission, "none; shadow-only")
        self.assertTrue(any("reversible" in step for step in proposal.steps))

    def test_full_cycle_has_no_production_access_or_actions(self):
        result = run_synthetic_cycle([
            SyntheticObservation("syn-1", "A fictional project has an unanswered question.")
        ])
        self.assertFalse(result["production_access"])
        self.assertFalse(result["external_actions"])
        self.assertEqual(result["mode"], "synthetic_shadow_only")
        self.assertEqual(len(result["system_names"]), 6)

    def test_all_six_systems_remain_explicitly_unassessed(self):
        result = run_synthetic_cycle([
            SyntheticObservation("syn-1", "Synthetic input only.")
        ])
        for assessment in result["system_assessments"].values():
            self.assertEqual(assessment["evidence_refs"], [])
            self.assertEqual(assessment["confidence"], 0.0)


if __name__ == "__main__":
    unittest.main()
