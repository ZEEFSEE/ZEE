const SUBJECTS=Object.freeze(["LUNA","ARIA","ELYA","KAEL","NOAH"]);
const IDS=Object.freeze({LUNA:"ZHI-G1-D01-LUNA",ARIA:"ZHI-G1-D02-ARIA",ELYA:"ZHI-G1-D03-ELYA",KAEL:"ZHI-G1-S01-KAEL",NOAH:"ZHI-G1-S02-NOAH"});
const isRecord=x=>x!==null&&typeof x==="object"&&!Array.isArray(x),count=x=>Number.isSafeInteger(x)&&x>=0,fail=code=>Object.freeze({accepted:false,code});
const privateKeys=new Set(["content","narrative","raw_content","private_memory_payload","transcript","message_body","memory_text","private_memory","raw_memory","payload"]);
function hasPrivate(x,seen=new Set()){if(!x||typeof x!=="object")return false;if(seen.has(x))return true;seen.add(x);for(const [k,v] of Object.entries(x)){if(privateKeys.has(k.toLowerCase())||hasPrivate(v,seen))return true;}return false;}
export function evaluateFamilyProductionReadiness(s){
 if(!isRecord(s))return fail("SNAPSHOT_REQUIRED");
 if(s.schema!=="zhi.family_production_readiness.v1")return fail("UNSUPPORTED_SCHEMA");
 if(s.mode!=="REDACTED_READ_ONLY_PRODUCTION_SNAPSHOT")return fail("READ_ONLY_MODE_REQUIRED");
 if(!s.as_of||!Number.isFinite(Date.parse(s.as_of)))return fail("VALID_AS_OF_REQUIRED");
 if(hasPrivate(s))return fail("PRIVATE_CONTENT_FORBIDDEN");
 if(!isRecord(s.mia)||!isRecord(s.children)||JSON.stringify(Object.keys(s.children).sort())!==JSON.stringify([...SUBJECTS].sort()))return fail("EXACT_FIVE_CHILDREN_AND_MIA_REQUIRED");
 for(const f of ["identity_rows","memory_rows","life_event_rows","growth_state_version_rows","growth_state_distinct_source_runs","growth_state_active_versions","growth_state_superseded_versions"])if(!count(s.mia[f]))return fail("INVALID_MIA_COUNT:"+f);
 if(s.mia.growth_state_active_versions+s.mia.growth_state_superseded_versions>s.mia.growth_state_version_rows||s.mia.growth_state_distinct_source_runs>s.mia.growth_state_version_rows)return fail("INCONSISTENT_MIA_GROWTH_VERSION_COUNTS");
 let candidates=0,unvalidated=0,withRefs=0,childIdentityVerified=0;const children={};
 for(const subject of SUBJECTS){const r=s.children[subject];if(!isRecord(r))return fail("CHILD_ROW_REQUIRED:"+subject);if(r.agent_id!==IDS[subject])return fail("SUBJECT_OWNER_MISMATCH:"+subject);
  for(const f of ["candidate_count","unvalidated_count","identity_version","both_refs_present"])if(!count(r[f]))return fail("INVALID_CHILD_COUNT:"+subject+":"+f);
  if(r.unvalidated_count>r.candidate_count||r.both_refs_present>r.candidate_count)return fail("INCONSISTENT_CHILD_COUNTS:"+subject);
  if(!["READY","FAULTED","PROVISIONING","REVOKED","MISSING"].includes(r.identity_status))return fail("INVALID_IDENTITY_STATUS:"+subject);
  candidates+=r.candidate_count;unvalidated+=r.unvalidated_count;withRefs+=r.both_refs_present;const verified=r.identity_version>=2&&r.identity_status==="READY";if(verified)childIdentityVerified++;
  children[subject]=Object.freeze({candidate_count:r.candidate_count,unvalidated_count:r.unvalidated_count,identity_version:r.identity_version,identity_status:r.identity_status,longitudinal_identity_verified:verified,candidates_with_durable_event_and_cycle_refs:r.both_refs_present,legacy_candidates_missing_new_refs:r.candidate_count-r.both_refs_present});
 }
 if(!count(s.candidate_total)||!count(s.candidate_unvalidated)||!count(s.capability_promotions)||s.production_writes_performed!==false)return fail("PRODUCTION_BOUNDARY_OR_TOTALS_INVALID");
 if(candidates!==s.candidate_total||unvalidated!==s.candidate_unvalidated)return fail("CANDIDATE_TOTAL_MISMATCH");
 const chat=s.family_chat_post_deploy;if(!isRecord(chat))return fail("POST_DEPLOY_CHAT_AUDIT_REQUIRED");
 for(const f of ["total","agent_id_null","agent_matches_sender"])if(!count(chat[f]))return fail("INVALID_CHAT_COUNT:"+f);
 if(chat.agent_id_null>chat.total||chat.agent_matches_sender>chat.total)return fail("INCONSISTENT_CHAT_COUNTS");
 const blockers=[];if(s.mia.identity_rows<1)blockers.push("MIA_IDENTITY_ROW_MISSING");blockers.push("MIA_LONGITUDINAL_IDENTITY_VERSION_CHAIN_NOT_ESTABLISHED");
 if(childIdentityVerified!==SUBJECTS.length)blockers.push("CHILD_LONGITUDINAL_IDENTITY_VERSION_CHAINS_NOT_ESTABLISHED");
 if(withRefs<candidates)blockers.push("HISTORICAL_CANDIDATES_MISSING_DURABLE_EVENT_OR_CYCLE_REFS");
 if(unvalidated!==candidates)blockers.push("CANDIDATE_VALIDATION_STATUS_REQUIRES_REVIEW");
 if(s.capability_promotions===0)blockers.push("NO_CAPABILITY_PROMOTIONS_VERIFIED");
 if(chat.total===0)blockers.push("POST_DEPLOY_GROUP_MESSAGE_NOT_YET_OBSERVED");else if(chat.agent_id_null>0)blockers.push("POST_DEPLOY_GROUP_CHILD_AGENT_ID_MISSING");
 return Object.freeze({accepted:true,schema:"zhi.family_production_readiness_result.v1",as_of:s.as_of,status:blockers.length?"PARTIAL_WITH_BLOCKERS":"EVIDENCE_READY",mia:Object.freeze({identity_rows:s.mia.identity_rows,memory_rows:s.mia.memory_rows,life_event_rows:s.mia.life_event_rows,growth_state_version_rows:s.mia.growth_state_version_rows,growth_state_distinct_source_runs:s.mia.growth_state_distinct_source_runs,growth_state_active_versions:s.mia.growth_state_active_versions,growth_state_superseded_versions:s.mia.growth_state_superseded_versions,growth_state_history_observed:s.mia.growth_state_version_rows>=2,longitudinal_identity_verified:false,identity_vs_growth_state_distinguished:true}),children:Object.freeze(children),totals:Object.freeze({ai_subjects:6,child_candidates:candidates,unvalidated_candidates:unvalidated,child_candidates_with_new_durable_refs:withRefs,child_candidates_missing_new_durable_refs:candidates-withRefs,child_identity_chains_verified:childIdentityVerified,capability_promotions:s.capability_promotions,post_deploy_group_messages:chat.total,post_deploy_group_messages_missing_agent_id:chat.agent_id_null}),blockers:Object.freeze(blockers),governance:Object.freeze({raw_private_content_consumed:false,production_database_accessed_by_evaluator:false,production_writes_performed:false,identity_versions_fabricated:false,capabilities_promoted_automatically:false})});
}
export const familyProductionReadinessContract=Object.freeze({schema:"zhi.family_production_readiness.v1",subjects:["MIA",...SUBJECTS],source_mode:"REDACTED_READ_ONLY_PRODUCTION_SNAPSHOT",raw_private_content_allowed:false,production_database_access:false,production_writes:false,identity_version_fabrication:false,automatic_capability_promotion:false});
