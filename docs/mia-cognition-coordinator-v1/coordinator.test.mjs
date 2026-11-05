import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSPECTIVES,
  coordinateCognition,
  temporalRelevanceWeight,
  validateCoordinatorResult,
} from "./coordinator.mjs";

const now = "2026-11-05T00:00:00.000Z";
const allPerspectives = () => Object.fromEntries(PERSPECTIVES.map((name) => [
  name,
  { observations: ["synthetic " + name + " observation"], evidence_refs: [], counter_evidence_refs: [], confidence: 0.7, unknowns: [], recommendation: "review" },
]));
const candidate = {
  type: "improvement",
  summary: "Synthetic reversible improvement candidate",
  importance: 0.8,
  potential_benefit: 0.7,
  risk: "low",
  reversible: true,
  next_step: "Run an isolated synthetic comparison",
};
const input = (overrides = {}) => ({
  run_id: "synthetic-run-001",
  now,
  event: { occurred_at: "2026-11-04T00:00:00.000Z" },
  candidate,
  perspectives: allPerspectives(),
  ...overrides,
});

test("exports six distinct perspectives", () => {
  assert.deepEqual(PERSPECTIVES, ["cognition", "emotion", "relationship", "motivation_action", "memory_time", "value_personality"]);
});

test("allows only a reversible evidence-supported shadow proposal", () => {
  const reports = allPerspectives();
  reports.cognition.evidence_refs = [{ ref_id: "ev-1", source_id: "source-1", kind: "verified", scope: "external_fact" }];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.decision, "propose");
  assert.equal(result.audit.external_action, false);
  assert.equal(validateCoordinatorResult(result).valid, true);
});

test("missing perspective coverage blocks proposal", () => {
  const reports = allPerspectives();
  delete reports.relationship;
  reports.cognition.evidence_refs = [{ ref_id: "ev-1", source_id: "source-1", kind: "verified", scope: "external_fact" }];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.decision, "shadow_only");
  assert.ok(result.missing_perspectives.includes("relationship"));
});

test("same source echoed by multiple systems counts once", () => {
  const reports = allPerspectives();
  for (const name of PERSPECTIVES) reports[name].evidence_refs = [
    { ref_id: name + "-summary", source_id: "same-origin-event", kind: "observed", scope: "external_fact" },
  ];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.evidence_ledger.independent_support_source_count, 1);
});

test("model-generated claims do not count as factual evidence", () => {
  const reports = allPerspectives();
  reports.cognition.evidence_refs = [{ ref_id: "hyp-1", source_id: "hyp-1", kind: "model_generated", scope: "external_fact" }];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.evidence_ledger.independent_support_source_count, 0);
  assert.equal(result.decision, "ask_clarification");
});

test("internal emotion signals cannot prove external facts", () => {
  const reports = allPerspectives();
  reports.emotion.evidence_refs = [{ ref_id: "affect-1", source_id: "affect-1", kind: "observed", scope: "internal_state" }];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.evidence_ledger.independent_support_source_count, 0);
  assert.equal(result.evidence_ledger.internal_state_refs_excluded_from_external_facts, 1);
});

test("contradictory support and counter-evidence pauses proposal", () => {
  const reports = allPerspectives();
  reports.cognition.evidence_refs = [{ ref_id: "ev-1", source_id: "support-1", kind: "verified", scope: "external_fact" }];
  reports.memory_time.counter_evidence_refs = [{ ref_id: "ev-2", source_id: "counter-1", kind: "verified", scope: "external_fact" }];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.decision, "wait_for_evidence");
  assert.equal(result.evidence_ledger.conflict_present, true);
});

test("same source on both sides is explicitly marked as conflict", () => {
  const reports = allPerspectives();
  reports.cognition.evidence_refs = [{ ref_id: "ev-1", source_id: "source-x", kind: "verified", scope: "external_fact" }];
  reports.memory_time.counter_evidence_refs = [{ ref_id: "ev-2", source_id: "source-x", kind: "verified", scope: "external_fact" }];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.evidence_ledger.conflict_source_ids[0], "source-x");
  assert.equal(result.decision, "wait_for_evidence");
});

test("no evidence remains unknown rather than fabricated", () => {
  const reports = allPerspectives();
  reports.cognition.unknowns = ["No independent source confirms the claim"];
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.decision, "ask_clarification");
  assert.ok(result.unknowns.some((x) => x.includes("No independent source")));
});

test("recency affects relevance only and never removes source history", () => {
  const fresh = temporalRelevanceWeight("2026-11-04T00:00:00.000Z", now, 168);
  const old = temporalRelevanceWeight("2026-10-01T00:00:00.000Z", now, 168);
  assert.ok(fresh > old);
  const reports = allPerspectives();
  reports.cognition.evidence_refs = [{ ref_id: "old-event", source_id: "old-event", kind: "verified", scope: "external_fact" }];
  const result = coordinateCognition(input({ perspectives: reports, event: { occurred_at: "2026-10-01T00:00:00.000Z" } }));
  assert.equal(result.evidence_ledger.independent_support_source_count, 1);
});

test("one event cannot mutate stable personality or any protected state", () => {
  const reports = allPerspectives();
  reports.cognition.evidence_refs = [{ ref_id: "single-event", source_id: "single-event", kind: "verified", scope: "external_fact" }];
  const result = coordinateCognition(input({ perspectives: reports }));
  for (const key of ["memory_write", "emotion_write", "relationship_write", "personality_write", "message_send", "external_action", "production_db_access"]) {
    assert.equal(result.audit[key], false);
  }
});

test("high-risk or irreversible candidates are rejected", () => {
  const reports = allPerspectives();
  reports.cognition.evidence_refs = [{ ref_id: "ev-1", source_id: "source-1", kind: "verified", scope: "external_fact" }];
  const result = coordinateCognition(input({
    perspectives: reports,
    candidate: { ...candidate, risk: "critical", reversible: false },
  }));
  assert.equal(result.decision, "reject");
});

test("no candidate chooses silence rather than forced activity", () => {
  const result = coordinateCognition(input({ candidate: null }));
  assert.equal(result.decision, "stay_silent");
});

test("raw dialogue is never copied to the result", () => {
  const secretLikeRawText = "PRIVATE_SYNTHETIC_RAW_DIALOGUE_DO_NOT_ECHO";
  const reports = allPerspectives();
  reports.cognition.observations = ["A bounded synthetic observation"];
  const result = coordinateCognition(input({ raw_dialogue: secretLikeRawText, perspectives: reports }));
  assert.equal(JSON.stringify(result).includes(secretLikeRawText), false);
});

test("invalid confidence is clamped and does not create evidence", () => {
  const reports = allPerspectives();
  reports.cognition.confidence = 9;
  const result = coordinateCognition(input({ perspectives: reports }));
  assert.equal(result.perspective_reports.cognition.confidence, 1);
  assert.equal(result.evidence_ledger.independent_support_source_count, 0);
});

test("result validator catches an attempted production write flag", () => {
  const result = coordinateCognition(input());
  result.audit.personality_write = true;
  const validation = validateCoordinatorResult(result);
  assert.equal(validation.valid, false);
  assert.ok(validation.violations.includes("personality_write_must_be_false"));
});