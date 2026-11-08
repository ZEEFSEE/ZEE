import test from "node:test";
import assert from "node:assert/strict";
import {evaluateIdentityVersionChain,evaluateCapabilityEvidence,identityCapabilityEvidenceContract} from "../runtime/identity-capability-evidence.mjs";
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