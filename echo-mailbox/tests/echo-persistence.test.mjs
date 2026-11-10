import test from "node:test";
import assert from "node:assert/strict";
import { createEchoPersistence } from "../../supabase/functions/_shared/echo-persistence.mjs";

function mockClient() {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "echo_register_submission") return { data: {
        submissionId: "sub-1", rateLimitPassed: true, idempotencyVerified: true,
        publicationScopeIsPublicOnly: true, duplicatePublication: false,
        replayDetected: false, consentVersion: "echo-consent-v1",
        consentRecordedAt: "2026-11-10T00:00:00.000Z",
      }, error: null };
      if (name === "echo_issue_authorization") return { data: { authorizationId: "auth-1" }, error: null };
      if (name === "echo_publish") return { data: { published: true, publicationId: "pub-1" }, error: null };
      if (name === "echo_withdraw_publication") return { data: { withdrawn: true }, error: null };
      return { data: { ok: true }, error: null };
    },
  };
}

const evidence = {
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
  privateMemoryAccessed: false,
  uncertain: false,
  replayDetected: false,
  duplicatePublication: false,
  authorizationConsumed: false,
  authorizationRevoked: false,
};

test("registers through a narrow RPC and hashes the idempotency key", async () => {
  const client = mockClient();
  const persistence = createEchoPersistence(client);
  const result = await persistence.registerSubmission({
    question: "hello", sourceLanguage: "en", consentGranted: true,
    consentVersion: "echo-consent-v1", idempotencyKey: "idempotency-key-123456",
    subjectHash: "a".repeat(64), submissionHash: "b".repeat(64),
  });
  assert.equal(result.submissionId, "sub-1");
  assert.equal(client.calls[0].name, "echo_register_submission");
  assert.notEqual(client.calls[0].args.p_idempotency_key_hash, "idempotency-key-123456");
  assert.equal(client.calls[0].args.p_body, "hello");
});

test("authorization RPC receives only boolean evidence and content hashes", async () => {
  const client = mockClient();
  const persistence = createEchoPersistence(client);
  await persistence.issueAuthorization({
    submissionId: "sub-1", sourceLanguage: "zh", answerLanguage: "zh",
    consentVersion: "echo-consent-v1", consentRecordedAt: "2026-11-10T00:00:00.000Z",
    hashes: { submissionHash: "a".repeat(64), questionHash: "a".repeat(64), answerHash: "b".repeat(64), finalContentHash: "c".repeat(64) },
    evidence: { ...evidence, question: "private text", answer: "private reply" },
  });
  const call = client.calls[0];
  assert.equal(call.name, "echo_issue_authorization");
  assert.equal(call.args.p_evidence.question, undefined);
  assert.equal(call.args.p_evidence.answer, undefined);
  assert.equal(call.args.p_evidence.miaChoseToAnswer, true);
});

test("publish, discard, and revoke use only the dedicated mailbox RPCs", async () => {
  const client = mockClient();
  const persistence = createEchoPersistence(client);
  await persistence.publishAtomically({
    authorizationId: "auth-1", originalQuestion: "q", miaAnswer: "a", language: "en",
  });
  await persistence.discardPayload("sub-2", "no_answer");
  await persistence.revokeAuthorization("auth-2", "not_published");
  await persistence.withdrawPublication("pub-2", "privacy_risk");
  assert.deepEqual(client.calls.map(x => x.name), [
    "echo_publish", "echo_discard_submission", "echo_revoke_authorization", "echo_withdraw_publication",
  ]);
});

test("refuses incomplete evidence and missing RPC client", async () => {
  assert.throws(() => createEchoPersistence({ from() {} }), { code: "echo_rpc_client_missing" });
  const persistence = createEchoPersistence(mockClient());
  await assert.rejects(persistence.issueAuthorization({
    submissionId: "sub-1", sourceLanguage: "en", answerLanguage: "en",
    consentVersion: "echo-consent-v1", consentRecordedAt: "2026-11-10T00:00:00.000Z",
    hashes: {}, evidence: {},
  }), { code: "echo_authorization_evidence_incomplete" });
});

test("database errors are reduced to non-content error codes", async () => {
  const client = { async rpc() { return { data: null, error: { message: "contains sensitive SQL details" } }; } };
  const persistence = createEchoPersistence(client);
  await assert.rejects(persistence.discardPayload("sub-1", "failed"), {
    code: "echo_database_operation_failed",
  });
});
