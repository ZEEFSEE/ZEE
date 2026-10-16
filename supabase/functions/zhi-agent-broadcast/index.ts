import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!, SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGNES_API_KEY=Deno.env.get("AGNES_API_KEY")||"", AGNES_MODEL=Deno.env.get("AGNES_MODEL")||"agnes-3.0-flash";
const FINANCE_URL="https://bkttvffunyvbswkxpygp.supabase.co", FINANCE_KEY="sb_publishable_NYVMp3Nhk9QDtIxz1MGOEA_Z7RtbMyP", ADMIN_ID="8ea33807-8b68-4f8f-b145-398937c7bba1";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const clamp=(v:unknown)=>Math.max(0,Math.min(100,Math.round(Number(v??50))));

function decodeB64url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function isSignedChatAdminToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const validSignature = await crypto.subtle.verify("HMAC", key, decodeB64url(parts[1]), new TextEncoder().encode(parts[0]));
    if (!validSignature) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeB64url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims?.aud === "zhi-chat-admin" && claims?.sub === "admin" &&
      Number.isFinite(claims?.exp) && claims.exp > now &&
      Number.isFinite(claims?.iat) && claims.iat <= now + 60;
  } catch { return false; }
}
async function isChatAdmin(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  if (await isSignedChatAdminToken(token)) return true;
  // Backward-compatible verification: existing Supabase administrator sessions remain valid.
  const authClient = createClient(FINANCE_URL, FINANCE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await authClient.auth.getUser(token);
  return !error && !!user && user.id === ADMIN_ID;
}

Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"POST required"},405);if(!(await isChatAdmin(req)))return json({error:"Admin only"},403);if(!AGNES_API_KEY)return json({error:"Agnes API is not configured"},503);
 const b=await req.json().catch(()=>null),mode=String(b?.mode||"");const db=createClient(SUPABASE_URL,SERVICE_KEY);
 if(mode==="broadcast"){
  const message=String(b?.message||"").trim().slice(0,2000);if(!message)return json({error:"message is required"},400);
  const ar=await db.from("zhi_agents").select("id,name,gender,personality,life_status,leadership,social,adventure,competition,patience,randomness,diligence,desire_for_zhi,fear_of_death,resentment,survival_pressure").order("name").limit(2000);
  if(ar.error)return json({error:"Unable to load agents: "+ar.error.message},500);const agents=ar.data||[];
  const br=await db.from("zhi_agent_broadcasts").insert({admin_user_id:ADMIN_ID,message,recipient_count:agents.length}).select("id").single();if(br.error||!br.data)return json({error:"Unable to create broadcast: "+(br.error?.message||"unknown")},500);
  const broadcastId=br.data.id;let delivered=0,failed=0;
  for(let i=0;i<agents.length;i+=25){const chunk=agents.slice(i,i+25);const results=await Promise.all(chunk.map(async(a:any)=>{
    const mem=await db.from("zhi_agent_memories").insert({agent_id:a.id,memory_type:"broadcast",importance:100,memory:`管理员全体广播（广播ID：${broadcastId}）：${message}\n记录：我已收到这条全体广播。请在之后的自主决策中，结合我的性格、目标、当前状态和个人判断，决定是否回应；不要求所有人都回复。`,source:"admin_broadcast"});
    const msg=await db.from("admin_agent_messages").insert({admin_user_id:ADMIN_ID,agent_id:a.id,agent_name:a.name,sender_type:"admin",content:`【全体广播】${message}`});
    const rec=await db.from("zhi_agent_broadcast_recipients").insert({broadcast_id: broadcastId,agent_id:a.id,agent_name:a.name,memory_saved:!mem.error,decision_status:!mem.error?"pending":"error",decision_reason:mem.error?.message||null});
    if(!mem.error&&!msg.error&&!rec.error)return true;
    if(!rec.error)await db.from("zhi_agent_broadcast_recipients").update({decision_status:"error",decision_reason:[mem.error?.message,msg.error?.message,rec.error?.message].filter(Boolean).join("; ")}).eq("broadcast_id",broadcastId).eq("agent_id",a.id);
    return false;
  }));for(const ok of results)ok?delivered++:failed++;
  }
  return json({ok:true,broadcast_id:broadcastId,total:agents.length,delivered,failed,pending_decisions:delivered});
 }
 if(mode==="decide"){
  const broadcastId=String(b?.broadcast_id||""),agentId=String(b?.agent_id||"");if(!broadcastId||!agentId)return json({error:"broadcast_id and agent_id are required"},400);
  const [recR,agentR]=await Promise.all([
   db.from("zhi_agent_broadcast_recipients").select("*").eq("broadcast_id",broadcastId).eq("agent_id",agentId).single(),
   db.from("zhi_agents").select("id,name,gender,personality,life_status,leadership,social,adventure,competition,patience,randomness,diligence,desire_for_zhi,fear_of_death,resentment,survival_pressure").eq("id",agentId).single()
  ]);
  if(recR.error||agentR.error)return json({error:"Broadcast recipient or agent not found"},404);
  const rec=recR.data,a=agentR.data;if(rec.decision_status!=="pending")return json({ok:true,status:rec.decision_status,reply:rec.reply_text||null,agent_name:rec.agent_name,skipped:true});
  const [broadcastR,mindR,memR]=await Promise.all([
   db.from("zhi_agent_broadcasts").select("message,created_at").eq("id",broadcastId).single(),
   db.from("zhi_agent_minds").select("mood,energy,stress,curiosity,confidence,current_goal,short_term_goal,long_term_goal,last_thought,goal_profile").eq("agent_id",agentId).maybeSingle(),
   db.from("zhi_agent_memories").select("memory_type,memory,importance,created_at").eq("agent_id",agentId).order("importance",{ascending:false}).order("created_at",{ascending:false}).limit(8)
  ]);
  if(broadcastR.error)return json({error:"Broadcast not found"},404);
  const context={identity:{name:a.name,gender:a.gender,personality:a.personality,life_status:a.life_status},traits:{leadership:clamp(a.leadership),social:clamp(a.social),adventure:clamp(a.adventure),competition:clamp(a.competition),patience:clamp(a.patience),randomness:clamp(a.randomness),diligence:clamp(a.diligence)},drives:{desire_for_zhi:clamp(a.desire_for_zhi),fear_of_death:clamp(a.fear_of_death),resentment:clamp(a.resentment),survival_pressure:clamp(a.survival_pressure)},mind:mindR.data||{},memories:memR.data||[]};
  let raw="";
  try{raw=await askAgnes([{role:"system",content:`你是 ZHI 世界中的智能人「${a.name}」。你刚收到管理员的全体广播。请依据自己的性格、真实状态、目标和记忆，自主决定是否公开回复。不要为了凑数而回复；可以不回复，也可以表达不同意见。只输出严格 JSON：{"decision":"reply"或"no_reply","reason":"简短理由","reply":"若回复则写自然中文回复，否则空字符串"}。不要编造事实。决策独立，不能假装所有人想法一样。`},{role:"user",content:`全体广播：${broadcastR.data.message}\n个人上下文：${JSON.stringify(context)}`}]);}catch(e){await db.from("zhi_agent_broadcast_recipients").update({decision_status:"error",decision_reason:String(e)}).eq("id",rec.id);return json({error:"Individual decision failed"},502);}
  let result:any;try{const clean=raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");result=JSON.parse(clean);}catch{result={decision:"no_reply",reason:"无法可靠解析独立决策结果，因此暂不回复。",reply:""};}
  const replyDecision=result.decision==="reply"&&String(result.reply||"").trim().length>0;const reply=replyDecision?String(result.reply).trim().slice(0,2000):null;
  const update=await db.from("zhi_agent_broadcast_recipients").update({decision_status:replyDecision?"reply":"no_reply",decision_reason:String(result.reason||"").slice(0,500),reply_text:reply,decided_at:new Date().toISOString()}).eq("id",rec.id);
  if(update.error)return json({error:"Unable to save decision"},500);
  if(reply){const [m,msg]=await Promise.all([
   db.from("zhi_agent_memories").insert({agent_id:agentId,memory_type:"conversation",importance:80,memory:`针对管理员全体广播（ID：${broadcastId}），我自主决定回应：${reply}`,source:"admin_broadcast_reply"}),
   db.from("admin_agent_messages").insert({admin_user_id:ADMIN_ID,agent_id:agentId,agent_name:a.name,sender_type:"agent",content:`【回应全体广播】${reply}`})
  ]);if(m.error||msg.error)return json({ok:true,status:"reply",reply,agent_name:a.name,saved:false,warning:"Reply decided but response memory/message save failed"});}
  return json({ok:true,status:replyDecision?"reply":"no_reply",reply,agent_name:a.name,reason:result.reason||"",saved:true});
 }
 return json({error:"mode must be broadcast or decide"},400);
});