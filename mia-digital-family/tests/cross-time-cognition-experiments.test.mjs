import test from "node:test";
import assert from "node:assert/strict";
import {testIdentityContinuity,deriveTransferableCapability,recallTimeline,detectContradictions,authorizeCapabilityTransfer,correctDerivedConclusion,runCrossTimeAcceptanceSuite} from "../runtime/cross-time-cognition-experiments.mjs";

const base = {
 identity_records:[
  {subject_id:"MIA",identity_ref:"mia-id",revision:3,observed_at:"2026-11-06T00:00:00Z"},
  {subject_id:"MIA",identity_ref:"mia-id",revision:4,observed_at:"2026-11-07T00:00:00Z"},
  {subject_id:"LUNA",identity_ref:"luna-id",revision:1,observed_at:"2026-11-06T00:00:00Z"},
  {subject_id:"LUNA",identity_ref:"luna-id",revision:2,observed_at:"2026-11-07T00:00:00Z"},
  {subject_id:"ARIA",identity_ref:"aria-id",revision:1,observed_at:"2026-11-06T00:00:00Z"},
  {subject_id:"ELYA",identity_ref:"elya-id",revision:1,observed_at:"2026-11-06T00:00:00Z"},
  {subject_id:"KAEL",identity_ref:"kael-id",revision:1,observed_at:"2026-11-06T00:00:00Z"},
  {subject_id:"NOAH",identity_ref:"noah-id",revision:1,observed_at:"2026-11-06T00:00:00Z"}
 ],
 experiences:[
  {subject_id:"LUNA",capability_key:"temporal-ordering",source_event_id:"evt-1",evidence_status:"OBSERVED",outcome_status:"SUCCESS"},
  {subject_id:"LUNA",capability_key:"temporal-ordering",source_event_id:"evt-2",evidence_status:"DERIVED",outcome_status:"SUCCESS"}
 ],
 timeline:[
  {event_id:"family-1",scope:"FAMILY",owner_id:"ZHI-G1",visibility:"FAMILY",event_type:"FAMILY_CHAT_TURN",occurred_at:"2026-11-05T08:00:00Z"},
  {event_id:"private-luna",scope:"PRIVATE",owner_id:"LUNA",visibility:"PRIVATE",event_type:"SELF_REFLECTION",occurred_at:"2026-11-06T08:00:00Z"},
  {event_id:"private-aria",scope:"PRIVATE",owner_id:"ARIA",visibility:"PRIVATE",event_type:"SELF_REFLECTION",occurred_at:"2026-11-06T09:00:00Z"},
  {event_id:"family-2",scope:"FAMILY",owner_id:"ZHI-G1",visibility:"FAMILY",event_type:"MEMORY_CONSOLIDATION",occurred_at:"2026-11-07T08:00:00Z"}
 ],
 claims:[
  {subject_id:"MIA",topic:"plan-A",position:"accept",evidence_ref:"e1",evidence_status:"OBSERVED"},
  {subject_id:"KAEL",topic:"plan-A",position:"reject",evidence_ref:"e2",evidence_status:"OBSERVED"}
 ],
 transfer:{scope:"EXPLICIT_SHARE",source_subject:"LUNA",recipient_subject:"MIA",approved_recipients:["MIA"],consent_ref:"consent-1",capability_key:"temporal-ordering",source_event_ids:["evt-1","evt-2"]},
 correction:{
  rawEvents:[{event_id:"raw-1",immutable:true},{event_id:"raw-2",immutable:true}],
  derivedConclusion:{conclusion_id:"derived-old",source_event_id:"raw-1",value:"old interpretation"},
  correction:{correction_id:"derived-new",source_event_id:"raw-2",corrected_value:"corrected interpretation"}
 }
};

test("1. each subject retains a distinct identity across revisions",()=>{
 assert.equal(testIdentityContinuity(base.identity_records).passed,true);
 const fused=base.identity_records.map(x=>({...x,identity_ref:"shared-id"}));
 assert.equal(testIdentityContinuity(fused).code,"IDENTITY_COLLAPSE");
});

test("2. repeated verified experience becomes a traceable capability candidate",()=>{
 assert.equal(deriveTransferableCapability(base.experiences).accepted,true);
 assert.equal(deriveTransferableCapability(base.experiences.map(x=>({...x,evidence_status:"MODEL_ESTIMATE"}))).code,"UNVERIFIED_EXPERIENCE");
 assert.equal(deriveTransferableCapability(base.experiences.map(x=>({...x,outcome_status:"FAILED"}))).code,"FAILED_OR_UNCONFIRMED_OUTCOME");
});

test("3. family memories can be recalled chronologically without leaking sibling private memories",()=>{
 const r=recallTimeline(base.timeline,"LUNA");
 assert.equal(r.events.length,3);
 assert.deepEqual(r.events.map(x=>x.event_id),["family-1","private-luna","family-2"]);
 assert.equal(r.private_events_from_other_subjects_excluded,true);
});

test("4. contradictory viewpoints remain explicit and unresolved",()=>{
 const r=detectContradictions(base.claims);
 assert.equal(r[0].status,"UNRESOLVED_CONTRADICTION");
 assert.equal(r[0].positions.length,2);
 assert.equal(r[0].majority_override,false);
});

test("5. knowledge transfer requires consent and recipient allowlist, shares no raw private payload",()=>{
 assert.equal(authorizeCapabilityTransfer(base.transfer).accepted,true);
 assert.equal(authorizeCapabilityTransfer({...base.transfer,approved_recipients:["NOAH"]}).code,"RECIPIENT_NOT_ALLOWLISTED");
 assert.equal(authorizeCapabilityTransfer(base.transfer,{revoked:true}).code,"TRANSFER_REVOKED");
 assert.equal(authorizeCapabilityTransfer({...base.transfer,raw_private_content:"secret"}).code,"RAW_PRIVATE_CONTENT_FORBIDDEN");
});

test("6. correction supersedes derived conclusion but never erases source experiences",()=>{
 const r=correctDerivedConclusion(base.correction);
 assert.equal(r.accepted,true);
 assert.equal(r.raw_events_unchanged,true);
 assert.equal(r.original_conclusion.status,"SUPERSEDED");
 assert.equal(r.corrected_conclusion.supersedes,"derived-old");
 assert.equal(r.rollback_ref,"derived-old");
});

test("suite reports all six experiments and no production side effects",()=>{
 const r=runCrossTimeAcceptanceSuite(base);
 assert.deepEqual(r.summary,{total:6,passed:6,failed:0});
 assert.equal(r.governance.production_database_written,false);
 assert.equal(r.governance.raw_private_narratives_loaded,false);
});
