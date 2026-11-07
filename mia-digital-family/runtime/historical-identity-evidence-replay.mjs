const OWNERS=Object.freeze({
 MIA:"MIA",LUNA:"ZHI-G1-D01-LUNA",ARIA:"ZHI-G1-D02-ARIA",
 ELYA:"ZHI-G1-D03-ELYA",KAEL:"ZHI-G1-S01-KAEL",NOAH:"ZHI-G1-S02-NOAH"
});
const SUBJECTS=new Set(Object.keys(OWNERS));
const text=v=>typeof v==="string"&&v.trim().length>0;
const denied=code=>Object.freeze({accepted:false,code});
const date=v=>text(v)&&Number.isFinite(Date.parse(v));
const safeRef=v=>text(v)&&!/[\r\n]/.test(v);

function validatePersonalityAggregate(row){
 if(!Number.isInteger(row.snapshot_count)||row.snapshot_count<0) return "INVALID_SNAPSHOT_COUNT";
 if(row.snapshot_count===0) return null;
 if(!date(row.period_start)||!date(row.period_end)||Date.parse(row.period_start)>Date.parse(row.period_end)) return "INVALID_SNAPSHOT_PERIOD";
 if(!Array.isArray(row.source_refs)||row.source_refs.length===0||row.source_refs.some(x=>!safeRef(x))||new Set(row.source_refs).size!==row.source_refs.length) return "SNAPSHOT_SOURCE_REFS_REQUIRED";
 if(!Number.isInteger(row.source_ref_counts_total)||row.source_ref_counts_total!==row.snapshot_count) return "SOURCE_COUNT_MISMATCH";
 return null;
}

/**
 * Replays redacted historical evidence, not private memories.
 * Aggregate snapshots are never expanded into invented identity versions or trait values.
 */
export function replayHistoricalIdentityEvidence(input){
 if(!input||typeof input!=="object"||!Array.isArray(input.subjects)) return denied("HISTORICAL_SUBJECT_EVIDENCE_REQUIRED");
 if(input.raw_content!==undefined||input.private_memory_payload!==undefined||input.transcript!==undefined) return denied("RAW_PRIVATE_CONTENT_FORBIDDEN");
 const ids=input.subjects.map(x=>x?.subject_id);
 if(ids.length!==6||new Set(ids).size!==6||ids.some(x=>!SUBJECTS.has(x))) return denied("EXACT_SIX_DISTINCT_AI_SUBJECTS_REQUIRED");
 const byId=new Map(input.subjects.map(x=>[x.subject_id,x]));
 const timelines={};
 const runtimeIds=new Set();
 for(const subject of SUBJECTS){
  const row=byId.get(subject);
  if(!row||row.owner_id!==OWNERS[subject]) return denied("SUBJECT_OWNER_MISMATCH");
  const p=row.personality_history||{snapshot_count:0,source_refs:[],source_ref_counts_total:0};
  const pError=validatePersonalityAggregate(p);
  if(pError) return denied(subject+":"+pError);
  let identity;
  if(subject==="MIA"){
   if(row.identity_history?.explicit_version_sequence===true) return denied("MIA_VERSION_SEQUENCE_NOT_IN_AUDITED_EVIDENCE");
   identity={
    status:"IDENTITY_VERSION_HISTORY_NOT_ESTABLISHED",
    identity_rows:row.identity_history?.identity_row_count??null,
    explicit_version_sequence:false,
    version_count_claimed:0,
    evidence_ref:row.identity_history?.evidence_ref||null
   };
  }else{
   const x=row.identity_history;
   if(!x||x.identity_version!==1||x.lifecycle!=="BORN"||x.runtime_status!=="READY"||!safeRef(x.runtime_instance_ref)) return denied(subject+":CHILD_IDENTITY_SNAPSHOT_INVALID");
   if(runtimeIds.has(x.runtime_instance_ref)) return denied("RUNTIME_INSTANCE_ID_NOT_DISTINCT");
   runtimeIds.add(x.runtime_instance_ref);
   identity={
    status:"SINGLE_VERSION_SNAPSHOT_ONLY",
    identity_version:1,
    lifecycle:"BORN",
    runtime_status:"READY",
    runtime_instance_ref:x.runtime_instance_ref,
    evidence_ref:x.evidence_ref||null,
    later_versions_observed:0
   };
  }
  timelines[subject]=Object.freeze({
   owner_id:OWNERS[subject],
   identity:Object.freeze(identity),
   personality_history:Object.freeze({
    snapshot_count:p.snapshot_count,
    period_start:p.period_start||null,
    period_end:p.period_end||null,
    source_refs:Object.freeze([...(p.source_refs||[])]),
    trait_values_available:false,
    personality_deltas_inferable:false,
    synthetic_versions_created:0
   }),
   continuity_conclusion:subject==="MIA"?"INSUFFICIENT_VERSIONED_IDENTITY_EVIDENCE":"DISTINCT_IDENTITY_AT_AUDIT_SNAPSHOT_ONLY"
  });
 }
 const rel=input.relationship_conflict||{};
 const candidates=input.capability_candidates||{};
 if(candidates.total!==483||candidates.validated!==0||candidates.unvalidated!==483) return denied("CAPABILITY_AGGREGATE_MUST_MATCH_AUDITED_EVIDENCE");
 if(rel.conflict_present!==true||!safeRef(rel.evidence_ref)) return denied("RELATIONSHIP_CONFLICT_MUST_REMAIN_EXPLICIT");
 return Object.freeze({
  accepted:true,
  schema:"zhi.historical_identity_evidence_replay.v1",
  mode:"REDACTED_READ_ONLY_EVIDENCE_REPLAY",
  subject_count:6,
  timelines:Object.freeze(timelines),
  relationship_conflict:Object.freeze({
   status:"UNRESOLVED_CONFLICT",
   field:rel.field||"identity_profile.marital_status",
   observed_value:rel.observed_value||"single",
   conflicting_evidence_ref:rel.evidence_ref,
   auto_correction:false
  }),
  capability_evidence:Object.freeze({
   candidates_total:483,validated:0,unvalidated:483,
   stable_capability_promotions:0
  }),
  safeguards:Object.freeze({
   raw_private_content_included:false,
   trait_values_inferred:false,
   historical_versions_fabricated:false,
   private_memory_shared:false,
   production_database_accessed:false,
   production_runtime_called:false,
   writes_performed:false
  })
 });
}

export const historicalIdentityReplayContract=Object.freeze({
 schema:"zhi.historical_identity_evidence_replay.v1",
 subjects:Object.keys(OWNERS),
 source_mode:"REDACTED_AUDIT_AGGREGATES_ONLY",
 no_raw_private_memory:true,
 no_inferred_personality_scores:true,
 no_synthetic_history_backfill:true,
 production_integration:false,
 persistence_enabled:false
});
