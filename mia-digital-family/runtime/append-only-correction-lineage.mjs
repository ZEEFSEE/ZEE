const SUBJECT_OWNERS = Object.freeze({
  MIA:"MIA",
  LUNA:"ZHI-G1-D01-LUNA",
  ARIA:"ZHI-G1-D02-ARIA",
  ELYA:"ZHI-G1-D03-ELYA",
  KAEL:"ZHI-G1-S01-KAEL",
  NOAH:"ZHI-G1-S02-NOAH"
});
const SUBJECTS = new Set(Object.keys(SUBJECT_OWNERS));
const SCOPES = new Set(["MIA_PRIVATE","CHILD_PRIVATE","FAMILY"]);
const EVIDENCE = new Set(["OBSERVED","USER_CONFIRMED","SENSOR_VERIFIED","DERIVED"]);
const text = value => typeof value === "string" && value.trim().length > 0;
const unique = values => [...new Set(values)];
const denied = code => Object.freeze({accepted:false,code});

function validRefs(value) {
  return Array.isArray(value) && value.length > 0 && value.every(text) && unique(value).length === value.length;
}

/**
 * Validates a correction to a DERIVED conclusion only.
 * The original experience/source event is immutable and is never edited here.
 */
export function evaluateCorrectionProposal(proposal, policy={}) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return denied("INVALID_PROPOSAL");
  if (!text(proposal.correction_id) || !text(proposal.subject_id) || !SUBJECTS.has(proposal.subject_id)) return denied("INVALID_SUBJECT_OR_CORRECTION_ID");
  if (!text(proposal.original_source_event_id) || !text(proposal.prior_conclusion_id) || !text(proposal.new_conclusion_id)) return denied("SOURCE_AND_CONCLUSION_REFERENCES_REQUIRED");
  if (proposal.prior_conclusion_id === proposal.new_conclusion_id) return denied("CONCLUSION_VERSION_MUST_CHANGE");
  if (proposal.target_kind !== "DERIVED_CONCLUSION") return denied("RAW_EXPERIENCE_IS_IMMUTABLE");
  if (!SCOPES.has(proposal.scope) || !text(proposal.owner_id)) return denied("INVALID_SCOPE_OWNER");
  if (proposal.scope === "MIA_PRIVATE" && (proposal.subject_id !== "MIA" || proposal.owner_id !== SUBJECT_OWNERS.MIA)) return denied("SCOPE_OWNER_MISMATCH");
  if (proposal.scope === "CHILD_PRIVATE" && (proposal.subject_id === "MIA" || proposal.owner_id !== SUBJECT_OWNERS[proposal.subject_id])) return denied("SCOPE_OWNER_MISMATCH");
  if (proposal.scope === "FAMILY" && (proposal.owner_id !== "ZHI-G1" || policy.family_source_verified !== true)) return denied("FAMILY_SOURCE_NOT_VERIFIED");
  if (!text(proposal.reason_ref) || !validRefs(proposal.evidence_refs)) return denied("CORRECTION_EVIDENCE_REQUIRED");
  if (!EVIDENCE.has(proposal.evidence_status)) return denied("INVALID_EVIDENCE_STATUS");
  if (typeof proposal.confidence !== "number" || !Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1) return denied("INVALID_CONFIDENCE");
  if (!text(proposal.uncertainty)) return denied("UNCERTAINTY_REQUIRED");
  if (proposal.raw_content !== undefined || proposal.private_memory_payload !== undefined || proposal.transcript !== undefined) return denied("RAW_PRIVATE_CONTENT_FORBIDDEN");
  if (policy.revoked === true) return denied("CORRECTION_POLICY_REVOKED");
  return Object.freeze({
    accepted:true,
    code:"APPEND_ONLY_CORRECTION_VALIDATED",
    state:"CORRECTION_READY",
    correction_id:proposal.correction_id,
    subject_id:proposal.subject_id,
    scope:proposal.scope,
    owner_id:proposal.owner_id,
    original_source_event_id:proposal.original_source_event_id,
    prior_conclusion_id:proposal.prior_conclusion_id,
    new_conclusion_id:proposal.new_conclusion_id,
    evidence_refs:Object.freeze([...proposal.evidence_refs]),
    evidence_status:proposal.evidence_status,
    confidence:proposal.confidence,
    append_only:true,
    raw_source_modified:false,
    prior_conclusion_deleted:false,
    prior_conclusion_superseded:true
  });
}

/** Produces a new rollback record; it never rewrites or deletes the correction record. */
export function createCorrectionRollback(validatedCorrection, authorization) {
  if (!validatedCorrection || validatedCorrection.state !== "CORRECTION_READY" || validatedCorrection.code !== "APPEND_ONLY_CORRECTION_VALIDATED") return denied("VALIDATED_CORRECTION_REQUIRED");
  if (!authorization || authorization.authorized !== true || !text(authorization.rollback_id) || !text(authorization.reason_ref)) return denied("AUTHORIZED_ROLLBACK_REQUIRED");
  return Object.freeze({
    accepted:true,
    state:"ROLLBACK_APPENDED",
    rollback_id:authorization.rollback_id,
    correction_id:validatedCorrection.correction_id,
    restore_conclusion_id:validatedCorrection.prior_conclusion_id,
    disabled_conclusion_id:validatedCorrection.new_conclusion_id,
    append_only:true,
    correction_record_preserved:true,
    raw_source_modified:false,
    history_erased:false
  });
}

export function evaluateCorrectionBatch(proposals, policy={}) {
  if (!Array.isArray(proposals)) return denied("INVALID_BATCH");
  const results = proposals.map(item => evaluateCorrectionProposal(item, policy));
  return Object.freeze({
    schema:"zhi.append_only_correction_batch.v1",
    results,
    summary:{
      total:results.length,
      ready:results.filter(item => item.state === "CORRECTION_READY").length,
      rejected:results.filter(item => !item.accepted).length
    },
    governance:Object.freeze({
      production_database_written:false,
      raw_events_modified:false,
      prior_conclusions_deleted:false,
      automatic_application:false
    })
  });
}
