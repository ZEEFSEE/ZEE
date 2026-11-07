import test from "node:test";
import assert from "node:assert/strict";
import { buildShadowCognitionSnapshot, shadowCognitionContract } from "../runtime/seven-brain-shadow-adapter.mjs";

const fixture = () => ({
  subjectId: "LUNA",
  observedAt: "2026-11-07T03:00:00.000Z",
  context: {
    identityRef: "identity:luna",
    personalityRef: "personality:luna:r107",
    revision: 107,
    conceptRefs: ["concept:care"],
    reasoningRefs: ["reasoning:sample-1"],
    assumptionRefs: [],
    memoryRefs: ["memory:luna:1"],
    sourceEventIds: ["event:1","event:2"],
    memoryScope: "PRIVATE",
    affectRef: "affect:luna:107",
    valueAssessmentRefs: [],
    estimateSource: "MODEL_ESTIMATE",
    goalRefs: ["goal:learn"],
    motivationRefs: [],
    nextFocusRef: "focus:learn",
    entityRefs: ["entity:ken"],
    relationshipRefs: ["edge:luna-ken"],
    worldContextRef: null,
    proposalRefs: [],
    outcomeRefs: ["outcome:cycle-107"],
    learningCandidateRefs: ["candidate:107"],
    rollbackRef: "revision:luna:106",
    permissionBasisRef: "policy:child-private",
    evidenceRefs: ["event:1"],
    auditRef: "audit:107",
    evidenceStatus: "DERIVED",
    uncertainty: "Some interpretation remains provisional."
  }
});

test("maps all eight dimensions without changing the input", () => {
  const input = fixture();
  const before = structuredClone(input);
  const snapshot = buildShadowCognitionSnapshot(input);
  assert.deepEqual(input, before);
  assert.equal(Object.keys(snapshot.dimensions).length, 8);
  assert.equal(snapshot.dimensions.SELF_CONTINUITY.status, "PRESENT");
  assert.equal(snapshot.dimensions.MEMORY_EXPERIENCE.refs.memoryScope, "PRIVATE");
  assert.equal(snapshot.governance.writes_performed, false);
});

test("unknown dimensions remain unknown; default PRIVATE scope alone is not evidence", () => {
  const snapshot = buildShadowCognitionSnapshot({subjectId:"ARIA",context:{}});
  for (const dimension of Object.values(snapshot.dimensions)) {
    assert.equal(dimension.status, "UNKNOWN");
    assert.equal(dimension.evidence_status, "UNKNOWN");
  }
});

test("Ken is a human participant, not an AI runtime subject", () => {
  assert.throws(() => buildShadowCognitionSnapshot({subjectId:"KEN",context:{}}), /AI_SUBJECT_REQUIRED/);
});

test("unapproved family scope cannot be inferred; PRIVATE is the default", () => {
  const snapshot = buildShadowCognitionSnapshot({subjectId:"NOAH",context:{memoryScope:"FAMILY"}});
  assert.equal(snapshot.governance.memory_scope, "FAMILY");
  const fallback = buildShadowCognitionSnapshot({subjectId:"NOAH",context:{memoryScope:"GLOBAL"}});
  assert.equal(fallback.governance.memory_scope, "PRIVATE");
});

test("ignores narrative, raw payload and other agents' private memory fields", () => {
  const snapshot = buildShadowCognitionSnapshot({
    subjectId:"ELYA",
    context:{
      narrative:"private text must not be copied",
      rawPayload:{secret:"not copied"},
      otherAgentsPrivateMemory:["KAEL private memory"],
      memoryRefs:["own-memory-ref"],
      evidenceStatus:"USER_STATED"
    }
  });
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("private text must not be copied"), false);
  assert.equal(serialized.includes("KAEL private memory"), false);
  assert.deepEqual(snapshot.dimensions.MEMORY_EXPERIENCE.refs.memoryRefs, ["own-memory-ref"]);
});

test("rejects unknown subjects and non-object input", () => {
  assert.throws(() => buildShadowCognitionSnapshot({subjectId:"UNKNOWN"}), /AI_SUBJECT_REQUIRED/);
  assert.throws(() => buildShadowCognitionSnapshot(null), /INVALID_INPUT/);
});

test("contract lists six AI subjects and eight dimensions", () => {
  assert.equal(shadowCognitionContract.subjects.length, 6);
  assert.equal(shadowCognitionContract.dimensions.length, 8);
  assert.equal(shadowCognitionContract.side_effects, false);
});
