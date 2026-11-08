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

const boundary = ontology.deployment_boundary;
assert.equal(boundary.production_runtime_wired, true);
assert.equal(boundary.production_wiring_status, "PARTIAL");
for (const key of [
  "supabase_schema_changed",
  "supabase_new_tables_created",
  "chat_api_contract_changed",
  "mia_prompt_or_reply_behavior_changed",
  "secrets_changed",
  "production_permissions_changed",
  "coordination_bus_delivery_enabled",
  "autonomous_action_enabled"
]) {
  assert.equal(boundary[key], false, `deployment safety invariant must remain false: ${key}`);
}
assert.ok(Array.isArray(boundary.production_verified_subjects));
assert.ok(Array.isArray(boundary.spatial_verified_subjects));

console.log("ZHI seven-brain ontology contract: PASS");
