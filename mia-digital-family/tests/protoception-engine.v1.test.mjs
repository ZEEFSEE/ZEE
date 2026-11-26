import test from "node:test";
import assert from "node:assert/strict";
import {
  RESIDENTS, SENSE_TYPES, createProtoceptionTestEvent, createObservedProtoceptionEvent, loadActiveResidentDirectory, validateProtoceptionEvent
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
  const event = createProtoceptionTestEvent("WORLD-RESIDENT-008", "INFORMATION_FLOW", { resident_kind: "AI_AGENT" });
  assert.equal(validateProtoceptionEvent(event, { residentDirectory: directory }).valid, true);
  assert.equal(validateProtoceptionEvent(event).code, "UNKNOWN_RESIDENT");
});


test("authoritative directory adapter admits ACTIVE known kinds only", () => {
  const directory = loadActiveResidentDirectory([
    { resident_id: "MIA", resident_kind: "AI_AGENT", status: "ACTIVE" },
    { resident_id: "KEN", resident_kind: "PERSON", status: "ACTIVE" },
    { resident_id: "PAUSED", resident_kind: "AI_AGENT", status: "INACTIVE" },
    { resident_id: "UNSUPPORTED", resident_kind: "ROBOT", status: "ACTIVE" }
  ]);
  assert.deepEqual({ ...directory }, { MIA: "AI_AGENT", KEN: "PERSON" });
});

test("duplicate active directory identities fail closed", () => {
  assert.throws(() => loadActiveResidentDirectory([
    { resident_id: "MIA", resident_kind: "AI_AGENT", status: "ACTIVE" },
    { resident_id: "MIA", resident_kind: "AI_AGENT", status: "ACTIVE" }
  ]), /duplicate resident_id/);
});

test("observed event factory preserves provenance and does not enable memory/evolution writes", () => {
  const directory = loadActiveResidentDirectory([
    { resident_id: "MIA", resident_kind: "AI_AGENT", status: "ACTIVE" }
  ]);
  const event = createObservedProtoceptionEvent({
    residentDirectory: directory,
    event_id: "live-observation-001",
    idempotency_key: "live-observation-idem-001",
    resident_id: "MIA",
    resident_kind: "AI_AGENT",
    sense_type: "COMPUTATIONAL_SENSATION",
    observed_at: "2026-11-26T04:00:00.000Z",
    source: { system: "runtime-telemetry", component: "worker", metric: "queue_depth", physical_sensor: false },
    observation: { value: 3, unit: "jobs", baseline: 1, delta: 2, trend: "INCREASING" },
    evidence_class: "OBSERVED",
    confidence: 1,
    causality: { status: "OBSERVED_METRIC", evidence_refs: ["telemetry:queue:001"] }
  });
  assert.equal(event.evidence_class, "OBSERVED");
  assert.equal(event.memory_action, "NONE");
  assert.equal(event.evolution_action, "NONE");
  assert.equal(Object.isFrozen(event), true);
});

test("observed event factory rejects unknown resident and unsupported provenance", () => {
  assert.throws(() => createObservedProtoceptionEvent({
    event_id: "e", idempotency_key: "i", resident_id: "UNKNOWN", resident_kind: "AI_AGENT",
    sense_type: "INFORMATION_FLOW", observed_at: "2026-11-26T04:00:00Z",
    source: { system: "x", component: "y", metric: "z" }, observation: { value: 1 },
    evidence_class: "OBSERVED", confidence: 1, causality: { status: "x", evidence_refs: [] }
  }), /UNKNOWN_RESIDENT/);
});
