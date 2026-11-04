/**
 * Isolated prototype-Mia public-world runtime contracts.
 * Coordinates are deterministic authored virtual metres, not a physical survey.
 * This module never calls APIs, writes storage, or persists agent state.
 */
export const WORLD_UNIT = "m";
export const NAV_CELL = 0.5;
export function validateWorldManifest(m) {
  const errors=[];
  if(m?.schema!=="zhi.mia.public-world.spatial-manifest.v1") errors.push("unsupported manifest schema");
  if(m?.coordinate_contract?.unit!=="meter" || m?.coordinate_contract?.meters_per_layout_unit!==0.02) errors.push("coordinate unit contract mismatch");
  if(m?.scope?.principal!=="prototype-mia" || m?.scope?.other_agents_access!==false) errors.push("world scope must be prototype Mia only");
  if(m?.scope?.aurora_enabled!==false || m?.scope?.federation_enabled!==false) errors.push("AURORA/federation must remain disabled");
  const ids=new Set();
  for(const s of m?.scenes??[]){
    if(ids.has(s.id)) errors.push("duplicate scene "+s.id); ids.add(s.id);
    if(!Number.isFinite(s.origin?.x)||!Number.isFinite(s.origin?.z)) errors.push("scene "+s.id+" missing world origin");
    if(!Number.isFinite(s.layout?.width)||!Number.isFinite(s.layout?.height)) errors.push("scene "+s.id+" missing layout bounds");
    if(!Array.isArray(s.anchors)||s.anchors.length<1) errors.push("scene "+s.id+" missing anchors");
    for(const a of s.anchors??[]){
      if(a.layout.x<0||a.layout.x>s.layout.width||a.layout.y<0||a.layout.y>s.layout.height) errors.push("anchor outside "+s.id+": "+a.id);
    }
    for(const o of s.obstacles??[]){
      if(!["circle","ellipse","rect"].includes(o.shape)) errors.push("unsupported collider "+o.id);
    }
  }
  if(ids.size!==6) errors.push("expected Forest Corner plus five destinations");
  for(const id of ["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"]){
    if(!m.routes?.some(r=>r.from==="mia-forest-corner"&&r.to===id&&r.direction==="bidirectional")) errors.push("missing bidirectional route "+id);
  }
  return {valid:errors.length===0,errors};
}
export function layoutToWorld(scene,point,contract) {
  if(!scene||!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)) throw new TypeError("finite scene layout point required");
  const scale=contract.meters_per_layout_unit;
  return {x:scene.origin.x+point.x*scale,y:scene.origin.y,z:scene.origin.z+point.y*scale,space:"zhi-mia-virtual-world-v1",unit:"m"};
}
export function anchorToLocal(scene,anchor,contract) {
  return {id:anchor.id,name:anchor.name,x:anchor.layout.x*contract.meters_per_layout_unit,z:anchor.layout.y*contract.meters_per_layout_unit};
}
export function anchorApproachToLocal(scene,anchor,contract) {
  const p=anchor.approach;
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)) throw new TypeError("safe walk-up point required for "+anchor.id);
  return {id:anchor.id,name:anchor.name,x:p.x,z:p.z};
}
export function isWalkable(scene,x,z,margin=0.45) {
  const width=scene.layout.width*0.02, depth=scene.layout.height*0.02;
  if(x<margin||z<margin||x>width-margin||z>depth-margin) return false;
  for(const o of scene.obstacles??[]){
    let hit=false;
    if(o.shape==="circle") hit=Math.hypot(x-o.x,z-o.z)<o.radius+margin;
    if(o.shape==="ellipse") hit=((x-o.x)/(o.rx+margin))**2+((z-o.z)/(o.rz+margin))**2<1;
    if(o.shape==="rect") hit=Math.abs(x-o.x)<o.width/2+margin && Math.abs(z-o.z)<o.depth/2+margin;
    if(hit) return false;
  }
  return true;
}
export function findWalkPath(scene,start,end,{cell=NAV_CELL,margin=0.42}={}) {
  const width=scene.layout.width*0.02,depth=scene.layout.height*0.02;
  const toCell=p=>({x:Math.round(p.x/cell),z:Math.round(p.z/cell)});
  const key=p=>p.x+","+p.z, from=toCell(start), goal=toCell(end);
  const valid=p=>p.x>=0&&p.z>=0&&p.x<=Math.floor(width/cell)&&p.z<=Math.floor(depth/cell)&&isWalkable(scene,p.x*cell,p.z*cell,margin);
  if(!valid(from)||!valid(goal)) return {reachable:false,path:[],reason:"start_or_goal_blocked"};
  const open=[from], came=new Map(), g=new Map([[key(from),0]]), f=new Map([[key(from),Math.abs(from.x-goal.x)+Math.abs(from.z-goal.z)]]);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(open.length){
    open.sort((a,b)=>(f.get(key(a))??Infinity)-(f.get(key(b))??Infinity));
    const cur=open.shift(), ck=key(cur);
    if(cur.x===goal.x&&cur.z===goal.z){
      const cells=[cur]; let k=ck;
      while(came.has(k)){const prev=came.get(k);cells.push(prev);k=key(prev);}
      cells.reverse();
      return {reachable:true,path:cells.map(p=>({x:p.x*cell,z:p.z*cell})),cell_size:cell,length_m:Math.max(0,(cells.length-1)*cell),reason:null};
    }
    for(const [dx,dz] of dirs){
      const n={x:cur.x+dx,z:cur.z+dz},nk=key(n); if(!valid(n))continue;
      const tentative=(g.get(ck)??Infinity)+1;
      if(tentative<(g.get(nk)??Infinity)){came.set(nk,cur);g.set(nk,tentative);f.set(nk,tentative+Math.abs(n.x-goal.x)+Math.abs(n.z-goal.z));if(!open.some(p=>key(p)===nk))open.push(n);}
    }
  }
  return {reachable:false,path:[],reason:"no_connected_walk_path"};
}
export function createRuntimePerception({scene,position,heading=0,visibleDistance=8}) {
  const entities=(scene.anchors??[]).map(a=>{
    const p=anchorToLocal(scene,a,{meters_per_layout_unit:0.02});
    const dx=p.x-position.x,dz=p.z-position.z,dist=Math.hypot(dx,dz);
    const angle=Math.atan2(dx,-dz)-heading;
    const normalized=Math.atan2(Math.sin(angle),Math.cos(angle));
    return {id:a.id,name:a.name,distance_m:Number(dist.toFixed(2)),bearing_rad:Number(normalized.toFixed(3)),in_range:dist<=visibleDistance,source:"runtime_scene_anchor"};
  }).filter(e=>e.in_range).sort((a,b)=>a.distance_m-b.distance_m);
  return {schema:"zhi.mia.runtime-perception.v1",scene_id:scene.id,position:{...position,unit:"m",coordinate_space:"scene-local"},heading_rad:heading,visible_distance_m:visibleDistance,visible_entities:entities,collider_count:scene.obstacles.length,perception_mode:"live_runtime_scene_graph",camera_sensor:false,physical_world:false,generated_at:new Date().toISOString()};
}

