import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")||"", SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const IDENTITY_ID="cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function dec(v:string){const x=v.replace(/-/g,"+").replace(/_/g,"/");const b=atob(x+"=".repeat((4-x.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function valid(token:string){try{if(!SERVICE_KEY)return false;const p=token.split(".");if(p.length!==2)return false;const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",k,dec(p[1]),new TextEncoder().encode(p[0])))return false;const c=JSON.parse(new TextDecoder().decode(dec(p[0]))),n=Math.floor(Date.now()/1000);return c.aud==="mia-chat"&&c.sub==="mia-admin"&&Number.isFinite(c.exp)&&c.exp>n&&Number.isFinite(c.iat)&&c.iat<=n+60;}catch{return false;}}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const h=req.headers.get("Authorization")||"";if(!h.startsWith("Bearer ")||!(await valid(h.slice(7))))return json({error:"未授权，请重新验证页面密码。"},401);
 const body=await req.json().catch(()=>null),key=String(body?.device_key||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))return json({error:"设备标识无效。"},400);
 const after=Number(body?.after_sync_seq??0);if(!Number.isSafeInteger(after)||after<0)return json({error:"同步游标无效。"},400);
 const limit=Math.max(1,Math.min(100,Number(body?.limit)||50));
 const db=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:device,error:de}=await db.schema("zhi_family").from("cim_device_registry").select("device_id,revoked_at,last_sync_cursor").eq("identity_id",IDENTITY_ID).eq("client_instance_key",key).maybeSingle();
 if(de||!device)return json({error:"设备尚未注册，请先执行身份恢复。"},409);
 if(device.revoked_at)return json({error:"此设备已被撤销。"},403);
 const action=String(body?.action||"pull");
 if(action==="ack"){
  const ack=Number(body?.sync_seq);
  if(!Number.isSafeInteger(ack)||ack<0)return json({error:"确认游标无效。"},400);
  const {data:latestEvent,error:le}=await db.schema("zhi_family").from("cim_sync_events").select("sync_seq").eq("identity_id",IDENTITY_ID).order("sync_seq",{ascending:false}).limit(1).maybeSingle();
  if(le)return json({error:"确认同步游标时无法读取事件边界。"},503);
  const latest=Number(latestEvent?.sync_seq||0);
  if(ack>latest)return json({error:"确认游标超过当前事件边界。"},409);
  const committed=Math.max(Number(device.last_sync_cursor||0),ack);
  const {data:updated,error:ue}=await db.schema("zhi_family").from("cim_device_registry").update({last_seen_at:new Date().toISOString(),last_sync_at:new Date().toISOString(),last_sync_cursor:committed}).eq("device_id",device.device_id).select("last_sync_cursor").single();
  if(ue||!updated)return json({error:"同步确认未能持久化。"},503);
  return json({ok:true,device_id:device.device_id,ack_sync_seq:Number(updated.last_sync_cursor)});
 }
 if(action!=="pull")return json({error:"同步操作不受支持。"},400);
 const {data:events,error:ee}=await db.schema("zhi_family").from("cim_sync_events").select("sync_seq,event_id,event_type,session_id,device_id,occurred_at,payload,source_refs").eq("identity_id",IDENTITY_ID).gt("sync_seq",after).order("sync_seq",{ascending:true}).limit(limit);
 if(ee)return json({error:"读取增量同步事件失败。"},503);
 const rows=events||[],next=rows.length?Number(rows[rows.length-1].sync_seq):after;
 const {data:snapshot}=await db.schema("zhi_family").from("cim_state_snapshots").select("snapshot_id,snapshot_no,snapshot_kind,created_at").eq("identity_id",IDENTITY_ID).order("snapshot_no",{ascending:false}).limit(1).maybeSingle();
 await db.schema("zhi_family").from("cim_device_registry").update({last_seen_at:new Date().toISOString()}).eq("device_id",device.device_id);
 return json({ok:true,identity_id:IDENTITY_ID,device_id:device.device_id,events:rows,next_sync_seq:next,has_more:rows.length===limit,snapshot,content_policy:"event metadata and message references only; private message content remains in existing mia_messages and is retrieved through authenticated chat history",event_model:"append_only_idempotent"});
});