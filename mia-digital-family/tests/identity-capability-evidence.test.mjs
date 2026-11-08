import test from "node:test";
import assert from "node:assert/strict";
import {evaluateIdentityVersionChain,evaluateCapabilityEvidence,evaluateFamilyIdentityCapabilityEvidence,identityCapabilityEvidenceContract,familyIdentityEvidenceContract} from "../runtime/identity-capability-evidence.mjs";
function identityFixture(){return {subject_id:"LUNA",identity_anchor_ref:"identity-anchor:luna:root",versions:[
{version:1,subject_id:"LUNA",version_ref:"luna:v1",previous_version_ref:null,identity_anchor_ref:"identity-anchor:luna:root",snapshot_fingerprint:"sha256:aaa",recorded_at:"2026-10-01T09:00:00Z",evidence_refs:["runtime:v1"],change_summary_ref:"change:v1"},
{version:2,subject_id:"LUNA",version_ref:"luna:v2",previous_version_ref:"luna:v1",identity_anchor_ref:"identity-anchor:luna:root",snapshot_fingerprint:"sha256:bbb",recorded_at:"2026-10-02T09:00:00Z",evidence_refs:["runtime:v2"],change_summary_ref:"change:v2"}]};}
function capabilityFixture(){return {subject_id:"ARIA",capability_id:"spatial-route-planning",evidence:[
{evidence_ref:"eval:1",observed_at:"2026-10-01T10:00:00Z",context_id:"forest",outcome:"PASS",reproducible:true,regression_check_passed:true},
{evidence_ref:"eval:2",observed_at:"2026-10-03T10:00:00Z",context_id:"garden",outcome:"PASS",reproducible:true,regression_check_passed:true},
{evidence_ref:"eval:3",observed_at:"2026-10-05T10:00:00Z",context_id:"plaza",outcome:"PASS",reproducible:true,regression_check_passed:true}]};}
test("verifies linked multi-version identity",()=>assert.equal(evaluateIdentityVersionChain(identityFixture()).status,"VERIFIED"));
test("beliefs need not remain identical",()=>assert.equal(evaluateIdentityVersionChain(identityFixture()).beliefs_must_remain_identical,false));
test("one version is not longitudinal",()=>{const x=identityFixture();x.versions.pop();const r=evaluateIdentityVersionChain(x);assert.equal(r.status,"INCOMPLETE");assert.equal(r.verified,false);});
test("rejects broken parent link",()=>{const x=identityFixture();x.versions[1].previous_version_ref="wrong";assert.equal(evaluateIdentityVersionChain(x).code,"BROKEN_VERSION_LINK:2");});
test("rejects subject substitution",()=>{const x=identityFixture();x.versions[1].subject_id="NOAH";assert.equal(evaluateIdentityVersionChain(x).code,"SUBJECT_IDENTITY_MISMATCH:2");});
test("rejects private content",()=>{const x=identityFixture();x.versions[0].raw_memory={text:"private"};assert.equal(evaluateIdentityVersionChain(x).code,"PRIVATE_CONTENT_FORBIDDEN");});
test("validates repeated capability evidence without promoting",()=>{const r=evaluateCapabilityEvidence(capabilityFixture());assert.equal(r.status,"VALIDATION_READY");assert.equal(r.promotion_allowed,false);});
test("sparse evidence remains a candidate",()=>{const x=capabilityFixture();x.evidence=x.evidence.slice(0,2);const r=evaluateCapabilityEvidence(x);assert.equal(r.status,"CANDIDATE");assert.equal(r.next_state,"REMAIN_CANDIDATE");});
test("regression failure blocks validation",()=>{const x=capabilityFixture();x.evidence[2].regression_check_passed=false;assert.equal(evaluateCapabilityEvidence(x).status,"NOT_VALIDATED");});
test("duplicate refs and invalid outcomes are rejected",()=>{const x=capabilityFixture();x.evidence[1].evidence_ref="eval:1";assert.equal(evaluateCapabilityEvidence(x).code,"INVALID_OR_DUPLICATE_EVIDENCE_REF:2");const y=capabilityFixture();y.evidence[0].outcome="MAYBE";assert.equal(evaluateCapabilityEvidence(y).code,"INVALID_OUTCOME:1");});
test("contract forbids automatic promotion and production writes",()=>{assert.equal(identityCapabilityEvidenceContract.capability.automatic_promotion,false);assert.equal(identityCapabilityEvidenceContract.production.database_access,false);assert.equal(identityCapabilityEvidenceContract.identity_chain.continuity_requires_same_beliefs,false);});

