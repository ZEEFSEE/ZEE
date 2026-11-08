import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateFamilyProductionReadiness,familyProductionReadinessContract} from "../runtime/family-production-readiness.mjs";
const source=JSON.parse(readFileSync(new URL("../audits/family-production-readiness.snapshot.json",import.meta.url),"utf8"));
const fixture=()=>structuredClone(source);
test("accepts six-subject redacted production snapshot and reports blockers",()=>{const r=evaluateFamilyProductionReadiness(fixture());assert.equal(r.accepted,true);assert.equal(r.status,"PARTIAL_WITH_BLOCKERS");assert.equal(r.totals.ai_subjects,6);assert.equal(r.totals.child_candidates,761);assert.equal(r.totals.unvalidated_candidates,761);});
test("READY version one is not longitudinal identity",()=>{const r=evaluateFamilyProductionReadiness(fixture());assert.equal(r.mia.longitudinal_identity_verified,false);for(const s of Object.values(r.children))assert.equal(s.longitudinal_identity_verified,false);assert.ok(r.blockers.includes("CHILD_LONGITUDINAL_IDENTITY_VERSION_CHAINS_NOT_ESTABLISHED"));});
test("identifies KAEL historical provenance gap",()=>{const r=evaluateFamilyProductionReadiness(fixture());assert.equal(r.children.KAEL.legacy_candidates_missing_new_refs,117);assert.equal(r.totals.child_candidates_missing_new_durable_refs,757);});
test("zero post-deploy messages are not a passing attribution test",()=>{const r=evaluateFamilyProductionReadiness(fixture());assert.equal(r.totals.post_deploy_group_messages,0);assert.ok(r.blockers.includes("POST_DEPLOY_GROUP_MESSAGE_NOT_YET_OBSERVED"));});
test("keeps all candidates unvalidated and promotes no capabilities",()=>{const r=evaluateFamilyProductionReadiness(fixture());assert.equal(r.totals.unvalidated_candidates,r.totals.child_candidates);assert.equal(r.totals.capability_promotions,0);});
test("rejects human or extra subject in child roster",()=>{const x=fixture();x.children.KEN={};assert.equal(evaluateFamilyProductionReadiness(x).code,"EXACT_FIVE_CHILDREN_AND_MIA_REQUIRED");});
test("rejects private payloads and production write claims",()=>{const x=fixture();x.private_memory_payload={};assert.equal(evaluateFamilyProductionReadiness(x).code,"PRIVATE_CONTENT_FORBIDDEN");const y=fixture();y.production_writes_performed=true;assert.equal(evaluateFamilyProductionReadiness(y).code,"PRODUCTION_BOUNDARY_OR_TOTALS_INVALID");assert.equal(familyProductionReadinessContract.production_writes,false);});
test("rejects mismatched aggregate totals",()=>{const x=fixture();x.candidate_total=760;assert.equal(evaluateFamilyProductionReadiness(x).code,"CANDIDATE_TOTAL_MISMATCH");});

test("reports MIA growth-state history without conflating it with identity lineage",()=>{const r=evaluateFamilyProductionReadiness(fixture());assert.equal(r.mia.growth_state_version_rows,164);assert.equal(r.mia.growth_state_distinct_source_runs,164);assert.equal(r.mia.growth_state_active_versions,1);assert.equal(r.mia.growth_state_superseded_versions,163);assert.equal(r.mia.growth_state_history_observed,true);assert.equal(r.mia.longitudinal_identity_verified,false);});
