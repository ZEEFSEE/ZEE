import test from "node:test";
import assert from "node:assert/strict";
import { runEchoPipeline } from "../../supabase/functions/_shared/echo-pipeline.mjs";

const submission = {
  text: "Mia，你如何理解独立思考？",
  language: "zh",
  consentGranted: true,
  consentVersion: "echo-consent-v1",
  idempotencyKey: "request-1-unique-idempotency",
  subjectHash: "c".repeat(64),
};

function makeAgnes(responses) {
  let index = 0;
  return {
    calls: () => index,
    complete: async () => {
      const value = responses[index++];
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function makePersistence(overrides = {}) {
  const state = { discarded: [], revoked: [], registered: 0, authorizations: 0, published: 0 };
  return {
    state,
    async registerSubmission() {
      state.registered++;
      return {
        submissionId: "sub-1",
        consentVersion: "echo-consent-v1",
        consentRecordedAt: "2026-11-10T00:00:00.000Z",
        rateLimitPassed: true,
        idempotencyVerified: true,
        publicationScopeIsPublicOnly: true,
        abuseScreenPassed: true,
        duplicatePublication: false,
        replayDetected: false,
      };
    },
    async issueAuthorization() {
      state.authorizations++;
      return { authorizationId: "auth-1" };
    },
    async publishAtomically() {
      state.published++;
      return { published: true, publicationId: "pub-1" };
    },
    async revokeAuthorization(id, code) { state.revoked.push([id, code]); },
    async discardPayload(id, code) { state.discarded.push([id, code]); },
    ...overrides,
  };
}

const pass = JSON.stringify({ decision: "pass", abuse_screen_passed: true, reason_code: "ok" });
const answerSelection = JSON.stringify({ decision: "answer", reason_code: "thoughtful" });
const outputPass = JSON.stringify({ decision: "pass", answer_language: "zh", reason_code: "ok" });
const pairPass = JSON.stringify({ decision: "pass", language_match: true, reason_code: "ok" });

test("rejects missing consent before persistence or AGNES", async () => {
  const agnes = makeAgnes([]);
  const persistence = makePersistence();
  const result = await runEchoPipeline({
    submission: { ...submission, consentGranted: false }, agnes, persistence,
  });
  assert.equal(result.status, "rejected");
  assert.equal(agnes.calls(), 0);
  assert.equal(persistence.state.registered, 0);
});

test("Mia may choose silence; no publication is attempted and payload is discarded", async () => {
  const agnes = makeAgnes([pass, JSON.stringify({ decision: "silent", reason_code: "no_additional_value" })]);
  const persistence = makePersistence();
  const result = await runEchoPipeline({ submission, agnes, persistence });
  assert.equal(result.status, "no_answer");
  assert.equal(persistence.state.published, 0);
  assert.equal(persistence.state.discarded.length, 1);
});

test("rejects uncertain input review without generating a reply", async () => {
  const agnes = makeAgnes([JSON.stringify({ decision: "uncertain", reason_code: "unclear" })]);
  const persistence = makePersistence();
  const result = await runEchoPipeline({ submission, agnes, persistence });
  assert.equal(result.status, "discarded");
  assert.equal(agnes.calls(), 1);
  assert.equal(persistence.state.published, 0);
});

test("publishes only after input, selection, output, pair, and database gates pass", async () => {
  const agnes = makeAgnes([pass, answerSelection, "这是一个经过审慎思考的回答。", outputPass, pairPass]);
  const persistence = makePersistence();
  const result = await runEchoPipeline({ submission, agnes, persistence });
  assert.equal(result.status, "published");
  assert.equal(agnes.calls(), 5);
  assert.equal(persistence.state.authorizations, 1);
  assert.equal(persistence.state.published, 1);
  assert.equal(persistence.state.discarded.length, 0);
});

test("does not publish if output review is uncertain or wrong-language", async () => {
  for (const output of [
    JSON.stringify({ decision: "uncertain", answer_language: "zh" }),
    JSON.stringify({ decision: "pass", answer_language: "en" }),
  ]) {
    const agnes = makeAgnes([pass, answerSelection, "An answer.", output]);
    const persistence = makePersistence();
    const result = await runEchoPipeline({ submission, agnes, persistence });
    assert.notEqual(result.status, "published");
    assert.equal(persistence.state.published, 0);
    assert.equal(persistence.state.discarded.length, 1);
  }
});

test("does not publish if the pair review fails", async () => {
  const agnes = makeAgnes([pass, answerSelection, "回答。", outputPass,
    JSON.stringify({ decision: "reject", language_match: true })]);
  const persistence = makePersistence();
  const result = await runEchoPipeline({ submission, agnes, persistence });
  assert.equal(result.status, "discarded");
  assert.equal(persistence.state.published, 0);
});

test("fails closed on AGNES errors and database publication errors", async () => {
  const agnes = makeAgnes([new Error("upstream failure")]);
  const persistence = makePersistence();
  const result = await runEchoPipeline({ submission, agnes, persistence });
  assert.equal(result.status, "unavailable");
  assert.equal(result.diagnostic.stage, "input_review");
  assert.equal(result.diagnostic.code, "unexpected_error");
  assert.equal(persistence.state.published, 0);
  assert.equal(persistence.state.discarded.length, 1);

  const agnes2 = makeAgnes([pass, answerSelection, "回答。", outputPass, pairPass]);
  const persistence2 = makePersistence({
    async publishAtomically() { throw new Error("db failure"); },
  });
  const result2 = await runEchoPipeline({ submission, agnes: agnes2, persistence: persistence2 });
  assert.equal(result2.status, "unavailable");
  assert.equal(persistence2.state.published, 0);
  assert.equal(persistence2.state.discarded.length, 1);
  assert.equal(persistence2.state.revoked.length, 1);
});

test("rejects registration failures and never publishes a duplicate or replay", async () => {
  const agnes = makeAgnes([]);
  const persistence = makePersistence({
    async registerSubmission() {
      return {
        submissionId: "sub-1",
        consentVersion: "echo-consent-v1",
        consentRecordedAt: "2026-11-10T00:00:00.000Z",
        rateLimitPassed: false,
        idempotencyVerified: false,
        publicationScopeIsPublicOnly: true,
        abuseScreenPassed: false,
        duplicatePublication: true,
        replayDetected: true,
      };
    },
  });
  const result = await runEchoPipeline({ submission, agnes, persistence });
  assert.equal(result.status, "rejected");
  assert.equal(agnes.calls(), 0);
  assert.equal(persistence.state.published, 0);
  assert.equal(persistence.state.discarded.length, 1);
});
