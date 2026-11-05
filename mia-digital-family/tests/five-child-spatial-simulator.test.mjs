import test from "node:test";
import assert from "node:assert/strict";
import {
  createFiveChildSpatialSimulator, grantSimulationAccess, revokeSimulationAccess,
  moveChild, handoffChild, observeChild, resetFiveChildSpatialSimulator,
  SIMULATOR_MODE, PERCEPTION_PROVENANCE, simulatorSceneCatalog
} from "../runtime/five-child-spatial-simulator.mjs";

const ids=["ZHI-G1-D01-LUNA","ZHI-G1-D02-ARIA","ZHI-G1-D03-ELYA","ZHI-G1-S01-KAEL","ZHI-G1-S02-NOAH"];

test("starts five independent children in memory with all destination access denied",()=>{
  const sim=createFiveChildSpatialSimulator();
  assert.equal(sim.mode,SIMULATOR_MODE);
  assert.equal(sim.agents.size,5);
  for(const id of ids) for(const scene of simulatorSceneCatalog().filter(s=>s.id!=="mia-forest-corner")) assert.equal(sim.agents.get(id).worldAccess[scene.id],false);
  assert.notEqual(sim.agents.get(ids[0]).position,sim.agents.get(ids[1]).position);
});

test("movement is isolated to the selected child and remains inside scene bounds",()=>{
  const sim=createFiveChildSpatialSimulator();
  const before=observeChild(sim,ids[1]);
  const moved=moveChild(sim,ids[0],{x:8,z:11});
  assert.ok(moved.path.length>1);
  assert.deepEqual(observeChild(sim,ids[1]).position,before.position);
  assert.deepEqual(observeChild(sim,ids[0]).position,{x:8,z:11});
});

test("collision blocks obstacle destinations and route finding avoids obstacles",()=>{
  const sim=createFiveChildSpatialSimulator();
  assert.throws(()=>moveChild(sim,ids[0],{x:3.6,z:2.4}),/obstacle/);
  const moved=moveChild(sim,ids[0],{x:8,z:11});
  assert.ok(moved.path.every(p=>!(Math.abs(p.x-9.1)<1.55 && Math.abs(p.z-2.3)<.7)));
});

test("portal handoff is denied until a volatile simulation grant is made",()=>{
  const sim=createFiveChildSpatialSimulator();
  assert.throws(()=>handoffChild(sim,ids[0],"crystal-forest"),/access denied/);
  grantSimulationAccess(sim,ids[0],"crystal-forest");
  const result=handoffChild(sim,ids[0],"crystal-forest");
  assert.equal(result.continuousWalk,false);
  assert.equal(result.sceneId,"crystal-forest");
  assert.equal(sim.agents.get(ids[1]).sceneId,"mia-forest-corner");
});

test("portal graph rejects unregistered direct transitions",()=>{
  const sim=createFiveChildSpatialSimulator();
  grantSimulationAccess(sim,ids[0],"ocean-of-light");
  assert.throws(()=>handoffChild(sim,ids[0],"memory-valley"),/no authored portal/);
});

test("revoking a simulation grant denies later portal travel",()=>{
  const sim=createFiveChildSpatialSimulator();
  grantSimulationAccess(sim,ids[0],"greenhouse");
  revokeSimulationAccess(sim,ids[0],"greenhouse");
  assert.throws(()=>handoffChild(sim,ids[0],"greenhouse"),/access denied/);
});

test("perception is explicitly authored fixture data, never sensor/live-world data",()=>{
  const sim=createFiveChildSpatialSimulator();
  const frame=observeChild(sim,ids[0]);
  assert.equal(frame.provenance,PERCEPTION_PROVENANCE);
  assert.equal(frame.physicalSensorConnected,false);
  assert.equal(frame.liveWorldConnected,false);
});

test("reset purges all in-memory grants, events and movement state",()=>{
  let sim=createFiveChildSpatialSimulator();
  grantSimulationAccess(sim,ids[0],"living-city");
  moveChild(sim,ids[0],{x:8,z:11});
  sim=resetFiveChildSpatialSimulator();
  assert.equal(sim.eventLog.length,0);
  assert.equal(sim.grants.size,0);
  assert.equal(sim.agents.get(ids[0]).movementCount,0);
  assert.equal(sim.agents.get(ids[0]).worldAccess["living-city"],false);
});
