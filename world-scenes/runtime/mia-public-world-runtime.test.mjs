import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateWorldManifest,layoutToWorld,anchorToLocal,anchorApproachToLocal,findWalkPath,isWalkable,createRuntimePerception} from "./mia-public-world-runtime.mjs";
const manifest=JSON.parse(await readFile(new URL("../public-destinations/world-spatial-manifest.v1.json",import.meta.url),"utf8"));
test("manifest calibrates six scene frames and keeps AURORA/federation disabled",()=>{
 const v=validateWorldManifest(manifest);assert.equal(v.valid,true,v.errors.join("; "));
 assert.equal(manifest.scenes.length,6);assert.equal(manifest.scope.aurora_enabled,false);assert.equal(manifest.scope.federation_enabled,false);
});
test("all six scene frames map authored layout points to deterministic virtual metres",()=>{
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
test("manifest rejects grants outside prototype Mia and enabled federation",()=>{
 const bad=structuredClone(manifest);bad.scope.federation_enabled=true;
 assert.equal(validateWorldManifest(bad).valid,false);
});
