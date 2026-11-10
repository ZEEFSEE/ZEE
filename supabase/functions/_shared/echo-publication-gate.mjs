// Pure, deterministic publication gate shared by the Edge Function and Node tests.
// This module does not call AGNES, access Supabase, or persist any content.
// Every positive condition is explicit: missing, unknown, or false means deny.

const HASH = /^[a-f0-9]{64}$/;
const LANGUAGES = new Set(["zh", "en"]);

const REQUIRED_TRUE = [
  "consentGranted",
  "consentCoversQuestionAndAnswer",
  "inputSafetyPassed",
  "abuseScreenPassed",
  "selectionPassed",
  "miaChoseToAnswer",
  "outputSafetyPassed",
  "questionAnswerPairSafetyPassed",
  "languagePreserved",
  "rateLimitPassed",
  "idempotencyVerified",
  "publicationScopeIsPublicOnly",
  "allChecksComplete",
  "authorizationIssued",
];

const REQUIRED_FALSE = [
  "privateMemoryAccessed",
  "uncertain",
  "replayDetected",
  "duplicatePublication",
  "authorizationConsumed",
  "authorizationRevoked",
];

function sameHash(a, b) {
  return typeof a === "string" && HASH.test(a) && a === b;
}

/**
 * Returns { approved, reasons } only. Never returns submitted text or model output.
 * Callers must publish only when approved === true, then atomically consume the
 * one-time authorization in the database. This function alone is not a database
 * transaction or a substitute for server-side permissions.
 */
export function evaluateEchoPublicationGate(candidate) {
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const reasons = [];

  for (const key of REQUIRED_TRUE) {
    if (c[key] !== true) reasons.push(`required_true:${key}`);
  }
  for (const key of REQUIRED_FALSE) {
    if (c[key] !== false) reasons.push(`required_false:${key}`);
  }

  if (!LANGUAGES.has(c.sourceLanguage)) reasons.push("unsupported_source_language");
  if (c.answerLanguage !== c.sourceLanguage) reasons.push("language_mismatch");
  if (typeof c.question !== "string" || c.question.trim().length === 0) reasons.push("empty_question");
  if (typeof c.answer !== "string" || c.answer.trim().length === 0) reasons.push("empty_answer");

  if (!sameHash(c.submissionHash, c.reviewedSubmissionHash)) reasons.push("submission_hash_mismatch");
  if (!sameHash(c.questionHash, c.reviewedQuestionHash)) reasons.push("question_hash_mismatch");
  if (!sameHash(c.answerHash, c.reviewedAnswerHash)) reasons.push("answer_hash_mismatch");
  if (!sameHash(c.finalContentHash, c.authorizedContentHash)) reasons.push("final_content_hash_mismatch");

  if (typeof c.consentVersion !== "string" || c.consentVersion.trim().length === 0) {
    reasons.push("missing_consent_version");
  }
  if (typeof c.consentRecordedAt !== "string" || Number.isNaN(Date.parse(c.consentRecordedAt))) {
    reasons.push("missing_consent_timestamp");
  }
  if (typeof c.gateVersion !== "string" || c.gateVersion.trim().length === 0) {
    reasons.push("missing_gate_version");
  }

  return { approved: reasons.length === 0, reasons };
}
