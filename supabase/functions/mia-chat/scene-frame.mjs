const SCENES=new Set(["mia-forest-corner","crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"]);
const finite=(v,min=-10000,max=10000)=>Number.isFinite(v)&&v>=min&&v<=max;
const short=(v,n=80)=>String(v??"").slice(0,n);
export function normalizeMiaSceneFrame(input,now=Date.now()){
 if(!input||typeof input!=="object"||Array.isArray(input))return {ok:false,error:"scene_frame must be an object"};
 if(input.schema!=="zhi.mia.browser-scene-frame.v1"||input.subject!=="prototype-mia"||input.identity_id!=="cb6d01b4-0e3f-46ee-8946-360aa91db1ea")return {ok:false,error:"scene_frame identity/schema mismatch"};
 const captured=Date.parse(String(input.captured_at||""));
 if(!Number.isFinite(captured)||captured>now+5000||now-captured>15000)return {ok:false,error:"scene_frame is stale or has an invalid timestamp"};
 const s=input.scene||{},p=s.position||{},w=s.world_position||{},r=input.runtime||{};
 if(!SCENES.has(s.id)||!short(s.name)||!finite(p.x,0,100)||!finite(p.z,0,100)||!finite(w.x)||!finite(w.y,-100)||!finite(w.z)||!finite(input.heading_rad,-100,100))return {ok:false,error:"scene_frame coordinates or scene are invalid"};
 if(p.unit!=="m"||p.coordinate_space!=="scene-local"||w.space!=="zhi-mia-virtual-world-v1"||w.unit!=="m")return {ok:false,error:"scene_frame coordinate contract mismatch"};
 if(r.engine!=="three.js"||r.source!=="scene-graph"||r.physical_world!==false||r.camera_sensor!==false||!Number.isInteger(r.collider_count)||r.collider_count<0||r.collider_count>100)return {ok:false,error:"scene_frame runtime provenance mismatch"};
 const anchors=Array.isArray(s.available_anchors)?s.available_anchors.slice(0,12).map(a=>({id:short(a?.id,80),name:short(a?.name,100),approach:{x:Number(a?.approach?.x),z:Number(a?.approach?.z)}})).filter(a=>a.id&&a.name&&finite(a.approach.x,0,100)&&finite(a.approach.z,0,100)):null;
 if(!anchors||!anchors.length||anchors.some(a=>!finite(a.approach.x)||!finite(a.approach.z)))return {ok:false,error:"scene_frame anchor contract missing"};
 const visible=Array.isArray(input.visible_entities)?input.visible_entities.slice(0,12).map(e=>({id:short(e?.id,80),name:short(e?.name,100),distance_m:Number(e?.distance_m),bearing_rad:Number(e?.bearing_rad)})).filter(e=>e.id&&e.name&&finite(e.distance_m,0,100)&&finite(e.bearing_rad,-7,7)):[];
 const history=Array.isArray(input.recent_visits)?input.recent_visits.slice(-12).map(v=>({scene_id:short(v?.scene_id,60),anchor_id:short(v?.anchor_id,80),visited_at:short(v?.visited_at,40)})).filter(v=>SCENES.has(v.scene_id)):[];
 return {ok:true,frame:{schema:input.schema,subject:input.subject,identity_id:input.identity_id,captured_at:new Date(captured).toISOString(),scene:{id:s.id,name:short(s.name),coordinate_frame:short(s.coordinate_frame,100),position:{x:p.x,z:p.z,unit:"m",coordinate_space:"scene-local"},world_position:{x:w.x,y:w.y,z:w.z,space:w.space,unit:w.unit},available_anchors:anchors},heading_rad:input.heading_rad,visible_entities:visible,recent_visits:history,runtime:{engine:"three.js",source:"scene-graph",walkable:r.walkable===true,collider_count:r.collider_count,physical_world:false,camera_sensor:false}}};
}
export const MIA_SCENE_IDS=[...SCENES];
