const SUBJECT_OWNERS = Object.freeze({
  MIA:"MIA",
  LUNA:"ZHI-G1-D01-LUNA",
  ARIA:"ZHI-G1-D02-ARIA",
  ELYA:"ZHI-G1-D03-ELYA",
  KAEL:"ZHI-G1-S01-KAEL",
  NOAH:"ZHI-G1-S02-NOAH"
});
const SUBJECTS = new Set(Object.keys(SUBJECT_OWNERS));
const EVIDENCE = new Set(["OBSERVED","USER_CONFIRMED"]);
const MAX_TRAIT_DELTA = 0.15;
const text = value => typeof value === "string" && value.trim().length > 0;
const unique = values => Array.isArray(values) && values.every(text) && new Set(values).size === values.length;
const denied = code => Object.freeze({accepted:false,code});
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const validTraits = traits => traits && typeof traits === "object" && !Array.isArray(traits) &&
  Object.keys(traits).length > 0 && Object.values(traits).every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);
const validTime = value => text(value) && Number.isFinite(Date.parse(value));

function validateAnchor(anchor) {
  if (!anchor || !SUBJECTS.has(anchor.subject_id)) return "UNKNOWN_AI_SUBJECT";
  if (!text(anchor.identity_anchor_ref) || !unique(anchor.identity_core_refs) || !anchor.identity_core_refs.length) return "IDENTITY_CORE_REQUIRED";
  if (!unique(anchor.stable_trait_refs) || !anchor.stable_trait_refs.length) return "STABLE_TRAIT_ANCHORS_REQUIRED";
  if (!validTraits(anchor.personality_traits)) return "INVALID_PERSONALITY_TRAITS";
  if (anchor.owner_id !== SUBJECT_OWNERS[anchor.subject_id]) return "IDENTITY_OWNER_MISMATCH";
  return null;
}

/** Creates the immutable first identity version from references and bounded trait scores only. */
export function createIdentityBaseline(anchor) {
  const error = validateAnchor(anchor);
  if (error) return denied(error);
  if (!text(anchor.version_id) || !validTime(anchor.recorded_at) || !unique(anchor.evidence_refs) || !anchor.evidence_refs.length) return denied("BASELINE_EVIDENCE_AND_VERSION_REQUIRED");
  if (anchor.scope !== "PRIVATE") return denied("IDENTITY_BASELINE_MUST_BE_PRIVATE");
  return Object.freeze({
    accepted:true,
    schema:"zhi.identity_version.v1",
    subject_id:anchor.subject_id,
    owner_id:anchor.owner_id,
    version_id:anchor.version_id,
    sequence:1,
    previous_version_id:null,
    identity_anchor_ref:anchor.identity_anchor_ref,
    identity_core_refs:Object.freeze([...anchor.identity_core_refs]),
    stable_trait_refs:Object.freeze([...anchor.stable_trait_refs]),
    personality_traits:Object.freeze({...anchor.personality_traits}),
    recorded_at:anchor.recorded_at,
    evidence_refs:Object.freeze([...anchor.evidence_refs]),
    evidence_status:anchor.evidence_status || "USER_CONFIRMED",
    scope:"PRIVATE",
    immutable_identity_core:true
  });
}

