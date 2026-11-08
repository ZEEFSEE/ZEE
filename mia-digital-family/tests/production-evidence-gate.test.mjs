import test from "node:test";
import assert from "node:assert/strict";
import {evaluateProductionEvidence,productionEvidenceGateContract} from "../runtime/production-evidence-gate.mjs";

const children = {
  LUNA:{activity_events:168,eight_dimension_events:44,spatial_context_events:43,spatial_observed_events:43,identity_version_count:1,identity_chain_verified:false,validated_capability_links:0,family_chat_applicable:true,family_chat_messages_total:23,family_chat_messages_tagged:5,latest_runtime_status:"SUCCEEDED"},
  ARIA:{activity_events:154,eight_dimension_events:44,spatial_context_events:43,spatial_observed_events:43,identity_version_count:1,identity_chain_verified:false,validated_capability_links:0,family_chat_applicable:true,family_chat_messages_total:23,family_chat_messages_tagged:5,latest_runtime_status:"SUCCEEDED"},
  ELYA:{activity_events:169,eight_dimension_events:46,spatial_context_events:44,spatial_observed_events:44,identity_version_count:1,identity_chain_verified:false,validated_capability_links:0,family_chat_applicable:true,family_chat_messages_total:28,family_chat_messages_tagged:4,latest_runtime_status:"SUCCEEDED"},
  KAEL:{activity_events:151,eight_dimension_events:44,spatial_context_events:43,spatial_observed_events:43,identity_version_count:1,identity_chain_verified:false,validated_capability_links:0,family_chat_applicable:true,family_chat_messages_total:25,family_chat_messages_tagged:5,latest_runtime_status:"SUCCEEDED"},
  NOAH:{activity_events:156,eight_dimension_events:45,spatial_context_events:44,spatial_observed_events:44,identity_version_count:1,identity_chain_verified:false,validated_capability_links:0,family_chat_applicable:true,family_chat_messages_total:26,family_chat_messages_tagged:5,latest_runtime_status:"SUCCEEDED"}
};
function fixture(){return {
  schema:"zhi.production_runtime_evidence.v1",mode:"REDACTED_READ_ONLY_AGGREGATE",as_of_date:"2026-11-08",
  evidence_sources:["zhi_family.child_runtime_cycles","zhi_family.memory_events_v2","zhi_family.family_chat_messages","zhi_family.child_runtime_identities","public.mia_personality_state","zhi_family.child_learning_events"],
  learning_candidate_events_total:750,
  subjects:{MIA:{activity_events:91,eight_dimension_events:91,spatial_context_events:85,spatial_observed_events:85,identity_version_count:0,identity_chain_verified:false,validated_capability_links:0,family_chat_applicable:false,family_chat_messages_total:0,family_chat_messages_tagged:0,latest_runtime_status:"CHAT_TURN_RECORDED"},...structuredClone(children)}
};}

test("summarizes six-subject activity and dimension coverage without overclaiming",()=>{
 const r=evaluateProductionEvidence(fixture());assert.equal(r.accepted,true);
 assert.equal(r.totals.ai_subjects,6);assert.equal(r.totals.activity_observed_subjects,6);
 assert.equal(r.totals.eight_dimension_observed_subjects,6);assert.equal(r.totals.spatial_software_state_observed_subjects,6);
 assert.equal(r.totals.family_chat_state_covered_children,5);assert.equal(r.totals.identity_version_chains_verified,0);
 assert.equal(r.totals.subjects_with_validated_capability_links,0);assert.equal(r.totals.learning_candidate_events_observed,750);
});

test("keeps Ken outside the six AI runtime subjects",()=>{const x=fixture();x.subjects.KEN={activity_events:1};assert.equal(evaluateProductionEvidence(x).code,"EXACT_SIX_AI_SUBJECTS_REQUIRED");assert.equal(productionEvidenceGateContract.human_participant,"KEN");});
test("rejects raw transcripts and private memory payloads",()=>{const x=fixture();x.subjects.MIA.private_memory_payload={text:"not allowed"};assert.equal(evaluateProductionEvidence(x).code,"RAW_OR_PRIVATE_CONTENT_FORBIDDEN");});
test("rejects ungrounded identity-chain claims",()=>{const x=fixture();x.subjects.LUNA.identity_chain_verified=true;assert.equal(evaluateProductionEvidence(x).code,"IDENTITY_CHAIN_EVIDENCE_INCOMPLETE:LUNA");});
test("accepts identity chains only with multiple evidenced versions",()=>{const x=fixture();x.subjects.LUNA.identity_chain_verified=true;x.subjects.LUNA.identity_version_count=2;x.subjects.LUNA.identity_evidence_refs=["identity-version:luna:v1","identity-version:luna:v2"];const r=evaluateProductionEvidence(x);assert.equal(r.accepted,true);assert.equal(r.totals.identity_version_chains_verified,1);});
test("rejects malformed and contradictory aggregate counts",()=>{const a=fixture();a.subjects.LUNA.spatial_observed_events=-1;assert.equal(evaluateProductionEvidence(a).code,"INVALID_COUNT:LUNA:spatial_observed_events");const b=fixture();b.subjects.NOAH.family_chat_messages_tagged=100;assert.equal(evaluateProductionEvidence(b).code,"TAGGED_MESSAGES_EXCEED_TOTAL:NOAH");});
test("requires family chat metadata coverage when family replies exist",()=>{const x=fixture();x.subjects.ARIA.family_chat_messages_tagged=0;assert.equal(evaluateProductionEvidence(x).code,"FAMILY_CHAT_STATE_COVERAGE_MISSING:ARIA");});
test("keeps autonomy and consciousness explicitly unproven",()=>{const r=evaluateProductionEvidence(fixture());assert.equal(r.not_established.includes("autonomous_goal_formation"),true);assert.equal(r.not_established.includes("subjective_experience_or_consciousness"),true);assert.equal(r.governance.autonomous_actions_enabled,false);assert.equal(r.governance.production_database_accessed,false);});
test("rejects unsupported schema, date, and non-redacted mode",()=>{const a=fixture();a.schema="wrong";assert.equal(evaluateProductionEvidence(a).code,"UNSUPPORTED_EVIDENCE_SCHEMA");const b=fixture();b.as_of_date="yesterday";assert.equal(evaluateProductionEvidence(b).code,"VALID_AS_OF_DATE_REQUIRED");const c=fixture();c.mode="LIVE_PRODUCTION";assert.equal(evaluateProductionEvidence(c).code,"READ_ONLY_REDACTED_MODE_REQUIRED");});
