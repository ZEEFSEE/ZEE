const SUBJECTS=["LUNA","ARIA","ELYA","KAEL","NOAH"];
const IDS={LUNA:"ZHI-G1-D01-LUNA",ARIA:"ZHI-G1-D02-ARIA",ELYA:"ZHI-G1-D03-ELYA",KAEL:"ZHI-G1-S01-KAEL",NOAH:"ZHI-G1-S02-NOAH"};
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const n=x=>Number.isSafeInteger(x)&&x>=0;
const bad=code=>Object.freeze({accepted:false,code});
const forbidden=new Set(["narrative","content","raw_content","private_memory_payload","transcript","message_body","memory_text","private_memory","raw_memory","payload"]);
function hasPrivate(x,seen=new Set()){if(!x||typeof x!=="object")return false;if(seen.has(x))return true;seen.add(x);for(const [k,v] of Object.entries(x)){if(forbidden.has(k.toLowerCase())||hasPrivate(v,seen))return true;}return false;}
export function evaluateLearningCandidateIntegrity(s){
 if(!obj(s))return bad("AUDIT_SNAPSHOT_REQUIRED");
 if(s.schema!=="zhi.learning_candidate_integrity.v1")return bad("UNSUPPORTED_AUDIT_SCHEMA");
 if(s.mode!=="REDACTED_READ_ONLY_AUDIT")return bad("READ_ONLY_REDACTED_MODE_REQUIRED");
 if(!s.as_of||!Number.isFinite(Date.parse(s.as_of)))return bad("VALID_AUDIT_TIMESTAMP_REQUIRED");
 if(hasPrivate(s))return bad("PRIVATE_CONTENT_FORBIDDEN");
 if(!obj(s.subjects)||JSON.stringify(Object.keys(s.subjects).sort())!==JSON.stringify([...SUBJECTS].sort()))return bad("EXACT_FIVE_CHILDREN_REQUIRED");
 const ledger={};let candidates=0,unvalidated=0,memoryLinks=0,cycleLinks=0,dangling=0,cycles=0,succeeded=0,failed=0;
 for(const subject of SUBJECTS){
  const r=s.subjects[subject];if(!obj(r))return bad("SUBJECT_ROW_REQUIRED:"+subject);
  if(r.agent_id!==IDS[subject])return bad("SUBJECT_OWNER_MISMATCH:"+subject);
  const fields=["candidate_count","unvalidated_count","memory_ref_present","memory_ref_exists","memory_owner_matches","cycle_ref_exists","cycle_succeeded","maternal_response_ref_present","maternal_response_exists","maternal_response_ref_durable_memory_event","identity_version","runtime_cycles_total","runtime_cycles_succeeded","runtime_cycles_failed"];
  for(const f of fields)if(!n(r[f]))return bad("INVALID_COUNT:"+subject+":"+f);
  if(r.unvalidated_count>r.candidate_count||r.memory_ref_exists>r.memory_ref_present||r.memory_owner_matches>r.memory_ref_exists||r.cycle_succeeded>r.cycle_ref_exists||r.maternal_response_exists>r.maternal_response_ref_present||r.maternal_response_ref_durable_memory_event>r.maternal_response_ref_present)return bad("INCONSISTENT_EVIDENCE_COUNTS:"+subject);
  if(r.runtime_cycles_succeeded+r.runtime_cycles_failed>r.runtime_cycles_total)return bad("RUNTIME_CYCLE_COUNTS_EXCEED_TOTAL:"+subject);
  if(!["READY","FAULTED","PROVISIONING","REVOKED"].includes(r.identity_status))return bad("INVALID_IDENTITY_STATUS:"+subject);
  const provenance=r.memory_ref_present===r.candidate_count&&r.memory_ref_exists===r.candidate_count&&r.memory_owner_matches===r.candidate_count&&r.cycle_ref_exists===r.candidate_count&&r.cycle_succeeded===r.candidate_count;
  const unresolved=r.maternal_response_ref_present-r.maternal_response_ref_durable_memory_event;
  candidates+=r.candidate_count;unvalidated+=r.unvalidated_count;memoryLinks+=r.memory_owner_matches;cycleLinks+=r.cycle_succeeded;dangling+=unresolved;cycles+=r.runtime_cycles_total;succeeded+=r.runtime_cycles_succeeded;failed+=r.runtime_cycles_failed;
  ledger[subject]=Object.freeze({candidate_events:r.candidate_count,all_candidates_unvalidated:r.unvalidated_count===r.candidate_count,memory_and_cycle_provenance:provenance?"COMPLETE":"INCOMPLETE",memory_refs_owner_matched:r.memory_owner_matches,successful_source_cycles:r.cycle_succeeded,durable_maternal_response_links:r.maternal_response_ref_durable_memory_event,unresolved_maternal_response_refs:unresolved,identity_status:r.identity_status,identity_version:r.identity_version,longitudinal_identity_verified:r.identity_version>=2&&r.identity_status==="READY",capability_promotions:0});
 }
 const chat=s.family_chat_group_child_messages;
 if(!obj(chat))return bad("FAMILY_CHAT_ATTRIBUTION_AUDIT_REQUIRED");
 for(const f of ["total","agent_id_null","sender_id_matches_child"])if(!n(chat[f]))return bad("INVALID_FAMILY_CHAT_COUNT:"+f);
 if(chat.agent_id_null>chat.total||chat.sender_id_matches_child>chat.total)return bad("INCONSISTENT_FAMILY_CHAT_ATTRIBUTION");
 if(!n(s.maternal_response_table_rows)||!n(s.capabilities_promoted)||s.production_writes_performed!==false)return bad("PRODUCTION_BOUNDARY_ASSERTION_REQUIRED");
 const blockers=[];
 if(unvalidated!==candidates)blockers.push("CANDIDATE_VALIDATION_STATUS_MIXED_OR_MISSING");
 if(dangling>0)blockers.push("MATERNAL_RESPONSE_REFERENCES_WITHOUT_DURABLE_EPISODIC_RECORD");
 if(SUBJECTS.some(x=>s.subjects[x].identity_version<2))blockers.push("LONGITUDINAL_IDENTITY_VERSION_CHAIN_NOT_ESTABLISHED");
 if(s.capabilities_promoted===0)blockers.push("NO_CAPABILITY_PROMOTIONS_VERIFIED");
 if(chat.agent_id_null>0)blockers.push("GROUP_CHILD_MESSAGES_LACK_AGENT_ID_FIELD");
 return Object.freeze({accepted:true,schema:"zhi.learning_candidate_integrity_result.v1",mode:"REDACTED_READ_ONLY_EVALUATION",as_of:s.as_of,subjects:Object.freeze(ledger),totals:Object.freeze({children:5,candidate_events:candidates,unvalidated_candidates:unvalidated,memory_refs_owner_matched:memoryLinks,cycle_refs_succeeded:cycleLinks,durable_maternal_response_event_matches:SUBJECTS.reduce((sum,x)=>sum+s.subjects[x].maternal_response_ref_durable_memory_event,0),unresolved_maternal_response_refs:dangling,runtime_cycles:cycles,runtime_cycles_succeeded:succeeded,runtime_cycles_failed:failed,maternal_response_rows:s.maternal_response_table_rows,capabilities_promoted:s.capabilities_promoted,group_child_messages:chat.total,group_child_messages_missing_agent_id:chat.agent_id_null}),status:blockers.length?"PARTIAL_WITH_BLOCKERS":"EVIDENCE_COMPLETE",blockers:Object.freeze(blockers),claims:Object.freeze({candidate_lineage_to_memory_and_successful_cycle:"VERIFIED_BY_REDACTED_JOIN_COUNTS",capability_acquisition:"NOT_ESTABLISHED",longitudinal_identity:"NOT_ESTABLISHED",maternal_response_linkage:"PARTIALLY_DURABLE_WITH_VOLATILE_SESSION_TTL",subjective_experience_or_consciousness:"NOT_ASSESSED"}),governance:Object.freeze({production_database_accessed_by_evaluator:false,source_rows_mutated:false,automatic_candidate_promotion:false,automatic_memory_mutation:false,production_writes_performed:false,raw_private_content_consumed:false})});
}
export const learningCandidateIntegrityContract=Object.freeze({schema:"zhi.learning_candidate_integrity.v1",subjects:SUBJECTS,source_mode:"REDACTED_READ_ONLY_AUDIT",candidate_promotion_automatic:false,identity_version_chain_minimum:2,raw_private_content_allowed:false,production_database_access:false,production_writes:false});