import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function decode(v:string){const s=v.replace(/-/g,"+").replace(/_/g,"/");const b=atob(s+"=".repeat((4-s.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function validToken(token:string){
 try{
  if(!SERVICE_KEY)return false;
  const p=token.split(".");if(p.length!==2)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",key,decode(p[1]),new TextEncoder().encode(p[0])))return false;
  const c=JSON.parse(new TextDecoder().decode(decode(p[0]))),now=Math.floor(Date.now()/1000);
  return c.aud==="mia-chat"&&c.sub==="mia-admin"&&Number.isFinite(c.exp)&&c.exp>now&&Number.isFinite(c.iat)&&c.iat<=now+60;
 }catch{return false;}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer ")||!(await validToken(auth.slice(7))))return json({error:"未授权，请重新验证页面密码。"},401);
 if(!URL||!SERVICE_KEY)return json({error:"CIM database is not configured."},503);
 const body=await req.json().catch(()=>null);
 const deviceKey=String(body?.device_key||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceKey))return json({error:"设备标识无效。"},400);
 const db=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const now=new Date().toISOString();
 const {data:identity,error:identityError}=await db.from("mia_identity").select("id,display_name").eq("id",IDENTITY_ID).single();
 if(identityError||!identity)return json({error:"Mia identity not found."},404);
 const {data:root,error:rootError}=await db.schema("zhi_family").from("cim_identity_roots").select("identity_id,scope,continuity_status,current_identity_version,current_snapshot_id,updated_at").eq("identity_id",IDENTITY_ID).single();
 if(rootError||!root)return json({error:"CIM identity root unavailable."},503);
 const {data:session,error:sessionError}=await db.from("mia_chat_sessions").select("id,status,created_at,last_message_at").eq("identity_id",IDENTITY_ID).order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(sessionError||!session)return json({error:"Mia session not found."},503);
 const ua=String(req.headers.get("user-agent")||"").slice(0,240);
 const platform=/Android/i.test(ua)?"android":/iPhone|iPad|iPod/i.test(ua)?"ios":/Windows/i.test(ua)?"windows":/Macintosh/i.test(ua)?"macos":/Linux/i.test(ua)?"linux":"web";
 const label=String(body?.device_label||platform).slice(0,80);
 const {data:device,error:deviceError}=await db.schema("zhi_family").from("cim_device_registry").upsert({
  identity_id:IDENTITY_ID,client_instance_key:deviceKey,device_label:label,platform,last_seen_at:now,metadata:{runtime:"mia-chat-pwa",user_agent_family:platform}
 },{onConflict:"identity_id,client_instance_key"}).select("device_id,last_sync_cursor,revoked_at").single();
 if(deviceError||!device)return json({error:"设备注册失败。"},503);
 if(device.revoked_at)return json({error:"此设备已被撤销，请在本设备清除站点数据后重新登录。"},403);
 const {error:linkError}=await db.schema("zhi_family").from("cim_session_links").upsert({
  identity_id:IDENTITY_ID,session_id:session.id,device_id:device.device_id,last_attached_at:now,attach_reason:"authenticated_device_bootstrap"
 },{onConflict:"identity_id,session_id,device_id"});
 if(linkError)return json({error:"会话连续性关联失败。"},503);
 const {data:latestSnapshot}=await db.schema("zhi_family").from("cim_state_snapshots").select("snapshot_id,snapshot_no,snapshot_kind,state_manifest,source_watermarks,created_at").eq("identity_id",IDENTITY_ID).order("snapshot_no",{ascending:false}).limit(1).maybeSingle();
 const {data:latestEvent}=await db.schema("zhi_family").from("cim_sync_events").select("sync_seq").eq("identity_id",IDENTITY_ID).order("sync_seq",{ascending:false}).limit(1).maybeSingle();
 const cursor=Number(latestEvent?.sync_seq||0);
 const {error:eventError}=await db.schema("zhi_family").from("cim_sync_events").upsert({
  identity_id:IDENTITY_ID,device_id:device.device_id,session_id:session.id,event_type:"DEVICE_BOOTSTRAP",idempotency_key:"device-bootstrap:"+device.device_id+":"+new Date().toISOString().slice(0,10),occurred_at:now,payload:{platform,session_status:session.status,identity_version:root.current_identity_version,snapshot_id:latestSnapshot?.snapshot_id||null},source_refs:{source:"mia-cim-bootstrap"}
 },{onConflict:"identity_id,idempotency_key"});
 if(eventError)return json({error:"设备同步事件记录失败。"},503);
 // Record the actual recovery boundary: this bootstrap restores metadata only, not message or memory bodies.
 const {error:recoveryAuditError}=await db.schema("zhi_family").from("cim_recovery_audit").insert({
  identity_id:IDENTITY_ID,
  device_id:device.device_id,
  session_id:session.id,
  recovery_status:"PARTIAL",
  recovered_from_snapshot_id:latestSnapshot?.snapshot_id||null,
  started_at:now,
  completed_at:new Date().toISOString(),
  details:{
   recovery_mode:"metadata_bootstrap_only",
   identity_version:root.current_identity_version,
   snapshot_no:latestSnapshot?.snapshot_no||null,
   device_sync_cursor:Number(device.last_sync_cursor||0),
   latest_event_seq:cursor,
   memory_content_restored:false,
   message_content_restored:false,
   original_memory_modified:false,
   next_step:"chat_history_and_memory_context_are_loaded_by_existing_mia_chat_flow"
  }
 });
 if(recoveryAuditError)console.warn("[CIM] recovery audit insert failed",recoveryAuditError.message);
 // Bootstrap is not a sync acknowledgement: keep the durable cursor unchanged until the client confirms history refresh.
 return json({ok:true,cim:{schema:"CIM.v1",identity_id:IDENTITY_ID,identity_version:root.current_identity_version,continuity_status:root.continuity_status,snapshot:latestSnapshot?{id:latestSnapshot.snapshot_id,number:latestSnapshot.snapshot_no,kind:latestSnapshot.snapshot_kind,created_at:latestSnapshot.created_at}:null,device_id:device.device_id,sync_cursor:Number(device.last_sync_cursor||0),latest_event_seq:cursor,session:{id:session.id,status:session.status,last_message_at:session.last_message_at},memory_source_of_truth:"existing_mia_memory_tables",existing_memory_copied:false,personality_changed:false,agnes_configuration_changed:false,restore_mode:"metadata_bootstrap_only",cross_device_sync:"device_registered; incremental event replication pending"}});
});