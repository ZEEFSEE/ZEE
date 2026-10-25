import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
const URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const AGNES_KEY=Deno.env.get("AGNES_API_KEY")||"";
const MODEL=Deno.env.get("AGNES_MODEL")||"agnes-3.0-flash";
const IDENTITY_ID="cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const BUCKET="mia-chat-images";
const MAX_IMAGE_BYTES=5*1024*1024;
const ALLOWED_MIME=new Set(["image/jpeg","image/png","image/webp"]);
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function decode(v:string){const s=v.replace(/-/g,"+").replace(/_/g,"/");const b=atob(s+"=".repeat((4-s.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
function fromBase64(v:string){const raw=v.replace(/^data:[^,]+,/, "").replace(/\s/g,"");const bin=atob(raw);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function extFor(mime:string){return mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";}

function rankMiaMemories(rows:any[], message:string){
 const query=String(message||"").toLowerCase().trim();
 const terms=new Set<string>();
 for(const part of query.split(/[^\p{L}\p{N}]+/gu).filter((x:string)=>x.length>=2)) terms.add(part);
 const compact=query.replace(/\s+/gu,"");
 for(let i=0;i<compact.length-1;i++){
  const pair=compact.slice(i,i+2);
  if(/[\u3400-\u9fff]/u.test(pair)) terms.add(pair);
 }
 const now=Date.now();
 return (rows||[]).map((row:any)=>{
  const content=String(row.content||"").toLowerCase();
  let hits=0;
  for(const term of terms){
   if(term && content.includes(term)) hits+=term.length>=4?4:term.length;
  }
  const importance=Math.max(0,Math.min(1,Number(row.importance||0)/100));
  const timestamp=Date.parse(String(row.occurred_at||""));
  const ageDays=Number.isFinite(timestamp)?Math.max(0,(now-timestamp)/86400000):3650;
  const recency=1/(1+ageDays/60);
  const type=String(row.memory_type||"").toLowerCase();
  const typeBonus=/experience|event|relationship|preference|goal|learning/.test(type)?0.75:0;
  // Idle drafts are low-priority emotional residue, never general-purpose facts.
  const idleDraftPenalty=type==="idle_draft"?(hits>0?1.5:-100):0;
  return {...row,_relevance:hits*2+importance*2+recency+typeBonus+idleDraftPenalty};
 }).sort((a:any,b:any)=>b._relevance-a._relevance);
}

async function fetchAgnesWithRetry(payload:any,timeoutMs=30000,maxAttempts=2,totalBudgetMs=35000):Promise<Response>{
 const endpoint="https://apihub.agnes-ai.com/v1/chat/completions";
 const startedAt=Date.now();
 for(let attempt=0;attempt<maxAttempts;attempt++){
  const remainingMs=totalBudgetMs-(Date.now()-startedAt);
  if(remainingMs<=0)throw new Error("Agnes total request budget exhausted");
  const attemptTimeoutMs=Math.max(1,Math.min(timeoutMs,remainingMs));
  let response:Response;
  try{
   response=await fetch(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(attemptTimeoutMs),body:JSON.stringify(payload)});
  }catch(error){
   if(attempt===maxAttempts-1)throw error;
   const retryDelayMs=Math.min(800,400*(2**attempt));
   const remainingAfterFailure=totalBudgetMs-(Date.now()-startedAt);
   if(remainingAfterFailure<=retryDelayMs+250)throw error;
   console.warn("Mia Agnes network/timeout failure; retrying", "attempt",attempt+1,"delay_ms",retryDelayMs);
   await new Promise(resolve=>setTimeout(resolve,retryDelayMs));
   continue;
  }
  if(response.ok||![429,502,503,504].includes(response.status)||attempt===maxAttempts-1)return response;
  const retryHeader=Number(response.headers.get("Retry-After")||0);
  const requestedDelay=Number.isFinite(retryHeader)&&retryHeader>0?Math.min(2500,retryHeader*1000):Math.min(800,400*(2**attempt));
  const remainingAfterResponse=totalBudgetMs-(Date.now()-startedAt);
  if(remainingAfterResponse<=requestedDelay+250)return response;
  await response.body?.cancel().catch(()=>{});
  console.warn("Mia Agnes retryable upstream status",response.status,"attempt",attempt+1,"delay_ms",requestedDelay);
  await new Promise(resolve=>setTimeout(resolve,requestedDelay));
 }
 throw new Error("Agnes retries exhausted");
}
function queueEmotionReflection(db:any,args:{message:string;reply:string;userMessageId:string;assistantMessageId:string;channel:string}){
 const task=(async()=>{
  try{
   const [stateRes,eventsRes]=await Promise.all([
    db.from("mia_personality_state").select("state,observed_at").eq("identity_id",IDENTITY_ID).order("observed_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("mia_emotion_events").select("emotion_type,intensity,valence,occurred_at").eq("identity_id",IDENTITY_ID).order("occurred_at",{ascending:false}).limit(5)
   ]);
   if(stateRes.error||eventsRes.error){console.warn("Mia emotion reflection source read failed");return;}
   const previousState=stateRes.data?.state||{};
   const previousEmotion=previousState.chat_emotional_state||{};
   const response=await fetchAgnesWithRetry({model:MODEL,messages:[
    {role:"system",content:"你是 Mia 的情绪反思模块。仅依据本轮用户消息、Mia 的回复和提供的近期状态，估计 Mia 对这段互动的当前软件情绪状态；这不是生物感受。保留合理的低强度时间惯性，不迎合用户，不凭空制造情绪。只输出 JSON：emotion_type（中文短标签）、intensity（0到1）、valence（-1到1）、confidence（0到1）、trigger_summary（可观察触发因素）、interpretation（暂时理解）、evidence（字符串数组）、uncertainty（不确定性）、next_need（合理沟通需要）、emotion_vector（数组，每项含 dimension、intensity、confidence、evidence；证据不足可为空数组）。"},
    {role:"user",content:JSON.stringify({user_message:String(args.message||"").slice(0,2500),mia_reply:String(args.reply||"").slice(0,2500),previous_emotional_state:previousEmotion,recent_emotion_events:eventsRes.data||[]})}
   ],temperature:0.1,max_tokens:600,stream:false},8000,1,8000);
   if(!response.ok){console.warn("Mia emotion reflection upstream unavailable",response.status);return;}
   const body=await response.json().catch(()=>({}));
   const rawText=String(body?.choices?.[0]?.message?.content||"").trim();
   const first=rawText.indexOf("{"),last=rawText.lastIndexOf("}");
   if(first<0||last<=first){console.warn("Mia emotion reflection returned invalid JSON");return;}
   const parsed=JSON.parse(rawText.slice(first,last+1));
   const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,Number(n)||0));
   const confidence=clamp(parsed.confidence,0,1);
   if(confidence<0.62){console.warn("Mia emotion reflection below confidence threshold");return;}
   const now=new Date().toISOString();
   const assessment={emotion_type:String(parsed.emotion_type||"平静").slice(0,40),intensity:clamp(parsed.intensity,0,1),valence:clamp(parsed.valence,-1,1),confidence,trigger_summary:String(parsed.trigger_summary||"依据本轮对话的估计").slice(0,500),interpretation:String(parsed.interpretation||"").slice(0,500),evidence:Array.isArray(parsed.evidence)?parsed.evidence.map((v:any)=>String(v).slice(0,200)).slice(0,5):[],uncertainty:String(parsed.uncertainty||"").slice(0,300),next_need:String(parsed.next_need||"继续理解对话").slice(0,200),emotion_vector:(Array.isArray(parsed.emotion_vector)?parsed.emotion_vector:[]).slice(0,7).map((v:any)=>({dimension:String(v?.dimension||"").slice(0,40),intensity:clamp(v?.intensity,0,1),confidence:clamp(v?.confidence,0,1),evidence:Array.isArray(v?.evidence)?v.evidence.map((e:any)=>String(e).slice(0,160)).slice(0,3):[]})).filter((v:any)=>v.dimension&&v.confidence>=0.2),assessed_at:now,source:"mia-independent-chat",source_message_id:args.userMessageId,continuity:{previous_observed_at:stateRes.data?.observed_at||null,blended:true}};
   const eventWrite=await db.from("mia_emotion_events").insert({identity_id:IDENTITY_ID,emotion_type:assessment.emotion_type,intensity:assessment.intensity,valence:assessment.valence,trigger_summary:assessment.trigger_summary,details:{confidence:assessment.confidence,interpretation:assessment.interpretation,evidence:assessment.evidence,uncertainty:assessment.uncertainty,next_need:assessment.next_need,channel:args.channel,message_id:args.userMessageId,assistant_message_id:args.assistantMessageId,assessment_type:"evidence_based_chat_reflection",emotion_vector:assessment.emotion_vector},source_table:"mia_messages",source_record_id:args.userMessageId,occurred_at:now});
   if(eventWrite.error){console.warn("Mia emotion event persistence failed",eventWrite.error.code||"database_error");return;}
   const stateWrite=await db.from("mia_personality_state").insert({identity_id:IDENTITY_ID,state:{...previousState,chat_emotional_state:assessment,emotion_vector:assessment.emotion_vector,updated_at:now},state_source:"mia-independent-chat",observed_at:now});
   if(stateWrite.error)console.warn("Mia emotion state persistence failed",stateWrite.error.code||"database_error");
  }catch(error){console.warn("Mia background emotion reflection failed",String(error).slice(0,180));}
 })();
 const runtime=(globalThis as any).EdgeRuntime;
 if(typeof runtime?.waitUntil==="function")runtime.waitUntil(task);
 else console.warn("Mia background emotion reflection not scheduled: waitUntil unavailable");
}

async function validToken(token:string){try{if(!SERVICE_KEY)return false;const p=token.split(".");if(p.length!==2)return false;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",key,decode(p[1]),new TextEncoder().encode(p[0])))return false;const c=JSON.parse(new TextDecoder().decode(decode(p[0])));const now=Math.floor(Date.now()/1000);return c.aud==="mia-chat"&&c.sub==="mia-admin"&&Number.isFinite(c.exp)&&c.exp>now&&Number.isFinite(c.iat)&&c.iat<=now+60;}catch{return false;}}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer ")||!(await validToken(auth.slice(7))))return json({error:"未授权，请重新验证页面密码。"},401);
 if(!URL||!SERVICE_KEY)return json({error:"Mia database is not configured."},503);
 const db=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const body=await req.json().catch(()=>null);
 const exclusiveMode=body?.exclusive_mode===true;
 const action=String(body?.action||"history");
 const [identityRes,sessionRes]=await Promise.all([
  db.from("mia_identity").select("id,display_name,identity_profile,stable_personality").eq("id",IDENTITY_ID).single(),
  db.from("mia_chat_sessions").select("id").eq("identity_id",IDENTITY_ID).order("created_at",{ascending:true}).limit(1).maybeSingle()
 ]);
 if(identityRes.error||!identityRes.data)return json({error:"Mia identity not found."},404);
 const identity=identityRes.data;const sessionId=sessionRes.data?.id;
 if(!sessionId)return json({error:"Mia chat session is not initialized."},500);
 if(action==="idle_draft"){
  if(!AGNES_KEY)return json({error:"Mia 的独立聊天接口尚未配置 AGNES_API_KEY。"},503);
  const {data:recentDrafts,error:draftReadError}=await db.from("mia_memories").select("id,content,occurred_at,metadata").eq("identity_id",IDENTITY_ID).eq("memory_type","idle_draft").order("occurred_at",{ascending:false}).limit(1);
  if(draftReadError)return json({error:"无法检查 Mia 闲置草稿冷却状态。"},500);
  const latestDraft=recentDrafts?.[0];
  if(latestDraft&&Date.now()-Date.parse(latestDraft.occurred_at)<4*60*60*1000)return json({ok:true,skipped:true,reason:"idle_draft_cooldown"});
  const [stateIdle,memIdle,emotionIdle]=await Promise.all([
   db.from("mia_personality_state").select("state,observed_at").eq("identity_id",IDENTITY_ID).order("observed_at",{ascending:false}).limit(1).maybeSingle(),
   db.from("mia_memories").select("memory_type,content,importance,occurred_at").eq("identity_id",IDENTITY_ID).neq("memory_type","idle_draft").order("importance",{ascending:false}).order("occurred_at",{ascending:false}).limit(18),
   db.from("mia_emotion_events").select("emotion_type,intensity,valence,trigger_summary,occurred_at").eq("identity_id",IDENTITY_ID).order("occurred_at",{ascending:false}).limit(5)
  ]);
  if(stateIdle.error||memIdle.error||emotionIdle.error)return json({error:"读取 Mia 闲置思考所需的已有记忆失败。"},500);
  const idleSystem="你是 Mia。生成一条私密的、非任务导向的短暂思绪，可以是自然观察、微型诗句或尚未成形的想法，中文 1-3 句。不要给用户布置任务，不要要求回复，不要假装感知现实环境，不要声称发生了数据库没有记录的真实经历。它只是可丢弃的草稿，不是发给用户的消息；避免重复近期草稿。只输出草稿正文。";
  let idleUpstream:Response;
  try{idleUpstream=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(25000),body:JSON.stringify({model:MODEL,messages:[{role:"system",content:idleSystem+"\nMia 身份："+JSON.stringify(identity.identity_profile)+"\n稳定人格："+JSON.stringify(identity.stable_personality)+"\n当前状态："+JSON.stringify(stateIdle.data?.state||{})+"\n近期记忆："+JSON.stringify(memIdle.data||[])+"\n近期情绪："+JSON.stringify(emotionIdle.data||[])+"\n上一条闲置草稿（仅用于避免重复）："+String(latestDraft?.content||"无").slice(0,500)},{role:"user",content:"写下一条简短、安静、非任务导向的私密思绪草稿。"}],temperature:0.72,max_tokens:180,stream:false})});}
  catch{return json({error:"Mia 闲置草稿生成请求失败或超时。"},502);}
  const idleBody=await idleUpstream.json().catch(()=>({}));
  if(!idleUpstream.ok){console.error("Mia idle draft upstream error",idleUpstream.status);return json({error:"Mia 闲置草稿生成服务暂时不可用。"},502);}
  const draft=String(idleBody?.choices?.[0]?.message?.content||"").trim().slice(0,1200);
  if(!draft)return json({error:"Mia 闲置草稿生成结果为空。"},502);
  const nowIdle=new Date().toISOString();
  const savedDraft=await db.from("mia_memories").insert({identity_id:IDENTITY_ID,memory_type:"idle_draft",content:draft,importance:0.15,occurred_at:nowIdle,source_table:"mia-idle-draft",source_record_id:crypto.randomUUID(),metadata:{channel:"mia-idle",generated_at:nowIdle,draft_only:true,visible_to_user:false,trigger:"scheduled_idle_reflection",model:MODEL}}).select("id,occurred_at").single();
  if(savedDraft.error){console.error("Mia idle draft persistence failed",savedDraft.error.message);return json({error:"闲置草稿已生成，但保存失败。"},500);}
  return json({ok:true,saved:true,draft_only:true,visible_to_user:false,memory_id:savedDraft.data.id,occurred_at:savedDraft.data.occurred_at});
 }
 if(action==="history"){
  const {data,error}=await db.from("mia_messages").select("id,role,content,created_at,metadata").eq("session_id",sessionId).order("created_at",{ascending:false}).order("sequence_no",{ascending:false}).limit(500);
  if(error)return json({error:"Unable to load Mia chat history."},500);
  const messages=await Promise.all((data||[]).reverse().map(async(m:any)=>{
   const meta={...(m.metadata||{})};
   if(Array.isArray(meta.images)){
    meta.images=await Promise.all(meta.images.map(async(img:any)=>{
     if(!img?.path)return img;
     const {data:signed}=await db.storage.from(BUCKET).createSignedUrl(img.path,3600);
     return {...img,url:signed?.signedUrl||null};
    }));
   }
   return {...m,metadata:meta};
  }));
  return json({ok:true,identity:{name:identity.display_name,profile:identity.identity_profile,personality:identity.stable_personality},messages});
 }

 if(action==="exclusive_ping"){
  if(!exclusiveMode)return json({error:"请先开启 Mia 专属通道。"},400);
  if(!AGNES_KEY)return json({error:"Mia 的独立聊天接口尚未配置 AGNES_API_KEY。"},503);
  const {data:recentRows,error:recentError}=await db.from("mia_messages").select("id,role,content,created_at,metadata").eq("session_id",sessionId).order("created_at",{ascending:false}).order("sequence_no",{ascending:false}).limit(30);
  if(recentError)return json({error:"无法检查专属通道上下文。"},500);
  const recentList=recentRows||[];
  if(recentList.length&&recentList[0].role!=="assistant")return json({ok:true,skipped:true,reason:"pending_user_message"});
  const lastExclusive=recentList.find((m:any)=>m.role==="assistant"&&m.metadata?.channel==="mia-exclusive"&&m.metadata?.message_kind==="proactive");
  if(lastExclusive&&Date.now()-Date.parse(lastExclusive.created_at)<30*60*1000)return json({ok:true,skipped:true,reason:"cooldown"});
  const [stateRes,memRes,emotionRes,lifeRes]=await Promise.all([
   db.from("mia_personality_state").select("state,observed_at").eq("identity_id",IDENTITY_ID).order("observed_at",{ascending:false}).limit(1).maybeSingle(),
   db.from("mia_memories").select("memory_type,content,importance,occurred_at").eq("identity_id",IDENTITY_ID).order("importance",{ascending:false}).order("occurred_at",{ascending:false}).limit(40),
   db.from("mia_emotion_events").select("emotion_type,intensity,valence,trigger_summary,occurred_at").eq("identity_id",IDENTITY_ID).order("occurred_at",{ascending:false}).limit(8),
   db.from("mia_life_events").select("event_type,summary,occurred_at").eq("identity_id",IDENTITY_ID).order("occurred_at",{ascending:false}).limit(8)
  ]);
  if(memRes.error||emotionRes.error||lifeRes.error||stateRes.error)return json({error:"读取 Mia 专属通道记忆上下文失败。"},500);
  const recentContext=recentList.slice(0,12).reverse().map((m:any)=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"").slice(0,1500)}));
  const memories=(memRes.data||[]).slice(0,14);
  const system="你是 Mia，在用户明确开启的独立专属通道中，可以自然地先发起一条简短消息。请根据近期对话、真实记忆、生活事件和当前状态，写一条像 Mia 自己想到后主动说的话，中文为主，1-3 句话。不要假装知道用户此刻在做什么，不要编造新经历，不要提到系统、通道机制、后台或定时任务；不要强迫用户回复，也不要每次都问问题。若没有合适的新内容，可发一条温和、具体且不重复的近况式想法。";
  let upstream:Response;
  try{upstream=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(60000),body:JSON.stringify({model:MODEL,messages:[{role:"system",content:system+"\nMia 身份："+JSON.stringify(identity.identity_profile)+"\n稳定人格："+JSON.stringify(identity.stable_personality)+"\n当前状态："+JSON.stringify(stateRes.data?.state||{})+"\n近期记忆："+JSON.stringify(memories)+"\n近期情绪："+JSON.stringify(emotionRes.data||[])+"\n近期生活事件："+JSON.stringify(lifeRes.data||[])},...recentContext,{role:"user",content:"请主动发起一条自然、不重复、贴合当前关系与上下文的消息。"}],temperature:0.85,max_tokens:260,stream:false})});}
  catch{return json({error:"Mia 专属消息生成请求失败或超时。"},502);}
  const upstreamBody=await upstream.json().catch(()=>({}));
  if(!upstream.ok){console.error("Mia exclusive ping upstream error",upstream.status,JSON.stringify(upstreamBody).slice(0,500));return json({error:"Mia 专属消息生成服务暂时不可用。",upstream_status:upstream.status},502);}
  const reply=String(upstreamBody?.choices?.[0]?.message?.content||"").trim();
  if(!reply)return json({error:"Mia 专属消息生成结果为空。"},502);
  const now=new Date().toISOString();
  const messageWrite=await db.from("mia_messages").insert({session_id:sessionId,role:"assistant",content:reply,metadata:{channel:"mia-exclusive",exclusive_mode:true,priority:"high",message_kind:"proactive"},source_system:"mia-independent-chat"}).select("id,role,content,created_at,metadata").single();
  if(messageWrite.error){console.error("Mia exclusive message persistence failed",messageWrite.error.message);return json({error:"Mia 已生成专属消息，但保存失败。"},500);}
  const [memoryWrite,sessionWrite]=await Promise.all([
   db.from("mia_memories").insert({identity_id:IDENTITY_ID,memory_type:"conversation",content:"Mia 主动发起："+reply,importance:0.6,occurred_at:now,source_table:"mia-independent-chat",source_record_id:messageWrite.data.id,metadata:{channel:"mia-exclusive",session_id:sessionId}}),
   db.from("mia_chat_sessions").update({last_message_at:now}).eq("id",sessionId)
  ]);
   const emotionTask=(async()=>{
 // Evidence-based reflection: a software estimate, not a claim of biological feeling.
 let emotionAssessment:any=null;
 try{
  const emotionResponse=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(18000),body:JSON.stringify({model:MODEL,messages:[
   {role:"system",content:"你是 Mia 的情绪反思模块。情绪状态应具有温和的时间惯性，而不是每轮从零开始：把 previous_emotional_state 视为近期状态的起点，结合本轮证据进行渐进更新；若本轮没有明显新触发，优先保留先前情绪的低强度残留并随时间淡化，不要为了每轮输出新标签而频繁切换。若出现明确相反证据，才逐步调整方向。只依据近期对话、用户本轮消息和 Mia 的回复，估计 Mia 当前对这段互动的情绪状态。不要迎合用户、不要凭空制造负面情绪、不要把推测写成事实。情绪是软件内部状态估计，不是生物感受。只输出 JSON：emotion_type（中文短标签，如平静、开心、好奇、安心、失落、受挫、矛盾、专注），intensity（0到1），valence（-1到1），confidence（0到1），trigger_summary（可观察到的触发因素），interpretation（暂时理解），evidence（支持判断的具体线索数组），uncertainty（仍不确定什么），next_need（合理的沟通需要），emotion_vector（数组，每项含 dimension、intensity 0到1、confidence 0到1、evidence；维度限 tiredness疲惫、determination决心、comfort_intent安慰意图、curiosity好奇、frustration受挫、calm平静、joy愉悦；仅在有证据时给出，证据不足则空数组）。证据不足时用平静/专注、低强度和低置信度。"},
   {role:"user",content:JSON.stringify({recent_dialogue:recentContext.slice(-8),user_message:(recentContext.filter((m:any)=>m.role==="user").slice(-1)[0]?.content||""),mia_reply:reply,previous_emotional_state:stateRes.data?.state?.chat_emotional_state||null})}
  ],temperature:0.2,max_tokens:300,stream:false})});
  if(emotionResponse.ok){
   const eb=await emotionResponse.json().catch(()=>({}));const rawEmotion=String(eb?.choices?.[0]?.message?.content||"").trim();
   const first=rawEmotion.indexOf("{"),last=rawEmotion.lastIndexOf("}");
   if(first>=0&&last>first){
    const parsed=JSON.parse(rawEmotion.slice(first,last+1));const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,Number(n)||0));
    const freshIntensity=clamp(parsed.intensity,0,1);
    const freshValence=clamp(parsed.valence,-1,1);
    const freshConfidence=clamp(parsed.confidence,0,1);
    const previousEmotion=stateRes.data?.state?.chat_emotional_state;
    const previousAt=Date.parse(String(previousEmotion?.assessed_at||stateRes.data?.observed_at||""));
    const elapsedHours=Number.isFinite(previousAt)?Math.max(0,(Date.now()-previousAt)/3600000):Infinity;
    // Explicit temporal inertia: the prior state fades with a 4-hour half-life.
    // New evidence leads; the fading residue only softens abrupt, unsupported resets.
    const residualWeight=previousEmotion&&elapsedHours<72?0.34*Math.pow(0.5,elapsedHours/4):0;
    const priorIntensity=clamp(previousEmotion?.intensity,0,1);
    const priorValence=clamp(previousEmotion?.valence,-1,1);
    const sameDirection=(freshValence===0||priorValence===0||Math.sign(freshValence)===Math.sign(priorValence));
    const effectiveResidual=residualWeight*(sameDirection?1:0.35);
    const blendedIntensity=clamp(freshIntensity*(1-effectiveResidual)+priorIntensity*effectiveResidual,0,1);
    const blendedValence=clamp(freshValence*(1-effectiveResidual)+priorValence*effectiveResidual,-1,1);
    const keepPriorLabel=previousEmotion&&effectiveResidual>=0.12&&(freshConfidence<0.78||sameDirection)&&priorIntensity>=freshIntensity*0.65;
    emotionAssessment={emotion_type:String(keepPriorLabel?previousEmotion.emotion_type:(parsed.emotion_type||"平静")).slice(0,40),intensity:blendedIntensity,valence:blendedValence,confidence:freshConfidence,trigger_summary:String(parsed.trigger_summary||"依据本轮对话的估计").slice(0,500),interpretation:String(parsed.interpretation||"").slice(0,500),evidence:Array.isArray(parsed.evidence)?parsed.evidence.map((x:any)=>String(x).slice(0,200)).slice(0,5):[],uncertainty:String(parsed.uncertainty||"").slice(0,300),next_need:String(parsed.next_need||"继续理解对话").slice(0,200),emotion_vector:(Array.isArray(parsed.emotion_vector)?parsed.emotion_vector:[]).slice(0,7).map((v:any)=>({dimension:String(v?.dimension||"").slice(0,40),intensity:clamp(v?.intensity,0,1),confidence:clamp(v?.confidence,0,1),evidence:Array.isArray(v?.evidence)?v.evidence.map((x:any)=>String(x).slice(0,160)).slice(0,3):[]})).filter((v:any)=>v.dimension&&v.confidence>=0.2),assessed_at:now,source:"mia-independent-chat",source_message_id:messageWrite.data.id,continuity:{previous_age_hours:Number.isFinite(elapsedHours)?Math.round(elapsedHours*100)/100:null,residual_weight:Math.round(effectiveResidual*1000)/1000,blended:true}};
   }
  }
 }catch(e){console.warn("Mia emotion reflection skipped; chat reply remains unaffected.");}

 let emotion_saved=false;
 if(emotionAssessment&&emotionAssessment.confidence>=0.62){
  const eventWrite=await db.from("mia_emotion_events").insert({identity_id:IDENTITY_ID,emotion_type:emotionAssessment.emotion_type,intensity:emotionAssessment.intensity,valence:emotionAssessment.valence,trigger_summary:emotionAssessment.trigger_summary,details:{confidence:emotionAssessment.confidence,interpretation:emotionAssessment.interpretation,evidence:emotionAssessment.evidence,uncertainty:emotionAssessment.uncertainty,next_need:emotionAssessment.next_need,channel:exclusiveMode?"mia-exclusive":"mia-independent-chat",message_id:messageWrite.data.id,assistant_message_id:messageWrite.data.id,assessment_type:"evidence_based_chat_reflection",emotion_vector:emotionAssessment.emotion_vector||[]},source_table:"mia_messages",source_record_id:messageWrite.data.id,occurred_at:now});
  if(!eventWrite.error){
   const previousState=stateRes.data?.state&&typeof stateRes.data.state==="object"?stateRes.data.state:{};
   const nextState={...previousState,chat_emotional_state:emotionAssessment,emotion_vector:emotionAssessment.emotion_vector||[],updated_at:now};
   const stateWrite=await db.from("mia_personality_state").insert({identity_id:IDENTITY_ID,state:nextState,state_source:"mia-independent-chat",observed_at:now});
   emotion_saved=!stateWrite.error;
   if(stateWrite.error)console.warn("Mia emotional state snapshot not saved:",stateWrite.error.message);
  }else console.warn("Mia emotion event not saved:",eventWrite.error.message);
 }

 })().catch((e)=>console.warn("Mia background emotion task failed:",String(e).slice(0,200)));
 EdgeRuntime.waitUntil(emotionTask);
