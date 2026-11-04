import test from "node:test";
import assert from "node:assert/strict";
import {normalizeMiaSceneFrame} from "../supabase/functions/mia-chat/scene-frame.mjs";
const now=Date.parse("2026-11-04T12:00:00.000Z");
function frame(){return {schema:"zhi.mia.browser-scene-frame.v1",subject:"prototype-mia",identity_id:"cb6d01b4-0e3f-46ee-8946-360aa91db1ea",captured_at:new Date(now).toISOString(),scene:{id:"crystal-forest",name:"水晶森林",coordinate_frame:"zhi-mia-virtual-world-v1",position:{x:4,z:5,unit:"m",coordinate_space:"scene-local"},world_position:{x:34,y:0,z:5,space:"zhi-mia-virtual-world-v1",unit:"m"},available_anchors:[{id:"crystal-grove",name:"水晶林",approach:{x:6,z:6}}]},heading_rad:0,visible_entities:[{id:"crystal-grove",name:"水晶林",distance_m:2,bearing_rad:0}],recent_visits:[],runtime:{engine:"three.js",source:"scene-graph",walkable:true,collider_count:3,physical_world:false,camera_sensor:false}};}
test("accepts current prototype Mia frame",()=>{const r=normalizeMiaSceneFrame(frame(),now);assert.equal(r.ok,true);assert.equal(r.frame.scene.id,"crystal-forest");});
test("rejects identity mismatch",()=>{const f=frame();f.identity_id="other";assert.equal(normalizeMiaSceneFrame(f,now).ok,false);});
test("rejects stale frame",()=>{const f=frame();f.captured_at=new Date(now-16000).toISOString();assert.equal(normalizeMiaSceneFrame(f,now).ok,false);});
test("rejects unknown scene",()=>{const f=frame();f.scene.id="aurora";assert.equal(normalizeMiaSceneFrame(f,now).ok,false);});
test("rejects coordinate contract mismatch",()=>{const f=frame();f.scene.position.unit="pixels";assert.equal(normalizeMiaSceneFrame(f,now).ok,false);});
test("rejects fake physical perception provenance",()=>{const f=frame();f.runtime.physical_world=true;assert.equal(normalizeMiaSceneFrame(f,now).ok,false);});
test("rejects missing safe anchor",()=>{const f=frame();f.scene.available_anchors=[];assert.equal(normalizeMiaSceneFrame(f,now).ok,false);});
test("caps and sanitizes visible entities",()=>{const f=frame();f.visible_entities=Array.from({length:30},(_,i)=>({id:"a"+i,name:"A"+i,distance_m:1,bearing_rad:0}));const r=normalizeMiaSceneFrame(f,now);assert.equal(r.frame.visible_entities.length,12);assert.equal("arbitrary" in r.frame,false);});
