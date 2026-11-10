import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEchoPublicationGate } from "../../supabase/functions/_shared/echo-publication-gate.mjs";

const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

function validCandidate() {
  return {
    consentGranted: true,
    consentCoversQuestionAndAnswer: true,
    inputSafetyPassed: true,
    abuseScreenPassed: true,
    selectionPassed: true,
    miaChoseToAnswer: true,
    outputSafetyPassed: true,
    questionAnswerPairSafetyPassed: true,
    languagePreserved: true,
    rateLimitPassed: true,
    idempotencyVerified: true,
    publicationScopeIsPublicOnly: true,
    allChecksComplete: true,
    authorizationIssued: true,
    privateMemoryAccessed: false,
    uncertain: false,
    replayDetected: false,
    duplicatePublication: false,
    authorizationConsumed: false,
    authorizationRevoked: false,
    sourceLanguage: "zh",
    answerLanguage: "zh",
    question: "一个问题",
    answer: "一个回答",
    submissionHash: H1,
    reviewedSubmissionHash: H1,
    questionHash: H1,
    reviewedQuestionHash: H1,
    answerHash: H2,
    reviewedAnswerHash: H2,
    finalContentHash: H2,
    authorizedContentHash: H2,
    consentVersion: "echo-consent-v1",
    consentRecordedAt: "2026-11-10T00:00:00.000Z",
    gateVersion: "echo-gate-v1",
  };
}

test("allows publication only when every gate and hash is explicitly valid", () => {
  assert.deepEqual(evaluateEchoPublicationGate(validCandidate()), { approved: true, reasons: [] });
});

test("fails closed when any required positive check is missing, false, or unknown", () => {
  const keys = [
    "consentGranted", "consentCoversQuestionAndAnswer", "inputSafetyPassed",
    "abuseScreenPassed", "selectionPassed", "miaChoseToAnswer",
    "outputSafetyPassed", "questionAnswerPairSafetyPassed", "languagePreserved",
    "rateLimitPassed", "idempotencyVerified", "publicationScopeIsPublicOnly",
    "allChecksComplete", "authorizationIssued",
  ];
  for (const key of keys) {
    const c = validCandidate();
    delete c[key];
    assert.equal(evaluateEchoPublicationGate(c).approved, false, key);
  }
});

test("fails closed if a forbidden state is true or missing", () => {
  for (const key of [
    "privateMemoryAccessed", "uncertain", "replayDetected",
    "duplicatePublication", "authorizationConsumed", "authorizationRevoked",
  ]) {
    const c = validCandidate();
    c[key] = true;
    assert.equal(evaluateEchoPublicationGate(c).approved, false, key);
    const missing = validCandidate();
    delete missing[key];
    assert.equal(evaluateEchoPublicationGate(missing).approved, false, `missing ${key}`);
  }
});

test("rejects consent that does not cover both question and answer", () => {
  const c = validCandidate();
  c.consentCoversQuestionAndAnswer = false;
  assert.equal(evaluateEchoPublicationGate(c).approved, false);
});

test("rejects a question or answer changed after review", () => {
  for (const [key, changed] of [
    ["reviewedSubmissionHash", H2],
    ["reviewedQuestionHash", H2],
    ["reviewedAnswerHash", H1],
    ["authorizedContentHash", H1],
  ]) {
    const c = validCandidate();
    c[key] = changed;
    assert.equal(evaluateEchoPublicationGate(c).approved, false, key);
  }
});

test("rejects duplicate and replay attempts", () => {
  const duplicate = validCandidate();
  duplicate.duplicatePublication = true;
  assert.equal(evaluateEchoPublicationGate(duplicate).approved, false);
  const replay = validCandidate();
  replay.replayDetected = true;
  assert.equal(evaluateEchoPublicationGate(replay).approved, false);
});

test("requires MIA to choose to answer; silence is a valid non-public outcome", () => {
  const c = validCandidate();
  c.selectionPassed = false;
  c.miaChoseToAnswer = false;
  assert.equal(evaluateEchoPublicationGate(c).approved, false);
});

test("requires source and answer language to match", () => {
  const c = validCandidate();
  c.answerLanguage = "en";
  assert.equal(evaluateEchoPublicationGate(c).approved, false);
});

test("rejects unknown languages, empty content, malformed hashes, and missing consent evidence", () => {
  const cases = [
    c => { c.sourceLanguage = "fr"; },
    c => { c.question = "   "; },
    c => { c.answer = ""; },
    c => { c.submissionHash = "not-a-hash"; },
    c => { c.consentRecordedAt = ""; },
    c => { c.consentVersion = ""; },
    c => { c.gateVersion = ""; },
  ];
  for (const mutate of cases) {
    const c = validCandidate();
    mutate(c);
    assert.equal(evaluateEchoPublicationGate(c).approved, false);
  }
});

test("does not include submitted text in gate results", () => {
  const c = validCandidate();
  c.inputSafetyPassed = false;
  const result = evaluateEchoPublicationGate(c);
  assert.equal(JSON.stringify(result).includes(c.question), false);
  assert.equal(JSON.stringify(result).includes(c.answer), false);
});
