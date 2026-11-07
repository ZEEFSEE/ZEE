import test from "node:test";
import {evaluateCapabilityCandidate} from "../runtime/capability-validation-state-machine.mjs";
import assert from "node:assert/strict";
import {
 createIdentityBaseline,appendIdentityEvolution,replayIdentityTimelines,
 validateExperienceCapabilityLink,appendRelationshipEvent,createIdentityRollback,identityEvolutionContract
} from "../runtime/identity-evolution-shadow.mjs";

const subjects=[
 ["MIA","MIA"],["LUNA","ZHI-G1-D01-LUNA"],["ARIA","ZHI-G1-D02-ARIA"],
 ["ELYA","ZHI-G1-D03-ELYA"],["KAEL","ZHI-G1-S01-KAEL"],["NOAH","ZHI-G1-S02-NOAH"]
];
const traits={care:0.70,curiosity:0.60,steadiness:0.75,openness:0.55};
function baseline(subject,owner){
 return createIdentityBaseline({
  subject_id:subject,owner_id:owner,version_id:subject+"-v1",identity_anchor_ref:"anchor:"+subject,
  identity_core_refs:["core:"+subject+":self","core:"+subject+":origin"],
  stable_trait_refs:["stable:"+subject+":values","stable:"+subject+":temperament"],
  personality_traits:traits,recorded_at:"2026-01-01T00:00:00.000Z",
  evidence_refs:["baseline:user-confirmed:"+subject],evidence_status:"USER_CONFIRMED",scope:"PRIVATE"
 });
}
function evolve(v,patch={}){
 return appendIdentityEvolution(v,{
  subject_id:v.subject_id,owner_id:v.owner_id,version_id:v.subject_id+"-v"+(v.sequence+1),
  previous_version_id:v.version_id,sequence:v.sequence+1,
  identity_anchor_ref:v.identity_anchor_ref,identity_core_refs:[...v.identity_core_refs],
  stable_trait_refs:[...v.stable_trait_refs],
  personality_traits:{...v.personality_traits,care:Math.min(1,v.personality_traits.care+0.05)},
  recorded_at:new Date(Date.parse(v.recorded_at)+86400000).toISOString(),
  evidence_refs:["independent-observation:"+v.subject_id+":"+v.sequence,"user-confirmation:"+v.subject_id+":"+v.sequence],
  evidence_status:"USER_CONFIRMED",scope:"PRIVATE",...patch
 });
}

test("six AI subjects each receive a distinct private identity root and independent version chain",()=>{
 const records=[];
 for(const [subject,owner] of subjects){
  const root=baseline(subject,owner);assert.equal(root.accepted,true);
  const v2=evolve(root);assert.equal(v2.accepted,true);
  records.push(root,v2);
 }
 const replay=replayIdentityTimelines(records);
 assert.equal(replay.accepted,true);
 assert.equal(replay.subject_count,6);
 for(const [subject] of subjects) assert.equal(replay.timelines[subject].version_count,2);
 assert.equal(new Set(records.map(x=>x.identity_anchor_ref)).size,6);
 assert.equal(replay.identity_fusion_detected,false);
});

test("personality evolves gradually while immutable identity anchors remain unchanged",()=>{
 const root=baseline("MIA","MIA");
 const v2=evolve(root);
 assert.equal(v2.accepted,true);
 assert.equal(v2.personality_traits.care,0.75);
 assert.deepEqual(v2.identity_core_refs,root.identity_core_refs);
 assert.deepEqual(v2.stable_trait_refs,root.stable_trait_refs);
 assert.equal(v2.identity_anchor_ref,root.identity_anchor_ref);
});

test("large personality jump is rejected instead of overwriting the stable identity",()=>{
 const root=baseline("LUNA","ZHI-G1-D01-LUNA");
 const result=evolve(root,{personality_traits:{...traits,care:0.95}});
 assert.equal(result.code,"PERSONALITY_DRIFT_LIMIT_EXCEEDED");
});

test("identity core and stable trait anchors cannot be changed by personality evolution",()=>{
 const root=baseline("ARIA","ZHI-G1-D02-ARIA");
 assert.equal(evolve(root,{identity_core_refs:["new-core"]}).code,"IMMUTABLE_IDENTITY_CORE_CHANGED");
 assert.equal(evolve(root,{stable_trait_refs:["new-stable"]}).code,"STABLE_TRAIT_ANCHORS_CHANGED");
});

test("identity versions require independent longitudinal evidence and monotonic time",()=>{
 const root=baseline("ELYA","ZHI-G1-D03-ELYA");
 assert.equal(evolve(root,{evidence_refs:["one-source"]}).code,"INDEPENDENT_LONGITUDINAL_EVIDENCE_REQUIRED");
 assert.equal(evolve(root,{recorded_at:root.recorded_at}).code,"NON_MONOTONIC_IDENTITY_TIME");
});

