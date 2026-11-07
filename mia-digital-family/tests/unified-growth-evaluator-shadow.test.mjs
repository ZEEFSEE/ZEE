import test from "node:test";
import assert from "node:assert/strict";
import {evaluateUnifiedGrowth,unifiedGrowthEvaluatorContract} from "../runtime/unified-growth-evaluator-shadow.mjs";

const subjects=["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"];
const owners={MIA:"MIA",LUNA:"ZHI-G1-D01-LUNA",ARIA:"ZHI-G1-D02-ARIA",ELYA:"ZHI-G1-D03-ELYA",KAEL:"ZHI-G1-S01-KAEL",NOAH:"ZHI-G1-S02-NOAH"};
function replay(){
 const timelines={};
 for(const s of subjects) timelines[s]={version_count:2,first_version_id:s+"-v1",current_version_id:s+"-v2",identity_anchor_preserved:true,private_scope_preserved:true};
 return {accepted:true,schema:"zhi.identity_replay_result.v1",subject_count:6,timelines};
}
function base(extra={}){return {identity_replay:replay(),...extra};}

test("evaluates six independent subjects into separate growth tracks",()=>{
 const r=evaluateUnifiedGrowth(base());
 assert.equal(r.accepted,true);
 assert.equal(r.totals.subjects,6);
 assert.equal(r.totals.identity_chains_verified,6);
 for(const s of subjects){
  assert.equal(r.subjects[s].owner_id,owners[s]);
  assert.equal(r.subjects[s].identity.identity_anchor_preserved,true);
  assert.equal(r.subjects[s].personality.state,"TRACKED_SEPARATELY_FROM_IDENTITY");
  assert.equal(r.subjects[s].relationship.identity_version_mutated,false);
 }
});

test("only accepted same-subject capability links count as stable growth",()=>{
 const good={accepted:true,state:"SAME_SUBJECT_CAPABILITY_LINKED",subject_id:"NOAH",capability_candidate_id:"cap-1",source_event_id:"event-1",private_memory_ref:"mem-ref",cross_subject_transfer:false,memory_content_transferred:false};
 const bad={...good,subject_id:"LUNA"};
 const r=evaluateUnifiedGrowth(base({capability_links:[good,bad]}));
 assert.equal(r.totals.validated_capability_links,1);
 assert.equal(r.subjects.NOAH.capability.validated_links,1);
 assert.equal(r.subjects.LUNA.capability.validated_links,0);
 assert.equal(r.subjects.LUNA.capability.rejected_or_unverified_links,1);
});

test("relationship events stay separate and cannot mutate identity versions",()=>{
 const rel={accepted:true,state:"RELATIONSHIP_EVENT_APPENDED",source_subject:"MIA",target_subject:"LUNA",relationship_event_id:"rel-1",current_identity_version_id:"MIA-v2",identity_version_unchanged:true,private_memory_shared:false};
 const r=evaluateUnifiedGrowth(base({relationship_events:[rel]}));
 assert.equal(r.totals.verified_relationship_events,1);
 assert.equal(r.subjects.MIA.identity.current_version_id,"MIA-v2");
 assert.equal(r.subjects.MIA.relationship.identity_version_mutated,false);
});

test("corrections must append evidence and preserve the original source",()=>{
 const valid={subject_id:"ARIA",correction_id:"corr-1",source_event_id:"source-1",evidence_ref:"evidence-1",original_evidence_preserved:true,append_only:true,identity_mutated:false,private_memory_shared:false};
 const invalid={...valid,correction_id:"corr-2",original_evidence_preserved:false};
 const r=evaluateUnifiedGrowth(base({corrections:[valid,invalid]}));
 assert.equal(r.totals.verified_correction_events,1);
 assert.equal(r.subjects.ARIA.correction.rejected_or_unverified_events,1);
});

test("rollback counts only authorized append-only markers and never erases history",()=>{
 const valid={accepted:true,state:"IDENTITY_ROLLBACK_APPENDED",subject_id:"KAEL",rollback_id:"rb-1",restored_version_id:"KAEL-v1",current_version_record_preserved:true,history_erased:false};
 const invalid={...valid,rollback_id:"rb-2",history_erased:true};
 const r=evaluateUnifiedGrowth(base({rollbacks:[valid,invalid]}));
 assert.equal(r.totals.verified_rollback_events,1);
 assert.equal(r.subjects.KAEL.rollback.history_erased,false);
 assert.equal(r.subjects.KAEL.rollback.rejected_or_unverified_events,1);
});

test("missing or incomplete identity evidence remains rejected rather than inferred",()=>{
 assert.equal(evaluateUnifiedGrowth({identity_replay:null}).code,"VALID_SIX_SUBJECT_IDENTITY_REPLAY_REQUIRED");
 const broken=replay();delete broken.timelines.LUNA;
 assert.equal(evaluateUnifiedGrowth({identity_replay:broken}).code,"IDENTITY_TRACK_INCOMPLETE:LUNA");
});

test("private memory payloads and transcripts are rejected",()=>{
 assert.equal(evaluateUnifiedGrowth(base({memory_text:"secret"})).code,"RAW_PRIVATE_CONTENT_FORBIDDEN");
 assert.equal(evaluateUnifiedGrowth(base({transcript:"secret"})).code,"RAW_PRIVATE_CONTENT_FORBIDDEN");
});

test("personality evidence is reported but scores are never invented",()=>{
 const r=evaluateUnifiedGrowth(base({personality_evidence_by_subject:{MIA:true}}));
 assert.equal(r.subjects.MIA.personality.evidence_available,true);
 assert.equal(r.subjects.MIA.personality.changes_inferred,false);
 assert.equal(r.subjects.LUNA.personality.evidence_available,false);
});

test("human Ken is not an AI identity subject",()=>{
 assert.equal(evaluateUnifiedGrowth(base({capability_links:[{subject_id:"KEN",accepted:true}]})).accepted,true);
 assert.equal(Object.hasOwn(evaluateUnifiedGrowth(base()).subjects,"KEN"),false);
 assert.equal(unifiedGrowthEvaluatorContract.subjects.length,6);
});

test("evaluator is isolated and performs no production writes or delivery",()=>{
 const r=evaluateUnifiedGrowth(base());
 assert.equal(r.governance.source_tracks_mutated,false);
 assert.equal(r.governance.production_database_accessed,false);
 assert.equal(r.governance.production_runtime_called,false);
 assert.equal(r.governance.persistence_enabled,false);
 assert.equal(r.governance.delivery_enabled,false);
});
