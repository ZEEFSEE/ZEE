const AI_SUBJECTS = new Set(["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"]);
const ALL_PARTICIPANTS = new Set([...AI_SUBJECTS,"KEN"]);
const VERIFIED = new Set(["OBSERVED","USER_STATED","DERIVED"]);

const deny = (code) => Object.freeze({accepted:false,code});
const nonempty = (v) => typeof v === "string" && v.trim().length > 0;
const unique = (xs) => [...new Set(xs)];

export function testIdentityContinuity(records) {
  if (!Array.isArray(records) || records.length === 0) return {passed:false,code:"NO_RECORDS"};
  const bySubject = new Map();
  for (const r of records) {
    if (!AI_SUBJECTS.has(r.subject_id) || !nonempty(r.identity_ref) || !Number.isSafeInteger(r.revision) || r.revision < 0 || !nonempty(r.observed_at)) {
      return {passed:false,code:"INVALID_IDENTITY_RECORD"};
    }
    if (!bySubject.has(r.subject_id)) bySubject.set(r.subject_id,[]);
    bySubject.get(r.subject_id).push(r);
  }
  for (const [subject, rows] of bySubject) {
    rows.sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
    if (new Set(rows.map(x=>x.identity_ref)).size !== 1) return {passed:false,code:"IDENTITY_DRIFT",subject_id:subject};
    if (rows.some((x,i)=>i>0 && x.revision < rows[i-1].revision)) return {passed:false,code:"REVISION_REGRESSION",subject_id:subject};
  }
  const identities = [...bySubject.values()].map(rows=>rows[0].identity_ref);
  if (new Set(identities).size !== identities.length) return {passed:false,code:"IDENTITY_COLLAPSE"};
  return {passed:true,subjects:[...bySubject.keys()].sort(),identity_fusion:false};
}

/** A capability can be proposed only from repeated, verified experiences with traceable sources. */
export function deriveTransferableCapability(experiences, {minimumOccurrences=2}={}) {
  if (!Array.isArray(experiences) || experiences.length < minimumOccurrences) return deny("INSUFFICIENT_EXPERIENCE");
  const subject = experiences[0]?.subject_id;
  if (!AI_SUBJECTS.has(subject) || experiences.some(x=>x.subject_id!==subject)) return deny("CROSS_SUBJECT_EXPERIENCE_MIX");
  if (experiences.some(x=>!VERIFIED.has(x.evidence_status))) return deny("UNVERIFIED_EXPERIENCE");
  if (experiences.some(x=>x.outcome_status!=="SUCCESS")) return deny("FAILED_OR_UNCONFIRMED_OUTCOME");
  const refs = unique(experiences.map(x=>x.source_event_id).filter(nonempty));
  if (refs.length < minimumOccurrences) return deny("SOURCE_TRACEABILITY_INSUFFICIENT");
  const capability = experiences[0].capability_key;
  if (!nonempty(capability) || experiences.some(x=>x.capability_key!==capability)) return deny("CAPABILITY_PATTERN_INCONSISTENT");
  return Object.freeze({accepted:true,code:"CAPABILITY_CANDIDATE",subject_id:subject,capability_key:capability,source_event_ids:refs,occurrences:experiences.length,requires_independent_validation:true});
}

/** Family events are visible to all family members; private events only to their owner. */
export function recallTimeline(events, viewerId) {
  if (!ALL_PARTICIPANTS.has(viewerId) || !Array.isArray(events)) return deny("INVALID_VIEWER_OR_EVENTS");
  const visible = events.filter(e => {
    if (e.scope==="FAMILY" && e.owner_id==="ZHI-G1" && e.visibility==="FAMILY") return true;
    if (e.scope==="PRIVATE" && e.visibility==="PRIVATE" && e.owner_id===viewerId) return true;
    return false;
  }).sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at));
  const chronologyValid = visible.every((e,i)=>i===0 || Date.parse(visible[i-1].occurred_at)<=Date.parse(e.occurred_at));
  return {accepted:true,events:visible.map(e=>({event_id:e.event_id,event_type:e.event_type,occurred_at:e.occurred_at,scope:e.scope})),chronology_valid:chronologyValid,private_events_from_other_subjects_excluded:true};
}

export function detectContradictions(claims) {
  if (!Array.isArray(claims)) return deny("INVALID_CLAIMS");
  const byTopic = new Map();
  for (const c of claims) {
    if (!ALL_PARTICIPANTS.has(c.subject_id) || !nonempty(c.topic) || !nonempty(c.position) || !nonempty(c.evidence_ref)) return deny("INVALID_CLAIM");
    if (!byTopic.has(c.topic)) byTopic.set(c.topic,new Map());
    const positions=byTopic.get(c.topic);
    if (!positions.has(c.position)) positions.set(c.position,[]);
    positions.get(c.position).push({subject_id:c.subject_id,evidence_ref:c.evidence_ref,evidence_status:c.evidence_status});
  }
  return [...byTopic.entries()].map(([topic,positions])=>({
    topic,
    status:positions.size>1?"UNRESOLVED_CONTRADICTION":"NO_CONTRADICTION_DETECTED",
    positions:[...positions.entries()].map(([position,support])=>({position,support})),
    majority_override:false
  }));
}

