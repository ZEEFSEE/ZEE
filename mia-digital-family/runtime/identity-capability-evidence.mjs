const SUBJECTS = Object.freeze(["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"]);
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v);
const nonBlank = v => typeof v === "string" && v.trim().length > 0;
const forbidden = new Set(["raw_content","private_memory_payload","transcript","message_body","memory_text","private_memory","raw_memory","narrative"]);
const result = (status,code,details={}) => Object.freeze({status,code,...details});
function hasPrivatePayload(value,seen=new Set()){if(!value||typeof value!=="object")return false;if(seen.has(value))return true;seen.add(value);for(const [k,v] of Object.entries(value)){if(forbidden.has(k.toLowerCase())||hasPrivatePayload(v,seen))return true;}return false;}
/** Append-only lineage check; continuity does not require identical beliefs. */
export function evaluateIdentityVersionChain(input){
 if(!isRecord(input))return result("REJECTED","IDENTITY_CHAIN_INPUT_REQUIRED");
 if(hasPrivatePayload(input))return result("REJECTED","PRIVATE_CONTENT_FORBIDDEN");
 if(!SUBJECTS.includes(input.subject_id))return result("REJECTED","UNKNOWN_AI_SUBJECT");
 if(!nonBlank(input.identity_anchor_ref))return result("REJECTED","IDENTITY_ANCHOR_REQUIRED");
 if(!Array.isArray(input.versions)||input.versions.length===0)return result("INCOMPLETE","IDENTITY_VERSIONS_REQUIRED");
 const refs=new Set();let previousTime=-Infinity;
 for(let i=0;i<input.versions.length;i++){const v=input.versions[i],n=i+1;
  if(!isRecord(v))return result("REJECTED","INVALID_VERSION_ROW:"+n);
  if(v.version!==n)return result("REJECTED","NON_SEQUENTIAL_VERSION:"+n);
  if(v.subject_id!==input.subject_id)return result("REJECTED","SUBJECT_IDENTITY_MISMATCH:"+n);
  if(v.identity_anchor_ref!==input.identity_anchor_ref)return result("REJECTED","IDENTITY_ANCHOR_CHANGED:"+n);
  if(i===0&&v.previous_version_ref!==null)return result("REJECTED","FIRST_VERSION_MUST_NOT_HAVE_PARENT");
  if(i>0&&v.previous_version_ref!==input.versions[i-1].version_ref)return result("REJECTED","BROKEN_VERSION_LINK:"+n);
  if(!nonBlank(v.version_ref)||refs.has(v.version_ref))return result("REJECTED","INVALID_OR_DUPLICATE_VERSION_REF:"+n);refs.add(v.version_ref);
  if(!nonBlank(v.snapshot_fingerprint))return result("REJECTED","SNAPSHOT_FINGERPRINT_REQUIRED:"+n);
  if(!nonBlank(v.recorded_at)||!Number.isFinite(Date.parse(v.recorded_at)))return result("REJECTED","INVALID_TIMESTAMP:"+n);
  const ts=Date.parse(v.recorded_at);if(ts<=previousTime)return result("REJECTED","NON_MONOTONIC_TIMESTAMP:"+n);previousTime=ts;
  if(!Array.isArray(v.evidence_refs)||v.evidence_refs.length===0||!v.evidence_refs.every(nonBlank)||new Set(v.evidence_refs).size!==v.evidence_refs.length)return result("REJECTED","VERSION_EVIDENCE_REQUIRED:"+n);
  if(!nonBlank(v.change_summary_ref))return result("REJECTED","CHANGE_SUMMARY_REFERENCE_REQUIRED:"+n);
 }
 if(input.versions.length<2)return result("INCOMPLETE","LONGITUDINAL_CHAIN_NOT_YET_ESTABLISHED",{subject_id:input.subject_id,versions_observed:input.versions.length,verified:false});
 return result("VERIFIED","APPEND_ONLY_IDENTITY_CHAIN_VALID",{subject_id:input.subject_id,versions_observed:input.versions.length,identity_anchor_ref:input.identity_anchor_ref,continuity_basis:"stable_subject_anchor_and_linked_versions",beliefs_must_remain_identical:false,verified:true});
}
/** Gate only: never promotes; requires evidence across time and contexts. */
export function evaluateCapabilityEvidence(input,policy={}){
 const minEvidence=policy.minEvidence??3,minDays=policy.minDistinctDays??2,minContexts=policy.minDistinctContexts??2;
 if(!isRecord(input))return result("REJECTED","CAPABILITY_EVIDENCE_INPUT_REQUIRED");
 if(hasPrivatePayload(input))return result("REJECTED","PRIVATE_CONTENT_FORBIDDEN");
 if(!SUBJECTS.includes(input.subject_id))return result("REJECTED","UNKNOWN_AI_SUBJECT");
 if(!nonBlank(input.capability_id))return result("REJECTED","CAPABILITY_ID_REQUIRED");
 if(!Array.isArray(input.evidence)||input.evidence.length===0)return result("CANDIDATE","NO_VALIDATION_EVIDENCE");
 const refs=new Set(),days=new Set(),contexts=new Set();
 for(let i=0;i<input.evidence.length;i++){const e=input.evidence[i],n=i+1;
  if(!isRecord(e)||!nonBlank(e.evidence_ref)||refs.has(e.evidence_ref))return result("REJECTED","INVALID_OR_DUPLICATE_EVIDENCE_REF:"+n);refs.add(e.evidence_ref);
  if(!nonBlank(e.observed_at)||!Number.isFinite(Date.parse(e.observed_at)))return result("REJECTED","INVALID_EVIDENCE_TIMESTAMP:"+n);days.add(new Date(e.observed_at).toISOString().slice(0,10));
  if(!nonBlank(e.context_id))return result("REJECTED","CONTEXT_REQUIRED:"+n);contexts.add(e.context_id);
  if(!["PASS","FAIL"].includes(e.outcome))return result("REJECTED","INVALID_OUTCOME:"+n);
  if(typeof e.reproducible!=="boolean"||typeof e.regression_check_passed!=="boolean")return result("REJECTED","REPRODUCIBILITY_AND_REGRESSION_FLAGS_REQUIRED:"+n);
 }
 const failures=input.evidence.filter(e=>e.outcome==="FAIL"||!e.reproducible||!e.regression_check_passed).length;
 if(failures>0)return result("NOT_VALIDATED","CONTRADICTORY_OR_REGRESSION_EVIDENCE",{subject_id:input.subject_id,capability_id:input.capability_id,evidence_count:refs.size,failing_evidence_count:failures,promotion_allowed:false});
 const ready=refs.size>=minEvidence&&days.size>=minDays&&contexts.size>=minContexts;
 return result(ready?"VALIDATION_READY":"CANDIDATE",ready?"REPEATED_CROSS_CONTEXT_EVIDENCE_SUFFICIENT":"MORE_LONGITUDINAL_EVIDENCE_REQUIRED",{subject_id:input.subject_id,capability_id:input.capability_id,evidence_count:refs.size,distinct_days:days.size,distinct_contexts:contexts.size,promotion_allowed:false,next_state:ready?"ELIGIBLE_FOR_SEPARATE_REVIEW":"REMAIN_CANDIDATE"});
}
export const identityCapabilityEvidenceContract=Object.freeze({schema:"zhi.identity_capability_evidence.v1",subjects:SUBJECTS,identity_chain:{append_only:true,minimum_versions_for_verification:2,continuity_requires_same_beliefs:false},capability:{minimum_evidence:3,minimum_distinct_days:2,minimum_distinct_contexts:2,requires_reproducibility:true,requires_regression_check:true,automatic_promotion:false},privacy:{raw_private_content_allowed:false},production:{database_access:false,runtime_writes:false,automatic_promotion:false,delivery_enabled:false}});

