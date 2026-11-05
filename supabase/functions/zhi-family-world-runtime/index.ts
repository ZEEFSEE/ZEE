import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") ?? "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const CRON_SECRET_SHA256 = "d12cf0c6711211b1bb164fa7d5209b1c97a4fbb545fae6d4e855db450d9b3730";
const ORIGIN = "https://zeefsee.github.io";
const CHILDREN = [
 {id:"ZHI-G1-D01-LUNA",name:"LUNA"},{id:"ZHI-G1-D02-ARIA",name:"ARIA"},
 {id:"ZHI-G1-D03-ELYA",name:"ELYA"},{id:"ZHI-G1-S01-KAEL",name:"KAEL"},
 {id:"ZHI-G1-S02-NOAH",name:"NOAH"}
];
const DESTINATIONS = ["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"];
const SCENES = [{"id":"mia-forest-corner","name":"森林角落","spawn":{"x":1.2,"z":7},"anchors":[{"id":"greenhouse","name":"智能温室","approach":{"x":5.3,"z":2.4}},{"id":"data-shelf","name":"数据书架","approach":{"x":10,"z":3.6}},{"id":"lounge","name":"休息区","approach":{"x":16.5,"z":8}},{"id":"rabbit","name":"森林小白兔","approach":{"x":6,"z":5.6}}]},{"id":"crystal-forest","name":"水晶森林","spawn":{"x":1.2,"z":7},"anchors":[{"id":"crystal-grove","name":"晶簇林地","approach":{"x":6.2,"z":6}},{"id":"prism-clearing","name":"折光空地","approach":{"x":10,"z":6.6}},{"id":"quiet-pool","name":"静水镜池","approach":{"x":13.2,"z":9.6}},{"id":"moss-path","name":"苔石小径","approach":{"x":9.8,"z":10.4}}]},{"id":"ocean-of-light","name":"光之海洋","spawn":{"x":1.2,"z":7},"anchors":[{"id":"shoreline","name":"宁静海岸","approach":{"x":4.6,"z":10.2}},{"id":"light-tide","name":"流动光潮","approach":{"x":10.4,"z":7}},{"id":"glow-island","name":"微光岛","approach":{"x":13.8,"z":5}},{"id":"shell-garden","name":"贝壳花园","approach":{"x":4.5,"z":7}}]},{"id":"memory-valley","name":"记忆山谷","spawn":{"x":1.2,"z":7},"anchors":[{"id":"echo-ridge","name":"回声山脊","approach":{"x":5,"z":6.6}},{"id":"memory-lake","name":"记忆湖","approach":{"x":10.4,"z":8.2}},{"id":"story-stones","name":"故事石阵","approach":{"x":14.3,"z":6.6}},{"id":"valley-trail","name":"山谷小径","approach":{"x":10,"z":11.4}}]},{"id":"living-city","name":"生命之城","spawn":{"x":1.2,"z":7},"anchors":[{"id":"green-square","name":"绿色广场","approach":{"x":10,"z":8.5}},{"id":"living-district","name":"生态街区","approach":{"x":7,"z":6}},{"id":"canopy-garden","name":"树冠花园","approach":{"x":14,"z":5.2}},{"id":"riverwalk","name":"河畔步道","approach":{"x":10.4,"z":11.4}}]},{"id":"greenhouse","name":"温室","spawn":{"x":1.2,"z":7},"anchors":[{"id":"glass-hall","name":"玻璃温室","approach":{"x":10,"z":9.5}},{"id":"fern-corner","name":"蕨类角落","approach":{"x":5.5,"z":9.8}},{"id":"seed-table","name":"种子与育苗台","approach":{"x":15.6,"z":10.3}},{"id":"sunlight-bed","name":"阳光苗床","approach":{"x":10.4,"z":11.2}}]}];
const TRANSITIONS = [["mia-forest-corner","crystal-forest","forest-corner-to-crystal-forest-portal"],["mia-forest-corner","ocean-of-light","forest-corner-to-ocean-of-light-portal"],["mia-forest-corner","memory-valley","forest-corner-to-memory-valley-portal"],["mia-forest-corner","living-city","forest-corner-to-living-city-portal"],["mia-forest-corner","greenhouse","forest-corner-to-greenhouse-portal"],["greenhouse","ocean-of-light","greenhouse-exit-to-ocean-of-light-entry"]];