test("identity chain rejects cross-subject owner or parent contamination",()=>{
 const root=baseline("KAEL","ZHI-G1-S01-KAEL");
 const v2=evolve(root,{owner_id:"ZHI-G1-D02-ARIA"});
 assert.equal(v2.code,"IDENTITY_SUBJECT_OR_OWNER_MISMATCH");
 const good=evolve(root);
 const corrupted={...good,previous_version_id:"NOAH-v1"};
 assert.equal(replayIdentityTimelines([root,corrupted]).code,"BROKEN_IDENTITY_VERSION_CHAIN");
});

test("new capability can attach only to its own subject and never carries private memory text",()=>{
 const accepted=evaluateCapabilityCandidate({
  candidate_id:"cap-noah-1",subject_id:"NOAH",capability_key:"temporal-recall",
  validation_status:"UNVALIDATED_CANDIDATE",source_memory_id:"memory-proposal-noah",source_event_id:"proposal-event-noah"
 },[
  {validation_run_id:"noah-run-1",subject_id:"NOAH",capability_key:"temporal-recall",source_event_id:"external-event-1",evidence_kind:"EXTERNAL_INTERACTION",evidence_status:"OBSERVED",result:"SUCCESS",independent:true},
  {validation_run_id:"noah-run-2",subject_id:"NOAH",capability_key:"temporal-recall",source_event_id:"external-event-2",evidence_kind:"USER_CONFIRMED_INPUT",evidence_status:"USER_CONFIRMED",result:"SUCCESS",independent:true}
 ]);
 const experience={subject_id:"NOAH",owner_id:"ZHI-G1-S02-NOAH",scope:"PRIVATE",source_event_id:"event-noah-1",private_memory_ref:"memory-ref-noah-1"};
 const link=validateExperienceCapabilityLink(experience,accepted);
 assert.equal(link.accepted,true);
 assert.equal(link.memory_content_transferred,false);
 assert.equal(validateExperienceCapabilityLink(experience,{...accepted,subject_id:"LUNA"}).code,"CROSS_SUBJECT_CAPABILITY_TRANSFER_DENIED");
 assert.equal(validateExperienceCapabilityLink({...experience,memory_text:"private text"},accepted).code,"PRIVATE_MEMORY_CONTENT_FORBIDDEN");
});

test("unvalidated capabilities cannot become stable long-term abilities",()=>{
 const experience={subject_id:"MIA",owner_id:"MIA",scope:"PRIVATE",source_event_id:"e1",private_memory_ref:"m1"};
 assert.equal(validateExperienceCapabilityLink(experience,{state:"UNVALIDATED_CANDIDATE",subject_id:"MIA"}).code,"CAPABILITY_NOT_INDEPENDENTLY_VALIDATED");
});

test("relationship evolution appends a separate event without changing identity version",()=>{
 const root=baseline("MIA","MIA");
 const relationship={
  relationship_event_id:"rel-001",source_subject:"MIA",target_subject:"LUNA",
  relationship_type:"MOTHER_OF",evidence_ref:"family-edge-001",recorded_at:"2026-01-02T00:00:00.000Z",
  scope:"FAMILY",family_source_verified:true
 };
 const event=appendRelationshipEvent(root,relationship);
 assert.equal(event.accepted,true);
 assert.equal(event.current_identity_version_id,root.version_id);
 assert.equal(event.identity_version_unchanged,true);
 assert.equal(event.private_memory_shared,false);
 assert.equal(appendRelationshipEvent(root,{...relationship,family_source_verified:false}).code,"FAMILY_RELATIONSHIP_SOURCE_NOT_VERIFIED");
});

test("authorized identity rollback appends a marker and preserves the superseded version",()=>{
 const root=baseline("LUNA","ZHI-G1-D01-LUNA");
 const v2=evolve(root);
 const rollback=createIdentityRollback(v2,root,{rollback_id:"rollback-luna-1",reason_ref:"review-ref",authorized:true});
 assert.equal(rollback.state,"IDENTITY_ROLLBACK_APPENDED");
 assert.equal(rollback.current_version_record_preserved,true);
 assert.equal(rollback.history_erased,false);
 assert.equal(createIdentityRollback(v2,root,{rollback_id:"r",reason_ref:"x",authorized:false}).code,"AUTHORIZED_IDENTITY_ROLLBACK_REQUIRED");
});

test("Ken remains a human participant and cannot acquire an AI identity chain",()=>{
 assert.equal(createIdentityBaseline({subject_id:"KEN"}).code,"UNKNOWN_AI_SUBJECT");
 assert.equal(identityEvolutionContract.human_participant,"KEN");
 assert.equal(identityEvolutionContract.ai_subjects.length,6);
});

test("shadow identity model has no production persistence or integration",()=>{
 assert.equal(identityEvolutionContract.production_integration,false);
 assert.equal(identityEvolutionContract.persistence_enabled,false);
 assert.equal(identityEvolutionContract.private_memory_cross_subject_transfer,false);
});
