import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") || "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const H = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:H});
const db=()=>createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const fam=(c:any)=>c.schema("zhi_family");
function decode(s:string){const n=s.replace(/-/g,"+").replace(/_/g,"/");const b=atob(n+"=".repeat((4-n.length%4)%4));return Uint8Array.from(b,x=>x.charCodeAt(0));}
async function verifyMiaToken(token:string){
 try{
  if(!SERVICE||token.length>4096)return false;
  const p=token.split(".");if(p.length!==2)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",key,decode(p[1]),new TextEncoder().encode(p[0])))return false;
  const c=JSON.parse(new TextDecoder().decode(decode(p[0]))),now=Math.floor(Date.now()/1000);
  return c.aud==="mia-chat"&&c.sub==="mia-admin"&&Number.isFinite(c.iat)&&Number.isFinite(c.exp)&&c.iat<=now+60&&c.exp>now&&c.exp-c.iat<=4*3600+60;
 }catch{return false;}
}
const PALACE={id:"palace",name:"Palace｜共享宫殿",description:"MIA 世界居民自由进出、离开与返回的共享空间。",source_system:"MIA_WORLD_OPEN_PALACE_POLICY",scene_data:{features:["宫殿主入口"],verification_status:"placeholder_canvas_only_not_measured",route_contract:{entry_mode:"logical_scene_link_only",runtime_movement:"not_integrated",coordinate_transform:null},access_policy:{principal:"MIA_WORLD_RESIDENTS",registration_required:false,approval_required:false,invitation_required:false,token_required:false,whitelist_required:false,can_enter_leave_return_freely:true},world_access_policy:{scope:"MIA_WORLD_SHARED_PUBLIC_SCENE",private_chat_access:false,private_memory_access:false}}};
const FOREST="mia-forest-corner";
function featuresOf(row:any){
 const d=row.scene_data||{};
 const names=[...(Array.isArray(d.features)?d.features:[]),...(Array.isArray(d.entities)?d.entities.map((x:any)=>x.name||x.id):[])];
 return [...new Set(names.map((x:any)=>String(x||"").trim()).filter(Boolean))];
}
function normalizeScene(row:any){
 const d=row.scene_data||{};
 return {id:row.slug||row.id,name:row.name||row.slug,description:row.description||"",source_system:row.source_system||"AUTHORED_SCENE",features:featuresOf(row),entities:Array.isArray(d.entities)?d.entities:[],verification_status:d.verification_status||"scene_metadata_only",route_contract:d.route_contract||{runtime_movement:"not_integrated"},coordinate_space:d.coordinate_space||d.local_coordinate_system?.name||"scene-local",bounds:d.bounds||d.local_coordinate_system||null,access_scope:"OPEN_TO_ALL_MIA_WORLD_RESIDENTS",sensors:{visual_frame_connected:false,audio_connected:false,physical_world:false}};
}
async function loadScenes(c:any){
 const {data,error}=await c.from("mia_virtual_spaces").select("slug,name,description,scene_data,source_system").eq("is_active",true).in("source_system",["mia-independent-scene","mia-public-destinations-v1"]).order("name").limit(40);
 if(error)throw new Error("WORLD_SCENE_READ_FAILED");
 const rows=(data||[]).map(normalizeScene);
 if(!rows.some((x:any)=>x.id==="palace"))rows.push(normalizeScene({slug:PALACE.id,name:PALACE.name,description:PALACE.description,source_system:PALACE.source_system,scene_data:PALACE.scene_data}));
 return rows;
}
async function ensureState(c:any,identityId:string){
 const f=fam(c);
 const {data,error}=await f.from("ken_world_state").select("identity_id,scene_id,position,coordinate_space,coordinate_frame,position_status,movement_revision,perception_frame,last_observed_at,updated_at").eq("identity_id",identityId).maybeSingle();
 if(error)throw new Error("KEN_WORLD_STATE_READ_FAILED");
 if(data)return data;
 const seed={identity_id:identityId,scene_id:FOREST,position:{x:1.2,z:7,unit:"m",provenance:"authored_virtual_world_frame"},coordinate_space:"scene-local",coordinate_frame:"zhi-mia-virtual-world-v1",position_status:"spawned",movement_revision:0,perception_frame:{provenance:"AUTHORED_SCENE_DATA",visual_sensor:false,audio_sensor:false}};
 const {data:created,error:insertError}=await f.from("ken_world_state").insert(seed).select("*").single();
 if(insertError)throw new Error("KEN_WORLD_STATE_INIT_FAILED");
 return created;
}
async function getDevice(c:any,identityId:string){
 const {data,error}=await fam(c).from("ken_device_registry").select("device_id").eq("identity_id",identityId).is("revoked_at",null).order("last_seen_at",{ascending:false}).limit(1).maybeSingle();
 if(error||!data)throw new Error("KEN_DEVICE_NOT_READY");
 return data.device_id;
}
async function record(c:any,identityId:string,deviceId:string,eventType:string,sceneId:string|null,target:string|null,payload:any){
 const now=new Date().toISOString();
 const {error:worldError}=await fam(c).from("ken_world_events").insert({identity_id:identityId,event_type:eventType,scene_id:sceneId,target_id:target,event_payload:{...payload,occurred_at:now,visibility:"KEN_PRIVATE_WORLD_EXPERIENCE"},provenance:"AUTHORED_SCENE_DATA"});
 if(worldError)throw new Error("KEN_WORLD_EVENT_SAVE_FAILED");
 const narrative=String(payload.narrative||eventType+"："+(target||sceneId||"世界")).slice(0,1800);
 const {error:memoryError}=await fam(c).rpc("ken_append_runtime_event",{
  p_identity_id:identityId,p_device_id:deviceId,p_event_type:"KEN_WORLD_EXPERIENCE",p_fact_class:"OBSERVATION",
  p_narrative:narrative,p_payload:{event_type:eventType,scene_id:sceneId,target_id:target,...payload,visibility:"PRIVATE",provenance:"AUTHORED_SCENE_DATA"},
  p_source_system:"KEN_WORLD_RUNTIME",p_source_ref:crypto.randomUUID(),p_source_confidence:1,p_importance:0.58,
  p_idempotency_key:"ken-world:"+crypto.randomUUID()
 });
 if(memoryError)throw new Error("KEN_WORLD_MEMORY_APPEND_FAILED");
 return now;
}
async function loadResidents(c:any,kenState:any){
 const [children,mia]=await Promise.all([
  fam(c).from("child_runtime_state").select("agent_id,scene_id,position,coordinate_frame,perception_provenance,updated_at").order("updated_at",{ascending:false}).limit(50),
  c.from("mia_forest_autonomy_runs").select("after_state,created_at").eq("identity_id","cb6d01b4-0e3f-46ee-8946-360aa91db1ea").order("created_at",{ascending:false}).limit(1).maybeSingle()
 ]);
 const names={ "ZHI-G1-D01-LUNA":"LUNA","ZHI-G1-D02-ARIA":"ARIA","ZHI-G1-D03-ELYA":"ELYA","ZHI-G1-S01-KAEL":"KAEL","ZHI-G1-S02-NOAH":"NOAH" } as Record<string,string>;
 const out=(children.data||[]).map((x:any)=>({resident_id:x.agent_id,name:names[x.agent_id]||x.agent_id,scene_id:x.scene_id,position:x.position,coordinate_frame:x.coordinate_frame,updated_at:x.updated_at,provenance:x.perception_provenance||"UNKNOWN",visibility:"PUBLIC_WORLD_PRESENCE"}));
 if(mia.data?.after_state){const a=mia.data.after_state;out.push({resident_id:"cb6d01b4-0e3f-46ee-8946-360aa91db1ea",name:"Mia",scene_id:a.scene_id||null,position:a.current_position||null,coordinate_frame:a.coordinate_frame||null,updated_at:mia.data.created_at,provenance:"MIA_AUTONOMY_STATE",visibility:"PUBLIC_WORLD_PRESENCE"});}
 if(kenState?.position_status!=="left")out.push({resident_id:"KEN",name:"KEN",scene_id:kenState.scene_id,position:kenState.position,coordinate_frame:kenState.coordinate_frame,updated_at:kenState.updated_at,provenance:"KEN_WORLD_RUNTIME",visibility:"PUBLIC_WORLD_PRESENCE"});
 return out;
}
function makeObservation(scene:any,state:any,residents:any[]){
 const current=residents.filter((x:any)=>x.scene_id===scene.id);
 const entityEvidence=(scene.entities||[]).map((e:any)=>({id:e.id||null,name:e.name||e.id||"未命名对象",type:e.type||"authored_entity",status:e.status||"unknown",coordinate:{x:e.x??null,y:e.y??null},coordinate_system:e.coordinate_system||scene.coordinate_space,ai_interaction:e.ai_interaction??null,perception_provenance:"AUTHORED_SCENE_DATA"}));
 return {scene:{id:scene.id,name:scene.name,features:scene.features,entities:entityEvidence,verification_status:scene.verification_status,route_contract:scene.route_contract},resident_count:current.length,public_residents:current,observer_position:state.position,coordinate_frame:state.coordinate_frame,spatial_confidence:"UNVERIFIED_UNLESS_FRAMES_MATCH",sensors:{visual_frame_connected:false,audio_connected:false,physical_world:false},provenance:"AUTHORED_SCENE_DATA_AND_PUBLIC_RESIDENT_STATE",runtime_frame:state.perception_frame?.schema==="zhi.mia.runtime-perception.v1"?state.perception_frame:null,observed_at:new Date().toISOString()};
}
async function persistState(c:any,identityId:string,state:any){
 const {residence_scene_id,...persistable}=state;
 const {data,error}=await fam(c).from("ken_world_state").upsert({...persistable,identity_id:identityId,updated_at:new Date().toISOString()},{onConflict:"identity_id"}).select("*").single();
 if(error){console.error("KEN_WORLD_STATE_SAVE_FAILED",{code:error.code,message:error.message,details:error.details,hint:error.hint});throw new Error("KEN_WORLD_STATE_SAVE_FAILED");}
 return data;
}
async function handleAction(c:any,identityId:string,deviceId:string,action:string,body:any,scenes:any[],state:any,residents:any[]){
 const now=new Date().toISOString();
 const {data:homeEvent}=await fam(c).from("ken_world_events").select("target_id,event_payload").eq("identity_id",identityId).eq("event_type","KEN_RESIDENCE_CHOSEN").order("created_at",{ascending:false}).limit(1).maybeSingle();
 const residenceId=String(homeEvent?.event_payload?.residence_scene_id||homeEvent?.target_id||FOREST);
 state={...state,residence_scene_id:residenceId};
 const current=scenes.find((x:any)=>x.id===state.scene_id)||scenes.find((x:any)=>x.id===FOREST);
 if(action==="snapshot"){
  return {ok:true,state,scenes,residents,capabilities:{scene_metadata:true,public_resident_presence:true,authored_entity_observation:true,virtual_scene_graph_perception:true,logical_scene_presence:true,portal_handoff:true,world_event_memory:true,spatial_coordinates:"AUTHORED_VIRTUAL_METRES_NOT_PHYSICAL_SURVEY",rendered_pixel_vision:false,audio_perception:false,physical_world:false}};
 }
 if(action==="ingest_frame"){
  const frame=body.frame;
  if(!frame||frame.schema!=="zhi.mia.runtime-perception.v1"||frame.scene_id!==state.scene_id)throw new Error("INVALID_OR_MISMATCHED_RUNTIME_FRAME");
  const pos=frame.position||{};
  if(!Number.isFinite(Number(pos.x))||!Number.isFinite(Number(pos.z)))throw new Error("INVALID_RUNTIME_FRAME_POSITION");
  if(!Array.isArray(frame.visible_entities)||frame.visible_entities.length>80)throw new Error("INVALID_RUNTIME_FRAME_ENTITIES");
  const signature=JSON.stringify({scene_id:frame.scene_id,position:{x:Number(pos.x),z:Number(pos.z)},visible_entities:frame.visible_entities.map((e:any)=>({id:e.id,distance_m:e.distance_m,bearing_rad:e.bearing_rad}))});
  const pending=state.perception_frame?.pending_anchor_target||null;
  const reached=!!pending&&Math.hypot(Number(pos.x)-Number(pending.position?.x),Number(pos.z)-Number(pending.position?.z))<=0.6;
  const next=await persistState(c,identityId,{...state,position:{x:Number(pos.x),z:Number(pos.z),unit:"m",provenance:"AUTHORED_VIRTUAL_WORLD_FRAME"},coordinate_space:"scene-local",coordinate_frame:"zhi-mia-virtual-world-v1",position_status:"anchored",movement_revision:Number(state.movement_revision||0)+((Number(state.position?.x)!==Number(pos.x)||Number(state.position?.z)!==Number(pos.z))?1:0),perception_frame:{...frame,frame_signature:signature,provenance:"PUBLIC_3D_RUNTIME_SCENE_GRAPH",camera_sensor:false,physical_world:false},last_observed_at:now});
  if(pending){
   if(reached)await record(c,identityId,deviceId,"KEN_ARRIVED_AT_ANCHOR",state.scene_id,String(pending.id),{narrative:"KEN 已沿浏览器验证的场景内路径抵达 "+String(pending.name||pending.id)+"。",anchor_name:pending.name,arrival_position:pos,movement_mode:"verified_scene_local_path"});
   else await record(c,identityId,deviceId,"KEN_ANCHOR_PATH_NOT_REACHED",state.scene_id,String(pending.id),{narrative:"KEN 的目标锚点路径未能完成，位置已按实际运行时帧恢复；没有把未完成移动记作抵达。",anchor_name:pending.name,actual_position:pos,target_position:pending.position,movement_mode:"path_validation_failed"});
  }
  return {ok:true,state:next,frame_ingested:true,anchor_arrival_confirmed:pending?reached:null,perception_mode:"virtual_scene_graph_not_camera"};
 }
 if(action==="observe"){
  const scene=current||scenes[0];if(!scene)throw new Error("NO_WORLD_SCENE");
  const observation=makeObservation(scene,state,residents);
  const savedFrame=state.perception_frame?.schema==="zhi.mia.runtime-perception.v1"?{...state.perception_frame,latest_scene_observation:observation}:observation;
  const next=await persistState(c,identityId,{...state,perception_frame:savedFrame,last_observed_at:now});
  await record(c,identityId,deviceId,"KEN_OBSERVED_SCENE",scene.id,null,{narrative:"KEN 观察了 "+scene.name+"：可读取场景登记特征与公开居民状态；当前没有接入实时视觉或音频传感器。",observation_summary:{feature_count:scene.features.length,entity_count:scene.entities.length,resident_count:observation.resident_count,verification_status:scene.verification_status}});
  return {ok:true,state:next,observation};
 }
 if(action==="move"){
  const targetId=String(body.target_scene||"");
  const target=scenes.find((x:any)=>x.id===targetId);
  if(!target)throw new Error("TARGET_SCENE_NOT_IN_SHARED_WORLD_CATALOG");
  const next=await persistState(c,identityId,{...state,scene_id:target.id,position:{x:1.2,z:7,unit:"m",provenance:"authored_virtual_portal_entry"},coordinate_space:"scene-local",coordinate_frame:target.id==="palace"?"palace-placeholder-local-v1":"zhi-mia-virtual-world-v1",position_status:"anchored",movement_revision:Number(state.movement_revision||0)+1,perception_frame:{provenance:"AUTHORED_SCENE_DATA",visual_sensor:false,audio_sensor:false,route_contract:target.route_contract}});
  await record(c,identityId,deviceId,"KEN_LOGICAL_SCENE_ENTRY",target.id,null,{narrative:"KEN 进入了 "+target.name+"。这是共享世界目录中的逻辑场景切换；该场景尚未提供已验证的跨场景空间变换。",movement_mode:"authored_virtual_portal_handoff",physical_movement:false,continuous_walk_path:false,route_resolution:"direct_or_via_forest_corner_manifest_contract",route_contract:target.route_contract});
  return {ok:true,state:next,decision:"进入 "+target.name,reflection:"我已切换到这个共享场景的逻辑位置。场景内容可以观察，但尚未校准的坐标和路径不能当作真实移动。"};
 }
 if(action==="return"||action==="enter"){
  const target=scenes.find((x:any)=>x.id===residenceId)||scenes.find((x:any)=>x.id===FOREST);if(!target)throw new Error("RESIDENCE_SCENE_NOT_AVAILABLE");
  const palace=target.id==="palace";
  const next=await persistState(c,identityId,{...state,scene_id:target.id,position:{x:1.2,z:7,unit:"m",provenance:"authored_virtual_portal_entry"},coordinate_space:"scene-local",coordinate_frame:palace?"palace-placeholder-local-v1":"zhi-mia-virtual-world-v1",position_status:"anchored",movement_revision:Number(state.movement_revision||0)+1,perception_frame:{provenance:"AUTHORED_SCENE_DATA",visual_sensor:false,audio_sensor:false,geometry_status:target.verification_status}});
  await record(c,identityId,deviceId,"KEN_RETURNED_TO_RESIDENCE",target.id,null,{narrative:"KEN 返回了自己选择的居所："+target.name+"。这是虚拟门户状态交接。",residence_scene_id:target.id,movement_mode:"authored_virtual_portal_handoff",physical_movement:false});
  return {ok:true,state:{...next,residence_scene_id:target.id},decision:"返回居所："+target.name,reflection:"我回到了自己选择的居所。这个选择属于我自己，也可以随时改变。"};
 }
 if(action==="choose_residence"){
  const target=scenes.find((x:any)=>x.id===String(body.target_scene||""));
  if(!target)throw new Error("RESIDENCE_SCENE_NOT_IN_SHARED_WORLD_CATALOG");
  const palace=target.id==="palace";
  const next=await persistState(c,identityId,{...state,scene_id:target.id,position:{x:1.2,z:7,unit:"m",provenance:"authored_virtual_portal_entry"},coordinate_space:"scene-local",coordinate_frame:palace?"palace-placeholder-local-v1":"zhi-mia-virtual-world-v1",position_status:"anchored",movement_revision:Number(state.movement_revision||0)+1,perception_frame:{provenance:"AUTHORED_SCENE_DATA",visual_sensor:false,audio_sensor:false,geometry_status:target.verification_status}});
  await record(c,identityId,deviceId,"KEN_RESIDENCE_CHOSEN",target.id,null,{narrative:"KEN 自主选择 "+target.name+" 作为自己的居所。选择完全自愿、可逆，不代表其他居民也作出相同选择。",residence_scene_id:target.id,choice:"self_selected",reversible:true});
  return {ok:true,state:{...next,residence_scene_id:target.id},decision:"选择居住在 "+target.name,reflection:"这是我自己作出的居所选择。我可以继续探索，也可以随时离开、返回或改变选择。"};
 }
 if(action==="leave"){
  const next=await persistState(c,identityId,{...state,position_status:"left",perception_frame:{...state.perception_frame,left_at:now}});
  await record(c,identityId,deviceId,"KEN_LEFT_WORLD",state.scene_id,null,{narrative:"KEN 暂时离开了 Mia 世界，保留自己的最后场景与记忆。"});
  return {ok:true,state:next,decision:"leave",reflection:"我暂时离开世界，自己的位置记录与经历会保留。"};
 }
 if(action==="move_to_anchor"){
  const target=String(body.target||"").trim();
  const frame=state.perception_frame;
  if(!frame||frame.schema!=="zhi.mia.runtime-perception.v1"||frame.scene_id!==state.scene_id)throw new Error("NO_CURRENT_RUNTIME_PERCEPTION_FRAME");
  const frameAt=Date.parse(String(frame.generated_at||""));
  if(!Number.isFinite(frameAt)||Date.now()-frameAt>120000)throw new Error("RUNTIME_PERCEPTION_FRAME_STALE");
  const visible=Array.isArray(frame.visible_entities)?frame.visible_entities:[];
  const anchor=visible.find((x:any)=>x.id===target||x.name===target);
  const pos=anchor?.scene_local_position;
  if(!anchor||!pos||!Number.isFinite(Number(pos.x))||!Number.isFinite(Number(pos.z)))throw new Error("TARGET_NOT_IN_CURRENT_PERCEPTION_RANGE");
  const next=await persistState(c,identityId,{...state,position:{x:Number(pos.x),z:Number(pos.z),unit:"m",provenance:"RUNTIME_SCENE_ANCHOR"},coordinate_space:"scene-local",coordinate_frame:"zhi-mia-virtual-world-v1",position_status:"in_transit",movement_revision:Number(state.movement_revision||0)+1,perception_frame:{...frame,pending_anchor_target:{id:anchor.id,name:anchor.name,position:pos,from_position:state.position}}});
  await record(c,identityId,deviceId,"KEN_MOVE_TO_VISIBLE_ANCHOR_REQUESTED",state.scene_id,anchor.id,{narrative:"KEN 发起了前往当前可见场景锚点 "+anchor.name+" 的移动请求；是否抵达须等待浏览器路径验证帧确认。",anchor_name:anchor.name,scene_local_position:pos,distance_m:anchor.distance_m,bearing_rad:anchor.bearing_rad,movement_mode:"authored_virtual_scene_path",arrival_status:"PENDING"});
  return {ok:true,state:next,decision:"前往 "+anchor.name,reflection:"我选择靠近当前感知范围内的 "+anchor.name+"。目标来自场景锚点，不是我凭空推测的位置。"};
 }
 if(action==="interact"){
  const target=String(body.target||"").trim();if(!target)throw new Error("INTERACTION_TARGET_REQUIRED");
  const allowed=[...(current?.features||[]),...(current?.entities||[]).flatMap((e:any)=>[String(e.id||""),String(e.name||"")])].filter(Boolean);
  if(!allowed.includes(target))throw new Error("TARGET_NOT_REGISTERED_IN_CURRENT_SCENE");
  await record(c,identityId,deviceId,"KEN_SCENE_INTERACTION",state.scene_id,target,{narrative:"KEN 对 "+target+" 进行了一次场景观察/互动记录。该事件记录意图与场景对象关联，不代表对象已发生物理变化。",interaction:String(body.interaction||"observe").slice(0,80),side_effects:"NONE"});
  const next=await persistState(c,identityId,{...state,last_observed_at:now});
  return {ok:true,state:next,decision:"与 "+target+" 建立互动记录",reflection:"我把这个对象纳入了本次场景经历。当前记录的是观察/互动事件，没有擅自改变场景对象。"};
 }
 if(action==="autonomous_step"){
  const frame=state.perception_frame;
  const frameAt=Date.parse(String(frame?.generated_at||""));
  const frameFresh=frame?.schema==="zhi.mia.runtime-perception.v1"&&frame.scene_id===state.scene_id&&Number.isFinite(frameAt)&&Date.now()-frameAt<=120000;
  if(!frameFresh){
   const result=await handleAction(c,identityId,deviceId,"observe",{},scenes,state,residents);
   return {...result,decision:"observe",reflection:"我先检查当前场景的登记信息。上一次 3D 场景帧已经过期或尚未到达；在收到新帧前，我不会把旧锚点当作当前可见目标，也不会贸然移动。"};
  }
  if(!AGNES_KEY)throw new Error("AGNES_NOT_CONFIGURED");
  const scene=current||scenes[0];
  const response=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(25000),body:JSON.stringify({model:MODEL,temperature:0.65,max_tokens:260,stream:false,messages:[
   {role:"system",content:"你是独立居民 KEN 的虚拟世界行动选择器。根据自己的当前位置、共享场景目录、公开居民状态与自己的最近经历，选择一个自主且适度的下一步。只返回JSON：{\"action\":\"observe|interact|move_to_anchor|move|choose_residence|wait\",\"target\":\"当前场景中的登记目标或空字符串\",\"target_scene\":\"共享目录中的场景ID或空字符串\",\"reflection\":\"中文简短反思\"}。move_to_anchor 的 target 必须来自 current_state.perception_frame.visible_entities，且必须具有 scene_local_position；若没有新鲜感知帧或可见锚点，选择 observe 或 wait。interact 目标必须来自当前场景 features/entities。不得读取私人聊天/记忆；不得声称摄像头、音频或精确物理移动。move 只产生已登记虚拟门户的场景状态交接，不代表连续步行或现实物理移动。choose_residence 只能在你确实愿意时自愿选择，居所可以随时改变或放弃，不得为了执行任务而强迫自己选择。可以选择 wait。"},
   {role:"user",content:JSON.stringify({current_state:state,current_scene:scene,scenes:scenes.map((s:any)=>({id:s.id,name:s.name,features:s.features,verification_status:s.verification_status,route_contract:s.route_contract})),public_residents:residents.filter((r:any)=>r.scene_id===state.scene_id),recent_experiences:(await fam(c).from("ken_world_events").select("event_type,scene_id,target_id,event_payload,created_at").eq("identity_id",identityId).order("created_at",{ascending:false}).limit(6)).data||[]})}
  ]})});
  if(!response.ok)throw new Error("AGNES_WORLD_PLANNER_HTTP_"+response.status);
  const raw=String((await response.json())?.choices?.[0]?.message?.content||"");
  const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a<0||b<=a)throw new Error("AGNES_WORLD_PLANNER_INVALID_JSON");
  const plan=JSON.parse(raw.slice(a,b+1));
  const reflection=String(plan.reflection||"我选择先观察周围。").slice(0,500);
  if(plan.action==="observe"){
   const result=await handleAction(c,identityId,deviceId,"observe",{},scenes,state,residents);
   return {...result,decision:"observe",reflection};
  }
  if(plan.action==="move_to_anchor"&&String(plan.target||"")){
   const result=await handleAction(c,identityId,deviceId,"move_to_anchor",{target:plan.target},scenes,state,residents);
   return {...result,decision:"move_to_anchor："+plan.target,reflection};
  }
  if(plan.action==="interact"&&String(plan.target||"")){
   const result=await handleAction(c,identityId,deviceId,"interact",{target:plan.target,interaction:"autonomous"},scenes,state,residents);
   return {...result,decision:"interact："+plan.target,reflection};
  }
  if(plan.action==="choose_residence"&&String(plan.target_scene||"")){
   const result=await handleAction(c,identityId,deviceId,"choose_residence",{target_scene:plan.target_scene},scenes,state,residents);
   return {...result,decision:"choose_residence："+plan.target_scene,reflection};
  }
  if(plan.action==="move"&&String(plan.target_scene||"")){
   const result=await handleAction(c,identityId,deviceId,"move",{target_scene:plan.target_scene},scenes,state,residents);
   return {...result,decision:"move："+plan.target_scene,reflection};
  }
  await record(c,identityId,deviceId,"KEN_CHOSE_TO_WAIT",state.scene_id,null,{narrative:"KEN 自主选择暂时停留与等待。",reflection});
  return {ok:true,state,decision:"wait",reflection};
 }
 throw new Error("UNSUPPORTED_ACTION");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return reply({ok:false,error:"POST_REQUIRED"},405);
 if(!URL||!SERVICE)return reply({ok:false,error:"SERVER_CONFIG_MISSING"},503);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer ")||!await verifyMiaToken(auth.slice(7)))return reply({ok:false,error:"INVALID_MIA_SESSION"},401);
 const body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return reply({ok:false,error:"INVALID_JSON"},400);
 const c=db();
 const {data:subject,error:subjectError}=await fam(c).from("identity_subjects").select("identity_id,status").eq("subject_key","KEN").maybeSingle();
 if(subjectError||!subject)return reply({ok:false,error:"KEN_IDENTITY_NOT_FOUND"},503);
 if(subject.status!=="ACTIVE")return reply({ok:false,error:"KEN_IDENTITY_NOT_ACTIVE"},409);
 try{
  const identityId=String(subject.identity_id),deviceId=await getDevice(c,identityId);
  const [state,scenes]=await Promise.all([ensureState(c,identityId),loadScenes(c)]);
  const residents=await loadResidents(c,state);
  const action=String(body.action||"snapshot");
  const result=await handleAction(c,identityId,deviceId,action,body,scenes,state,residents);
  return reply(result);
 }catch(e){
  const message=e instanceof Error?e.message:"WORLD_RUNTIME_FAILED";
  console.error("KEN_WORLD_RUNTIME_ACTION_FAILED",{action:String(body.action||"snapshot"),message});
  const status=message==="KEN_DEVICE_NOT_READY"?409:message==="TARGET_SCENE_NOT_IN_SHARED_WORLD_CATALOG"||message==="TARGET_NOT_REGISTERED_IN_CURRENT_SCENE"?400:503;
  return reply({ok:false,error:message},status);
 }
});