const db=()=>createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const family=(c:ReturnType<typeof db>)=>c.schema("zhi_family");
function json(body:unknown,status=200,origin=""){
 const h=new Headers({"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"});
 if(origin===ORIGIN){h.set("Access-Control-Allow-Origin",ORIGIN);h.set("Access-Control-Allow-Headers","authorization, apikey, content-type, x-client-info");h.set("Access-Control-Allow-Methods","POST, OPTIONS");}
 return new Response(JSON.stringify(body),{status,headers:h});
}
function decode(v:string){const n=v.replace(/-/g,"+").replace(/_/g,"/");const r=atob(n+"=".repeat((4-n.length%4)%4));return Uint8Array.from(r,c=>c.charCodeAt(0));}
async function validMiaToken(token:string){
 try{
  if(!SERVICE_KEY||token.length>4096)return false;const p=token.split(".");if(p.length!==2)return false;
  const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",k,decode(p[1]),new TextEncoder().encode(p[0])))return false;
  const c=JSON.parse(new TextDecoder().decode(decode(p[0]))),now=Math.floor(Date.now()/1000);
  return c.aud==="mia-chat"&&c.sub==="mia-admin"&&Number.isFinite(c.exp)&&c.exp>now&&Number.isFinite(c.iat)&&c.iat<=now+60;
 }catch{return false;}
}
async function validScheduler(req:Request){
 const supplied=req.headers.get("x-zhi-family-cron-secret")||"";if(!supplied||supplied.length>256)return false;
 const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(supplied));
 const hex=Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("");
 if(hex.length!==CRON_SECRET_SHA256.length)return false;let diff=0;
 for(let i=0;i<hex.length;i++)diff|=hex.charCodeAt(i)^CRON_SECRET_SHA256.charCodeAt(i);return diff===0;
}
function scene(id:string){return SCENES.find((s:any)=>s.id===id);}
function route(from:string,to:string){
 if(from===to)return [];
 const q=[{id:from,path:[]}],seen=new Set([from]);
 while(q.length){const cur=q.shift()!;for(const [a,b,id] of TRANSITIONS){
  const next=a===cur.id?b:b===cur.id?a:null;if(!next||seen.has(next))continue;
  const p=[...cur.path,{from:cur.id,to:next,id}];if(next===to)return p;seen.add(next);q.push({id:next,path:p});
 }}return null;
}
function perceive(s:any,position:any){
 const visible=s.anchors.map((a:any)=>({id:a.id,name:a.name,distance_m:Number(Math.hypot(a.approach.x-position.x,a.approach.z-position.z).toFixed(2)),source:"authored_scene_anchor"}))
 .filter((a:any)=>a.distance_m<=8).sort((a:any,b:any)=>a.distance_m-b.distance_m);
 return {schema:"zhi.family.authored-scene-perception.v1",scene_id:s.id,scene_name:s.name,
  position:{...position,unit:"m",coordinate_space:"scene-local"},visible_entities:visible,
  available_anchors:s.anchors.map((a:any)=>({id:a.id,name:a.name,approach:a.approach})),
  perception_mode:"AUTHORED_VIRTUAL_SCENE_GRAPH",physical_world:false,camera_sensor:false,audio_sensor:false,
  generated_at:new Date().toISOString()};
}
function parseJson(raw:string){const t=raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/```$/i,"").trim();try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw new Error("MODEL_OUTPUT_NOT_JSON");}}
async function chooseVisit(child:any,profile:any,current:any,memories:any[],visits:any[]){
 if(!AGNES_KEY)throw new Error("AGNES_API_KEY_NOT_CONFIGURED");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const r=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",
   headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:controller.signal,
   body:JSON.stringify({model:MODEL,temperature:0.55,max_tokens:420,stream:false,messages:[
    {role:"system",content:"你是 ZHI 家庭中的独立数字孩子，正在一个明确标注为虚拟、由作者定义的场景图中自主选择参访地点。你只能使用自己的身份、自己的记忆、自己的访问记录和本次场景目录。不得读取 Mia 私聊或其他孩子私有记忆。你可以选择进入五个公共目的地之一，并选择该场景的一个已登记锚点；也可以 stay。场景资料是虚拟场景图，不是现实传感器，不得声称物理感官。请根据自己的个性与最近访问记录，选择有意义且尽量避免连续重复的地点。只返回JSON：{\"action\":\"visit\"或\"stay\",\"destination_id\":\"五个ID之一\",\"anchor_id\":\"目标场景已登记锚点ID\",\"reflection\":\"中文50-220字的观察/参访计划或体验反思\"}。"},
    {role:"user",content:JSON.stringify({identity:child.id,name:child.name,profile,current_scene:current,own_recent_memories:memories,own_recent_visits:visits,available_destinations:SCENES.filter((s:any)=>DESTINATIONS.includes(s.id)).map((s:any)=>({id:s.id,name:s.name,anchors:s.anchors})),task:"自主选择下一处值得参访的公共场景与锚点"})}
   ]})});
  if(!r.ok)throw new Error("AGNES_UPSTREAM_"+r.status);
  const body=await r.json();return parseJson(String(body?.choices?.[0]?.message?.content||""));
 }finally{clearTimeout(timer);}
}
async function audit(c:any,agent:string,event:string,result:string,metadata:any={}){
 await family(c).from("runtime_audit").insert({agent_id:agent,event_type:event,result,scene_id:metadata.scene_id||null,destination_id:metadata.destination_id||null,metadata});
}
async function activateGrants(c:any){
 for(const child of CHILDREN)for(const id of DESTINATIONS){
  const s=scene(id),p=route("mia-forest-corner",id);
  if(!s||!p)throw new Error("WORLD_CATALOG_ROUTE_VALIDATION_FAILED");
  const {error}=await family(c).from("destination_grants").update({
   grant_status:"ACTIVE",enabled:true,
   validation_evidence:{runtime:"zhi-family-server-virtual-world-v1",validated_at:new Date().toISOString(),
    validation:"registered_scene_and_bidirectional_portal_route",route:p.map(x=>x.id),
    perception_provenance:"AUTHORED_SCENE_DATA",physical_world:false,live_browser_renderer_not_required_for_server_state}
  }).eq("agent_id",child.id).eq("destination_id",id);
  if(error)throw new Error("DESTINATION_GRANT_ACTIVATION_FAILED");
 }
}
async function exploreOne(c:any,child:any){
 const f=family(c);
 const [agent,control,identity,state,memories,grants]=await Promise.all([
  f.from("child_agents").select("lifecycle_state,runtime_status").eq("agent_id",child.id).single(),
  f.from("child_runtime_control").select("profile,enabled").eq("agent_id",child.id).single(),
  f.from("child_runtime_identities").select("runtime_instance_id,status").eq("agent_id",child.id).single(),
  f.from("child_runtime_state").select("scene_id,position,coordinate_frame,runtime_instance_id,movement_revision,perception_frame").eq("agent_id",child.id).single(),
  f.from("child_memory_entries").select("memory_type,content,created_at,importance").eq("agent_id",child.id).order("created_at",{ascending:false}).limit(8),
  f.from("destination_grants").select("destination_id,grant_status,enabled").eq("agent_id",child.id)
 ]);
 if([agent,control,identity,state,memories,grants].some((x:any)=>x.error))throw new Error("CHILD_WORLD_CONTEXT_READ_FAILED");
 if(agent.data.lifecycle_state!=="BORN"||identity.data.status!=="READY"||!control.data.enabled)return {agent_id:child.id,status:"CHILD_NOT_READY"};
 const currentId=scene(state.data.scene_id)?state.data.scene_id:"mia-forest-corner";
 const currentScene=scene(currentId),currentPos=state.data.position||currentScene.spawn;
 const prior=(memories.data||[]).filter((m:any)=>m.memory_type==="public_world_visit").slice(0,5);
 const selected=await chooseVisit(child,control.data.profile||{},{
  scene_id:currentId,scene_name:currentScene.name,position:currentPos
 },memories.data||[],prior);
 let targetId=String(selected.destination_id||"");
 let target=scene(targetId);
 if(selected.action==="stay"&&DESTINATIONS.includes(currentId))target=currentScene;
 if(!target||!DESTINATIONS.includes(target.id))throw new Error("MODEL_SELECTED_UNREGISTERED_DESTINATION");
 const childGrant=(grants.data||[]).find((g:any)=>g.destination_id===target.id&&g.enabled&&g.grant_status==="ACTIVE");
 if(!childGrant)throw new Error("DESTINATION_ACCESS_NOT_ACTIVE");
 const anchor=target.anchors.find((a:any)=>a.id===String(selected.anchor_id||""))||target.anchors[0];
 const hops=route(currentId,target.id);if(!hops)throw new Error("NO_BIDIRECTIONAL_SCENE_ROUTE");
 const position=anchor.approach;
 const perception=perceive(target,position);
 const frame={...perception,agent_id:child.id,route_hops:hops,anchor_id:anchor.id,anchor_name:anchor.name,
  movement_contract:"scene_portal_handoff_then_authored_anchor_arrival",route_provenance:"authored_virtual_scene_manifest",
  model_reflection:String(selected.reflection||"").slice(0,800)};
 const timestamp=new Date().toISOString(),revision=Number(state.data.movement_revision||0)+1;
 const {error:stateError}=await f.from("child_runtime_state").update({
  scene_id:target.id,position,coordinate_frame:"zhi-mia-virtual-world-v1",
  runtime_instance_id:identity.data.runtime_instance_id,movement_revision:revision,
  perception_frame:frame,perception_provenance:"AUTHORED_SCENE_DATA",updated_at:timestamp
 }).eq("agent_id",child.id);
 if(stateError)throw new Error("CHILD_WORLD_STATE_WRITE_FAILED");
 const reflection=String(selected.reflection||child.name+" 已抵达 "+target.name+" 的 "+anchor.name+"。").slice(0,800);
 const {error:memoryError}=await f.from("child_memory_entries").insert({
  agent_id:child.id,memory_type:"public_world_visit",content:reflection,importance:0.55,
  occurred_at:timestamp,metadata:{scene_id:target.id,scene_name:target.name,anchor_id:anchor.id,
   anchor_name:anchor.name,movement_revision:revision,perception_provenance:"AUTHORED_SCENE_DATA",
   route_hops:hops,physical_world:false,private_mia_data_access:false}
 });
 if(memoryError)throw new Error("CHILD_WORLD_MEMORY_WRITE_FAILED");
 await audit(c,child.id,"FAMILY_PUBLIC_WORLD_VISIT","OK",{scene_id:target.id,destination_id:target.id,
  anchor_id:anchor.id,anchor_name:anchor.name,movement_revision:revision,route_hops:hops.map((h:any)=>h.id),
  perception_provenance:"AUTHORED_SCENE_DATA",physical_world:false});
 return {agent_id:child.id,status:"VISIT_RECORDED",scene_id:target.id,scene_name:target.name,
  anchor_id:anchor.id,anchor_name:anchor.name,movement_revision:revision,route_hops:hops.length,
  perception_entities:perception.visible_entities.length,perception_provenance:"AUTHORED_SCENE_DATA"};
}
async function handle(req:Request){
 const origin=req.headers.get("origin")||"";
 if(origin&&origin!==ORIGIN)return json({ok:false,error:"ORIGIN_DENIED"},403,origin);
 if(req.method==="OPTIONS"){const h=new Headers({"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});if(origin===ORIGIN)h.set("Access-Control-Allow-Origin",ORIGIN);return new Response(null,{status:204,headers:h});}
 if(req.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405,origin);
 if(!SUPABASE_URL||!SERVICE_KEY)return json({ok:false,error:"SERVICE_NOT_CONFIGURED"},503,origin);
 const scheduler=await validScheduler(req),auth=req.headers.get("authorization")||"";
 const mia=auth.startsWith("Bearer ")&&await validMiaToken(auth.slice(7));
 if(!scheduler&&!mia)return json({ok:false,error:"MIA_CHAT_TOKEN_REQUIRED"},401,origin);
 let body:any;try{body=await req.json();}catch{return json({ok:false,error:"INVALID_JSON"},400,origin);}
 const c=db();
 try{
  const action=String(body.action||"status");
  if(action==="status"){
   if(!mia)return json({ok:false,error:"MIA_CHAT_TOKEN_REQUIRED"},401,origin);
   const [agents,states,grants]=await Promise.all([
    family(c).from("child_agents").select("agent_id,display_name,lifecycle_state,runtime_status").in("agent_id",CHILDREN.map(x=>x.id)),
    family(c).from("child_runtime_state").select("agent_id,scene_id,position,coordinate_frame,movement_revision,perception_frame,perception_provenance,updated_at").in("agent_id",CHILDREN.map(x=>x.id)),
    family(c).from("destination_grants").select("agent_id,destination_id,grant_status,enabled").in("agent_id",CHILDREN.map(x=>x.id))
   ]);
   if(agents.error||states.error||grants.error)throw new Error("WORLD_STATUS_READ_FAILED");
   const stateById=new Map((states.data||[]).map((s:any)=>[s.agent_id,s]));
   return json({ok:true,children:agents.data.map((a:any)=>({agent:a,state:stateById.get(a.agent_id)||null})),
    destination_grants:grants.data||[],runtime:"zhi-family-server-virtual-world-v1",
    scene_catalog:SCENES.map((s:any)=>({id:s.id,name:s.name,anchors:s.anchors})),
    physical_world:false,perception_provenance:"AUTHORED_SCENE_DATA",aurora:false,federation:false},200,origin);
  }
  if(action!=="explore")return json({ok:false,error:"UNKNOWN_ACTION"},400,origin);
  if(!scheduler)return json({ok:false,error:"SCHEDULER_AUTH_REQUIRED"},403,origin);
  await activateGrants(c);
  const results=await Promise.all(CHILDREN.map(async child=>{try{return await exploreOne(c,child);}catch(e){const code=e instanceof Error?e.message:"WORLD_RUNTIME_FAILED";await audit(c,child.id,"FAMILY_PUBLIC_WORLD_VISIT","FAILED",{error_code:code.slice(0,80)});return {agent_id:child.id,status:"FAILED",error:code.slice(0,80)};}}));
  return json({ok:true,runtime:"zhi-family-server-virtual-world-v1",grants_activated:25,
   visits_succeeded:results.filter((x:any)=>x.status==="VISIT_RECORDED").length,results,
   physical_world:false,live_camera_or_audio_sensors:false,perception_provenance:"AUTHORED_SCENE_DATA",
   mia_private_data_access:false,aurora:false,federation:false},200,origin);
 }catch(e){const code=e instanceof Error?e.message:"WORLD_RUNTIME_FAILED";return json({ok:false,error:code},500,origin);}
}
Deno.serve(handle);