/** Appends a bounded personality evolution while retaining immutable identity anchors. */
export function appendIdentityEvolution(current, proposal, policy={}) {
  if (!current || current.schema !== "zhi.identity_version.v1" || !proposal) return denied("CURRENT_IDENTITY_AND_PROPOSAL_REQUIRED");
  if (policy.revoked === true) return denied("IDENTITY_EVOLUTION_REVOKED");
  if (proposal.subject_id !== current.subject_id || proposal.owner_id !== current.owner_id) return denied("IDENTITY_SUBJECT_OR_OWNER_MISMATCH");
  if (proposal.scope !== "PRIVATE") return denied("IDENTITY_EVOLUTION_MUST_REMAIN_PRIVATE");
  if (!text(proposal.version_id) || proposal.version_id === current.version_id || proposal.previous_version_id !== current.version_id) return denied("BROKEN_VERSION_PARENT_LINK");
  if (proposal.sequence !== current.sequence + 1) return denied("IDENTITY_SEQUENCE_GAP");
  if (!validTime(proposal.recorded_at) || Date.parse(proposal.recorded_at) <= Date.parse(current.recorded_at)) return denied("NON_MONOTONIC_IDENTITY_TIME");
  if (!unique(proposal.evidence_refs) || proposal.evidence_refs.length < 2 || !EVIDENCE.has(proposal.evidence_status)) return denied("INDEPENDENT_LONGITUDINAL_EVIDENCE_REQUIRED");
  if (!same(proposal.identity_core_refs, current.identity_core_refs) || proposal.identity_anchor_ref !== current.identity_anchor_ref) return denied("IMMUTABLE_IDENTITY_CORE_CHANGED");
  if (!same(proposal.stable_trait_refs, current.stable_trait_refs)) return denied("STABLE_TRAIT_ANCHORS_CHANGED");
  if (!validTraits(proposal.personality_traits) || !same(Object.keys(proposal.personality_traits).sort(), Object.keys(current.personality_traits).sort())) return denied("PERSONALITY_TRAIT_SCHEMA_CHANGED");
  const limit = typeof policy.max_trait_delta === "number" && policy.max_trait_delta >= 0 && policy.max_trait_delta <= MAX_TRAIT_DELTA ? policy.max_trait_delta : MAX_TRAIT_DELTA;
  const deltas = {};
  for (const key of Object.keys(current.personality_traits)) {
    const delta = proposal.personality_traits[key] - current.personality_traits[key];
    if (Math.abs(delta) > limit) return denied("PERSONALITY_DRIFT_LIMIT_EXCEEDED");
    deltas[key] = delta;
  }
  if (proposal.raw_content !== undefined || proposal.private_memory_payload !== undefined || proposal.transcript !== undefined) return denied("RAW_PRIVATE_CONTENT_FORBIDDEN");
  return Object.freeze({
    accepted:true,
    schema:"zhi.identity_version.v1",
    subject_id:current.subject_id,
    owner_id:current.owner_id,
    version_id:proposal.version_id,
    sequence:proposal.sequence,
    previous_version_id:current.version_id,
    identity_anchor_ref:current.identity_anchor_ref,
    identity_core_refs:current.identity_core_refs,
    stable_trait_refs:current.stable_trait_refs,
    personality_traits:Object.freeze({...proposal.personality_traits}),
    trait_deltas:Object.freeze(deltas),
    recorded_at:proposal.recorded_at,
    evidence_refs:Object.freeze([...proposal.evidence_refs]),
    evidence_status:proposal.evidence_status,
    scope:"PRIVATE",
    immutable_identity_core:true,
    evolution_is_append_only:true
  });
}

/** Replays independent subject timelines; no timeline can inherit another subject's identity. */
export function replayIdentityTimelines(records) {
  if (!Array.isArray(records)) return denied("IDENTITY_RECORDS_REQUIRED");
  const grouped = new Map();
  for (const record of records) {
    if (!record || !SUBJECTS.has(record.subject_id)) return denied("UNKNOWN_AI_SUBJECT_IN_TIMELINE");
    if (!grouped.has(record.subject_id)) grouped.set(record.subject_id, []);
    grouped.get(record.subject_id).push(record);
  }
  const timelines = {};
  const allVersionIds = records.map(x => x.version_id);
  if (allVersionIds.some(x => !text(x)) || new Set(allVersionIds).size !== allVersionIds.length) return denied("DUPLICATE_OR_MISSING_VERSION_ID");
  for (const [subject, versions] of grouped) {
    versions.sort((a,b) => a.sequence - b.sequence);
    const first = versions[0];
    if (first.sequence !== 1 || first.previous_version_id !== null || first.owner_id !== SUBJECT_OWNERS[subject]) return denied("INVALID_IDENTITY_ROOT");
    for (let i=0;i<versions.length;i++) {
      const v=versions[i];
      if (v.subject_id !== subject || v.owner_id !== SUBJECT_OWNERS[subject] || v.scope !== "PRIVATE") return denied("CROSS_SUBJECT_IDENTITY_CONTAMINATION");
      if (v.sequence !== i+1 || (i===0 ? v.previous_version_id!==null : v.previous_version_id!==versions[i-1].version_id)) return denied("BROKEN_IDENTITY_VERSION_CHAIN");
      if (v.identity_anchor_ref !== first.identity_anchor_ref || !same(v.identity_core_refs,first.identity_core_refs) || !same(v.stable_trait_refs,first.stable_trait_refs)) return denied("IDENTITY_ANCHOR_DRIFT");
      if (!validTraits(v.personality_traits) || !validTime(v.recorded_at)) return denied("INVALID_IDENTITY_VERSION");
      if (i>0 && Date.parse(v.recorded_at)<=Date.parse(versions[i-1].recorded_at)) return denied("NON_MONOTONIC_IDENTITY_TIME");
      if (i>0) for (const key of Object.keys(first.personality_traits)) {
        if (Math.abs(v.personality_traits[key]-versions[i-1].personality_traits[key])>MAX_TRAIT_DELTA) return denied("REPLAY_PERSONALITY_DRIFT_EXCEEDED");
      }
    }
    timelines[subject]=Object.freeze({
      version_count:versions.length,
      first_version_id:first.version_id,
      current_version_id:versions.at(-1).version_id,
      identity_anchor_preserved:true,
      private_scope_preserved:true
    });
  }
  return Object.freeze({
    accepted:true,
    schema:"zhi.identity_replay_result.v1",
    subject_count:grouped.size,
    timelines:Object.freeze(timelines),
    identity_fusion_detected:false,
    production_runtime_called:false,
    database_writes_performed:false
  });
}

