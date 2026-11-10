// Narrow Supabase persistence adapter. All writes use server-only RPCs;
// this module never reads or writes any Mia private table and never calls .from().

export class EchoPersistenceError extends Error {
  constructor(code) {
    super(code);
    this.name = "EchoPersistenceError";
    this.code = code;
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function requireClient(client) {
  if (!client || typeof client.rpc !== "function") {
    throw new EchoPersistenceError("echo_rpc_client_missing");
  }
}

async function rpc(client, name, args) {
  let result;
  try { result = await client.rpc(name, args); }
  catch { throw new EchoPersistenceError("echo_database_operation_failed"); }
  if (result?.error) throw new EchoPersistenceError("echo_database_operation_failed");
  return result?.data;
}

const EVIDENCE_KEYS = [
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
  "privateMemoryAccessed",
  "uncertain",
  "replayDetected",
  "duplicatePublication",
  "authorizationConsumed",
  "authorizationRevoked",
];

export function createEchoPersistence(client) {
  requireClient(client);

  return {
    async registerSubmission({
      question, sourceLanguage, consentGranted, consentVersion,
      idempotencyKey, subjectHash, submissionHash,
    }) {
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16
        || typeof subjectHash !== "string" || !/^[a-f0-9]{64}$/.test(subjectHash)) {
        throw new EchoPersistenceError("echo_registration_input_invalid");
      }
      const idempotencyKeyHash = await sha256(idempotencyKey);
      return await rpc(client, "echo_register_submission", {
        p_body: question,
        p_source_language: sourceLanguage,
        p_consent: consentGranted === true,
        p_consent_version: consentVersion,
        p_idempotency_key_hash: idempotencyKeyHash,
        p_body_sha256: submissionHash,
        p_subject_hash: subjectHash,
      });
    },

    async issueAuthorization({
      submissionId, sourceLanguage, answerLanguage,
      consentVersion, consentRecordedAt, hashes, evidence,
    }) {
      const safeEvidence = {};
      for (const key of EVIDENCE_KEYS) {
        if (typeof evidence?.[key] !== "boolean") {
          throw new EchoPersistenceError("echo_authorization_evidence_incomplete");
        }
        safeEvidence[key] = evidence[key];
      }
      return await rpc(client, "echo_issue_authorization", {
        p_submission_id: submissionId,
        p_source_language: sourceLanguage,
        p_answer_language: answerLanguage,
        p_consent_version: consentVersion,
        p_consent_recorded_at: consentRecordedAt,
        p_hashes: {
          submissionHash: hashes.submissionHash,
          questionHash: hashes.questionHash,
          answerHash: hashes.answerHash,
          finalContentHash: hashes.finalContentHash,
        },
        p_evidence: safeEvidence,
      });
    },

    async publishAtomically({
      authorizationId, originalQuestion, miaAnswer, language,
    }) {
      return await rpc(client, "echo_publish", {
        p_authorization_id: authorizationId,
        p_original_question: originalQuestion,
        p_mia_answer: miaAnswer,
        p_language: language,
      });
    },

    async discardPayload(submissionId, eventCode) {
      return await rpc(client, "echo_discard_submission", {
        p_submission_id: submissionId,
        p_event_code: eventCode,
      });
    },

    async revokeAuthorization(authorizationId, reason) {
      const safeReason = reason === "not_published" ? "not_published" : "pipeline_failed";
      return await rpc(client, "echo_revoke_authorization", {
        p_authorization_id: authorizationId,
        p_reason: safeReason,
      });
    },
  };
}
