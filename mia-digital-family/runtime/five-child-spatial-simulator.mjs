/**
 * Five-child spatial browser simulator.
 * ISOLATED_SIMULATION_ONLY: authored virtual geometry, in-memory state, no network/storage.
 * It does not connect to Mia, Supabase, AGNES, production permissions, or a live renderer.
 */
import { CHILDREN } from "./family-runtime.mjs";

export const SIMULATOR_MODE = "ISOLATED_SIMULATION_ONLY";
export const PERCEPTION_PROVENANCE = "AUTHORED_VIRTUAL_SCENE_FIXTURE_NOT_SENSOR_DATA";

export const SCENE_FIXTURE = Object.freeze([
  { id:"mia-forest-corner", name:"森林角落", width:20, depth:14, origin:{x:0,z:0}, spawn:{x:1.2,z:7}, anchors:[["智能温室",5.3,2.4],["数据书架",10,3.6],["休息区",16.5,8],["森林小白兔",6,5.6]], obstacles:[["circle",3.6,2.4,1.1],["rect",9.1,2.3,2.6,.9],["rect",14.6,6.8,3.4,1.3],["circle",1.4,1.8,.55],["circle",18.4,1.8,.6],["circle",1.6,12.2,.5],["circle",18.6,12.1,.6]] },
  { id:"crystal-forest", name:"水晶森林", width:20, depth:14, origin:{x:30,z:0}, spawn:{x:1.2,z:7}, anchors:[["晶簇林地",6.2,6],["折光空地",10,6.6],["静水镜池",13.2,9.6],["苔石小径",9.8,10.4]], obstacles:[["circle",4.2,6,1.25],["circle",5.1,7.4,.7],["ellipse",15.8,9.6,1.45,.8],["circle",1.8,1.5,.45],["circle",18.2,1.5,.45]] },
  { id:"ocean-of-light", name:"光之海洋", width:20, depth:14, origin:{x:60,z:0}, spawn:{x:1.2,z:7}, anchors:[["宁静海岸",4.6,10.2],["流动光潮",10.4,7],["微光岛",13.8,5],["贝壳花园",4.5,7]], obstacles:[["rect",8.7,5.1,5.8,2.4],["ellipse",15.8,5,1.2,.85],["circle",5.2,5.2,.75]] },
  { id:"memory-valley", name:"记忆山谷", width:20, depth:14, origin:{x:90,z:0}, spawn:{x:1.2,z:7}, anchors:[["回声山脊",5,6.6],["记忆湖",10.4,8.2],["故事石阵",14.3,6.6],["山谷小径",10,11.4]], obstacles:[["rect",5,4.4,4.8,2.8],["ellipse",10.4,9.6,2.7,.9],["circle",15.8,6.6,.6],["circle",16.8,7.1,.55]] },
  { id:"living-city", name:"生命之城", width:20, depth:14, origin:{x:120,z:0}, spawn:{x:1.2,z:7}, anchors:[["绿色广场",10,8.5],["生态街区",7,6],["树冠花园",14,5.2],["河畔步道",10.4,11.4]], obstacles:[["rect",4.6,6,3.5,3.6],["circle",15.8,5.2,1.1],["circle",10,7.2,.75]] },
  { id:"greenhouse", name:"温室", width:20, depth:14, origin:{x:150,z:0}, spawn:{x:1.2,z:7}, anchors:[["玻璃温室",10,9.5],["蕨类角落",5.5,9.8],["种子与育苗台",15.6,10.3],["阳光苗床",10.4,11.2]], obstacles:[["rect",10,6.6,7.2,4.6],["circle",4.4,8.8,.9],["rect",15.6,9.2,2.4,1]] }
]);

const PORTALS = Object.freeze([
  ["mia-forest-corner","crystal-forest","forest-corner-to-crystal-forest-portal"],
  ["mia-forest-corner","ocean-of-light","forest-corner-to-ocean-of-light-portal"],
  ["mia-forest-corner","memory-valley","forest-corner-to-memory-valley-portal"],
  ["mia-forest-corner","living-city","forest-corner-to-living-city-portal"],
  ["mia-forest-corner","greenhouse","forest-corner-to-greenhouse-portal"],
  ["greenhouse","ocean-of-light","greenhouse-exit-to-ocean-of-light-entry"]
]);

const SCENES = new Map(SCENE_FIXTURE.map(scene => [scene.id, scene]));
const DESTINATIONS = SCENE_FIXTURE.filter(s => s.id !== "mia-forest-corner").map(s => s.id);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function inBounds(scene,p) { return p.x>=0 && p.z>=0 && p.x<=scene.width && p.z<=scene.depth; }
function blocked(scene,p,r=.24) {
  return scene.obstacles.some(o => {
    const [shape,x,z,a,b] = o;
    if (shape==="circle") return Math.hypot(p.x-x,p.z-z) < a+r;
    if (shape==="ellipse") return ((p.x-x)/(a+r))**2 + ((p.z-z)/(b+r))**2 < 1;
    return Math.abs(p.x-x) < a/2+r && Math.abs(p.z-z) < b/2+r;
  });
}
function cell(p) { return {x:Math.round(p.x*2)/2,z:Math.round(p.z*2)/2}; }
function key(p) { return p.x.toFixed(1)+","+p.z.toFixed(1); }