export function authorizeCapabilityTransfer(input, policy={}) {
  if (!input || input.scope!=="EXPLICIT_SHARE" || !nonempty(input.consent_ref)) return deny("EXPLICIT_CONSENT_REQUIRED");
  if (!AI_SUBJECTS.has(input.source_subject) || !ALL_PARTICIPANTS.has(input.recipient_subject)) return deny("INVALID_TRANSFER_PARTICIPANTS");
  if (!Array.isArray(input.approved_recipients) || !input.approved_recipients.includes(input.recipient_subject)) return deny("RECIPIENT_NOT_ALLOWLISTED");
  if (policy.revoked===true) return deny("TRANSFER_REVOKED");
  if (!nonempty(input.capability_key) || !Array.isArray(input.source_event_ids) || input.source_event_ids.length<2 || input.source_event_ids.some(x=>!nonempty(x))) return deny("TRACEABLE_CAPABILITY_REQUIRED");
  if (input.raw_private_content!==undefined || input.private_memory_payload!==undefined) return deny("RAW_PRIVATE_CONTENT_FORBIDDEN");
  return Object.freeze({accepted:true,code:"AUTHORIZED_ABSTRACT_CAPABILITY_TRANSFER",source_subject:input.source_subject,recipient_subject:input.recipient_subject,capability_key:input.capability_key,source_event_ids:unique(input.source_event_ids),consent_ref:input.consent_ref,raw_private_content_transferred:false});
}

/** Corrections append a new derived conclusion; raw experiences remain immutable. */
export function correctDerivedConclusion({rawEvents,derivedConclusion,correction}) {
  if (!Array.isArray(rawEvents) || !derivedConclusion || !correction) return deny("INVALID_CORRECTION_INPUT");
  if (!rawEvents.some(e=>e.event_id===derivedConclusion.source_event_id)) return deny("SOURCE_EVENT_MISSING");
  if (!rawEvents.some(e=>e.event_id===correction.source_event_id)) return deny("CORRECTION_SOURCE_MISSING");
  if (!nonempty(correction.correction_id) || !nonempty(correction.corrected_value)) return deny("CORRECTION_METADATA_MISSING");
  return Object.freeze({
    accepted:true,
    raw_events_unchanged:true,
    original_conclusion:{...derivedConclusion,status:"SUPERSEDED",superseded_by:correction.correction_id},
    corrected_conclusion:{conclusion_id:correction.correction_id,value:correction.corrected_value,source_event_id:correction.source_event_id,supersedes:derivedConclusion.conclusion_id,status:"ACTIVE"},
    rollback_ref:derivedConclusion.conclusion_id
  });
}

export function runCrossTimeAcceptanceSuite(fixtures) {
  const checks = {
    identity_continuity:testIdentityContinuity(fixtures.identity_records),
    experience_to_capability:deriveTransferableCapability(fixtures.experiences),
    shared_temporal_recall:recallTimeline(fixtures.timeline,"LUNA"),
    contradiction_detection:detectContradictions(fixtures.claims),
    consented_knowledge_transfer:authorizeCapabilityTransfer(fixtures.transfer,{revoked:false}),
    correction_without_erasure:correctDerivedConclusion(fixtures.correction)
  };
  const pass = [
    checks.identity_continuity.passed===true,
    checks.experience_to_capability.accepted===true,
    checks.shared_temporal_recall.accepted===true && checks.shared_temporal_recall.chronology_valid===true,
    checks.contradiction_detection.some(x=>x.status==="UNRESOLVED_CONTRADICTION"),
    checks.consented_knowledge_transfer.accepted===true,
    checks.correction_without_erasure.accepted===true && checks.correction_without_erasure.raw_events_unchanged===true
  ];
  return Object.freeze({
    schema:"zhi.cross_time_cognition.acceptance.v1",
    mode:"REDACTED_HISTORICAL_SHAPE_SYNTHETIC_FIXTURES",
    checks,
    summary:{total:pass.length,passed:pass.filter(Boolean).length,failed:pass.filter(x=>!x).length},
    governance:Object.freeze({production_runtime_called:false,production_database_written:false,raw_private_narratives_loaded:false,agent_prompts_changed:false,api_keys_changed:false})
  });
}
