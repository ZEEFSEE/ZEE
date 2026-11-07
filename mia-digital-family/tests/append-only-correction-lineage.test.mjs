import test from "node:test";
import assert from "node:assert/strict";
import {evaluateCorrectionProposal,createCorrectionRollback,evaluateCorrectionBatch} from "../runtime/append-only-correction-lineage.mjs";

const proposal={
 correction_id:"corr-001",subject_id:"LUNA",scope:"CHILD_PRIVATE",owner_id:"ZHI-G1-D01-LUNA",
 original_source_event_id:"raw-event-001",prior_conclusion_id:"conclusion-v1",new_conclusion_id:"conclusion-v2",
 target_kind:"DERIVED_CONCLUSION",reason_ref:"review-001",evidence_refs:["evidence-a","evidence-b"],
 evidence_status:"USER_CONFIRMED",confidence:0.92,uncertainty:"The corrected interpretation remains bounded by the cited evidence."
};

test("correction appends a new conclusion version while preserving original experience",()=>{
 const result=evaluateCorrectionProposal(proposal);
 assert.equal(result.accepted,true);
 assert.equal(result.prior_conclusion_superseded,true);
 assert.equal(result.raw_source_modified,false);
 assert.equal(result.prior_conclusion_deleted,false);
 assert.equal(result.original_source_event_id,"raw-event-001");
});

test("raw experience cannot itself be corrected or overwritten",()=>{
 assert.equal(evaluateCorrectionProposal({...proposal,target_kind:"RAW_EXPERIENCE"}).code,"RAW_EXPERIENCE_IS_IMMUTABLE");
});

test("private correction cannot cross subject ownership",()=>{
 assert.equal(evaluateCorrectionProposal({...proposal,subject_id:"ARIA"}).code,"SCOPE_OWNER_MISMATCH");
});

test("family correction requires verified family source and canonical owner",()=>{
 const family={...proposal,scope:"FAMILY",owner_id:"ZHI-G1"};
 assert.equal(evaluateCorrectionProposal(family).code,"FAMILY_SOURCE_NOT_VERIFIED");
 assert.equal(evaluateCorrectionProposal(family,{family_source_verified:true}).accepted,true);
});

test("correction must create a distinct conclusion version and cite evidence",()=>{
 assert.equal(evaluateCorrectionProposal({...proposal,new_conclusion_id:"conclusion-v1"}).code,"CONCLUSION_VERSION_MUST_CHANGE");
 assert.equal(evaluateCorrectionProposal({...proposal,evidence_refs:[]}).code,"CORRECTION_EVIDENCE_REQUIRED");
});

test("raw private content and transcripts are never accepted into correction payloads",()=>{
 assert.equal(evaluateCorrectionProposal({...proposal,private_memory_payload:"secret"}).code,"RAW_PRIVATE_CONTENT_FORBIDDEN");
 assert.equal(evaluateCorrectionProposal({...proposal,transcript:"private conversation"}).code,"RAW_PRIVATE_CONTENT_FORBIDDEN");
});

test("rollback appends a new record and preserves both original and correction history",()=>{
 const correction=evaluateCorrectionProposal(proposal);
 const rollback=createCorrectionRollback(correction,{rollback_id:"rollback-001",reason_ref:"authorized-review",authorized:true});
 assert.equal(rollback.state,"ROLLBACK_APPENDED");
 assert.equal(rollback.restore_conclusion_id,"conclusion-v1");
 assert.equal(rollback.correction_record_preserved,true);
 assert.equal(rollback.raw_source_modified,false);
 assert.equal(rollback.history_erased,false);
});

test("rollback without explicit authorization is denied",()=>{
 const correction=evaluateCorrectionProposal(proposal);
 assert.equal(createCorrectionRollback(correction,{rollback_id:"rollback-001",reason_ref:"review",authorized:false}).code,"AUTHORIZED_ROLLBACK_REQUIRED");
});

test("batch remains a deterministic metadata-only validation",()=>{
 const result=evaluateCorrectionBatch([proposal,{...proposal,correction_id:"corr-002",new_conclusion_id:"conclusion-v3"}]);
 assert.deepEqual(result.summary,{total:2,ready:2,rejected:0});
 assert.equal(result.governance.production_database_written,false);
 assert.equal(result.governance.automatic_application,false);
});
