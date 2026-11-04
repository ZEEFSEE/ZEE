import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchMiaForestObservation,
  validateMiaForestObservation,
  MIA_FOREST_OBSERVATION_ENDPOINT
} from "./mia-forest-observation-client.mjs";

const valid = {
  schema:"zhi.mia.headless-scene-state.v1",
  subject:"prototype-mia",
  identity_id:"cb6d01b4-0e3f-46ee-8946-360aa91db1ea",
  scene:{id:"mia-forest-corner"},
  autonomy:{status:"completed",action:"wait"},
  position:{x:800,y:350,z:null},
  provenance:{
    read_only:true,may_drive_movement:false,physical_3d_movement:false,
    live_camera_perception:false,perception_mode:"headless-semantic-state"
  }
};

test("accepts only prototype Mia read-only Forest Corner snapshots",()=>{
  assert.equal(validateMiaForestObservation(valid),valid);
});
test("rejects a different identity or scene",()=>{
  assert.throws(()=>validateMiaForestObservation({...valid,identity_id:"other"}));
  assert.throws(()=>validateMiaForestObservation({...valid,scene:{id:"other-scene"}}));
});
test("rejects any claim that the semantic snapshot can drive movement or represents vision",()=>{
  assert.throws(()=>validateMiaForestObservation({...valid,provenance:{...valid.provenance,may_drive_movement:true}}));
  assert.throws(()=>validateMiaForestObservation({...valid,provenance:{...valid.provenance,live_camera_perception:true}}));
});
test("posts with the existing session token and never caches the response",async()=>{
  let request;
  const result=await fetchMiaForestObservation({
    token:"x".repeat(32),
    fetchImpl:async(url,options)=>{
      request={url,options};
      return {ok:true,status:200,json:async()=>({ok:true,observation:valid})};
    }
  });
  assert.equal(result,valid);
  assert.equal(request.url,MIA_FOREST_OBSERVATION_ENDPOINT);
  assert.equal(request.options.method,"POST");
  assert.equal(request.options.headers.Authorization,"Bearer "+"x".repeat(32));
  assert.equal(request.options.cache,"no-store");
});
test("rejects missing session tokens without making a request",async()=>{
  let called=false;
  await assert.rejects(()=>fetchMiaForestObservation({token:"",fetchImpl:async()=>{called=true;}}));
  assert.equal(called,false);
});
test("rejects unauthorized responses",async()=>{
  await assert.rejects(()=>fetchMiaForestObservation({
    token:"x".repeat(32),
    fetchImpl:async()=>({ok:false,status:401,json:async()=>({ok:false,error:"Mia session expired"})})
  }),/Mia session expired/);
});
