const SUBJECTS = new Set(["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"]);
const VALID_EVIDENCE = new Set(["OBSERVED","USER_CONFIRMED","SENSOR_VERIFIED"]);
const EXTERNAL_KINDS = new Set(["EXTERNAL_INTERACTION","USER_CONFIRMED_INPUT","SENSOR_OBSERVATION"]);

const reject = code => Object.freeze({accepted:false,code});
const text = value => typeof value==="string" && value.trim().length>0;
const unique = values => [...new Set(values)];

export function evaluateCapabilityCandidate(candidate, validationRuns, policy={}) {
  if (!candidate || !SUBJECTS.has(candidate.subject_id) || !text(candidate.candidate_id) || !text(candidate.capability_key)) return reject("INVALID_CANDIDATE");
  if (candidate.validation_status!=="UNVALIDATED_CANDIDATE") return reject("CANDIDATE_NOT_PENDING");
  if (!text(candidate.source_memory_id) || !text(candidate.source_event_id)) return reject("PROPOSAL_SOURCE_REQUIRED");
  if (!Array.isArray(validationRuns)) return reject("VALIDATION_RUNS_REQUIRED");
  if (policy.revoked===true) return reject("CANDIDATE_REVOKED");
  const eligible = validationRuns.filter(run =>
    run && run.subject_id===candidate.subject_id &&
    run.capability_key===candidate.capability_key &&
    text(run.validation_run_id) &&
    text(run.source_event_id) &&
    run.source_event_id!==candidate.source_event_id &&
    VALID_EVIDENCE.has(run.evidence_status) &&
    EXTERNAL_KINDS.has(run.evidence_kind) &&
    run.result==="SUCCESS" &&
    run.independent===true &&
    run.raw_private_content===undefined &&
    run.private_memory_payload===undefined
  );
  const runIds=unique(eligible.map(x=>x.validation_run_id));
  const sourceIds=unique(eligible.map(x=>x.source_event_id));
  if (runIds.length<2 || sourceIds.length<2) {
    return Object.freeze({
      accepted:false,
      code:eligible.some(x=>x.result==="FAILURE")?"INDEPENDENT_REPEAT_TEST_REQUIRED":"INDEPENDENT_REPEAT_TEST_REQUIRED",
      state:"REPEAT_TEST_REQUIRED",
      valid_runs:runIds.length,
      valid_sources:sourceIds.length,
      required_runs:2
    });
  }
  return Object.freeze({
    accepted:true,
    code:"CAPABILITY_VALIDATED",
    state:"ACCEPTED",
    candidate_id:candidate.candidate_id,
    subject_id:candidate.subject_id,
    capability_key:candidate.capability_key,
    validation_run_ids:runIds,
    source_event_ids:sourceIds,
    evidence_status:"INDEPENDENTLY_REPEATED",
    raw_private_content_transferred:false,
    rollback_ref:candidate.candidate_id
  });
}

export function revokeAcceptedCapability(accepted, revocation) {
  if (!accepted || accepted.state!=="ACCEPTED" || accepted.code!=="CAPABILITY_VALIDATED") return reject("NO_ACCEPTED_CAPABILITY");
  if (!revocation || !text(revocation.revocation_id) || !text(revocation.reason_ref) || revocation.authorized!==true) return reject("AUTHORIZED_REVOCATION_REQUIRED");
  return Object.freeze({
    accepted:true,
    state:"REVOKED",
    revocation_id:revocation.revocation_id,
    revoked_candidate_id:accepted.candidate_id,
    rollback_ref:accepted.rollback_ref,
    derived_capability_disabled:true,
    source_events_unchanged:true
  });
}

export function evaluateCandidateBatch(candidates, validationRunMap) {
  if (!Array.isArray(candidates) || !validationRunMap || typeof validationRunMap!=="object") return reject("INVALID_BATCH");
  const results=candidates.map(candidate=>evaluateCapabilityCandidate(candidate,validationRunMap[candidate.candidate_id]??[]));
  return Object.freeze({
    schema:"zhi.capability_validation_batch.v1",
    results,
    summary:{
      total:results.length,
      accepted:results.filter(x=>x.state==="ACCEPTED").length,
      pending:results.filter(x=>x.state==="REPEAT_TEST_REQUIRED").length,
      rejected:results.filter(x=>x.accepted===false && x.state!=="REPEAT_TEST_REQUIRED").length
    },
    governance:Object.freeze({production_database_written:false,source_events_modified:false,automatic_promotion:false})
  });
}
