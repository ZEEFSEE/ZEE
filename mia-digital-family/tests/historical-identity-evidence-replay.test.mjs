import test from "node:test";
import assert from "node:assert/strict";
import {replayHistoricalIdentityEvidence,historicalIdentityReplayContract} from "../runtime/historical-identity-evidence-replay.mjs";

const owners={
 MIA:"MIA",LUNA:"ZHI-G1-D01-LUNA",ARIA:"ZHI-G1-D02-ARIA",
 ELYA:"ZHI-G1-D03-ELYA",KAEL:"ZHI-G1-S01-KAEL",NOAH:"ZHI-G1-S02-NOAH"
};
const children=["LUNA","ARIA","ELYA","KAEL","NOAH"];
function fixture(){
 return {
  subjects:Object.entries(owners).map(([subject_id,owner_id])=>({
   subject_id,owner_id,
   identity_history:subject_id==="MIA"
    ?{identity_row_count:1,explicit_version_sequence:false,evidence_ref:"audit:mia-identity-row"}
    :{identity_version:1,lifecycle:"BORN",runtime_status:"READY",runtime_instance_ref:"runtime:"+subject_id,evidence_ref:"audit:child-identity:"+subject_id},
   personality_history:subject_id==="MIA"
    ?{snapshot_count:220,period_start:"2026-10-16T22:42:26Z",period_end:"2026-11-07T00:11:33Z",source_refs:["audit:mia-personality-state-aggregate"],source_ref_counts_total:220}
    :{snapshot_count:0,source_refs:[],source_ref_counts_total:0}
  })),
  relationship_conflict:{conflict_present:true,field:"identity_profile.marital_status",observed_value:"single",evidence_ref:"audit:family-graph-and-birth-event"},
  capability_candidates:{total:483,validated:0,unvalidated:483}
 };
}

test("replays all six audited subjects without inventing identity versions",()=>{
 const r=replayHistoricalIdentityEvidence(fixture());
 assert.equal(r.accepted,true);
 assert.equal(r.subject_count,6);
 assert.equal(r.timelines.MIA.identity.status,"IDENTITY_VERSION_HISTORY_NOT_ESTABLISHED");
 assert.equal(r.timelines.MIA.personality_history.snapshot_count,220);
 assert.equal(r.timelines.MIA.personality_history.synthetic_versions_created,0);
 for(const s of children){
  assert.equal(r.timelines[s].identity.identity_version,1);
  assert.equal(r.timelines[s].continuity_conclusion,"DISTINCT_IDENTITY_AT_AUDIT_SNAPSHOT_ONLY");
 }
});

test("Mia personality snapshot counts do not become fabricated trait values or versions",()=>{
 const r=replayHistoricalIdentityEvidence(fixture());
 assert.equal(r.timelines.MIA.personality_history.trait_values_available,false);
 assert.equal(r.timelines.MIA.personality_history.personality_deltas_inferable,false);
 assert.equal(r.timelines.MIA.identity.version_count_claimed,0);
});

test("five child runtime identities must have distinct runtime instance references",()=>{
 const f=fixture();
 f.subjects.find(x=>x.subject_id==="NOAH").identity_history.runtime_instance_ref="runtime:LUNA";
 assert.equal(replayHistoricalIdentityEvidence(f).code,"RUNTIME_INSTANCE_ID_NOT_DISTINCT");
});

test("a child identity snapshot cannot be upgraded to an unobserved later version",()=>{
 const f=fixture();
 f.subjects.find(x=>x.subject_id==="ARIA").identity_history.identity_version=2;
 assert.equal(replayHistoricalIdentityEvidence(f).code,"ARIA:CHILD_IDENTITY_SNAPSHOT_INVALID");
});

test("missing one of six subjects or duplicate subject identity is rejected",()=>{
 const f=fixture();f.subjects.pop();
 assert.equal(replayHistoricalIdentityEvidence(f).code,"EXACT_SIX_DISTINCT_AI_SUBJECTS_REQUIRED");
});

test("identity ownership cannot cross between Mia and children",()=>{
 const f=fixture();f.subjects.find(x=>x.subject_id==="ELYA").owner_id="ZHI-G1-D02-ARIA";
 assert.equal(replayHistoricalIdentityEvidence(f).code,"SUBJECT_OWNER_MISMATCH");
});

test("historical relationship conflict is preserved and never auto-corrected",()=>{
 const r=replayHistoricalIdentityEvidence(fixture());
 assert.equal(r.relationship_conflict.status,"UNRESOLVED_CONFLICT");
 assert.equal(r.relationship_conflict.auto_correction,false);
});

test("483 learning candidates remain unvalidated and no capability is promoted",()=>{
 const r=replayHistoricalIdentityEvidence(fixture());
 assert.equal(r.capability_evidence.candidates_total,483);
 assert.equal(r.capability_evidence.validated,0);
 assert.equal(r.capability_evidence.stable_capability_promotions,0);
});

test("raw/private narratives and inferred history are rejected",()=>{
 const f=fixture();f.raw_content="private conversation";
 assert.equal(replayHistoricalIdentityEvidence(f).code,"RAW_PRIVATE_CONTENT_FORBIDDEN");
 const g=fixture();g.capability_candidates.validated=1;g.capability_candidates.unvalidated=482;
 assert.equal(replayHistoricalIdentityEvidence(g).code,"CAPABILITY_AGGREGATE_MUST_MATCH_AUDITED_EVIDENCE");
});

test("Mia snapshot aggregate must preserve exact audited period and source count shape",()=>{
 const f=fixture();f.subjects.find(x=>x.subject_id==="MIA").personality_history.source_ref_counts_total=219;
 assert.equal(replayHistoricalIdentityEvidence(f).code,"MIA:SOURCE_COUNT_MISMATCH");
});

test("replay is strictly redacted and production disconnected",()=>{
 const r=replayHistoricalIdentityEvidence(fixture());
 assert.equal(r.safeguards.raw_private_content_included,false);
 assert.equal(r.safeguards.private_memory_shared,false);
 assert.equal(r.safeguards.production_database_accessed,false);
 assert.equal(historicalIdentityReplayContract.production_integration,false);
 assert.equal(historicalIdentityReplayContract.persistence_enabled,false);
});