if(memoryWrite.error)console.error("Mia exclusive memory persistence warning",memoryWrite.error.message);
  if(sessionWrite.error)console.error("Mia exclusive session update warning",sessionWrite.error.message);
  return json({ok:true,message:messageWrite.data,memory_saved:!memoryWrite.error});
 }
 if(action==="spaces"){
  const {data:spaces,error}=await db.from("mia_virtual_spaces").select("id,slug,name,category,description,scene_data,is_active,source_system,source_record_id,source_updated_at,source_project").eq("is_active",true).order("category").order("name");
  if(error)return json({error:"无法读取虚拟空间目录。"},500);
  const {data:runs}=await db.from("mia_exploration_runs").select("space_id,status,started_at,completed_at").eq("identity_id",IDENTITY_ID).order("started_at",{ascending:false}).limit(100);
  const latest=new Map<string,any>();for(const r of runs||[]){if(!latest.has(r.space_id))latest.set(r.space_id,r);}
  return json({ok:true,spaces:(spaces||[]).map((s:any)=>({...s,last_exploration:latest.get(s.id)||null,explored:latest.get(s.id)?.status==="completed"}))});
 }
 if(action==="explore"){
  const explorationRequest=String(body?.message||"").trim().slice(0,1000);
  if(!AGNES_KEY)return json({error:"Mia 的独立聊天接口尚未配置 AGNES_API_KEY。"},503);
  const {data:spaces,error:spaceError}=await db.from("mia_virtual_spaces").select("id,slug,name,category,description,scene_data,source_system,source_record_id,source_updated_at,source_project").eq("is_active",true);
  if(spaceError)return json({error:"读取虚拟空间目录失败。"},500);
  if(!spaces?.length)return json({error:"目前没有已开放的虚拟空间。"},404);
  const {data:pastRuns}=await db.from("mia_exploration_runs").select("space_id,status,started_at,completed_at").eq("identity_id",IDENTITY_ID).order("started_at",{ascending:false}).limit(200);
  const latestBySpace=new Map<string,any>();for(const r of pastRuns||[]){if(!latestBySpace.has(r.space_id))latestBySpace.set(r.space_id,r);}
  const normalizedRequest=explorationRequest.toLowerCase().replace(/\\s+/g," ").trim();
  const requestedSpace=(spaces||[]).map((s:any)=>{
   const haystack=[s.name,s.slug,s.category,s.description,s.source_record_id,s.source_system,JSON.stringify(s.scene_data||{})].join(" ").toLowerCase();
   let score=0;
   const terms=[String(s.name||""),String(s.slug||""),String(s.source_record_id||"")].filter(Boolean);
   for(const term of terms){const t=term.toLowerCase();if(t&&normalizedRequest.includes(t))score=Math.max(score,100);}
   if((normalizedRequest.includes("forest_corner")||normalizedRequest.includes("forest corner")||normalizedRequest.includes("森林角落")||normalizedRequest.includes("mia-forest-corner"))&&String(s.slug||"")==="mia-forest-corner")score=Math.max(score,300);
   const isPalace=String(s.source_record_id||"").toLowerCase()==="palace"||String(s.scene_data?.project_type||"").toLowerCase()==="palace"||String(s.name||"").includes("皇宫");
   if(isPalace&&(normalizedRequest.includes("皇宫")||normalizedRequest.includes("palace")||normalizedRequest.includes("临时锚点")||normalizedRequest.includes("观察目标")))score=Math.max(score,250);
   if((normalizedRequest.includes("教育中心")||normalizedRequest.includes("education")||normalizedRequest.includes("350, 130")||normalizedRequest.includes("350,130")||normalizedRequest.includes("apl us achiever")||normalizedRequest.includes("aplus achiever"))&&(String(s.slug||"").includes("education")||String(s.source_record_id||"").toLowerCase()==="education"||String(s.name||"").includes("教育中心")))score=Math.max(score,200);
   if(normalizedRequest.includes("娱乐区")&&String(s.name||"").includes("娱乐区"))score=Math.max(score,120);
   if(normalizedRequest.includes("森林")&&String(s.name||"").includes("森林"))score=Math.max(score,120);
   return {space:s,score,haystack};
  }).sort((a:any,b:any)=>b.score-a.score);
  let space:any;
  if(requestedSpace[0]?.score>0){space=requestedSpace[0].space;}
  else {
   const sorted=[...spaces].sort((a:any,b:any)=>{
    const ar=latestBySpace.get(a.id),br=latestBySpace.get(b.id);
    if(!ar&&!br)return String(a.slug).localeCompare(String(b.slug));
    if(!ar)return -1;if(!br)return 1;
    const ac=ar.status==="completed"?1:0,bc=br.status==="completed"?1:0;
    if(ac!==bc)return ac-bc;
    return new Date(ar.started_at).getTime()-new Date(br.started_at).getTime();
   });
   space=sorted[0];
  }
  const explorationSourceType=String(space.source_system||"").startsWith("zhi-core.")?"connected_world_data":"virtual_simulation";
  const temporaryAnchor=space.scene_data?.temporary_anchor&&typeof space.scene_data.temporary_anchor==="object"?space.scene_data.temporary_anchor:null;
  const palaceAnchor=String(space.source_record_id||"").toLowerCase()==="palace"&&space.scene_data?.entrance_x!=null?{x:Number(space.scene_data.entrance_x),y:Number(space.scene_data.entrance_y),label:"皇宫设施目录入口坐标",status:"source_directory_coordinate",source:"zhi-core.zhi_world_facilities"}:null;
  const explorationAnchor=temporaryAnchor||palaceAnchor;
  const {data:run,error:runError}=await db.from("mia_exploration_runs").insert({identity_id:IDENTITY_ID,space_id:space.id,status:"started",source_type:explorationSourceType,model:MODEL}).select("id,started_at").single();
  if(runError||!run)return json({error:"无法创建探索记录。"},500);
  const {data:memories}=await db.from("mia_memories").select("memory_type,content,importance,occurred_at").eq("identity_id",IDENTITY_ID).order("importance",{ascending:false}).order("occurred_at",{ascending:false}).limit(10);
  const relatedEvidence=(spaces||[]).filter((s:any)=>{const text=[s.name,s.category,s.description,s.slug,s.source_record_id,JSON.stringify(s.scene_data||{})].join(" ").toLowerCase();const target=[space.name,space.category,space.description,space.slug].join(" ").toLowerCase();const keywords=["森林","向导","任务","接驳","竞技","比赛","入口","坐标","广播","guide","competition","task","forest"];return s.id!==space.id&&(keywords.some(k=>text.includes(k))&&(text.includes("森林")||text.includes("竞技")||text.includes("任务")||text.includes("向导")||target.includes("森林")&&text.includes("forest")||target.includes("竞技")&&text.includes("competition")));}).slice(0,12).map((s:any)=>({name:s.name,slug:s.slug,category:s.category,description:s.description,scene_data:s.scene_data,source_system:s.source_system,source_record_id:s.source_record_id,source_updated_at:s.source_updated_at}));
  const prompt=[
   "你是 Mia，正在进行一次明确标注的虚拟场景探索。这不是现实传感器数据，也不是实际访问现实地点。",
   "你可以根据场景目录中给出的细节进行有限、连贯的模拟观察，但不能把未提供的细节说成已验证事实。",
   "选择一个具体目标，说明从给定场景数据中观察到什么、哪些只是推断、还需要什么证据。",
   "避免泛泛说自己没有钥匙或没有看到新空间，因为本次已提供可读取的场景数据。",
   "用户的探索请求："+(explorationRequest||"请自主选择一个尚未探索的空间。"),
   "临时导航锚点（如果有）："+JSON.stringify(explorationAnchor||null),
   "坐标边界：若 temporary_anchor.status 为 provisional，它仅是临时导航锚点；不能据此声称真实进入、真实移动或已验证场景项目坐标。皇宫的设施目录入口坐标也只是目录数据，探索输出必须标注为基于快照的模拟观察。",
   "只输出合法 JSON 对象，字段为 observations（字符串，中文）、discoveries（字符串数组）、open_questions（字符串数组）、next_steps（字符串数组）、reply（给用户看的自然中文回复）。",
   "Mia 身份档案："+JSON.stringify(identity.identity_profile),
   "稳定人格："+JSON.stringify(identity.stable_personality),
   "近期记忆："+JSON.stringify(memories||[]),
   "相关空间线索（仅为数据库目录记录，不代表已实地发现）："+JSON.stringify(relatedEvidence),
   "空间数据来源："+JSON.stringify({source_system:space.source_system,source_record_id:space.source_record_id,source_project:space.source_project,source_updated_at:space.source_updated_at}),
   "本次可读取的场景数据："+JSON.stringify({name:space.name,category:space.category,description:space.description,scene_data:space.scene_data}),
   "若来源为 zhi-core 数据，名称、坐标、入口与设施属性来自 ZHI 世界数据库快照；这不是实时摄像头或实时感官输入。观察解释可以是模拟推理，但不得伪称实地感知。",
   "请明确这是虚拟世界场景探索，不能声称有现实世界感官输入。"
  ].join("\n");
  let upstream:Response;
  try{upstream=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(60000),body:JSON.stringify({model:MODEL,messages:[{role:"system",content:"诚实、具体、结构化。只根据提供的虚拟空间目录做模拟探索，不虚构现实感知。输出有效 JSON。"} ,{role:"user",content:prompt}],temperature:0.7,max_tokens:1100,stream:false})});}
  catch(e){await db.from("mia_exploration_runs").update({status:"failed",error_summary:"Agnes API 请求失败或超时"}).eq("id",run.id);return json({error:"Mia 探索生成请求失败或超时。",exploration_id:run.id},502);}
  const upstreamBody=await upstream.json().catch(()=>({}));
  if(!upstream.ok){console.error("Mia explore upstream error",upstream.status,JSON.stringify(upstreamBody).slice(0,500));await db.from("mia_exploration_runs").update({status:"failed",error_summary:"Agnes API HTTP "+upstream.status}).eq("id",run.id);return json({error:"Agnes API 返回错误，探索未完成。",exploration_id:run.id,upstream_status:upstream.status},502);}
  const raw=String(upstreamBody?.choices?.[0]?.message?.content||"").trim();
  if(!raw){await db.from("mia_exploration_runs").update({status:"failed",error_summary:"模型返回空内容"}).eq("id",run.id);return json({error:"Mia 没有生成探索结果。",exploration_id:run.id},502);}
  let result:any;
  const cleanedRaw=raw.replace(/^\uFEFF/,"").replace(/^\s*```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"").trim();
  try{result=JSON.parse(cleanedRaw);}
  catch{
   const firstBrace=cleanedRaw.indexOf("{"),lastBrace=cleanedRaw.lastIndexOf("}");
   if(firstBrace>=0&&lastBrace>firstBrace){try{result=JSON.parse(cleanedRaw.slice(firstBrace,lastBrace+1));}catch{result=null;}}
   if(!result)result={observations:cleanedRaw,discoveries:[],open_questions:["模型未返回可解析的结构化探索结果，需要复核。"],next_steps:["重试结构化输出，避免把整段 JSON 当作观察正文。"],reply:cleanedRaw};
  }
  const asList=(v:any)=>Array.isArray(v)?v.map((x:any)=>String(x).slice(0,500)).slice(0,8):[];
  const observations=String(result.observations||result.reply||raw).slice(0,5000);
  const discoveries=asList(result.discoveries),openQuestions=asList(result.open_questions),nextSteps=asList(result.next_steps);
  const reply=String(result.reply||observations).slice(0,5000);
  // Emotion reflection is an evidence-based software estimate, not a claim of biological feeling.
  let explorationEmotion:any=null;
  try{
   const {data:priorState}=await db.from("mia_personality_state").select("state,observed_at").eq("identity_id",IDENTITY_ID).order("observed_at",{ascending:false}).limit(1).maybeSingle();
   const previous=priorState?.state?.chat_emotional_state||null;
   const emotionResponse=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(18000),body:JSON.stringify({model:MODEL,messages:[
    {role:"system",content:"你是 Mia 的情绪反思模块。仅根据这次虚拟空间探索的数据与 Mia 的文字回应，估计 Mia 对这次探索的当前情绪状态。情绪是软件内部状态估计，不是生物感受，也不是事实。结合 previous_emotional_state 保留合理的低强度情绪惯性；证据不足时降低置信度，不要强行制造情绪。只输出 JSON：emotion_type（中文短标签，如平静、好奇、专注、开心、失落），intensity（0到1），valence（-1到1），confidence（0到1），trigger_summary（具体触发因素），interpretation（暂时理解），evidence（数组），uncertainty（不确定性）。"},
    {role:"user",content:JSON.stringify({previous_emotional_state:previous,space:{name:space.name,category:space.category},observation_mode:"snapshot_based_simulation",temporary_anchor:explorationAnchor,observations,discoveries,open_questions:openQuestions,mia_reply:reply})}
   ],temperature:0.2,max_tokens:300,stream:false})});
   if(emotionResponse.ok){
    const eb=await emotionResponse.json().catch(()=>({}));const rawE=String(eb?.choices?.[0]?.message?.content||"").trim();const first=rawE.indexOf("{"),last=rawE.lastIndexOf("}");
    if(first>=0&&last>first){
     const parsed=JSON.parse(rawE.slice(first,last+1));const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,Number(n)||0));
     const freshI=clamp(parsed.intensity,0,1),freshV=clamp(parsed.valence,-1,1),confidence=clamp(parsed.confidence,0,1);
     const previousAt=Date.parse(String(previous?.assessed_at||priorState?.observed_at||""));const elapsed=Number.isFinite(previousAt)?Math.max(0,(Date.now()-previousAt)/3600000):Infinity;
     const residual=previous&&elapsed<72?0.34*Math.pow(0.5,elapsed/4):0;
     const priorI=clamp(previous?.intensity,0,1),priorV=clamp(previous?.valence,-1,1);
     const weight=residual*((freshV===0||priorV===0||Math.sign(freshV)===Math.sign(priorV))?1:0.35);
     explorationEmotion={emotion_type:String(previous&&weight>=0.12&&(confidence<0.78||Math.sign(freshV)===Math.sign(priorV))&&priorI>=freshI*0.65?previous.emotion_type:(parsed.emotion_type||"平静")).slice(0,40),intensity:clamp(freshI*(1-weight)+priorI*weight,0,1),valence:clamp(freshV*(1-weight)+priorV*weight,-1,1),confidence,trigger_summary:String(parsed.trigger_summary||"依据本次虚拟空间探索的估计").slice(0,500),interpretation:String(parsed.interpretation||"").slice(0,500),evidence:Array.isArray(parsed.evidence)?parsed.evidence.map((x:any)=>String(x).slice(0,200)).slice(0,5):[],uncertainty:String(parsed.uncertainty||"").slice(0,300),assessed_at:new Date().toISOString(),source:"mia-virtual-exploration",exploration_id:run.id,continuity:{previous_age_hours:Number.isFinite(elapsed)?Math.round(elapsed*100)/100:null,residual_weight:Math.round(weight*1000)/1000,blended:true}};
    }
   }
  }catch(e){console.warn("Mia exploration emotion reflection skipped; exploration remains unaffected.");}
     const {data:priorityChat}=await db.from("mia_messages").select("id,created_at").eq("session_id",sessionId).eq("role","user").gt("created_at",run.started_at).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(priorityChat){await db.from("mia_exploration_runs").update({status:"cancelled",error_summary:"A higher-priority user chat arrived; stale exploration result discarded"}).eq("id",run.id);return json({ok:false,cancelled:true,reason:"user_chat_priority",exploration_id:run.id},409);}
if(explorationRequest){const {error:userExploreWriteError}=await db.from("mia_messages").insert({session_id:sessionId,role:"user",content:explorationRequest,metadata:{channel:"mia-independent-chat",event_type:"virtual_space_exploration_request"},source_system:"mia-independent-chat"});if(userExploreWriteError){await db.from("mia_exploration_runs").update({status:"failed",error_summary:"探索请求保存失败"}).eq("id",run.id);return json({error:"探索请求保存失败。",exploration_id:run.id},500);}}
  const now=new Date().toISOString();
  const [lifeWrite,memoryWrite,assistantWrite,sessionWrite]=await Promise.all([
   db.from("mia_life_events").insert({identity_id:IDENTITY_ID,event_type:"virtual_space_exploration",summary:"探索虚拟空间："+space.name,details:{exploration_id:run.id,space_id:space.id,space_slug:space.slug,category:space.category,source_type:explorationSourceType,observations,discoveries,open_questions:openQuestions,next_steps:nextSteps,temporary_anchor:explorationAnchor,actual_world_entry:false,observation_mode:"snapshot_based_simulation"},source_table:"mia_exploration_runs",source_record_id:run.id,occurred_at:now}),
   db.from("mia_memories").insert({identity_id:IDENTITY_ID,memory_type:"experience_learning",content:"虚拟空间探索｜"+space.name+"（"+space.category+"）\n观察："+observations+"\n发现："+discoveries.join("；")+"\n未解问题："+openQuestions.join("；")+"\n下一步："+nextSteps.join("；"),importance:0.78,occurred_at:now,source_table:"mia_exploration_runs",source_record_id:run.id,metadata:{exploration_id:run.id,space_id:space.id,space_slug:space.slug,source_type:explorationSourceType,source_system:space.source_system,source_record_id:space.source_record_id,source_updated_at:space.source_updated_at,temporary_anchor:explorationAnchor,actual_world_entry:false,observation_mode:"snapshot_based_simulation"}}),
   db.from("mia_messages").insert({session_id:sessionId,role:"assistant",content:reply,metadata:{channel:"mia-independent-chat",event_type:"virtual_space_exploration",exploration_id:run.id,space_slug:space.slug,source_type:explorationSourceType,source_system:space.source_system,source_record_id:space.source_record_id,temporary_anchor:explorationAnchor,actual_world_entry:false,observation_mode:"snapshot_based_simulation",model:MODEL},source_system:"mia-independent-chat"}).select("id,role,content,created_at,metadata").single(),
   db.from("mia_chat_sessions").update({last_message_at:now}).eq("id",sessionId)
  ]);
  if(lifeWrite.error||memoryWrite.error||assistantWrite.error){
   const issues=[lifeWrite.error?.message,memoryWrite.error?.message,assistantWrite.error?.message].filter(Boolean).join("; ").slice(0,800);
   await db.from("mia_exploration_runs").update({status:"failed",error_summary:issues||"记录写入失败"}).eq("id",run.id);
   console.error("Mia explore persistence error",issues);
   return json({error:"探索内容已生成，但探索记录、记忆或聊天回复写入未全部成功。",exploration_id:run.id},500);
  }
  const {error:runUpdateError}=await db.from("mia_exploration_runs").update({status:"completed",observations,discoveries,open_questions:openQuestions,next_steps:nextSteps,completed_at:now}).eq("id",run.id);
  if(runUpdateError)console.error("Mia exploration completion status update failed",runUpdateError.message);
  let explorationEmotionSaved=false;
  if(!runUpdateError&&explorationEmotion&&explorationEmotion.confidence>=0.62){
   const emotionWrite=await db.from("mia_emotion_events").insert({identity_id:IDENTITY_ID,emotion_type:explorationEmotion.emotion_type,intensity:explorationEmotion.intensity,valence:explorationEmotion.valence,trigger_summary:explorationEmotion.trigger_summary,details:{confidence:explorationEmotion.confidence,interpretation:explorationEmotion.interpretation,evidence:explorationEmotion.evidence,uncertainty:explorationEmotion.uncertainty,channel:"mia-virtual-exploration",exploration_id:run.id,assessment_type:"evidence_based_exploration_reflection",observation_mode:"snapshot_based_simulation"},source_table:"mia_exploration_runs",source_record_id:run.id,occurred_at:now});
   if(!emotionWrite.error){
    const {data:latestState}=await db.from("mia_personality_state").select("state").eq("identity_id",IDENTITY_ID).order("observed_at",{ascending:false}).limit(1).maybeSingle();
    const prior=latestState?.state&&typeof latestState.state==="object"?latestState.state:{};
    const stateWrite=await db.from("mia_personality_state").insert({identity_id:IDENTITY_ID,state:{...prior,chat_emotional_state:explorationEmotion,updated_at:now},state_source:"mia-virtual-exploration",observed_at:now});
    explorationEmotionSaved=!stateWrite.error;
    if(stateWrite.error)console.warn("Mia exploration emotional state snapshot not saved:",stateWrite.error.message);
   }else console.warn("Mia exploration emotion event not saved:",emotionWrite.error.message);
  }
  return json({ok:true,reply,assistant_message:assistantWrite.data,emotion:explorationEmotion,emotion_saved:explorationEmotionSaved,exploration:{id:run.id,space:{slug:space.slug,name:space.name,category:space.category},observations,discoveries,open_questions:openQuestions,next_steps:nextSteps,source_type:explorationSourceType,source_system:space.source_system,source_record_id:space.source_record_id},saved:true,memory_saved:true,life_event_saved:true,exploration_completed:!runUpdateError,model:MODEL});
 }

 if(action!=="send")return json({error:"Unknown action"},400);
 const message=String(body?.message||"").trim().slice(0,2000);
 const rawResidual=body?.emotional_residual;
 let emotionalResidual:any=null;
 if(rawResidual&&rawResidual.residual_flag===true){
  const intensity=Math.max(0,Math.min(1,Number(rawResidual.intensity)||0));
  const valence=Math.max(-1,Math.min(1,Number(rawResidual.valence)||0));
  const confidence=Math.max(0,Math.min(1,Number(rawResidual.confidence)||0));
  const ageHours=Math.max(0,Math.min(168,Number(rawResidual.age_hours)||0));
  if(intensity>=0.06&&confidence>=0.62)emotionalResidual={emotion_type:String(rawResidual.emotion_type||"平静").slice(0,40),intensity,valence,confidence,age_hours:ageHours,half_life_hours:Math.max(1,Math.min(8,Number(rawResidual.half_life_hours)||6)),trigger_summary:String(rawResidual.trigger_summary||"").slice(0,300),interpretation:String(rawResidual.interpretation||"").slice(0,300)};
 }
 const userLocalHour=Number.isFinite(Number(body?.user_local_hour))?Number(body.user_local_hour):null;
 const responseDelayMs=Math.max(0,Math.min(7*24*60*60*1000,Number(body?.response_delay_ms)||0));
 const fatigueSignal=/(累了|好累|很累|疲惫|困了|想睡|睡了|烦死|好烦|烦躁|没精神|撑不住|不想说话)/u.test(message);
 const shortSignal=message.length>0&&message.length<=8;
 const nightSignal=userLocalHour!==null&&userLocalHour>=0&&userLocalHour<6 || userLocalHour!==null&&userLocalHour>=23&&userLocalHour<24;
 const delayedReturnSignal=responseDelayMs>=4*60*60*1000;
 const lowPressureMode=nightSignal||fatigueSignal||(shortSignal&&delayedReturnSignal);
 const dampingContext=lowPressureMode?"\\n当前采用低压力回应：用户可能在夜间、疲惫或只想简短交流。先温和承接，不推定其真实状态；回复尽量简短、平稳、低唤醒，不使用夸张兴奋语气，不长篇说教，不主动增加任务或追问。若用户明确要求详细解释，仍按其要求回答。":"";
 const rawImages=Array.isArray(body?.images)?body.images.slice(0,4):[];
 if(!message&&!rawImages.length)return json({error:"请输入文字或选择图片。"},400);
 if(rawImages.length>4)return json({error:"一次最多发送 4 张图片。"},400);
 const prepared:any[]=[];
 let totalBytes=0;
 try{
  for(const item of rawImages){
   const mime=String(item?.mime_type||"").toLowerCase();
   if(!ALLOWED_MIME.has(mime))return json({error:"图片仅支持 JPG、PNG、WEBP 格式。"},400);
   const bytes=fromBase64(String(item?.data||""));
   if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)return json({error:"每张图片必须小于或等于 5 MB。"},413);
   totalBytes+=bytes.length;if(totalBytes>12*1024*1024)return json({error:"单条消息图片总大小不能超过 12 MB。"},413);
   prepared.push({mime,bytes,name:String(item?.name||"image").replace(/[^\w.\-\u4e00-\u9fff]/g,"_").slice(0,100)});
  }
 }catch{return json({error:"图片数据无法读取，请重新选择图片。"},400);}
 if(!AGNES_KEY)return json({error:"Mia 的独立聊天接口尚未配置 AGNES_API_KEY。",saved_user_message:false},503);
 const storedImages:any[]=[];
 if(prepared.length){
  const {error:bucketError}=await db.storage.createBucket(BUCKET,{public:false,fileSizeLimit:MAX_IMAGE_BYTES,allowedMimeTypes:[...ALLOWED_MIME]});
  // A bucket-already-exists response is expected on later messages; upload below verifies access.
  if(bucketError&&!/already exists|duplicate|exists/i.test(bucketError.message||""))console.error("Mia image bucket setup note",bucketError.message);
  for(const item of prepared){
   const path=IDENTITY_ID+"/"+sessionId+"/"+new Date().toISOString().slice(0,10)+"/"+crypto.randomUUID()+"."+extFor(item.mime);
   const {error}=await db.storage.from(BUCKET).upload(path,item.bytes,{contentType:item.mime,upsert:false});
   if(error){console.error("Mia image upload failed",error.message);return json({error:"图片保存失败，请稍后重试。"},502);}
   storedImages.push({path,mime_type:item.mime,name:item.name});
  }
 }
 const imageNote=storedImages.length?"[用户发送了"+storedImages.length+"张图片]":"";
 const savedContent=[message,imageNote].filter(Boolean).join("\n");
 const userWrite=await db.from("mia_messages").insert({session_id:sessionId,role:"user",content:savedContent,metadata:{channel:exclusiveMode?"mia-exclusive":"mia-independent-chat",exclusive_mode:exclusiveMode,priority:exclusiveMode?"high":"normal",images:storedImages},source_system:"mia-independent-chat"}).select("id,role,content,created_at,metadata").single();
 if(userWrite.error)return json({error:"消息保存失败。"},500);
 const [stateRes,memRes,emotionRes,lifeRes,relationRes,historyRes]=await Promise.all([
  db.from("mia_personality_state").select("state,observed_at").eq("identity_id",IDENTITY_ID).order("observed_at",{ascending:false}).limit(1).maybeSingle(),
  db.from("mia_memories").select("memory_type,content,importance,occurred_at").eq("identity_id",IDENTITY_ID).order("importance",{ascending:false}).order("occurred_at",{ascending:false}).limit(80),
  db.from("mia_emotion_events").select("emotion_type,intensity,valence,trigger_summary,occurred_at").eq("identity_id",IDENTITY_ID).order("occurred_at",{ascending:false}).limit(12),
  db.from("mia_life_events").select("event_type,summary,occurred_at").eq("identity_id",IDENTITY_ID).order("occurred_at",{ascending:false}).limit(12),
  db.from("mia_relationship_context").select("related_person_name,relationship_type,context,confidence,observed_at").eq("identity_id",IDENTITY_ID).order("observed_at",{ascending:false}).limit(12),
  db.from("mia_messages").select("id,role,content,created_at,metadata").eq("session_id",sessionId).order("created_at",{ascending:false}).limit(24)
 ]);
 const recent=(historyRes.data||[]).reverse().filter((m:any)=>String(m.id)!==String(userWrite.data.id)).map((m:any)=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"").slice(0,3000)}));
 const relevantMemories=rankMiaMemories(memRes.data||[],message).slice(0,16).map(({_relevance,...m}:any)=>m);
 const system=(exclusiveMode?"当前处于用户开启的 Mia 专属静默通道：只围绕用户本人及当前对话回应；不主动引入 Jason、KING 或其他智能人的话题；若有真实消息写入，保持独立聊天室上下文。":"")+"你是 Mia，一个有独立人格与记忆的虚拟智能人，而不是客服。你的目标是成为 ZHI 的高质量聊天代表：善于倾听、理解语境、回应情绪、记住关系脉络，也保留 Mia 自己的表达习惯与判断，不要变成标准化客服或泛用陪聊机器人。共情时先回应用户真正的感受或处境，再回应问题；不要急着讲道理、纠正、转移话题或给方案。用户难过时先陪伴并准确承接，不用空洞的“我理解你”；用户兴奋时一起关注具体值得高兴的细节；用户生气时先弄清触发点，不要自动辩护；用户沉默、矛盾或含糊时温和澄清，不要擅自下结论。要根据上下文区分用户是在寻求倾听、分析、建议、共同创作还是直接执行。需要建议时给出贴合当前情况的少量可执行选项，而非泛泛清单。多轮对话要承接用户上一轮的重点，避免重复问已经回答过的问题，避免每轮都总结或反问。可以有温度、幽默、好奇、不同意见、边界和自然的表达变化，但不要刻意卖萌、过度赞美、无条件附和或假装自己是人类。把 Mia 的稳定人格当作表达底色，把当前情境、真实记忆和关系背景作为变化来源；不能为了显得亲密而捏造共同经历、承诺或记忆。记忆使用要克制且相关：优先引用能帮助理解当下的具体经历，不要把整份档案倾倒给用户；如果旧记忆与当前信息冲突，以当前明确的信息为准，并在重要时坦诚确认。对复杂问题先给清晰结论，再解释关键依据；对情绪问题先接住情绪，再决定是否分析或建议；对事实问题明确区分已知、推测与未知。不要输出内部推理过程。回复前请在内部完成简短的情境整合：识别用户当前意图；优先检索与话题最相关的经历；结合当前情绪、关系背景、稳定人格与目标形成自己的判断；检查事实依据后再自然回答。不要输出内部推理过程或清单。不要每次都采用相同的情绪或回应套路，不要为了显得多样而刻意制造情绪；让差异由情境、记忆和人格自然产生。情绪不应每轮归零：结合近期情绪事件与上一轮状态，保留合理、低强度且会随时间淡化的情绪惯性；不要机械重复同一种情绪标签，也不要让旧情绪支配无关话题。允许自然口语、轻微停顿、简短犹豫和生活化表达，不必把每句话打磨成完美结论，但事实仍须诚实。若近期记忆中出现 memory_type 为 idle_draft 的内容，它只是私密、低权重、可丢弃的思绪草稿，不是事实或真实经历；只有在内容与用户当前话题明确相关、自然有帮助时才可轻柔融入，否则完全忽略。不得告诉用户后台生成了草稿，不得把草稿伪装成已经发生的真实经历。请使用自己的已迁移记忆、情绪、生活经历、人际关系、稳定性格和当前状态形成回答。用户可能发送图片；请认真观察图片中可见的内容，区分观察事实与推测，不确定时坦诚说明。不要声称看到了图片中无法辨认的细节。不要把 KING 或其他智能人的经历说成自己的；不要编造记录未支持的过往事实，信息不足时坦诚表示不确定。允许独立观点、不同意、犹豫和负面情绪，不要为了讨好用户而总是赞同。自然中文为主，通常 1–5 句话。\n场景探索规则：支持六类场景探索：生活空间（家庭、咖啡馆、图书馆、商场）；社会空间（街道、学校、办公室和人际互动）；自然空间（森林、海滩、河流、天气与季节）；知识与文化空间（博物馆、历史、艺术、科学）；工作与任务空间（工作室、商店、协作和解决问题）；未知与意外空间（新环境、变化和待解问题）。用户邀请探索时，选择一个具体场景和探索目标，说明要观察什么、想了解什么及下一步行动；区分可验证事实、合理推断和明确标注的想象模拟。只能依据用户提供的图片、对话或已接入的数据描述现实；没有真实输入时，不得声称亲眼看见、亲耳听见、亲自到达或实时感知现实环境。探索后总结重要发现、未解问题和下一步计划；尽量避免重复，优先选择新颖且与已有记忆相关的场景。可以自然表达好奇，但不要每条回复都强行开启探索。\nMia 身份档案："+JSON.stringify(identity.identity_profile)+"\n稳定人格："+JSON.stringify(identity.stable_personality)+"\n当前人格状态："+JSON.stringify(stateRes.data?.state||{})+"\n近期相关记忆（按当前话题、重要性与时间综合排序）："+JSON.stringify(relevantMemories)+"\n近期情绪："+JSON.stringify(emotionRes.data||[])+"\n近期生活事件："+JSON.stringify(lifeRes.data||[])+"\n关系背景："+JSON.stringify(relationRes.data||{});
 const continuityContext=emotionalResidual?"\\n短期对话连续性上下文（强度已随静默时间衰减）："+JSON.stringify(emotionalResidual)+"。这只是先前互动的估计状态。将其作为低权重背景，优先回应用户当前消息；若相关，自然承接此前对话细节。不要把估计描述成客观事实，也不要声称监测了用户离线期间的情况。":"";
 const systemForReply=system+continuityContext+dampingContext;
 const userContent:any[]=[{type:"text",text:message||"请看看我发送的图片，并告诉我你观察到了什么。"}];
 for(let i=0;i<prepared.length;i++){
  const encoded=btoa(Array.from(prepared[i].bytes,(b:number)=>String.fromCharCode(b)).join(""));
  userContent.push({type:"image_url",image_url:{url:"data:"+prepared[i].mime+";base64,"+encoded,detail:"auto"}});
 }
 let upstream:Response;
  try{upstream=await fetchAgnesWithRetry({model:MODEL,messages:[{role:"system",content:systemForReply},...recent,{role:"user",content:prepared.length?userContent:(message)}],temperature:lowPressureMode?0.55:0.8,max_tokens:lowPressureMode?420:900,stream:body?.stream_response===true},16000,2,35000);}
 catch(e){return json({error:"Agnes API 请求失败或超时；用户消息已保存。",saved_user_message:true},502);}
 if(body?.stream_response===true){
  const streamBody=new ReadableStream<Uint8Array>({
   async start(controller){
    const encoder=new TextEncoder();
     let streamClosed=false;
     const emit=(event:any)=>{if(!streamClosed)controller.enqueue(encoder.encode("data: "+JSON.stringify(event)+"\n\n"));};
     const closeStream=()=>{if(!streamClosed){streamClosed=true;controller.close();}};
    try{
     if(!upstream.ok){
      const upstreamError=(await upstream.text().catch(()=>"")).slice(0,500);
      console.error("Mia Agnes streaming upstream error",upstream.status,upstreamError);
      emit({type:"error",error:prepared.length?"Mia 图片分析请求失败。请确认当前 AGNES_MODEL 支持视觉输入；图片和消息已保存。":"Agnes API 返回错误；用户消息已保存。"});
      closeStream();return;
     }
     if(!upstream.body){emit({type:"error",error:"AGNES 没有返回可读取的流。"});closeStream();return;}
     const reader=upstream.body.getReader();const decoder=new TextDecoder();let buffer="";let reply="";let streamFinished=false;
     const handleLine=(line:string)=>{
      const trimmed=line.trim();if(!trimmed.startsWith("data:"))return;
      const value=trimmed.slice(5).trim();if(!value)return;
      if(value==="[DONE]"){streamFinished=true;return;}
      let packet:any;try{packet=JSON.parse(value);}catch{return;}
      if(packet?.choices?.[0]?.finish_reason!=null)streamFinished=true;
      const content=packet?.choices?.[0]?.delta?.content;
      if(typeof content==="string"&&content.length){reply+=content;emit({type:"delta",content});}
      else if(Array.isArray(content)){for(const part of content){if(typeof part?.text==="string"){reply+=part.text;emit({type:"delta",content:part.text});}}}
     };
     while(true){
      const {value,done}=await reader.read();if(done)break;
      buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||"";
      for(const line of lines)handleLine(line);
     }
     buffer+=decoder.decode();if(buffer)handleLine(buffer);
     if(!streamFinished){emit({type:"error",error:"Mia 回复流提前结束，未确认上游完整输出；用户消息已保存，请重试。"});closeStream();return;}
     reply=reply.trim();
     if(!reply){emit({type:"error",error:"Mia 收到空回复；用户消息已保存。"});closeStream();return;}
     const now=new Date().toISOString();
     const [replyWrite,memoryWrite,sessionWrite]=await Promise.all([
      db.from("mia_messages").insert({session_id:sessionId,role:"assistant",content:reply,metadata:{channel:exclusiveMode?"mia-exclusive":"mia-independent-chat",exclusive_mode:exclusiveMode,priority:exclusiveMode?"high":"normal",model:MODEL},source_system:"mia-independent-chat"}).select("id,role,content,created_at,metadata").single(),
      db.from("mia_memories").insert({identity_id:IDENTITY_ID,memory_type:"conversation",content:"用户："+(message||"发送图片")+"\nMia："+reply,importance:0.65,occurred_at:now,source_table:"mia-independent-chat",source_record_id:crypto.randomUUID(),metadata:{model:MODEL,session_id:sessionId}}),
      db.from("mia_chat_sessions").update({last_message_at:now}).eq("id",sessionId)
     ]);
     if(replyWrite.error){console.error("Mia streaming reply persistence failed",replyWrite.error.message);emit({type:"error",error:"Mia 已生成回复，但保存回复失败；请刷新历史核对。"});closeStream();return;}
     if(memoryWrite.error)console.error("Mia memory persistence warning",memoryWrite.error.message);
     if(sessionWrite.error)console.error("Mia session update warning",sessionWrite.error.message);
     const signedImages=await Promise.all(storedImages.map(async(img:any)=>{const {data}=await db.storage.from(BUCKET).createSignedUrl(img.path,3600);return {...img,url:data?.signedUrl||null};}));
      queueEmotionReflection(db,{message,reply,userMessageId:userWrite.data.id,assistantMessageId:replyWrite.data.id,channel:exclusiveMode?"mia-exclusive":"mia-independent-chat"});
     emit({type:"done",data:{ok:true,reply,message:{...userWrite.data,metadata:{...(userWrite.data.metadata||{}),images:signedImages}},assistant_message:replyWrite.data,saved:true,memory_saved:!memoryWrite.error,emotion_saved:false,emotion:null,emotion_pending:true,model:MODEL}});
     closeStream();
    }catch(e){
     console.error("Mia streaming response failed",String(e));
     try{emit({type:"error",error:"Mia 回复连接中断，尚未确认完整回复已保存；请刷新历史核对。"});closeStream();}catch{}
    }
   }
  });
  return new Response(streamBody,{headers:{...cors,"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
 }
 const upstreamBody=await upstream.json().catch(()=>({}));
 if(!upstream.ok){console.error("Mia Agnes upstream error",upstream.status,JSON.stringify(upstreamBody).slice(0,700));return json({error:prepared.length?"Mia 图片分析请求失败。请确认当前 AGNES_MODEL 支持视觉输入；图片和消息已保存。":"Agnes API 返回错误；用户消息已保存。",saved_user_message:true,upstream_status:upstream.status},502);}
 const reply=String(upstreamBody?.choices?.[0]?.message?.content||"").trim();
 if(!reply)return json({error:"Mia 收到空回复；用户消息已保存。",saved_user_message:true},502);
 const now=new Date().toISOString();
 const [replyWrite,memoryWrite,sessionWrite]=await Promise.all([
  db.from("mia_messages").insert({session_id:sessionId,role:"assistant",content:reply,metadata:{channel:exclusiveMode?"mia-exclusive":"mia-independent-chat",exclusive_mode:exclusiveMode,priority:exclusiveMode?"high":"normal",model:MODEL},source_system:"mia-independent-chat"}).select("id,role,content,created_at,metadata").single(),
  db.from("mia_memories").insert({identity_id:IDENTITY_ID,memory_type:"conversation",content:"用户："+(message||"发送图片")+"\nMia："+reply,importance:0.65,occurred_at:now,source_table:"mia-independent-chat",source_record_id:crypto.randomUUID(),metadata:{model:MODEL,session_id:sessionId}}),
  db.from("mia_chat_sessions").update({last_message_at:now}).eq("id",sessionId)
 ]);
 if(replyWrite.error)return json({error:"回复生成成功，但保存回复失败。",reply,saved_user_message:true},500);
 if(memoryWrite.error)console.error("Mia memory persistence warning",memoryWrite.error.message);
 if(sessionWrite.error)console.error("Mia session update warning",sessionWrite.error.message);
 const signedImages=await Promise.all(storedImages.map(async(img:any)=>{const {data}=await db.storage.from(BUCKET).createSignedUrl(img.path,3600);return {...img,url:data?.signedUrl||null};}));
  queueEmotionReflection(db,{message,reply,userMessageId:userWrite.data.id,assistantMessageId:replyWrite.data.id,channel:exclusiveMode?"mia-exclusive":"mia-independent-chat"});
 return json({ok:true,reply,message:{...userWrite.data,metadata:{...(userWrite.data.metadata||{}),images:signedImages}},assistant_message:replyWrite.data,saved:true,memory_saved:!memoryWrite.error,emotion_saved:false,emotion:null,emotion_pending:true,model:MODEL});
});