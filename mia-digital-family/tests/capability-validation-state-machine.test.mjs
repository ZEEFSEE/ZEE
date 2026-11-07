import test from "node:test";
import assert from "node:assert/strict";
import {evaluateCapabilityCandidate,revokeAcceptedCapability,evaluateCandidateBatch} from "../runtime/capability-validation-state-machine.mjs";

const candidate={
 candidate_id:"cand-1",subject_id:"LUNA",capability_key:"temporal-ordering",
 validation_status:"UNVALIDATED_CANDIDATE",source_memory_id:"memory-1",source_event_id:"proposal-source"
};
const goodRuns=[
 {validation_run_id:"run-1",subject_id:"LUNA",capability_key:"temporal-ordering",source_event_id:"external-1",evidence_kind:"EXTERNAL_INTERACTION",evidence_status:"OBSERVED",result:"SUCCESS",independent:true},
 {validation_run_id:"run-2",subject_id:"LUNA",capability_key:"temporal-ordering",source_event_id:"external-2",evidence_kind:"USER_CONFIRMED_INPUT",evidence_status:"USER_CONFIRMED",result:"SUCCESS",independent:true}
];

test("requires two independent external validation runs",()=>{
 const r=evaluateCapabilityCandidate(candidate,goodRuns);
 assert.equal(r.accepted,true);
 assert.equal(r.state,"ACCEPTED");
 assert.equal(r.validation_run_ids.length,2);
});

test("a scheduled reflection or model estimate cannot validate a capability",()=>{
 const r=evaluateCapabilityCandidate(candidate,goodRuns.map(x=>({...x,evidence_kind:"SCHEDULED_REFLECTION",evidence_status:"DERIVED"})));
 assert.equal(r.state,"REPEAT_TEST_REQUIRED");
});

test("a single successful independent run remains pending",()=>{
 assert.equal(evaluateCapabilityCandidate(candidate,goodRuns.slice(0,1)).state,"REPEAT_TEST_REQUIRED");
});

test("the proposal source cannot be reused as its own validation",()=>{
 const r=evaluateCapabilityCandidate(candidate,goodRuns.map(x=>({...x,source_event_id:"proposal-source"})));
 assert.equal(r.state,"REPEAT_TEST_REQUIRED");
});

test("same run or source duplicated does not satisfy independent repetition",()=>{
 const r=evaluateCapabilityCandidate(candidate,[goodRuns[0],{...goodRuns[1],validation_run_id:"run-1",source_event_id:"external-1"}]);
 assert.equal(r.state,"REPEAT_TEST_REQUIRED");
});

test("another subject's evidence cannot validate this candidate",()=>{
 const r=evaluateCapabilityCandidate(candidate,goodRuns.map(x=>({...x,subject_id:"ARIA"})));
 assert.equal(r.state,"REPEAT_TEST_REQUIRED");
});

test("raw private content is rejected from validation payloads",()=>{
 const r=evaluateCapabilityCandidate(candidate,goodRuns.map(x=>({...x,private_memory_payload:"private"})));
 assert.equal(r.state,"REPEAT_TEST_REQUIRED");
});

test("a qualifying failed validation forces human review and blocks promotion",()=>{
 const failed={...goodRuns[0],result:"FAILURE"};
 const r=evaluateCapabilityCandidate(candidate,[...goodRuns,failed]);
 assert.equal(r.accepted,false);
 assert.equal(r.state,"HUMAN_REVIEW_REQUIRED");
 assert.equal(r.code,"CONTRADICTORY_VALIDATION_EVIDENCE");
});

test("revoked candidates cannot be accepted",()=>{
 assert.equal(evaluateCapabilityCandidate(candidate,goodRuns,{revoked:true}).code,"CANDIDATE_REVOKED");
});

test("accepted capability can be revoked with authorization and rollback reference",()=>{
 const accepted=evaluateCapabilityCandidate(candidate,goodRuns);
 const revoked=revokeAcceptedCapability(accepted,{revocation_id:"rev-1",reason_ref:"policy-change",authorized:true});
 assert.equal(revoked.state,"REVOKED");
 assert.equal(revoked.rollback_ref,"cand-1");
 assert.equal(revoked.source_events_unchanged,true);
});

test("revocation without explicit authorization is denied",()=>{
 const accepted=evaluateCapabilityCandidate(candidate,goodRuns);
 assert.equal(revokeAcceptedCapability(accepted,{revocation_id:"rev-1",reason_ref:"policy-change",authorized:false}).code,"AUTHORIZED_REVOCATION_REQUIRED");
});

test("real-history-shaped unvalidated candidates remain pending",()=>{
 const candidates=Array.from({length:5},(_,i)=>({...candidate,candidate_id:"historical-"+i}));
 const batch=evaluateCandidateBatch(candidates,{});
 assert.deepEqual(batch.summary,{total:5,accepted:0,pending:5,review_required:0,rejected:0});
 assert.equal(batch.governance.automatic_promotion,false);
});
