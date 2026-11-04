import test from "node:test";
import assert from "node:assert/strict";
import { createForestObservationFrame } from "./mia-forest-observation-frame.mjs";

const scene = {
  slug:"mia-forest-corner", name:"Forest Corner",
  local_coordinate_system:{width:1000,height:700},
  entities:[{id:"lounge",name:"休息区",type:"interaction_zone",status:"active",x:800,y:350}]
};
const navigation = {nodes:[{node_id:"lounge"}],edges:[{edge_id:"edge-1",from:"a",to:"lounge",runtime_registered:false,traversal_status:"authored_pending_runtime_validation"}]};

test("emits a source-backed local semantic frame without claiming perception",()=>{
  const frame=createForestObservationFrame({scene,navigation,now:new Date("2026-11-04T14:00:00Z")});
  assert.equal(frame.schema,"zhi.mia.scene-observation-frame.v1");
  assert.equal(frame.subject,"prototype-mia");
  assert.equal(frame.entities[0].position.z,null);
  assert.equal(frame.entities[0].perception_mode,"authored-semantic-data");
  assert.equal(frame.runtime.live_camera_perception,false);
  assert.equal(frame.provenance.not_a_visual_perception_claim,true);
  assert.equal(frame.restrictions.may_drive_movement,false);
});

test("rejects scenes outside prototype Mia Forest Corner",()=>{
  assert.throws(()=>createForestObservationFrame({scene:{slug:"mia-02",entities:[]}}),/Only prototype Mia/);
});

test("navigation remains inactive unless separately registered by a verified runtime",()=>{
  const frame=createForestObservationFrame({scene,navigation});
  assert.equal(frame.navigation.graph_status,"authored-not-registered");
  assert.equal(frame.navigation.edges[0].runtime_registered,false);
});