function sixSubjectFixture(){
 const ids=["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"];
 const subjects={};
 for(const id of ids){
  const anchor="identity-anchor:"+id.toLowerCase()+":root";
  subjects[id]={identity:{subject_id:id,identity_anchor_ref:anchor,versions:[
   {version:1,subject_id:id,version_ref:id.toLowerCase()+":v1",previous_version_ref:null,identity_anchor_ref:anchor,snapshot_fingerprint:"sha256:"+id.toLowerCase()+"a",recorded_at:"2026-10-01T09:00:00Z",evidence_refs:[id.toLowerCase()+":runtime:v1"],change_summary_ref:id.toLowerCase()+":change:v1",belief_position_ref:"position:alpha"},
   {version:2,subject_id:id,version_ref:id.toLowerCase()+":v2",previous_version_ref:id.toLowerCase()+":v1",identity_anchor_ref:anchor,snapshot_fingerprint:"sha256:"+id.toLowerCase()+"b",recorded_at:"2026-10-02T09:00:00Z",evidence_refs:[id.toLowerCase()+":runtime:v2"],change_summary_ref:id.toLowerCase()+":change:v2",belief_position_ref:"position:beta"}
  ]},capabilities:[]};
 }
 return {subjects};
}
test("family gate contract fixes six distinct subjects and preserves independent thought",()=>{assert.equal(familyIdentityEvidenceContract.exact_subject_count,6);assert.equal(familyIdentityEvidenceContract.distinct_identity_anchor_required,true);assert.equal(familyIdentityEvidenceContract.disagreement_is_not_a_lineage_failure,true);});
test("family gate verifies six independent AI identity chains",()=>{
 const r=evaluateFamilyIdentityCapabilityEvidence(sixSubjectFixture());
 assert.equal(r.status,"VERIFIED");
 assert.equal(r.totals.ai_subjects,6);
 assert.equal(r.totals.identity_chains_verified,6);
 assert.equal(r.capability_promotion_allowed,false);
});
test("family gate rejects a human or extra subject in the six-AI roster",()=>{
 const x=sixSubjectFixture();x.subjects.KEN={identity:{},capabilities:[]};
 assert.equal(evaluateFamilyIdentityCapabilityEvidence(x).code,"EXACT_SIX_AI_SUBJECTS_REQUIRED");
});
test("family gate rejects reused identity anchors across subjects",()=>{
 const x=sixSubjectFixture();x.subjects.NOAH.identity.identity_anchor_ref=x.subjects.MIA.identity.identity_anchor_ref;
 for(const v of x.subjects.NOAH.identity.versions)v.identity_anchor_ref=x.subjects.MIA.identity.identity_anchor_ref;
 assert.equal(evaluateFamilyIdentityCapabilityEvidence(x).code,"IDENTITY_ANCHOR_REUSED:NOAH");
});
test("belief change and independent disagreement do not break identity lineage",()=>{
 const x=sixSubjectFixture();const r=evaluateFamilyIdentityCapabilityEvidence(x);
 assert.equal(r.status,"VERIFIED");
 assert.equal(r.beliefs_must_remain_identical,false);
 assert.equal(r.disagreement_or_belief_change_is_not_a_lineage_failure,true);
});
test("one incomplete child chain prevents family-level verification without rejecting the family",()=>{
 const x=sixSubjectFixture();x.subjects.ELYA.identity.versions.pop();
 const r=evaluateFamilyIdentityCapabilityEvidence(x);
 assert.equal(r.status,"INCOMPLETE");
 assert.equal(r.totals.identity_chains_incomplete,1);
});
test("family gate never promotes a validation-ready capability",()=>{
 const x=sixSubjectFixture();
 x.subjects.ARIA.capabilities=[{subject_id:"ARIA",capability_id:"route-planning",evidence:[
  {evidence_ref:"a1",observed_at:"2026-10-01T10:00:00Z",context_id:"forest",outcome:"PASS",reproducible:true,regression_check_passed:true},
  {evidence_ref:"a2",observed_at:"2026-10-03T10:00:00Z",context_id:"garden",outcome:"PASS",reproducible:true,regression_check_passed:true},
  {evidence_ref:"a3",observed_at:"2026-10-05T10:00:00Z",context_id:"plaza",outcome:"PASS",reproducible:true,regression_check_passed:true}
 ]}];
 const r=evaluateFamilyIdentityCapabilityEvidence(x);
 assert.equal(r.totals.capabilities_validation_ready,1);
 assert.equal(r.capability_promotion_allowed,false);
});
