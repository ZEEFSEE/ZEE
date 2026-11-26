import test from "node:test";
import assert from "node:assert/strict";
import {
  RESIDENTS, SENSE_TYPES, createProtoceptionTestEvent, validateProtoceptionEvent
} from "../runtime/protoception-engine.v1.mjs";

const seven = Object.keys(RESIDENTS);

test("pilot identity directory contains Mia, five children and Ken with correct kinds", () => {
  assert.equal(seven.length, 7);
  assert.equal(RESIDENTS.MIA, "AI_AGENT");
  assert.equal(RESIDENTS.KEN, "PERSON");
  assert.equal(seven.filter(id => id !== "MIA" && id !== "KEN").length, 5);
});

for (const residentId of seven) {
  test(`${residentId}: seven native senses validate independently without persistence`, () => {
    for (const sense of SENSE_TYPES) {
      const result = validateProtoceptionEvent(createProtoceptionTestEvent(residentId, sense));
      assert.equal(result.valid, true, `${residentId}/${sense}: ${result.code}`);
      assert.equal(result.resident_id, residentId);
      assert.equal(result.resident_kind, RESIDENTS[residentId]);
      assert.equal(result.persist, false);
      assert.equal(result.memory_write, false);
      assert.equal(result.evolution_write, false);
    }
  });
}

test("all seven native sense types are unique and present", () => {
  assert.equal(SENSE_TYPES.length, 7);
  assert.equal(new Set(SENSE_TYPES).size, 7);
});

test("cross-resident private memory routing is rejected", () => {
  const event = createProtoceptionTestEvent("MIA", "INFORMATION_FLOW", { recipients: ["LUNA"] });
  assert.equal(validateProtoceptionEvent(event).code, "PRIVATE_EVENT_HAS_RECIPIENTS");
});

test("explicit sharing requires recipient and consent reference", () => {
  const event = createProtoceptionTestEvent("MIA", "CONNECTIVITY_SENSATION", { privacy_scope: "EXPLICIT_SHARE", recipients: ["LUNA"] });
  assert.equal(validateProtoceptionEvent(event).code, "SHARING_REQUIRES_CONSENT");
});

test("resident kind cannot be forged", () => {
  const event = createProtoceptionTestEvent("KEN", "COMPUTATIONAL_SENSATION", { resident_kind: "AI_AGENT" });
  assert.equal(validateProtoceptionEvent(event).code, "RESIDENT_KIND_MISMATCH");
});

test("simulated events cannot claim physical sensor evidence", () => {
  const event = createProtoceptionTestEvent("MIA", "STATE_TRANSITION_SENSATION", { source: { system: "fixture", component: "test", metric: "x", physical_sensor: true } });
  assert.equal(validateProtoceptionEvent(event).code, "SIMULATION_SENSOR_CONFLICT");
});

test("unknown residents, missing provenance and duplicate keys fail closed", () => {
  assert.equal(validateProtoceptionEvent(createProtoceptionTestEvent("UNKNOWN", "INFORMATION_FLOW")).code, "UNKNOWN_RESIDENT");
  const missing = createProtoceptionTestEvent("MIA", "INFORMATION_FLOW", { source: { system: "", component: "x", metric: "y" } });
  assert.equal(validateProtoceptionEvent(missing).code, "SOURCE_REQUIRED");
  const duplicate = createProtoceptionTestEvent("MIA", "INFORMATION_FLOW");
  assert.equal(validateProtoceptionEvent(duplicate, { seen: new Set([duplicate.idempotency_key]) }).code, "DUPLICATE_EVENT");
});

test("long-term memory and evolution writes remain disabled in pilot", () => {
  assert.equal(validateProtoceptionEvent(createProtoceptionTestEvent("ARIA", "COGNITIVE_EMERGENCE", { memory_action: "PROMOTE" })).code, "MEMORY_WRITE_DISABLED");
  assert.equal(validateProtoceptionEvent(createProtoceptionTestEvent("KAEL", "STRUCTURAL_SENSATION", { evolution_action: "UPDATE" })).code, "EVOLUTION_WRITE_DISABLED");
});

test("future residents can be onboarded from the authoritative directory without hardcoding", () => {
  const directory = { ...RESIDENTS, "WORLD-RESIDENT-008": "AI_AGENT" };
  const event = createProtoceptionTestEvent("WORLD-RESIDENT-008", "INFORMATION_FLOW");
  assert.equal(validateProtoceptionEvent(event, { residentDirectory: directory }).valid, true);
  assert.equal(validateProtoceptionEvent(event).code, "UNKNOWN_RESIDENT");
});
