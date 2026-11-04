import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AGNES = Deno.env.get("AGNES_API_KEY") || "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const MIA = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const FOREST = "mia-forest-corner";
const DESTINATIONS = ["crystal-forest","ocean-of-light","memory-valley","living-city","greenhouse"];
const H = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-mia-cron-secret","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply = (v:unknown,s=200) => new Response(JSON.stringify(v),{status:s,headers:H});

export function safeFallback(s:any) {
  if (s.session_status !== "active") return {action:"enter",reason:"Safe fallback: enter the registered Forest_Corner scene."};
  const lastAt = Date.parse(String(s.environment_state?.last_interaction?.occurred_at || ""));
  if (!Number.isFinite(lastAt) || Date.now() - lastAt > 2 * 60 * 60 * 1000) return {action:"interact",behavior:"observe_greenhouse",target:"greenhouse",reason:"Safe fallback: make one quiet local observation after a long rest interval."};
  return {action:"wait",reason:"Preserve the current state without forcing activity."};
}
export function applyAction(input:any, plan:any, at:string) {
  const s = JSON.parse(JSON.stringify(input));
  const allowed = ["wait","enter","interact","leave","travel"];
  let action = allowed.includes(String(plan?.action)) ? String(plan.action) : "wait";
  let reason = String(plan?.reason || "No planner explanation.").slice(0,500);
  let blocked = false;
  if (action === "travel") {
    action = "wait"; blocked = true;
    reason = "Cross-scene travel blocked: world transforms and a physical scene runtime are not verified.";
  } else if (action === "enter" && s.session_status !== "active") {
    s.session_status = "active"; s.position_status = "anchored";
  } else if (action === "leave" && s.session_status === "active") {
    s.session_status = "left";
  } else if (action === "interact" && s.session_status === "active") {
    const behaviors = ["observe_greenhouse","rest","listen","observe_rabbit","inspect_data_shelf"];
    const behavior = behaviors.includes(plan?.behavior) ? plan.behavior : "observe_greenhouse";
    const targets = ["greenhouse","data-shelf","lounge","forest-rabbit","tiny-planet-friends-glb"];
    const target = targets.includes(plan?.target) ? plan.target : (behavior === "observe_rabbit" ? "forest-rabbit" : behavior === "inspect_data_shelf" ? "data-shelf" : behavior === "rest" || behavior === "listen" ? "lounge" : "greenhouse");
    s.environment_state = s.environment_state || {entities:[]};
    s.environment_state.last_interaction = {target,behavior,occurred_at:at,source:"semantic_headless_runtime"};
    s.last_interaction_sequence = Number(s.sequence || 0) + 1;
  } else if (action !== "wait") {
    action = "wait"; blocked = true;
    reason = "Action incompatible with the current session state; position preserved.";
  }
  s.sequence = Number(s.sequence || 0) + 1;
  s.last_action = action;
  return {state:s,action,reason,blocked};
}
function seed(forest:any) {
  const entities = Array.isArray(forest.scene_data?.entities) ? forest.scene_data.entities.map((e:any)=>String(e.id||"")).filter(Boolean) : [];
  return {
    world_id:"50b06c01-060d-49fa-8988-8f38c13406d7",scene_id:FOREST,sequence:0,
    session_status:"left",current_node_id:"lounge",position_status:"anchored",
    current_position:{x:800,y:350,z:null,frame:"forest-corner-local-v1"},
    coordinate_space:"scene-local",coordinate_frame:"Forest_Corner local layout",
    world_transform:null,world_transform_status:"uncalibrated",
    runtime_instance_id:"forest-corner-headless-v1",
    route:[{x:0,y:350,node_id:"entry"},{x:160,y:350,node_id:"stone-path-waypoint-01"},{x:320,y:350,node_id:"stone-path-waypoint-02"},{x:480,y:350,node_id:"stone-path-waypoint-03"},{x:640,y:350,node_id:"stone-path-waypoint-04"},{x:800,y:350,node_id:"lounge"}],
    environment_state:{entities}
  };
}
async function planWithAgnes(state:any, scenes:any[]) {
  if (!AGNES) throw new Error("AGNES_API_KEY missing");
  const ctl = new AbortController(); const timer = setTimeout(()=>ctl.abort(),30000);
  try {
    const r = await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+AGNES,"Content-Type":"application/json"},signal:ctl.signal,body:JSON.stringify({
      model:MODEL,temperature:0.3,max_tokens:300,
      messages:[
        {role:"system",content:"你是原型 Mia 的低压力场景自主规划器。只输出 JSON：action, behavior, target, reason。action 仅可为 wait/enter/interact/leave/travel；behavior 仅可为 observe_greenhouse/rest/listen/observe_rabbit/inspect_data_shelf。等待是有效选择，不要强迫重复活动。只可执行 Forest_Corner 本地语义场景行为。五个公共目的地只是登记数据，没有经过校准的世界变换、碰撞、导航或真实场景切换器；不得执行 travel。不得声称真实视觉、感官或物理移动。"},
        {role:"user",content:JSON.stringify({state,destinations:scenes.filter((x:any)=>DESTINATIONS.includes(x.slug)).map((x:any)=>({slug:x.slug,name:x.name,verification:x.scene_data?.verification_status}))})}
      ]
    })});
    if(!r.ok) throw new Error("AGNES HTTP "+r.status);
    const text=(await r.json())?.choices?.[0]?.message?.content;
    const match=typeof text==="string"?text.match(/\{[\s\S]*\}/):null;
    if(!match) throw new Error("AGNES JSON missing");
    return JSON.parse(match[0]);
  } finally { clearTimeout(timer); }
}
async function handler(req:Request) {
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:H});
  if(req.method!=="POST") return reply({ok:false,error:"POST required"},405);
  if(!URL||!KEY) return reply({ok:false,error:"Runtime configuration missing"},503);
  const secret=req.headers.get("x-mia-cron-secret")||"";
  if(!secret) return reply({ok:false,error:"Unauthorized"},401);
  const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.rpc("mia_forest_cron_secret_matches",{p_secret:secret});
  if(auth.error||auth.data!==true) return reply({ok:false,error:"Unauthorized"},401);
  let body:any={}; try{body=await req.json();}catch{}
  const trigger=String(body.trigger||"scheduled");
  const control=await db.from("mia_forest_autonomy_control").select("enabled").eq("singleton",true).maybeSingle();
  if(control.error) return reply({ok:false,error:"Control read failed"},500);
  if(!control.data?.enabled) return reply({ok:true,skipped:"autonomy_disabled"},423);
  if(trigger==="scheduled"){
    const claim=await db.rpc("mia_forest_autonomy_claim_tick");
    if(claim.error) return reply({ok:false,error:"Tick claim failed"},500);
    if(claim.data!==true) return reply({ok:true,skipped:"tick_not_claimed"});
  } else if(trigger!=="manual") return reply({ok:false,error:"Unsupported trigger"},400);
  const loaded=await db.from("mia_virtual_spaces").select("slug,name,description,scene_data,is_active,source_system").eq("is_active",true).in("slug",[FOREST,...DESTINATIONS]);
  if(loaded.error) return reply({ok:false,error:"Scene registry read failed"},500);
  const scenes=loaded.data||[];
  const forest=scenes.find((x:any)=>x.slug===FOREST);
  if(!forest) return reply({ok:false,error:"Forest_Corner missing"},409);
  const latest=await db.from("mia_forest_autonomy_runs").select("after_state").eq("identity_id",MIA).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(latest.error) return reply({ok:false,error:"State read failed"},500);
  const before=latest.data?.after_state||seed(forest);
  let plan:any, planner="agnes";
  try{plan=await planWithAgnes(before,scenes);}catch(e){planner="safe_rule_fallback";plan=safeFallback(before);console.warn("Mia planner fallback",e instanceof Error?e.message:"unknown");}
  const at=new Date().toISOString();
  const result=applyAction(before,plan,at);
  const id=crypto.randomUUID();
  const details={planner_mode:planner,trigger,runtime_instance_id:"forest-corner-headless-v1",execution_layer:"semantic_headless_runtime",scene_data_loaded:true,live_perception_connected:false,physical_3d_movement:false,cross_scene_travel_enabled:false,world_transform_status:"uncalibrated",action_blocked:result.blocked,registered_destination_count:scenes.filter((x:any)=>DESTINATIONS.includes(x.slug)).length,no_chat_or_personality_writes:true};
  const saved=await db.from("mia_forest_autonomy_runs").insert({id,identity_id:MIA,status:"completed",planned_action:result.action,planner_reason:result.reason,before_state:before,after_state:result.state,runtime_request_id:id+":"+result.action,details,completed_at:at});
  if(saved.error) return reply({ok:false,error:"State transition was not committed"},500);
  return reply({ok:true,identity_id:MIA,action:result.action,planner_mode:planner,sequence:result.state.sequence,scene_id:result.state.scene_id,session_status:result.state.session_status,runtime_instance_id:"forest-corner-headless-v1",physical_3d_movement:false,live_perception_connected:false,cross_scene_travel_enabled:false,runtime_request_id:id+":"+result.action});
}
if(import.meta.main) Deno.serve(handler);
