/**
 * Isolated in-memory five-child spatial simulation; never grants production access.
 */
import { CHILDREN } from "./family-runtime.mjs";
import { validateWorldManifest, isWalkable, findWalkPath, createRuntimePerception, resolveSceneRoute } from "../../world-scenes/runtime/mia-public-world-runtime.mjs";
export const DESTINATIONS = Object.freeze(["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"]);
const HUB = "mia-forest-corner";
const OFFSETS = [[0,0],[.5,0],[-.5,0],[0,.5],[0,-.5],[.5,.5],[-.5,.5],[.5,-.5],[-.5,-.5]];
const sceneOf = (m,id) => { const s=m.scenes.find(x=>x.id===id); if(!s) throw new Error("Unknown scene: "+id); return s; };
const frame = (s,p,h) => createRuntimePerception({scene:s,position:p,heading:h});
function spawn(s,occupied=[]) {
 for(const [dx,dz] of OFFSETS){const p={x:s.spawn.x+dx,z:s.spawn.z+dz};if(!occupied.some(q=>q.x===p.x&&q.z===p.z)&&isWalkable(s,p.x,p.z))return p;}
 throw new Error("No safe unoccupied simulation spawn: "+s.id);
}
export function createFiveChildSpatialSimulation(manifest) {
 const v=validateWorldManifest(manifest); if(!v.valid)throw new Error("Invalid manifest: "+v.errors.join("; "));
 const sim={mode:"ISOLATED_SIMULATION_ONLY",productionAccessGranted:false,manifestModified:false,auroraEnabled:false,federationEnabled:false,manifest,agents:new Map(),transitionEvents:new Map()};
 const hub=sceneOf(manifest,HUB);
 for(const c of CHILDREN){const occupied=[...sim.agents.values()].filter(a=>a.sceneId===HUB).map(a=>a.position);const p=spawn(hub,occupied);sim.agents.set(c.agentId,{agentId:c.agentId,sceneId:HUB,position:p,heading:0,movementState:"IDLE",navigationStatus:"READY",lastTransitionId:null,lastTransitionEventId:null,accessMode:sim.mode,perceptionFrame:frame(hub,p,0)});}
 return sim;
}
export function getSimulatedAgentState(sim,id){const a=sim.agents.get(id);if(!a)throw new Error("Unknown agent: "+id);return {...a,position:{...a.position},perceptionFrame:structuredClone(a.perceptionFrame)};}
export function moveSimulatedAgent(sim,id,target){
 const a=sim.agents.get(id);if(!a)throw new Error("Unknown agent: "+id);
 if(!Number.isFinite(target?.x)||!Number.isFinite(target?.z))throw new TypeError("Finite target required");
 const s=sceneOf(sim.manifest,a.sceneId),r=findWalkPath(s,a.position,target);
 if(!r.reachable)return {moved:false,reason:r.reason,position:{...a.position}};
 const p={...r.path.at(-1)};
 if([...sim.agents.values()].some(o=>o.agentId!==id&&o.sceneId===a.sceneId&&o.position.x===p.x&&o.position.z===p.z))return {moved:false,reason:"occupied_by_sibling",position:{...a.position}};
 a.position=p;a.movementState="IDLE";a.navigationStatus="ARRIVED";a.perceptionFrame=frame(s,p,a.heading);
 return {moved:true,position:{...p},path:r.path};
}
export function transitionSimulatedAgent(sim,manifest,id,to,eventId){
 const a=sim.agents.get(id);if(!a)throw new Error("Unknown agent: "+id);
 if(typeof eventId!=="string"||!eventId.trim())throw new Error("eventId required");
 const prior=sim.transitionEvents.get(eventId);
 if(prior){if(prior.agentId!==id||prior.toSceneId!==to)throw new Error("Transition event id reused with different payload");return {...prior.result,idempotentReplay:true};}
 const route=resolveSceneRoute(manifest,a.sceneId,to);
 if(!route.ok)return {transitioned:false,reason:route.reason,idempotentReplay:false};
 const target=sceneOf(manifest,to),occupied=[...sim.agents.values()].filter(o=>o.agentId!==id&&o.sceneId===to).map(o=>o.position);
 let p;try{p=spawn(target,occupied);}catch{return {transitioned:false,reason:"destination_spawn_unavailable",idempotentReplay:false};}
 const nextFrame=frame(target,p,a.heading);
 const from=a.sceneId;
 a.sceneId=to;a.position=p;a.movementState="IDLE";a.navigationStatus="ARRIVED";a.lastTransitionId=route.hops.at(-1)?.transition_id??null;a.lastTransitionEventId=eventId;a.perceptionFrame=nextFrame;
 const result={transitioned:true,agentId:id,fromSceneId:from,toSceneId:to,transitionId:a.lastTransitionId,position:{...p},idempotentReplay:false};
 sim.transitionEvents.set(eventId,{agentId:id,toSceneId:to,result});
 return result;
}
