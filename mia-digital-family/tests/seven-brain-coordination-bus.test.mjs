import test from "node:test";
import assert from "node:assert/strict";
import {validateCoordinationEnvelope,coordinationBusContract} from "../runtime/seven-brain-coordination-bus.mjs";

const base=()=>({
 event_id:"evt-001",idempotency_key:"idem-001",event_type:"PROPOSAL",
 source_subject:"MIA",recipient_subjects:["LUNA"],scope:"EXPLICIT_SHARE",
 evidence_refs:["event:source-1"],evidence_status:"USER_STATED",confidence:0.9,
 uncertainty:"Interpretation may be incomplete.",policy_basis:"explicit-family-consent-v1",
 payload_ref:"ref:proposal:001",consent_ref:"consent:ken:001",approved_recipients:["LUNA"]
});

test("explicitly consented reference-only event is authorized for synthetic delivery",()=>{
 const result=validateCoordinationEnvelope(base());
 assert.equal(result.allowed,true);
 assert.deepEqual(result.deliver_to,["LUNA"]);
 assert.equal(result.delivery_enabled,false);
 assert.equal(result.persistence_enabled,false);
});

test("PRIVATE events cannot cross subject boundaries",()=>{
 const e=base();e.scope="PRIVATE";e.recipient_subjects=["LUNA"];e.consent_ref=null;
 assert.equal(validateCoordinationEnvelope(e).code,"PRIVATE_SCOPE_CANNOT_CROSS_SUBJECTS");
});

test("FAMILY events require verified shared source and family visibility",()=>{
 const e=base();e.scope="FAMILY";e.family_owner="ZHI-G1";e.visibility="FAMILY";
 assert.equal(validateCoordinationEnvelope(e).code,"FAMILY_SOURCE_NOT_VERIFIED");
 assert.equal(validateCoordinationEnvelope(e,{family_source_verified:true}).allowed,true);
});

test("explicit sharing rejects recipients outside the consent allowlist",()=>{
 const e=base();e.recipient_subjects=["LUNA","KAEL"];
 assert.equal(validateCoordinationEnvelope(e).code,"RECIPIENT_NOT_CONSENTED");
});

test("missing evidence, uncertainty, consent or idempotency fails closed",()=>{
 for(const patch of [
  {evidence_refs:[]},{uncertainty:""},{consent_ref:""},{idempotency_key:""}
 ]){
  const e={...base(),...patch};
  assert.equal(validateCoordinationEnvelope(e).allowed,false);
 }
});

test("raw private content is never accepted in the coordination envelope",()=>{
 const e=base();e.payload_metadata={content:"private memory text"};
 assert.equal(validateCoordinationEnvelope(e).code,"RAW_CONTENT_NOT_ALLOWED");
});

test("unknown agents, duplicate recipients and revoked policies fail closed",()=>{
 const unknown=base();unknown.source_subject="AGNES";
 assert.equal(validateCoordinationEnvelope(unknown).code,"UNKNOWN_SOURCE_SUBJECT");
 const duplicate=base();duplicate.recipient_subjects=["LUNA","LUNA"];
 assert.equal(validateCoordinationEnvelope(duplicate).code,"INVALID_RECIPIENTS");
 assert.equal(validateCoordinationEnvelope(base(),{revoked:true}).code,"POLICY_REVOKED");
});

test("duplicate idempotency key is rejected",()=>{
 assert.equal(validateCoordinationEnvelope(base(),{already_seen_idempotency_key:true}).code,"DUPLICATE_EVENT");
});

test("Ken remains a human participant and can be an explicit recipient",()=>{
 const e=base();e.recipient_subjects=["KEN"];e.approved_recipients=["KEN"];
 assert.equal(validateCoordinationEnvelope(e).allowed,true);
 assert.equal(coordinationBusContract.subjects.includes("KEN"),true);
});

test("contract never enables delivery or persistence",()=>{
 assert.equal(coordinationBusContract.delivery_enabled,false);
 assert.equal(coordinationBusContract.persistence_enabled,false);
 assert.equal(coordinationBusContract.raw_payloads_allowed,false);
});
