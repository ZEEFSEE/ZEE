import test from "node:test";
import assert from "node:assert/strict";
import {runDeliberation,validateContribution,deliberationContract} from "../runtime/seven-brain-deliberation-simulator.mjs";

const subjects=["MIA","LUNA","ARIA","ELYA","KAEL","NOAH","KEN"];
const contribution=(subject_id,position_key="P1",extra={})=>({
 claim_id:"claim-"+subject_id,issue_id:"issue-goal",position_key,
 subject_id,participant_kind:subject_id==="KEN"?"HUMAN_PARTICIPANT":"AI_AGENT",
 statement:"Synthetic perspective for controlled test only.",
 scope:"FAMILY",evidence_refs:["source-A","source-B"],
 evidence_status:"OBSERVED",confidence:0.8,
 uncertainty:"Synthetic fixture; not a statement about a real agent.",
 ...extra
});
const run=(contributions)=>runDeliberation({contributions},{family_source_verified:true});

test("all seven independent participants can contribute without identity fusion",()=>{
 const result=run(subjects.map(s=>contribution(s)));
 assert.equal(result.accepted_count,7);
 assert.deepEqual(result.participants,subjects);
 assert.equal(result.governance.dissent_preserved,true);
});

test("four independent evidence-backed participants form only a consensus candidate",()=>{
 const result=run(subjects.slice(0,4).map(s=>contribution(s)));
 assert.equal(result.issues[0].status,"CONSENSUS_CANDIDATE");
 assert.equal(result.issues[0].options[0].supporting_subjects.length,4);
 assert.equal(result.issues[0].forced_resolution,false);
});

test("minority disagreement is preserved rather than overwritten",()=>{
 const result=run([
  contribution("MIA","P1"),contribution("LUNA","P1"),contribution("ARIA","P1"),
  contribution("ELYA","P1"),contribution("KAEL","P2"),contribution("NOAH","P2"),
  contribution("KEN","P2")
 ]);
 assert.equal(result.issues[0].status,"UNRESOLVED_DISSENT");
 assert.equal(result.issues[0].dissent_preserved,true);
 assert.deepEqual(result.issues[0].options.map(x=>x.supporting_subjects.length),[4,3]);
});

test("model estimates and unknowns cannot create consensus",()=>{
 const result=run(subjects.slice(0,5).map(s=>contribution(s,"P1",{evidence_status:"MODEL_ESTIMATE"})));
 assert.equal(result.issues[0].status,"INSUFFICIENT_QUORUM");
 assert.equal(result.issues[0].options[0].status,"SUPPORTED_VIEW");
});

test("private memory is rejected even when the recipient is the deliberation group",()=>{
 const c=contribution("MIA","P1",{scope:"PRIVATE"});
 assert.equal(validateContribution(c,{family_source_verified:true}).code,"PRIVATE_OR_UNSHARED_SCOPE");
});

test("unverified family evidence fails closed",()=>{
 assert.equal(validateContribution(contribution("MIA"),{}).code,"FAMILY_SOURCE_NOT_VERIFIED");
});

test("Ken must remain a human participant",()=>{
 const wrong=contribution("KEN","P1",{participant_kind:"AI_AGENT"});
 assert.equal(validateContribution(wrong,{family_source_verified:true}).code,"KEN_MUST_REMAIN_HUMAN");
 assert.equal(deliberationContract.participants.KEN,"HUMAN_PARTICIPANT");
});

test("duplicate contribution from one subject is rejected",()=>{
 const result=run([contribution("MIA"),contribution("MIA","P2")]);
 assert.equal(result.accepted_count,1);
 assert.equal(result.rejected[0].reason,"DUPLICATE_SUBJECT_CONTRIBUTION");
});

test("insufficient evidence references prevent consensus",()=>{
 const result=run(subjects.slice(0,6).map(s=>contribution(s,"P1",{evidence_refs:["single-source"]})));
 assert.equal(result.issues[0].status,"INSUFFICIENT_QUORUM");
});

test("simulation never writes, calls production, or reads private memory",()=>{
 const result=run(subjects.map(s=>contribution(s)));
 assert.equal(result.mode,"SYNTHETIC_DETERMINISTIC_SIMULATION");
 assert.equal(result.governance.production_runtime_called,false);
 assert.equal(result.governance.model_calls_performed,false);
 assert.equal(result.governance.database_writes_performed,false);
 assert.equal(result.governance.private_memory_read,false);
 assert.equal(result.governance.autonomous_actions_enabled,false);
});
