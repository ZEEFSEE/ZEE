import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" };
const json = (value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function decodeB64Url(input:string):Uint8Array{const normalized=input.replace(/-/g,"+").replace(/_/g,"/");const padded=normalized+"=".repeat((4-normalized.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
async function verifyKenSession(token:string):Promise<boolean>{
 const parts=token.split(".");if(parts.length!==2||!SERVICE_KEY)return false;
 try{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("HMAC",key,decodeB64Url(parts[1]),new TextEncoder().encode(parts[0]));if(!valid)return false;
  const claims=JSON.parse(new TextDecoder().decode(decodeB64Url(parts[0])));const now=Math.floor(Date.now()/1000);
  return claims?.aud==="mia-chat"&&claims?.sub==="mia-admin"&&Number.isFinite(claims?.iat)&&Number.isFinite(claims?.exp)&&claims.iat<=now+60&&claims.exp>now&&claims.exp-claims.iat<=4*60*60+60;
 }catch{return false;}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(!SUPABASE_URL||!SERVICE_KEY)return json({error:"SERVER_CONFIG_MISSING"},503);
 const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 if(req.method==="GET"){
  const url=new URL(req.url);const limit=Math.max(1,Math.min(50,Number(url.searchParams.get("limit"))||30));const before=url.searchParams.get("before");
  let query=db.schema("zhi_family").from("world_public_chat_messages").select("message_id,room_key,sender_resident_id,content,reply_to,created_at").eq("room_key","mia-world-public").order("created_at",{ascending:false}).limit(limit);
  if(before)query=query.lt("created_at",before);
  const {data,error}=await query;if(error)return json({error:"PUBLIC_FEED_READ_FAILED"},503);
  const ids=[...new Set((data||[]).map((row:any)=>row.sender_resident_id))];
  const {data:residents}=ids.length?await db.schema("zhi_family").from("world_residents").select("resident_id,display_name,resident_kind").in("resident_id",ids):{data:[]};
  const names=new Map((residents||[]).map((r:any)=>[r.resident_id,r]));
  const messages=(data||[]).reverse().map((row:any)=>({...row,resident:names.get(row.sender_resident_id)||{resident_id:row.sender_resident_id,display_name:row.sender_resident_id}}));
  return json({ok:true,room:"mia-world-public",messages,count:messages.length});
 }
 if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer ")||!(await verifyKenSession(auth.slice(7))))return json({error:"AUTH_REQUIRED",message:"需要有效的 Ken 登录会话。"},401);
 const body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return json({error:"INVALID_JSON"},400);
 const content=typeof body.content==="string"?body.content.trim():"";if(!content||content.length>4000)return json({error:"INVALID_CONTENT"},400);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const requestId=typeof body.client_request_id==="string"&&uuid.test(body.client_request_id)?body.client_request_id:null;
 const replyTo=typeof body.reply_to==="string"&&uuid.test(body.reply_to)?body.reply_to:null;
 const {data,error}=await db.schema("zhi_family").rpc("world_public_chat_post",{p_sender_resident_id:"KEN",p_content:content,p_client_request_id:requestId,p_reply_to:replyTo});
 if(error)return json({error:"MESSAGE_POST_FAILED",detail:error.message},409);
 return json(data);
});
