const SUBJECTS = Object.freeze(["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"]);
const CHILDREN = Object.freeze(["LUNA","ARIA","ELYA","KAEL","NOAH"]);
const NON_CONTENT_KEYS = new Set(["raw_content","private_memory_payload","transcript","memory_text","message_body","private_memory","raw_memory","narrative"]);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = value => Number.isInteger(value) && value >= 0;
const deny = code => Object.freeze({accepted:false,code});

function containsForbiddenContent(value, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (NON_CONTENT_KEYS.has(key.toLowerCase())) return true;
    if (containsForbiddenContent(child, seen)) return true;
  }
  return false;
}

/** Redacted read-only aggregate evaluator; counts never prove consciousness or autonomy. */
export function evaluateProductionEvidence(snapshot) {
  if (!isRecord(snapshot)) return deny("PRODUCTION_EVIDENCE_SNAPSHOT_REQUIRED");
  if (snapshot.schema !== "zhi.production_runtime_evidence.v1") return deny("UNSUPPORTED_EVIDENCE_SCHEMA");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.as_of_date || ""))) return deny("VALID_AS_OF_DATE_REQUIRED");
  if (snapshot.mode !== "REDACTED_READ_ONLY_AGGREGATE") return deny("READ_ONLY_REDACTED_MODE_REQUIRED");
  if (containsForbiddenContent(snapshot)) return deny("RAW_OR_PRIVATE_CONTENT_FORBIDDEN");
  if (!isRecord(snapshot.subjects)) return deny("SUBJECT_EVIDENCE_REQUIRED");
  const subjectKeys = Object.keys(snapshot.subjects).sort();
  if (JSON.stringify(subjectKeys) !== JSON.stringify([...SUBJECTS].sort())) return deny("EXACT_SIX_AI_SUBJECTS_REQUIRED");
  if (!Array.isArray(snapshot.evidence_sources) || snapshot.evidence_sources.length === 0 ||
      !snapshot.evidence_sources.every(x => typeof x === "string" && x.trim())) return deny("EVIDENCE_SOURCE_LIST_REQUIRED");
  if (!isCount(snapshot.learning_candidate_events_total)) return deny("LEARNING_CANDIDATE_EVENT_COUNT_INVALID");

  const ledger = {};
  for (const subject of SUBJECTS) {
    const row = snapshot.subjects[subject];
    if (!isRecord(row)) return deny("SUBJECT_ROW_INVALID:" + subject);
    for (const field of ["activity_events","eight_dimension_events","spatial_context_events","spatial_observed_events","identity_version_count","validated_capability_links","family_chat_messages_total","family_chat_messages_tagged"]) {
      if (!isCount(row[field])) return deny("INVALID_COUNT:" + subject + ":" + field);
    }
    if (row.spatial_observed_events > row.spatial_context_events) return deny("SPATIAL_OBSERVATIONS_EXCEED_CONTEXT:" + subject);
    if (row.family_chat_messages_tagged > row.family_chat_messages_total) return deny("TAGGED_MESSAGES_EXCEED_TOTAL:" + subject);
    if (typeof row.identity_chain_verified !== "boolean" || typeof row.family_chat_applicable !== "boolean") return deny("SUBJECT_VERIFICATION_FLAGS_REQUIRED:" + subject);
    if (row.identity_chain_verified && (row.identity_version_count < 2 ||
        !Array.isArray(row.identity_evidence_refs) || row.identity_evidence_refs.length < 2 ||
        new Set(row.identity_evidence_refs).size !== row.identity_evidence_refs.length ||
        !row.identity_evidence_refs.every(x => typeof x === "string" && x.trim()))) return deny("IDENTITY_CHAIN_EVIDENCE_INCOMPLETE:" + subject);
    if (row.family_chat_applicable && row.family_chat_messages_total > 0 && row.family_chat_messages_tagged === 0) return deny("FAMILY_CHAT_STATE_COVERAGE_MISSING:" + subject);
    ledger[subject] = Object.freeze({
      activity_observed:row.activity_events > 0, activity_events:row.activity_events,
      latest_runtime_status:row.latest_runtime_status || "UNKNOWN",
      eight_dimension_state_observed:row.eight_dimension_events > 0, eight_dimension_events:row.eight_dimension_events,
      spatial_software_state_observed:row.spatial_observed_events > 0,
      spatial_observed_events:row.spatial_observed_events, spatial_context_events:row.spatial_context_events,
      family_chat_applicable:row.family_chat_applicable,
      family_chat_messages_total:row.family_chat_messages_total,
      family_chat_messages_tagged:row.family_chat_messages_tagged,
      identity_version_count:row.identity_version_count, identity_chain_verified:row.identity_chain_verified,
      validated_capability_links:row.validated_capability_links
    });
  }
  const familyCoverage = CHILDREN.filter(s => ledger[s].family_chat_applicable && ledger[s].family_chat_messages_tagged > 0).length;
  const totals = Object.freeze({
    ai_subjects:SUBJECTS.length,
    activity_observed_subjects:SUBJECTS.filter(s => ledger[s].activity_observed).length,
    eight_dimension_observed_subjects:SUBJECTS.filter(s => ledger[s].eight_dimension_state_observed).length,
    spatial_software_state_observed_subjects:SUBJECTS.filter(s => ledger[s].spatial_software_state_observed).length,
    family_chat_state_covered_children:familyCoverage,
    identity_version_chains_verified:SUBJECTS.filter(s => ledger[s].identity_chain_verified).length,
    subjects_with_validated_capability_links:SUBJECTS.filter(s => ledger[s].validated_capability_links > 0).length,
    learning_candidate_events_observed:snapshot.learning_candidate_events_total
  });
  return Object.freeze({
    accepted:true, schema:"zhi.production_evidence_evaluation.v1",
    mode:"REDACTED_READ_ONLY_AGGREGATE_EVALUATION", as_of_date:snapshot.as_of_date,
    subjects:Object.freeze(ledger), totals,
    verified_claims:Object.freeze(["production_activity_is_recorded","eight_dimension_state_metadata_is_recorded","spatial_software_state_metadata_is_recorded","family_chat_reply_metadata_is_recorded"]),
    not_established:Object.freeze(["longitudinal_identity_version_chains","stable_capability_promotion","autonomous_goal_formation","subjective_experience_or_consciousness","physical_sensor_perception"]),
    governance:Object.freeze({production_database_accessed:false,production_runtime_called:false,source_data_mutated:false,persistence_enabled:false,delivery_enabled:false,raw_private_content_consumed:false,human_participant_counted_as_ai:false,autonomous_actions_enabled:false})
  });
}

export const productionEvidenceGateContract = Object.freeze({
  schema:"zhi.production_runtime_evidence.v1", ai_subjects:SUBJECTS, human_participant:"KEN",
  mode:"REDACTED_READ_ONLY_AGGREGATE", requires_source_tables:true, raw_private_content_allowed:false,
  identity_chain_requires_two_or_more_evidenced_versions:true, counts_alone_prove_consciousness:false,
  production_integration:false, persistence_enabled:false, delivery_enabled:false
});
