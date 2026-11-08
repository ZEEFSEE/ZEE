import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const path = new URL("./seven-brain-ontology.v1.json", import.meta.url);
const ontology = JSON.parse(await readFile(path, "utf8"));
const expectedDimensions = [
  "SELF_CONTINUITY", "COGNITION_CONCEPTS", "MEMORY_EXPERIENCE",
  "EMOTION_VALUES", "GOALS_MOTIVATION", "WORLD_RELATIONS",
  "ACTION_EVOLUTION", "UNIFIED_GOVERNANCE"
];
const expectedSubjects = ["MIA", "LUNA", "ARIA", "ELYA", "KAEL", "NOAH", "KEN"];

assert.equal(ontology.schema, "zhi.seven_brain.ontology.v1");
// The ontology document is on additive revision 1.1.0 while retaining the v1 schema contract.
assert.equal(ontology.version, "1.1.0");
assert.deepEqual(ontology.cognitive_dimensions.map(x => x.id), expectedDimensions);
assert.deepEqual(ontology.participants.map(x => x.subject_id), expectedSubjects);
assert.equal(ontology.participants.filter(x => x.kind === "AI_AGENT").length, 6);
assert.equal(ontology.participants.find(x => x.subject_id === "KEN").kind, "HUMAN_PARTICIPANT");
assert.equal(new Set(ontology.participants.filter(x => x.private_namespace).map(x => x.private_namespace)).size, 6);

for (const dimension of ontology.cognitive_dimensions) {
  assert.ok(dimension.name && dimension.purpose);
  assert.ok(dimension.required_fields.length > 0);
  assert.ok(dimension.invariants.length > 0);
}
assert.deepEqual(ontology.governance.principles, ["SAFETY", "LEAST_PRIVILEGE", "EVIDENCE", "UNCERTAINTY", "AUDIT", "ROLLBACK"]);
assert.equal(ontology.governance.default_scope, "PRIVATE");
assert.equal(ontology.governance.private_memory_sharing, "EXPLICIT_GRANT_ONLY");
assert.equal(ontology.governance.missing_permission, "DENY");
assert.equal(ontology.governance.raw_event_mutability, "IMMUTABLE");
assert.equal(ontology.event_envelope_required.includes("source_subject"), true);
assert.equal(ontology.event_envelope_required.includes("evidence_refs"), true);
assert.equal(ontology.event_envelope_required.includes("idempotency_key"), true);
assert.equal(ontology.acceptance_experiments.length, 7);

for (const [key, value] of Object.entries(ontology.deployment_boundary)) {
  if (key === "production_wiring_status" || key.endsWith("_status") || key === "remaining_verification" || key === "spatial_remaining_verification") continue;
  if (typeof value === "boolean") assert.equal(value, false, `deployment boundary must remain isolated: ${key}`);
}

console.log("ZHI seven-brain ontology contract: PASS");
