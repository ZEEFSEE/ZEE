import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateWorldManifest,layoutToWorld,anchorToLocal,anchorApproachToLocal,findWalkPath,isWalkable,createRuntimePerception,resolveSceneTransition,resolveSceneRoute} from "./mia-public-world-runtime.mjs";
const manifest=JSON.parse(await readFile(new URL("../public-destinations/world-spatial-manifest.v1.json",import.meta.url),"utf8"));
test("manifest calibrates seven scene frames, opens all Mia-world agents, and keeps federation disabled",()=>{
 const v=validateWorldManifest(manifest);assert.equal(v.valid,true,v.errors.join("; "));
 assert.equal(manifest.scenes.length,7);assert.equal(manifest.scope.principal,"mia-world-agents");assert.equal(manifest.scope.other_agents_access,true);assert.equal(manifest.scope.registration_required,false);assert.equal(manifest.scope.approval_required,false);assert.equal(manifest.scope.token_required,false);assert.equal(manifest.scope.aurora_enabled,false);assert.equal(manifest.scope.federation_enabled,false);
});
test("all seven scene frames map authored layout points to deterministic virtual metres",()=>{
 for(const s of manifest.scenes){const p=layoutToWorld(s,{x:500,y:350},manifest.coordinate_contract);assert.equal(p.unit,"m");assert.equal(p.x,s.origin.x+10);assert.equal(p.z,s.origin.z+7);}
});
test("each scene has a connected walk path from portal to every anchor",()=>{
 for(const s of manifest.scenes){const start=s.spawn;for(const a of s.anchors){const entity=anchorToLocal(s,a,manifest.coordinate_contract);const end=anchorApproachToLocal(s,a,manifest.coordinate_contract);assert.ok(Number.isFinite(entity.x));const route=findWalkPath(s,start,end);assert.equal(route.reachable,true,s.id+" -> "+a.id+" "+route.reason);assert.ok(route.path.length>0);}}
});
test("colliders block space and safety boundary rejects outside movement",()=>{
 const s=manifest.scenes.find(x=>x.id==="crystal-forest");
 assert.equal(isWalkable(s,4.2,6,false),false);
 assert.equal(isWalkable(s,-1,2),false);
 assert.equal(isWalkable(s,1,1),true);
});
test("runtime perception reports only nearby scene-graph anchors, not camera claims",()=>{
 const s=manifest.scenes.find(x=>x.id==="greenhouse");
 const frame=createRuntimePerception({scene:s,position:{x:10,z:6.6}});
 assert.equal(frame.perception_mode,"live_runtime_scene_graph");
 assert.equal(frame.camera_sensor,false);
 assert.ok(Array.isArray(frame.visible_entities));
});
test("manifest rejects federation enablement and closed access gates",()=>{
 const bad=structuredClone(manifest);bad.scope.federation_enabled=true;
 assert.equal(validateWorldManifest(bad).valid,false);
 const closed=structuredClone(manifest);closed.scope.other_agents_access=false;
 assert.equal(validateWorldManifest(closed).valid,false);
});

test("greenhouse to ocean has an explicit virtual portal handoff, not a fabricated continuous route",()=>{
 const r=resolveSceneTransition(manifest,"greenhouse","ocean-of-light");
 assert.equal(r.ok,true);assert.equal(r.status,"authored_virtual_portal_handoff");assert.equal(r.continuous_walk_path,false);
 assert.deepEqual(r.source.scene_local,{x:1.2,z:7,unit:"m"});assert.deepEqual(r.target.scene_local,{x:1.2,z:7,unit:"m"});
});
test("unknown scene transition fails closed without inventing coordinates",()=>{
 const r=resolveSceneTransition(manifest,"greenhouse","unknown-coast");assert.equal(r.ok,false);assert.equal(r.status,"unknown");assert.equal(r.reason,"no_registered_transition_contract");
});

test("all five public destinations have explicit bidirectional Forest Corner portal contracts",()=>{
 const ids=["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"];
 for(const id of ids){const a=resolveSceneTransition(manifest,"mia-forest-corner",id);const b=resolveSceneTransition(manifest,id,"mia-forest-corner");assert.equal(a.ok,true,"Forest Corner -> "+id);assert.equal(b.ok,true,id+" -> Forest Corner");assert.equal(a.continuous_walk_path,false);assert.equal(b.continuous_walk_path,false);}
});
test("all pairs of the five public destinations route only through declared portal contracts",()=>{
 const ids=["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"];
 for(const from of ids)for(const to of ids){if(from===to)continue;const r=resolveSceneRoute(manifest,from,to);assert.equal(r.ok,true,from+" -> "+to);assert.ok(["via_forest_corner","direct_portal_handoff"].includes(r.status));assert.equal(r.hops.length,r.status==="direct_portal_handoff"?1:2);}
});
test("unknown destinations remain unknown and never receive inferred coordinates",()=>{
 const r=resolveSceneRoute(manifest,"greenhouse","unregistered-destination");assert.equal(r.ok,false);assert.equal(r.status,"unknown");assert.deepEqual(r.hops,[]);
});

test("Palace has a bidirectional free-passage portal for all Mia world agents",()=>{
 const a=resolveSceneTransition(manifest,"mia-forest-corner","palace");
 const b=resolveSceneTransition(manifest,"palace","mia-forest-corner");
 assert.equal(a.ok,true);assert.equal(b.ok,true);
 assert.equal(a.to_scene_id,"palace");assert.equal(b.to_scene_id,"mia-forest-corner");
 const palace=manifest.scenes.find(s=>s.id==="palace");
 assert.equal(palace.runtime_geometry_status,"placeholder_canvas_only_not_measured");
 assert.deepEqual(palace.directory_reference.directory_entry,{x:1000,y:330});
 assert.equal(palace.directory_reference.mapping_to_runtime_frame,"not_calibrated");
});

test("Palace can reach every existing destination and return through Forest Corner",()=>{
 const ids=["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"];
 for(const id of ids){
  const outbound=resolveSceneRoute(manifest,"palace",id);
  const inbound=resolveSceneRoute(manifest,id,"palace");
  assert.equal(outbound.ok,true,"Palace -> "+id);
  assert.equal(inbound.ok,true,id+" -> Palace");
  assert.equal(outbound.status,"via_forest_corner");
  assert.equal(inbound.status,"via_forest_corner");
  assert.equal(outbound.hops.length,2);
  assert.equal(inbound.hops.length,2);
 }
});