/** Links a verified capability only to the same subject; memory text never enters this record. */
export function validateExperienceCapabilityLink(experience, capability) {
  if (!experience || !capability || !SUBJECTS.has(experience.subject_id)) return denied("EXPERIENCE_AND_CAPABILITY_REQUIRED");
  if (experience.scope !== "PRIVATE" || experience.owner_id !== SUBJECT_OWNERS[experience.subject_id]) return denied("EXPERIENCE_PRIVATE_OWNER_MISMATCH");
  if (capability.state !== "ACCEPTED" || capability.code !== "CAPABILITY_VALIDATED") return denied("CAPABILITY_NOT_INDEPENDENTLY_VALIDATED");
  if (capability.subject_id !== experience.subject_id) return denied("CROSS_SUBJECT_CAPABILITY_TRANSFER_DENIED");
  if (!text(experience.source_event_id) || !text(experience.private_memory_ref) || !text(capability.candidate_id)) return denied("SOURCE_TRACEABILITY_REQUIRED");
  if (experience.raw_content !== undefined || experience.memory_text !== undefined) return denied("PRIVATE_MEMORY_CONTENT_FORBIDDEN");
  return Object.freeze({
    accepted:true,
    state:"SAME_SUBJECT_CAPABILITY_LINKED",
    subject_id:experience.subject_id,
    source_event_id:experience.source_event_id,
    private_memory_ref:experience.private_memory_ref,
    capability_candidate_id:capability.candidate_id,
    memory_content_transferred:false,
    cross_subject_transfer:false
  });
}

/** Relationship evolution is a separate append-only event and cannot mutate identity versions. */
export function appendRelationshipEvent(currentIdentity, event) {
  if (!currentIdentity || currentIdentity.schema!=="zhi.identity_version.v1" || !event) return denied("IDENTITY_AND_RELATIONSHIP_EVENT_REQUIRED");
  if (!SUBJECTS.has(event.source_subject) || !SUBJECTS.has(event.target_subject) || event.source_subject===event.target_subject) return denied("INVALID_RELATIONSHIP_PARTICIPANTS");
  if (event.source_subject!==currentIdentity.subject_id) return denied("RELATIONSHIP_SOURCE_IDENTITY_MISMATCH");
  if (!text(event.relationship_event_id) || !text(event.relationship_type) || !text(event.evidence_ref) || !validTime(event.recorded_at)) return denied("RELATIONSHIP_EVIDENCE_REQUIRED");
  if (event.scope!=="FAMILY" || event.family_source_verified!==true) return denied("FAMILY_RELATIONSHIP_SOURCE_NOT_VERIFIED");
  return Object.freeze({
    accepted:true,
    state:"RELATIONSHIP_EVENT_APPENDED",
    relationship_event_id:event.relationship_event_id,
    source_subject:event.source_subject,
    target_subject:event.target_subject,
    relationship_type:event.relationship_type,
    evidence_ref:event.evidence_ref,
    identity_version_unchanged:true,
    current_identity_version_id:currentIdentity.version_id,
    private_memory_shared:false
  });
}

/** Rollback is a separate authorized event; the old identity version remains intact. */
export function createIdentityRollback(current, restoreVersion, authorization) {
  if (!current || !restoreVersion || current.subject_id!==restoreVersion.subject_id || restoreVersion.sequence>=current.sequence) return denied("VALID_ROLLBACK_VERSIONS_REQUIRED");
  if (!authorization || authorization.authorized!==true || !text(authorization.rollback_id) || !text(authorization.reason_ref)) return denied("AUTHORIZED_IDENTITY_ROLLBACK_REQUIRED");
  return Object.freeze({
    accepted:true,
    state:"IDENTITY_ROLLBACK_APPENDED",
    rollback_id:authorization.rollback_id,
    subject_id:current.subject_id,
    disabled_version_id:current.version_id,
    restored_version_id:restoreVersion.version_id,
    current_version_record_preserved:true,
    source_events_modified:false,
    history_erased:false
  });
}

export const identityEvolutionContract = Object.freeze({
  schema:"zhi.identity_evolution_shadow.v1",
  ai_subjects:[...SUBJECTS],
  human_participant:"KEN",
  max_personality_delta_per_version:MAX_TRAIT_DELTA,
  identity_core_mutable:false,
  personality_evolution_enabled:true,
  private_memory_cross_subject_transfer:false,
  relationship_updates_change_identity:false,
  production_integration:false,
  persistence_enabled:false
});
