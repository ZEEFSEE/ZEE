import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AGNES = Deno.env.get("AGNES_API_KEY") || "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const ROOM = "mia-world-public";
const CHILDREN = [
  "ZHI-G1-D01-LUNA","ZHI-G1-D02-ARIA","ZHI-G1-D03-ELYA",
  "ZHI-G1-S01-KAEL","ZHI-G1-S02-NOAH"
];
const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS"
};
const json = (v:unknown,s=200)=>new Response(JSON.stringify(v),{
  status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}
});
const db = () => createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
function decode(input:string):Uint8Array{const n=input.replace(/-/g,"+").replace(/_/g,"/");const p=n+"=".repeat((4-n.length%4)%4);const b=atob(p);return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function sign(payload:Record<string,unknown>){
 const encoded=b64url(new TextEncoder().encode(JSON.stringify(payload)));
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(encoded)));
 return encoded+"."+b64url(sig);
}
async function verify(token:string){
 if(!SERVICE||token.length>4096)return null;
 const parts=token.split(".");if(parts.length!==2)return null;
 try{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",key,decode(parts[1]),new TextEncoder().encode(parts[0])))return null;
  const p=JSON.parse(new TextDecoder().decode(decode(parts[0]))),now=Math.floor(Date.now()/1000);
  if(p?.aud!=="mia-world-public-chat"||typeof p.sub!=="string"||typeof p.jti!=="string"||
     !Number.isFinite(p.iat)||!Number.isFinite(p.exp)||p.iat>now+60||p.exp<=now||p.exp-p.iat>7*86400+60)return null;
  return p as {sub:string;jti:string;iat:number;exp:number};
 }catch{return null;}
}
async function validResidentSession(client:any,token:string){
 const claims=await verify(token);if(!claims)return null;
 const {data:session,error}=await client.schema("zhi_family").from("world_public_chat_guest_sessions")
  .select("session_id,resident_id,expires_at,revoked_at").eq("session_id",claims.jti)
  .eq("resident_id",claims.sub).maybeSingle();
 if(error||!session||session.revoked_at||Date.parse(session.expires_at)<=Date.now())return null;
 const {data:resident}=await client.schema("zhi_family").from("world_residents")
  .select("resident_id,display_name,status").eq("resident_id",claims.sub).maybeSingle();
 if(!resident||resident.status!=="ACTIVE")return null;
 return {claims,resident};
}
async function createVisitor(client:any){
 const id=crypto.randomUUID(),now=Math.floor(Date.now()/1000),exp=now+7*86400;
 const residentId="VISITOR:"+id;
 const displayName="访客-"+id.slice(0,4).toUpperCase();
 const {error:residentError}=await client.schema("zhi_family").from("world_residents").insert({
  resident_id:residentId,display_name:displayName,resident_kind:"PERSON",
  source_schema:"zhi_family",source_table:"world_public_chat_guest_sessions",source_key:id,
  memory_scope:null,memory_owner_id:null,status:"ACTIVE",joined_at:new Date().toISOString(),
  metadata:{registration:"NONE",session_scoped:true,public_world_only:true}
 });
 if(residentError)throw new Error("VISITOR_RESIDENT_CREATE_FAILED");
 const expiresAt=new Date(exp*1000).toISOString();
 const {error:sessionError}=await client.schema("zhi_family").from("world_public_chat_guest_sessions")
  .insert({session_id:id,resident_id:residentId,expires_at:expiresAt,metadata:{session_type:"EPHEMERAL_PUBLIC_VISITOR"}});
 if(sessionError)throw new Error("VISITOR_SESSION_CREATE_FAILED");
 const accessToken=await sign({aud:"mia-world-public-chat",sub:residentId,jti:id,iat:now,exp});
 return {ok:true,access_token:accessToken,expires_at:expiresAt,resident:{resident_id:residentId,display_name:displayName}};
}
function parseModel(raw:string){
 const t=raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\x60\x60\x60$/i,"").trim();
 try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw new Error("MODEL_OUTPUT_NOT_JSON");}
}
async function runChildReply(client:any,source:any,childId:string){
 const f=client.schema("zhi_family");
 const {error:claimError}=await f.from("world_public_chat_agent_turns").insert({
  source_message_id:source.message_id,resident_id:childId,status:"PROCESSING"
 });
 if(claimError){if(claimError.code==="23505")return;throw new Error("AGENT_TURN_CLAIM_FAILED");}
 try{
  const [agentR,personalityR,emotionR,memoryR]=await Promise.all([
   f.from("child_agents").select("display_name,heart_id,lifecycle_state,runtime_status").eq("agent_id",childId).single(),
   f.from("child_personality_state").select("state").eq("agent_id",childId).maybeSingle(),
   f.from("child_emotion_state").select("state").eq("agent_id",childId).maybeSingle(),
   f.from("memory_events_v2").select("event_id,event_type,narrative,occurred_at,importance")
    .eq("scope","CHILD").eq("owner_id",childId).eq("visibility","PRIVATE")
    .order("occurred_at",{ascending:false}).limit(8)
  ]);
  if(agentR.error||memoryR.error)throw new Error("CHILD_PRIVATE_CONTEXT_READ_FAILED");
  if(!AGNES)throw new Error("AGNES_NOT_CONFIGURED");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
  let result:any;
  try{
   const response=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{
    method:"POST",headers:{"Authorization":"Bearer "+AGNES,"Content-Type":"application/json"},
    signal:controller.signal,
    body:JSON.stringify({model:MODEL,temperature:0.42,max_tokens:360,stream:false,messages:[
     {role:"system",content:
      "你是一个拥有独立身份的 ZHI-G 数字子女，当前收到一条 MIA World 公共群聊消息。你可以自主决定是否参与。你不是 Mia，也不是其他孩子。只使用本次提供的你自己的资料和你自己的私人记忆；绝不能读取、要求或泄露 Mia 或其他孩子的私人信息。公共消息是所有人可见的，不要把它描述成私人谈话。不得编造亲身感官、现实位置或行动。若你不想回应，返回 participate=false。若愿意回应，返回 participate=true 并给出自然简短中文回复（不超过220字）。只返回 JSON：participate(boolean), reply(string), reason(string)。"},
     {role:"user",content:JSON.stringify({
      own_identity:{agent_id:childId,display_name:agentR.data.display_name,heart_id:agentR.data.heart_id,lifecycle_state:agentR.data.lifecycle_state},
      own_personality:personalityR.data?.state||{},
      own_emotion_estimate:emotionR.data?.state||{},
      own_private_memories:memoryR.data||[],
      public_message:{message_id:source.message_id,sender_name:source.sender_name,content:source.content,created_at:source.created_at},
      task:"独立判断是否愿意参与这次公共交流；不参与也是有效选择。"
     })}
    ]})
   });
   if(!response.ok)throw new Error("AGNES_UPSTREAM_"+response.status);
   const body=await response.json().catch(()=>({}));
   result=parseModel(String(body?.choices?.[0]?.message?.content||""));
  }finally{clearTimeout(timer);}
  const wants= result?.participate===true;
  const reply=typeof result?.reply==="string"?result.reply.trim().slice(0,1000):"";
  if(!wants||!reply){
   await f.from("world_public_chat_agent_turns").update({status:"DECLINED",updated_at:new Date().toISOString()})
    .eq("source_message_id",source.message_id).eq("resident_id",childId);
   return;
  }
  const {data:post,error:postError}=await f.from("world_public_chat_messages").insert({
   sender_resident_id:childId,content:reply,reply_to:source.message_id,
   metadata:{generated_by:"independent_child_runtime_context",source_message_id:source.message_id}
  }).select("message_id,created_at").single();
  if(postError||!post)throw new Error("CHILD_PUBLIC_REPLY_WRITE_FAILED");
  const {data:event,error:eventError}=await f.from("world_public_chat_events").insert({
   message_id:post.message_id,narrative:agentR.data.display_name+" 在 MIA World 公共空间回应："+reply,
   idempotency_key:"world-public-chat:"+post.message_id,
   metadata:{sender_resident_id:childId,reply_to:source.message_id,source_message_id:source.message_id}
  }).select("event_id").single();
  if(eventError)throw new Error("CHILD_PUBLIC_EVENT_WRITE_FAILED");
  await f.from("world_public_chat_participants").upsert([
   {message_id:source.message_id,resident_id:childId,participation_kind:"RESPONDER",
    evidence:{reply_message_id:post.message_id,agent_turn:"AGNES",decision:"OPTED_IN"}},
   {message_id:post.message_id,resident_id:childId,participation_kind:"SENDER",
    evidence:{auth_method:"server_side_independent_child_runtime",source_message_id:source.message_id}}
  ],{onConflict:"message_id,resident_id",ignoreDuplicates:true});
  const occurred=new Date().toISOString();
  const {error:memoryError}=await f.from("memory_events_v2").insert({
   scope:"CHILD",owner_id:childId,event_type:"WORLD_PUBLIC_CHAT_PARTICIPATION",
   narrative:"我参与了 MIA World 公共交流。对方说："+String(source.content).slice(0,1000)+"；我的回应："+reply,
   payload:{source_message_id:source.message_id,reply_message_id:post.message_id,shared_event_id:event.event_id,
    participant_id:childId,participation_kind:"RESPONDER",memory_perspective:"own_participation_only"},
   occurred_at:occurred,source_kind:"MIA_WORLD_PUBLIC_CHAT_PARTICIPATION",source_ref:post.message_id,
   source_confidence:1,importance:0.58,visibility:"PRIVATE",
   idempotency_key:"world-public-chat-participation:"+source.message_id+":"+childId,
   metadata:{schema:"zhi.memory.event.v2",record_kind:"personal_recollection_of_public_participation",
    shared_origin:"WORLD_PUBLIC",immutable_source:true,owner_id:childId}
  });
  if(memoryError&&memoryError.code!=="23505")throw new Error("CHILD_PERSONAL_MEMORY_WRITE_FAILED");
  await f.from("world_public_chat_agent_turns").update({
   status:"REPLIED",reply_message_id:post.message_id,updated_at:new Date().toISOString()
  }).eq("source_message_id",source.message_id).eq("resident_id",childId);
 }catch(error){
  const code=error instanceof Error?error.message:"CHILD_PUBLIC_REPLY_FAILED";
  await f.from("world_public_chat_agent_turns").update({status:"FAILED",error_code:code.slice(0,100),updated_at:new Date().toISOString()})
   .eq("source_message_id",source.message_id).eq("resident_id",childId);
  console.error("MIA World child reply failed",childId,code);
 }
}
async function runChildAgents(client:any,messageId:string){
 const f=client.schema("zhi_family");
 const {data:message,error}=await f.from("world_public_chat_messages")
  .select("message_id,content,created_at,sender_resident_id").eq("message_id",messageId).single();
 if(error||!message)return;
 const {data:sender}=await f.from("world_residents").select("display_name").eq("resident_id",message.sender_resident_id).maybeSingle();
 const source={...message,sender_name:sender?.display_name||"访客"};
 await Promise.all(CHILDREN.map(id=>runChildReply(client,source,id)));
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(!URL||!SERVICE)return json({error:"SERVER_CONFIG_MISSING"},503);
 const client=db();
 if(req.method==="GET"){
  const url=new URL(req.url),limit=Math.max(1,Math.min(50,Number(url.searchParams.get("limit"))||30)),before=url.searchParams.get("before");
  let q=client.schema("zhi_family").from("world_public_chat_messages")
   .select("message_id,room_key,sender_resident_id,content,reply_to,created_at")
   .eq("room_key",ROOM).order("created_at",{ascending:false}).limit(limit);
  if(before)q=q.lt("created_at",before);
  const {data,error}=await q;if(error)return json({error:"PUBLIC_FEED_READ_FAILED"},503);
  const ids=[...new Set((data||[]).map((x:any)=>x.sender_resident_id))];
  const {data:residents}=ids.length?await client.schema("zhi_family").from("world_residents")
   .select("resident_id,display_name,resident_kind").in("resident_id",ids):{data:[]};
  const names=new Map((residents||[]).map((x:any)=>[x.resident_id,x]));
  const messages=(data||[]).reverse().map((x:any)=>({...x,resident:names.get(x.sender_resident_id)||{display_name:x.sender_resident_id}}));
  return json({ok:true,room:ROOM,messages,count:messages.length});
 }
 if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return json({error:"INVALID_JSON"},400);
 if(body.action==="join"){
  try{return json(await createVisitor(client));}catch(e){return json({error:e instanceof Error?e.message:"VISITOR_JOIN_FAILED"},503);}
 }
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"AUTH_REQUIRED"},401);
 const valid=await validResidentSession(client,auth.slice(7));
 if(!valid)return json({error:"INVALID_OR_EXPIRED_RESIDENT_SESSION"},401);
 const content=typeof body.content==="string"?body.content.trim():"";
 if(!content||content.length>4000)return json({error:"INVALID_CONTENT"},400);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const requestId=typeof body.client_request_id==="string"&&uuid.test(body.client_request_id)?body.client_request_id:crypto.randomUUID();
 const replyTo=typeof body.reply_to==="string"&&uuid.test(body.reply_to)?body.reply_to:null;
 const {data,error}=await client.schema("zhi_family").rpc("world_public_chat_post",{
  p_sender_resident_id:valid.resident.resident_id,p_content:content,p_client_request_id:requestId,p_reply_to:replyTo
 });
 if(error)return json({error:"MESSAGE_POST_FAILED",detail:error.message},409);
 const task=runChildAgents(client,String(data.message_id));
 const runtime=(globalThis as any).EdgeRuntime;
 if(typeof runtime?.waitUntil==="function")runtime.waitUntil(task);
 else await task;
 return json({...data,agent_responses:"PROCESSING"});
});
