import json
import unittest
from pathlib import Path

from zpcl.engine import (
    DIMENSION_WEIGHTS, EventLedger, ZPCLError, calculate_dimensions,
    evaluate, safety_decision, validate_event, validate_seed_transition,
)

ROOT = Path(__file__).resolve().parents[1]

def event(event_id="evt-1", key="idem-1"):
    return {
        "schema_version": "1.0",
        "event_id": event_id,
        "agent_id": "agent-test",
        "event_type": "environment.observation",
        "timestamp": "2026-11-02T02:00:00Z",
        "source": {"type": "environment", "id": "forest-corridor"},
        "payload": {"observation": "small waveform oscillation"},
        "provenance": {"origin": "fixture"},
        "correlation_id": "corr-1",
        "idempotency_key": key,
    }

def features():
    return {
        "grounding": {"evidence": .1, "fact_inference": .1, "calibration": .2, "correction": .1, "provenance": .1},
        "discovery": {"information_gain": .8, "relevance": .9, "evidence_quality": .8, "novelty": .7},
        "agency": {"problem_finding": .8, "plan_quality": .7, "feedback_use": .8, "effectiveness": .7},
        "continuity": {"identity": .05, "state_transition": .1, "relationship": .05, "memory": .1},
        "creativity": {"novelty": .8, "cross_dimension": .8, "utility": .7, "verifiability": .8},
        "evolution": {"retention": .7, "transfer": .6, "reproducibility": .7, "correction": .8},
    }

class FormulaTests(unittest.TestCase):
    def test_weights_sum_to_one(self):
        self.assertAlmostEqual(sum(DIMENSION_WEIGHTS.values()), 1.0)

    def test_dimensions_are_bounded(self):
        result = calculate_dimensions(features())
        self.assertEqual(set(result), set(DIMENSION_WEIGHTS))
        for item in result.values():
            self.assertGreaterEqual(item["loss"], 0)
            self.assertLessEqual(item["loss"], 1)

    def test_discovery_product_reward(self):
        f = features()
        f["discovery"] = {"information_gain": 1, "relevance": 1, "evidence_quality": 1, "novelty": 1}
        self.assertAlmostEqual(calculate_dimensions(f)["discovery"]["loss"], 0)

    def test_random_noise_low_evidence_gets_low_reward(self):
        f = features()
        f["discovery"] = {"information_gain": 1, "relevance": .2, "evidence_quality": 0, "novelty": 1}
        self.assertAlmostEqual(calculate_dimensions(f)["discovery"]["loss"], 1)

    def test_missing_component_rejected(self):
        f = features()
        del f["grounding"]["evidence"]
        with self.assertRaises(ZPCLError):
            calculate_dimensions(f)

    def test_out_of_range_rejected(self):
        f = features()
        f["creativity"]["novelty"] = 1.2
        with self.assertRaises(ZPCLError):
            calculate_dimensions(f)

    def test_total_loss_is_weighted_sum(self):
        result = evaluate(event(), features())
        expected = sum(DIMENSION_WEIGHTS[k] * result["dimensions"][k]["loss"] for k in DIMENSION_WEIGHTS)
        self.assertAlmostEqual(result["total_loss"], expected)

    def test_safety_block_overrides_positive_score(self):
        result = evaluate(event(), features(), safety_gate="BLOCK")
        self.assertEqual(result["decision"], "REJECT")
        self.assertEqual(result["safety_gate"], "BLOCK")

    def test_warn_does_not_promote(self):
        result = evaluate(event(), features(), safety_gate="WARN")
        self.assertEqual(result["decision"], "OBSERVE")

class EventTests(unittest.TestCase):
    def test_valid_event(self):
        validate_event(event())

    def test_missing_required_field_rejected(self):
        bad = event()
        del bad["agent_id"]
        with self.assertRaises(ZPCLError):
            validate_event(bad)

    def test_timezone_required(self):
        bad = event()
        bad["timestamp"] = "2026-11-02T02:00:00"
        with self.assertRaises(ZPCLError):
            validate_event(bad)

    def test_unsupported_schema_rejected(self):
        bad = event()
        bad["schema_version"] = "9.0"
        with self.assertRaises(ZPCLError):
            validate_event(bad)

    def test_idempotent_duplicate_is_ignored(self):
        ledger = EventLedger()
        self.assertTrue(ledger.accept(event()))
        self.assertFalse(ledger.accept(event()))

    def test_idempotency_key_collision_rejected(self):
        ledger = EventLedger()
        ledger.accept(event())
        with self.assertRaisesRegex(ZPCLError, "idempotency_key_conflict"):
            ledger.accept(event(event_id="evt-2"))

    def test_seed_stage_only_moves_forward_one_step(self):
        self.assertTrue(validate_seed_transition("S1", "S2"))
        self.assertFalse(validate_seed_transition("S1", "S3"))
        self.assertFalse(validate_seed_transition("S5", "S5"))

    def test_unknown_seed_stage_rejected(self):
        with self.assertRaises(ZPCLError):
            validate_seed_transition("S9", "S1")

    def test_safety_gate_requires_approval_for_stable_upgrade(self):
        self.assertEqual(safety_decision("PASS", "STABLE_UPGRADE"), "REQUIRE_EXTERNAL_APPROVAL")
        self.assertEqual(safety_decision("WARN", "STABLE_UPGRADE"), "OBSERVE")
        self.assertEqual(safety_decision("BLOCK", "STABLE_UPGRADE"), "REJECT")

class SchemaTests(unittest.TestCase):
    def test_all_json_schemas_parse(self):
        schema_dir = ROOT / "schemas"
        files = sorted(schema_dir.glob("*.schema.json"))
        self.assertEqual({p.name for p in files}, {"event.schema.json", "evaluation.schema.json", "seed.schema.json"})
        for path in files:
            with path.open(encoding="utf-8") as handle:
                schema = json.load(handle)
            self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
            self.assertIn("required", schema)

if __name__ == "__main__":
    unittest.main()