export function createFiveChildSpatialSimulator() {
  const agents = new Map(CHILDREN.map(child => [child.agentId, {
    ...child, sceneId:"mia-forest-corner", position:{x:1.2,z:7},
    worldAccess:Object.fromEntries(DESTINATIONS.map(id=>[id,false])),
    movementCount:0, perceptionRevision:0
  }]));
  return { mode:SIMULATOR_MODE, agents, eventLog:[], grants: new Set() };
}

export function grantSimulationAccess(sim, childId, destinationId) {
  const child=sim.agents.get(childId);
  if (!child || !DESTINATIONS.includes(destinationId)) throw new Error("unknown child or destination");
  sim.grants.add(childId+"|"+destinationId);
  child.worldAccess[destinationId]=true;
  sim.eventLog.push({type:"SIMULATION_GRANT",childId,destinationId,scope:"VOLATILE_SESSION_ONLY"});
  return true;
}
export function revokeSimulationAccess(sim, childId, destinationId) {
  const child=sim.agents.get(childId);
  if (!child || !DESTINATIONS.includes(destinationId)) throw new Error("unknown child or destination");
  sim.grants.delete(childId+"|"+destinationId);
  child.worldAccess[destinationId]=false;
  return true;
}
function allowed(sim, childId, sceneId) {
  return sceneId==="mia-forest-corner" || sim.grants.has(childId+"|"+sceneId);
}
export function moveChild(sim, childId, target) {
  const child=sim.agents.get(childId);
  if (!child) throw new Error("unknown child");
  const scene=SCENES.get(child.sceneId);
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z) || !inBounds(scene,target)) throw new Error("target outside scene bounds");
  if (blocked(scene,target)) throw new Error("target intersects a scene obstacle");
  const start=cell(child.position), goal=cell(target);
  const queue=[start], came=new Map([[key(start),null]]), dirs=[[.5,0],[-.5,0],[0,.5],[0,-.5]];
  let found=false;
  while(queue.length) {
    const p=queue.shift(), k=key(p);
    if(k===key(goal)){found=true;break;}
    for(const [dx,dz] of dirs){
      const n={x:Math.round((p.x+dx)*2)/2,z:Math.round((p.z+dz)*2)/2}, nk=key(n);
      if(came.has(nk)||!inBounds(scene,n)||blocked(scene,n)) continue;
      came.set(nk,k);queue.push(n);
    }
  }
  if(!found) throw new Error("no collision-free path found");
  const path=[];let cursor=key(goal);
  while(cursor){const [x,z]=cursor.split(",").map(Number);path.push({x,z});cursor=came.get(cursor);}
  path.reverse();
  child.position={x:target.x,z:target.z};
  child.movementCount++;child.perceptionRevision++;
  sim.eventLog.push({type:"SIMULATED_MOVE",childId,sceneId:child.sceneId,steps:path.length,provenance:PERCEPTION_PROVENANCE});
  return Object.freeze({path:Object.freeze(path),sceneId:child.sceneId,position:clone(child.position),mode:SIMULATOR_MODE});
}
export function handoffChild(sim, childId, targetSceneId) {
  const child=sim.agents.get(childId);
  if(!child||!SCENES.has(targetSceneId)) throw new Error("unknown child or scene");
  const edge=PORTALS.find(([a,b])=>(a===child.sceneId&&b===targetSceneId)||(b===child.sceneId&&a===targetSceneId));
  if(!edge) throw new Error("no authored portal connects these two scenes");
  const sourceScene=SCENES.get(child.sceneId);
  if(Math.hypot(child.position.x-sourceScene.spawn.x,child.position.z-sourceScene.spawn.z)>0.75) {
    throw new Error("child must reach the authored scene portal anchor before handoff");
  }
  const destination=targetSceneId==="mia-forest-corner" ? child.sceneId : targetSceneId;
  if(!allowed(sim,childId,destination)) throw new Error("destination access denied (simulation grant required)");
  child.sceneId=targetSceneId;child.position=clone(SCENES.get(targetSceneId).spawn);
  sim.eventLog.push({type:"SIMULATED_PORTAL_HANDOFF",childId,from:edge[0],to:edge[1],continuousWalk:false,portalId:edge[2]});
  return Object.freeze({sceneId:child.sceneId,position:clone(child.position),portalId:edge[2],continuousWalk:false,mode:SIMULATOR_MODE});
}
export function observeChild(sim, childId) {
  const child=sim.agents.get(childId);
  if(!child) throw new Error("unknown child");
  const scene=SCENES.get(child.sceneId);
  const nearest=scene.anchors.map(([name,x,z])=>({name,distance:Math.hypot(child.position.x-x,child.position.z-z)})).sort((a,b)=>a.distance-b.distance)[0];
  return Object.freeze({
    childId,sceneId:scene.id,sceneName:scene.name,position:clone(child.position),
    nearestAnchor:nearest && nearest.distance<=3 ? nearest.name : null,
    movementCount:child.movementCount,perceptionRevision:child.perceptionRevision,
    provenance:PERCEPTION_PROVENANCE,physicalSensorConnected:false,liveWorldConnected:false
  });
}
export function resetFiveChildSpatialSimulator() { return createFiveChildSpatialSimulator(); }
export const simulatorSceneCatalog = () => SCENE_FIXTURE.map(({id,name})=>({id,name}));