/** Resolve only an explicitly authored portal handoff; never infer missing coordinates. */
export function resolveSceneTransition(manifest, fromSceneId, toSceneId) {
  const edge=(manifest?.scene_transitions??[]).find(e=>
    (e.from_scene_id===fromSceneId&&e.to_scene_id===toSceneId)||
    (e.direction==="bidirectional"&&e.from_scene_id===toSceneId&&e.to_scene_id===fromSceneId));
  if(!edge) return {ok:false,status:"unknown",reason:"no_registered_transition_contract"};
  if(edge.calibration_status!=="virtual_portal_handoff_defined_not_physical_survey" || edge.mode!=="scene_portal_handoff")
    return {ok:false,status:"unverified",reason:"transition_contract_not_verified"};
  const reverse=edge.from_scene_id!==fromSceneId;
  const source=reverse?edge.target:edge.source, target=reverse?edge.source:edge.target;
  for(const p of [source?.scene_local,target?.scene_local]) if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z)||p.unit!=="m") return {ok:false,status:"unknown",reason:"portal_coordinates_missing"};
  return {ok:true,status:"authored_virtual_portal_handoff",continuous_walk_path:false,source,target,from_scene_id:fromSceneId,to_scene_id:toSceneId,transition_id:edge.transition_id,provenance:edge.coordinate_provenance};
}

/** Resolve a declared direct portal or a declared two-leg route via Forest Corner. */
export function resolveSceneRoute(manifest,fromSceneId,toSceneId) {
  if(fromSceneId===toSceneId) return {ok:true,status:"already_in_scene",hops:[]};
  const direct=resolveSceneTransition(manifest,fromSceneId,toSceneId);
  if(direct.ok) return {ok:true,status:"direct_portal_handoff",hops:[direct]};
  const hub="mia-forest-corner";
  if(fromSceneId!==hub&&toSceneId!==hub){
    const first=resolveSceneTransition(manifest,fromSceneId,hub);
    const second=resolveSceneTransition(manifest,hub,toSceneId);
    if(first.ok&&second.ok) return {ok:true,status:"via_forest_corner",hops:[first,second]};
  }
  return {ok:false,status:"unknown",reason:"no_complete_registered_route_contract",hops:[]};
}
