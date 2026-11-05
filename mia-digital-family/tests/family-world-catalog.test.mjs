import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../../world-scenes/public-destinations/world-spatial-manifest.v1.json", import.meta.url), "utf8"));
const policy = JSON.parse(await readFile(new URL("../family-public-world-access.v1.json", import.meta.url), "utf8"));
const children = ["ZHI-G1-D01-LUNA","ZHI-G1-D02-ARIA","ZHI-G1-D03-ELYA","ZHI-G1-S01-KAEL","ZHI-G1-S02-NOAH"];
const destinations = ["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"];

function reachable(from, to) {
  const queue=[from], seen=new Set([from]);
  while(queue.length) {
    const current=queue.shift();
    if(current===to)return true;
    for(const edge of manifest.scene_transitions||[]) {
      if(edge.direction!=="bidirectional")continue;
      const next=edge.from_scene_id===current?edge.to_scene_id:edge.to_scene_id===current?edge.from_scene_id:null;
      if(next&&!seen.has(next)){seen.add(next);queue.push(next);}
    }
  }
  return false;
}

test("all five public destinations are registered with a spawn and four named anchors",()=>{
  for(const id of destinations){
    const scene=manifest.scenes.find(s=>s.id===id);
    assert.ok(scene,id);
    assert.ok(Number.isFinite(scene.spawn.x)&&Number.isFinite(scene.spawn.z));
    assert.equal(scene.anchors.length,4);
    for(const anchor of scene.anchors)assert.ok(Number.isFinite(anchor.approach.x)&&Number.isFinite(anchor.approach.z));
  }
});

test("all six scenes are mutually reachable using authored bidirectional portal handoffs",()=>{
  const ids=manifest.scenes.map(s=>s.id);
  for(const from of ids)for(const to of ids)assert.equal(reachable(from,to),true,from+" -> "+to);
});

test("every child has an independent grant for every public destination",()=>{
  assert.equal(policy.grants.length,25);
  for(const child of children)for(const destination of destinations){
    assert.ok(policy.grants.some(g=>g.agent_id===child&&g.destination_id===destination&&g.access==="GRANTED"));
  }
});

test("world remains virtual and isolated from Mia private data, AURORA and federation",()=>{
  assert.equal(manifest.scope.aurora_enabled,false);
  assert.equal(manifest.scope.federation_enabled,false);
  assert.equal(policy.mia_private_chat_access,false);
  assert.equal(policy.aurora,false);
  assert.equal(policy.federation,false);
  assert.equal(policy.public_chat_relay,false);
});