/**
 * Family-level gate for six independent AI identity chains.
 * It validates lineage only; it never creates versions or promotes capabilities.
 */
export function evaluateFamilyIdentityCapabilityEvidence(input){
 if(!isRecord(input))return result("REJECTED","FAMILY_EVIDENCE_INPUT_REQUIRED");
 if(hasPrivatePayload(input))return result("REJECTED","PRIVATE_CONTENT_FORBIDDEN");
 if(!isRecord(input.subjects)||JSON.stringify(Object.keys(input.subjects).sort())!==JSON.stringify([...SUBJECTS].sort()))return result("REJECTED","EXACT_SIX_AI_SUBJECTS_REQUIRED");
 const anchors=new Set(),identityResults={},capabilityResults={};
 let verified=0,validationReady=0,notValidated=0;
 for(const subject of SUBJECTS){
  const row=input.subjects[subject];
  if(!isRecord(row)||!isRecord(row.identity))return result("REJECTED","IDENTITY_CHAIN_REQUIRED:"+subject);
  if(row.identity.subject_id!==subject)return result("REJECTED","SUBJECT_IDENTITY_MISMATCH:"+subject);
  const identity=evaluateIdentityVersionChain(row.identity);
  if(identity.status==="REJECTED")return result("REJECTED",identity.code);
  if(identity.identity_anchor_ref){
   if(anchors.has(identity.identity_anchor_ref))return result("REJECTED","IDENTITY_ANCHOR_REUSED:"+subject);
   anchors.add(identity.identity_anchor_ref);
  }
  if(identity.status==="VERIFIED")verified++;
  identityResults[subject]=identity;
  const capabilities=row.capabilities??[];
  if(!Array.isArray(capabilities))return result("REJECTED","CAPABILITY_LIST_REQUIRED:"+subject);
  capabilityResults[subject]=capabilities.map((item,index)=>{
   if(!isRecord(item)||item.subject_id!==subject)return result("REJECTED","CAPABILITY_SUBJECT_MISMATCH:"+subject+":"+(index+1));
   const evaluated=evaluateCapabilityEvidence(item);
   if(evaluated.status==="REJECTED")return evaluated;
   if(evaluated.status==="VALIDATION_READY")validationReady++;
   if(evaluated.status==="NOT_VALIDATED")notValidated++;
   return evaluated;
  });
  const rejected=capabilityResults[subject].find(x=>x.status==="REJECTED");
  if(rejected)return rejected;
 }
 return result(verified===SUBJECTS.length?"VERIFIED":"INCOMPLETE",verified===SUBJECTS.length?"SIX_SUBJECT_IDENTITY_LINEAGE_VERIFIED":"SIX_SUBJECT_IDENTITY_LINEAGE_INCOMPLETE",{
  subjects:Object.freeze(identityResults),
  capability_evidence:Object.freeze(capabilityResults),
  totals:Object.freeze({ai_subjects:SUBJECTS.length,identity_chains_verified:verified,identity_chains_incomplete:SUBJECTS.length-verified,capabilities_validation_ready:validationReady,capabilities_not_validated:notValidated}),
  independent_identity_anchors:true,
  beliefs_must_remain_identical:false,
  disagreement_or_belief_change_is_not_a_lineage_failure:true,
  capability_promotion_allowed:false,
  production_writes_performed:false
 });
}
export const familyIdentityEvidenceContract=Object.freeze({schema:"zhi.family_identity_capability_evidence.v1",subjects:SUBJECTS,exact_subject_count:6,distinct_identity_anchor_required:true,beliefs_must_remain_identical:false,disagreement_is_not_a_lineage_failure:true,capability_promotion_automatic:false,production_database_access:false,production_writes:false});
