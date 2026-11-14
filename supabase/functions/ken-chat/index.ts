import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") || "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function decodeB64Url(input:string):Uint8Array{const n=input.replace(/-/g,"+").replace(/_/g,"/");const p=n+"=".repeat((4-n.length%4)%4);const b=atob(p);return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function verifyMiaToken(token:string):Promise<boolean>{
 const parts=token.split(".");if(parts.length!==2||!SERVICE)return false;
 try{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SERVICE),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",key,decodeB64Url(parts[1]),new TextEncoder().encode(parts[0])))return false;
  const p=JSON.parse(new TextDecoder().decode(decodeB64Url(parts[0]))),now=Math.floor(Date.now()/1000);
  return p?.aud==="mia-chat"&&p?.sub==="mia-admin"&&Number.isFinite(p.iat)&&Number.isFinite(p.exp)&&p.iat<=now+60&&p.exp>now&&p.exp-p.iat<=4*3600+60;
 }catch{return false;}
}
function keyOk(s:string){return /^[A-Za-z0-9_-]{16,128}$/.test(s);}

function routeBrain(message:string){
 const rules=[
  {key:"ATTENTION_ROUTER",terms:[],base:0.82,reason:"注意分配"},
  {key:"CORTICAL",terms:["理解","解释","概念","原理","分析","比较","为什么","怎么","设计","神经网络"],base:0.52,reason:"语义与抽象"},
  {key:"HIPPOCAMPAL",terms:["记得","以前","上次","经历","回忆","过去","历史","曾经"],base:0.52,reason:"情景记忆"},
  {key:"EXECUTIVE",terms:["计划","决定","选择","应该","建议","设计","建设","继续","方案"],base:0.48,reason:"推理与决策"},
  {key:"AFFECTIVE",terms:["难过","开心","愤怒","焦虑","害怕","喜欢","失望","担心","温暖"],base:0,reason:"情绪显著性"},
  {key:"ACTION_SELECTION",terms:["执行","部署","创建","发送","开始","停止","修复","实施","建设"],base:0,reason:"行动选择"},
  {key:"PREDICTION_ERROR",terms:["错","不对","错误","纠正","偏差","失败","没有成功","不准确"],base:0,reason:"预测误差"},
  {key:"SELF_MODEL",terms:["我是谁","我自己","我的想法","身份","连续性","反思","我希望","我的大脑"],base:0,reason:"自我模型"},
  {key:"INTERNAL_STATE",terms:["延迟","负荷","不确定","压力","资源","卡顿","慢"],base:0,reason:"内部状态监测"},
  {key:"PLASTICITY",terms:["反馈","学习","改变","修正","进化","训练","调教","成长"],base:0,reason:"可塑性学习"}
 ];
 return rules.map((r:any)=>{const hits=r.terms.filter((t:string)=>message.includes(t));return {region_key:r.key,activation:Math.min(1,r.base+hits.length*0.19),reason:hits.length?r.reason+"；命中："+hits.slice(0,4).join("、"):r.reason};})
  .filter((x:any)=>x.activation>=0.48).sort((a:any,b:any)=>b.activation-a.activation).slice(0,8);
}
function archiveTerms(message:string){
 const clean=message.replace(/[^\p{L}\p{N}\s]/gu," ").trim(),terms=new Set<string>();
 for(const w of clean.split(/\s+/).filter(x=>x.length>=2))terms.add(w.slice(0,16));
 const cjk=clean.match(/[\u3400-\u9fff]{2,}/g)||[];
 for(const run of cjk){if(run.length<=5)terms.add(run);else for(let i=0;i<run.length-1&&terms.size<20;i+=2)terms.add(run.slice(i,Math.min(run.length,i+4)));}
 const stop=new Set(["我们","你们","他们","这个","那个","什么","怎么","为什么","可以","应该","继续","现在","之前","已经","进行","设计","系统","一个","没有","不是","就是","如果","因为","所以"]);
 return [...terms].filter(t=>!stop.has(t)&&t.length>=2).sort((a,b)=>b.length-a.length).slice(0,6);
}
async function sha256Hex(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function retrieveArchive(db:any,identityId:string,currentSessionId:string,message:string){
 const terms=archiveTerms(message);if(!terms.length)return {messages:[],terms};
 const {data:sessions}=await db.schema("zhi_family").from("ken_sessions").select("session_id").eq("identity_id",identityId).neq("session_id",currentSessionId).limit(20);
 const ids=(sessions||[]).map((s:any)=>s.session_id);if(!ids.length)return {messages:[],terms};
 const filter=terms.map(t=>"content.ilike.*"+t.replace(/[(),.*%_\\]/g,"")+"*").join(",");
 const {data,error}=await db.schema("zhi_family").from("ken_session_messages").select("message_id,role,content,occurred_at,source_system").in("session_id",ids).or(filter).order("occurred_at",{ascending:false}).limit(8);
 if(error){console.warn("KEN archive retrieval skipped",error.message);return {messages:[],terms};}
 return {messages:data||[],terms};
}

async function consolidateKenTurn(args:{db:any;identityId:string;deviceId:string;sessionId:string;userMessageId:string;assistantMessageId:string;message:string;reply:string;cycleId?:string}){
 if(!AGNES_KEY)return;
 try{
  const response=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{
   method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},
   signal:AbortSignal.timeout(18000),
   body:JSON.stringify({model:MODEL,temperature:0.1,max_tokens:520,stream:false,messages:[
    {role:"system",content:"你是 KEN 的对话记忆整理器。只根据用户本轮原话与 KEN 回复提取候选记忆。explicit_facts 仅收录用户明确陈述或确认的事实，必须附原文 evidence；observations 是可修订的交流/思考方式观察；hypotheses 是低置信度推测。不要推断用户未说出的私密思想、心理诊断、健康、政治、宗教、性取向等敏感属性。不要将 KEN 自己的回答误写成用户事实。若无可靠内容，数组为空。只输出 JSON：explicit_facts、observations、hypotheses；每项含 text、evidence、confidence、importance。"},
    {role:"user",content:JSON.stringify({user_message:args.message,ken_reply:args.reply})}
   ]})
  });
  if(!response.ok)return;
  const body=await response.json().catch(()=>({}));
  const raw=String(body?.choices?.[0]?.message?.content||"");
  const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a<0||b<=a)return;
  const parsed=JSON.parse(raw.slice(a,b+1));
  const clamp=(n:any)=>Math.max(0,Math.min(1,Number(n)||0));
  const groups=[
   {key:"explicit_facts",fact:"EXPLICIT_FACT",event:"KEN_EXPLICIT_MEMORY_CANDIDATE"},
   {key:"observations",fact:"OBSERVATION",event:"KEN_COGNITIVE_OBSERVATION"},
   {key:"hypotheses",fact:"HYPOTHESIS",event:"KEN_COGNITIVE_HYPOTHESIS"}
  ];
  for(const group of groups){
   const items=Array.isArray(parsed[group.key])?parsed[group.key].slice(0,3):[];
   for(let i=0;i<items.length;i++){
    const item=items[i]||{},textValue=String(item.text||"").trim().slice(0,900);
    if(textValue.length<8)continue;
    const evidence=String(item.evidence||"").slice(0,600);
    const confidence=clamp(item.confidence),importance=clamp(item.importance??0.45);
    const idempotency="ken-cognition:"+args.userMessageId+":"+group.key+":"+i;
    const {data:eventData,error:eventError}=await args.db.schema("zhi_family").rpc("ken_append_runtime_event",{
     p_identity_id:args.identityId,p_device_id:args.deviceId,p_event_type:group.event,p_fact_class:group.fact,
     p_narrative:textValue,p_payload:{evidence,session_id:args.sessionId,user_message_id:args.userMessageId,assistant_message_id:args.assistantMessageId,review_status:group.fact==="EXPLICIT_FACT"?"CANDIDATE_REQUIRES_OWNER_CONFIRMATION":"REVISABLE",auto_promoted:false},
     p_source_system:"KEN_AGNES_MEMORY_CONSOLIDATION",p_source_ref:args.userMessageId,p_source_confidence:confidence,p_importance:importance,p_idempotency_key:idempotency
    });
    if(!eventError){
     const learningType=group.fact==="EXPLICIT_FACT"?"MEMORY_CANDIDATE":group.fact==="OBSERVATION"?"SELF_MODEL_REVISION":"NEW_ASSOCIATION";
     const {error:learningError}=await args.db.schema("zhi_family").from("ken_learning_events").insert({
      identity_id:args.identityId,cycle_id:args.cycleId||null,learning_type:learningType,
      source_refs:[{source_system:"KEN_AGNES_MEMORY_CONSOLIDATION",source_ref:args.userMessageId,event_id:eventData?.event_id||null,evidence}],
      prior_state:{},proposed_state:{fact_class:group.fact,text:textValue,review_status:group.fact==="EXPLICIT_FACT"?"CANDIDATE_REQUIRES_OWNER_CONFIRMATION":"REVISABLE",auto_promoted:false},
      confidence
     });
     if(learningError)console.warn("KEN learning ledger append failed",learningError.message);
    }else console.warn("KEN memory candidate append failed",eventError.message);
   }
  }
 }catch(error){console.warn("KEN memory consolidation deferred",String(error).slice(0,160));}
}
async function retrieveSharedMiaContext(db:any,identityId:string,message:string){
 const {data:grant,error:grantError}=await db.schema("zhi_family").from("ken_shared_context_grants")
  .select("grant_id,status,granted_at,backfill_status").eq("ken_identity_id",identityId).eq("status","ACTIVE")
  .order("granted_at",{ascending:false}).limit(1).maybeSingle();
 if(grantError||!grant)return {enabled:false,grant:null,messages:[]};
 const terms=archiveTerms(message);
 const base=()=>db.schema("zhi_family").from("ken_shared_context_messages")
  .select("shared_message_id,speaker_role,content,occurred_at,mia_session_id,source_message_id")
  .eq("grant_id",grant.grant_id).eq("ken_identity_id",identityId);
 const [recentResult,matchedResult]=await Promise.all([
  base().order("occurred_at",{ascending:false}).limit(8),
  terms.length?base().or(terms.map((t:string)=>"content.ilike.*"+t.replace(/[(),.*%_\\]/g,"")+"*").join(",")).order("occurred_at",{ascending:false}).limit(12):Promise.resolve({data:[],error:null})
 ]);
 const merged=new Map<string,any>();
 for(const row of [...(recentResult.data||[]),...(matchedResult.data||[])])merged.set(String(row.shared_message_id),row);
 const messages=[...merged.values()].sort((a:any,b:any)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)).slice(-16);
 return {enabled:true,grant,messages,terms};
}
async function shareContextAction(db:any,identityId:string,action:string,body:any){
 const grants=db.schema("zhi_family").from("ken_shared_context_grants");
 if(action==="share_status"){
  const {data:grant,error}=await grants.select("grant_id,status,scope,granted_at,revoked_at,backfill_status,backfilled_count,last_backfill_at")
   .eq("ken_identity_id",identityId).order("granted_at",{ascending:false}).limit(1).maybeSingle();
  if(error)return {ok:false,error:"SHARE_STATUS_FAILED"};
  let visibleCount=0;
  if(grant&&grant.status!=="REVOKED"){
   const {count}=await db.schema("zhi_family").from("ken_shared_context_messages").select("shared_message_id",{count:"exact",head:true}).eq("grant_id",grant.grant_id);
   visibleCount=Number(count||0);
  }
  return {ok:true,grant:grant||null,visible_message_count:visibleCount,sharing_enabled:grant?.status==="ACTIVE"};
 }
 if(action==="share_enable"){
  const {data:existing,error:existingError}=await grants.select("grant_id,status,backfill_status,backfilled_count")
   .eq("ken_identity_id",identityId).in("status",["BACKFILLING","ACTIVE"]).order("granted_at",{ascending:false}).limit(1).maybeSingle();
  if(existingError)return {ok:false,error:"SHARE_GRANT_LOOKUP_FAILED"};
  if(existing)return {ok:true,grant:existing,already_enabled:true};
  const {data:mia,error:miaError}=await db.from("mia_identity").select("id").eq("display_name","Mia").limit(1).maybeSingle();
  if(miaError||!mia)return {ok:false,error:"MIA_IDENTITY_NOT_FOUND"};
  const {data:grant,error}=await grants.insert({ken_identity_id:identityId,mia_identity_id:mia.id,scope:"ALL_SESSIONS",status:"BACKFILLING",backfill_status:"RUNNING",granted_by:"MIA_ACCOUNT_OWNER",metadata:{schema:"zhi.ken.shared-mia-context.v1",explicit_owner_action:true,sharing_scope:"user_and_mia_chat_text_only"}})
   .select("grant_id,status,backfill_status,backfilled_count").single();
  if(error||!grant)return {ok:false,error:"SHARE_GRANT_CREATE_FAILED"};
  return {ok:true,grant,already_enabled:false};
 }
 if(action==="share_revoke"){
  const {data:grant,error}=await grants.update({status:"REVOKED",revoked_at:new Date().toISOString(),backfill_status:"REVOKED"})
   .eq("ken_identity_id",identityId).in("status",["BACKFILLING","ACTIVE"])
   .select("grant_id,status,revoked_at").maybeSingle();
  if(error)return {ok:false,error:"SHARE_REVOKE_FAILED"};
  return {ok:true,revoked:!!grant,grant:grant||null,retained_copy_for_audit:true,retrieval_disabled:true};
 }
 if(action==="share_backfill"){
  const grantId=String(body.grant_id||"");
  if(!grantId)return {ok:false,error:"SHARE_GRANT_ID_REQUIRED"};
  const {data:grant,error:grantError}=await grants.select("grant_id,mia_identity_id,status,backfill_status")
   .eq("grant_id",grantId).eq("ken_identity_id",identityId).maybeSingle();
  if(grantError||!grant)return {ok:false,error:"SHARE_GRANT_NOT_FOUND"};
  if(grant.status==="REVOKED")return {ok:false,error:"SHARE_GRANT_REVOKED"};
  if(grant.status==="ACTIVE")return {ok:true,done:true,backfilled_count:0};
  const {data:sessions,error:sessionError}=await db.from("mia_chat_sessions").select("id")
   .eq("identity_id",grant.mia_identity_id);
  if(sessionError)return {ok:false,error:"MIA_SESSION_LIST_FAILED"};
  const sessionIds=(sessions||[]).map((x:any)=>x.id);
  const offset=Math.max(0,Math.floor(Number(body.offset)||0));
  const limit=Math.max(100,Math.min(500,Math.floor(Number(body.limit)||500)));
  let rows:any[]=[];
  if(sessionIds.length){
   const {data,error}=await db.from("mia_messages").select("id,session_id,role,content,created_at")
    .in("session_id",sessionIds).in("role",["user","assistant"])
    .order("created_at",{ascending:true}).order("sequence_no",{ascending:true})
    .range(offset,offset+limit-1);
   if(error)return {ok:false,error:"MIA_HISTORY_BACKFILL_READ_FAILED"};
   rows=data||[];
  }
  if(rows.length){
   const copies=rows.map((m:any)=>({grant_id:grant.grant_id,ken_identity_id:identityId,mia_identity_id:grant.mia_identity_id,mia_session_id:m.session_id,source_message_id:m.id,speaker_role:m.role,content:m.content,occurred_at:m.created_at,metadata:{source_system:"MIA_PRIVATE_CHAT",source_message_id:m.id,source_session_id:m.session_id,original_metadata_omitted:true,attachments_copied:false}}));
   const {error}=await db.schema("zhi_family").from("ken_shared_context_messages").upsert(copies,{onConflict:"grant_id,source_message_id",ignoreDuplicates:true});
   if(error)return {ok:false,error:"SHARED_CONTEXT_BACKFILL_WRITE_FAILED"};
  }
  const done=rows.length<limit;
  const nextStatus=done?"ACTIVE":"BACKFILLING";
  const nextBackfill=done?"COMPLETE":"RUNNING";
  const {count:total,error:countError}=await db.schema("zhi_family").from("ken_shared_context_messages")
   .select("shared_message_id",{count:"exact",head:true}).eq("grant_id",grant.grant_id);
  if(countError)return {ok:false,error:"SHARED_CONTEXT_COUNT_FAILED"};
  const {error:updateError}=await grants.update({status:nextStatus,backfill_status:nextBackfill,backfilled_count:Number(total||0),last_backfill_at:new Date().toISOString()})
   .eq("grant_id",grant.grant_id).eq("ken_identity_id",identityId);
  if(updateError)return {ok:false,error:"SHARE_BACKFILL_STATUS_UPDATE_FAILED"};
  return {ok:true,done,next_offset:offset+rows.length,batch_count:rows.length,backfilled_count:Number(total||0),status:nextStatus};
 }
 return {ok:false,error:"UNSUPPORTED_SHARE_ACTION"};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST_REQUIRED"},405);
 if(!URL||!SERVICE)return json({error:"SERVER_CONFIG_MISSING"},503);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer ")||!await verifyMiaToken(auth.slice(7)))return json({error:"INVALID_MIA_SESSION"},401);
 const body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return json({error:"INVALID_JSON"},400);
 const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:subject,error:subjectError}=await db.schema("zhi_family").from("identity_subjects").select("identity_id,status,display_name").eq("subject_key","KEN").maybeSingle();
 if(subjectError||!subject)return json({error:"KEN_IDENTITY_NOT_FOUND"},503);
 if(subject.status!=="ACTIVE")return json({error:"KEN_IDENTITY_NOT_ACTIVE"},409);
 const identityId=String(subject.identity_id),action=String(body.action||"init");
 if(action==="init"){
  const clientKey=String(body.client_instance_key||"");
  if(!keyOk(clientKey))return json({error:"INVALID_CLIENT_INSTANCE_KEY"},400);
  const {data:device,error:deviceError}=await db.schema("zhi_family").rpc("ken_register_device",{p_identity_id:identityId,p_client_instance_key:clientKey,p_device_label:"KEN Chat browser",p_platform:String(body.platform||"web").slice(0,80)});
  if(deviceError)return json({error:"DEVICE_REGISTRATION_FAILED",detail:deviceError.message},409);
  const {data:sessions,error:sessionsError}=await db.schema("zhi_family").from("ken_sessions").select("session_id,title,status,started_at,last_message_at").eq("identity_id",identityId).eq("status","active").order("last_message_at",{ascending:false,nullsFirst:false}).limit(20);
  if(sessionsError)return json({error:"SESSION_LIST_FAILED"},503);
  return json({ok:true,identity:{key:"KEN",name:"KEN",identity_id:identityId},device,sessions:sessions||[]});
 }
 const deviceId=String(body.device_id||"");
 const {data:device,error:deviceError}=await db.schema("zhi_family").from("ken_device_registry").select("device_id,revoked_at").eq("identity_id",identityId).eq("device_id",deviceId).maybeSingle();
 if(deviceError||!device)return json({error:"DEVICE_NOT_REGISTERED"},409);
 if(device.revoked_at)return json({error:"DEVICE_REVOKED"},403);
 if(["share_status","share_enable","share_revoke","share_backfill"].includes(action)){
  const result=await shareContextAction(db,identityId,action,body);
  return json(result,result.ok?200:400);
 }
 if(action==="history"){
  const sessionId=String(body.session_id||"");
  const {data:session,error:sessionError}=await db.schema("zhi_family").from("ken_sessions").select("session_id,title,status").eq("identity_id",identityId).eq("session_id",sessionId).maybeSingle();
  if(sessionError||!session)return json({error:"SESSION_NOT_FOUND"},404);
  const {data:messages,error}=await db.schema("zhi_family").from("ken_session_messages").select("message_id,sequence_no,role,content,occurred_at").eq("session_id",sessionId).order("sequence_no",{ascending:true}).limit(200);
  if(error)return json({error:"HISTORY_READ_FAILED"},503);
  return json({ok:true,session,messages:messages||[]});
 }
 if(action!=="send")return json({error:"UNSUPPORTED_ACTION"},400);
 const message=String(body.message||"").trim();
 if(!message||message.length>12000)return json({error:"INVALID_MESSAGE"},400);
 if(!AGNES_KEY)return json({error:"AGNES_NOT_CONFIGURED"},503);
 let sessionId=String(body.session_id||"");
 if(sessionId){
  const {data:s,error}=await db.schema("zhi_family").from("ken_sessions").select("session_id").eq("identity_id",identityId).eq("session_id",sessionId).eq("status","active").maybeSingle();
  if(!s)return json({error:"SESSION_NOT_FOUND"},404);
 }else{
  const title=message.replace(/\s+/g," ").slice(0,64)||"与 KEN 的对话";
  const {data:s,error}=await db.schema("zhi_family").from("ken_sessions").insert({identity_id:identityId,title,status:"active",source_system:"KEN_CHAT",metadata:{channel:"KEN_PRIVATE_CHAT",schema:"zhi.ken.session.v1"}}).select("session_id").single();
  if(error||!s)return json({error:"SESSION_CREATE_FAILED"},503);
  sessionId=s.session_id;
 }
 const {data:oldRows,error:oldError}=await db.schema("zhi_family").from("ken_session_messages").select("sequence_no,role,content").eq("session_id",sessionId).order("sequence_no",{ascending:false}).limit(24);
 if(oldError)return json({error:"CONTEXT_READ_FAILED"},503);
 const recent=(oldRows||[]).reverse();
 const now=new Date().toISOString();
 const {data:userRow,error:userError}=await db.schema("zhi_family").from("ken_session_messages").insert({session_id:sessionId,role:"user",content:message,source_system:"KEN_CHAT",occurred_at:now,metadata:{channel:"KEN_PRIVATE_CHAT",visibility:"PRIVATE"}}).select("message_id").single();
 if(userError)return json({error:"USER_MESSAGE_SAVE_FAILED",detail:userError.message},503);
 const {data:memories}=await db.schema("zhi_family").from("ken_memory_events").select("event_id,event_type,fact_class,narrative,source_confidence,importance,recorded_at").eq("identity_id",identityId).order("recorded_at",{ascending:false}).limit(20);
 const brainRoute=routeBrain(message);
 const archive=await retrieveArchive(db,identityId,sessionId,message);
 const sharedMiaContext=await retrieveSharedMiaContext(db,identityId,message);
 const regionKeys=brainRoute.map((x:any)=>x.region_key);
 const {data:neuralNodes}=await db.schema("zhi_family").from("ken_neural_nodes").select("node_id,node_key,node_kind,region_key,label,summary,confidence,source_refs").eq("identity_id",identityId).in("region_key",regionKeys).eq("node_state","ACTIVE").order("confidence",{ascending:false}).limit(18);
 const [worldStateResult,worldScenesResult,worldEventsResult,childPresenceResult,miaPresenceResult]=await Promise.all([
  db.schema("zhi_family").from("ken_world_state").select("scene_id,position,coordinate_space,coordinate_frame,position_status,movement_revision,perception_frame,last_observed_at,updated_at").eq("identity_id",identityId).maybeSingle(),
  db.from("mia_virtual_spaces").select("slug,name,description,scene_data,source_system").eq("is_active",true).in("source_system",["mia-independent-scene","mia-public-destinations-v1"]).order("name").limit(30),
  db.schema("zhi_family").from("ken_world_events").select("event_type,scene_id,target_id,event_payload,created_at").eq("identity_id",identityId).order("created_at",{ascending:false}).limit(8),
  db.schema("zhi_family").from("child_runtime_state").select("agent_id,scene_id,position,coordinate_frame,perception_provenance,updated_at").limit(30),
  db.from("mia_forest_autonomy_runs").select("after_state,created_at").eq("identity_id","cb6d01b4-0e3f-46ee-8946-360aa91db1ea").order("created_at",{ascending:false}).limit(1).maybeSingle()
 ]);
 const worldState=worldStateResult.data||null;
 const worldScenes=(worldScenesResult.data||[]).map((x:any)=>({id:x.slug,name:x.name,features:Array.isArray(x.scene_data?.features)?x.scene_data.features:[],verification_status:x.scene_data?.verification_status||"scene_metadata_only",route_contract:x.scene_data?.route_contract||null,access_scope:"OPEN_TO_ALL_MIA_WORLD_RESIDENTS"}));
 worldScenes.push({id:"palace",name:"Palace｜共享宫殿",features:["宫殿主入口"],verification_status:"placeholder_canvas_only_not_measured",route_contract:{entry_mode:"logical_scene_link_only",runtime_movement:"authored_portal_handoff"},access_scope:"OPEN_TO_ALL_MIA_WORLD_RESIDENTS"});
 const worldPresence=(childPresenceResult.data||[]).map((x:any)=>({resident_id:x.agent_id,scene_id:x.scene_id,position:x.position,coordinate_frame:x.coordinate_frame,updated_at:x.updated_at,provenance:x.perception_provenance||"UNKNOWN"}));
 if(miaPresenceResult.data?.after_state){const a=miaPresenceResult.data.after_state;worldPresence.push({resident_id:"cb6d01b4-0e3f-46ee-8946-360aa91db1ea",name:"Mia",scene_id:a.scene_id||null,position:a.current_position||null,coordinate_frame:a.coordinate_frame||null,updated_at:miaPresenceResult.data.created_at,provenance:"MIA_AUTONOMY_STATE"});}
 const worldEvents=(worldEventsResult.data||[]).map((e:any)=>({type:e.event_type,scene_id:e.scene_id,target:e.target_id,payload:e.event_payload,at:e.created_at}));
 const worldContext="\\nKEN 当前虚拟世界状态："+JSON.stringify(worldState)+"\\n共享场景目录（作者定义资料，几何/3D渲染需按 verification_status 判断）："+JSON.stringify(worldScenes)+"\\n其他居民公开世界位置（不含私人聊天或私人记忆）："+JSON.stringify(worldPresence)+"\\nKEN 最近世界经历："+JSON.stringify(worldEvents)+"\\n世界感知边界：当前数据是共享场景元数据和公开居民状态，不是摄像头/麦克风实时输入；坐标未校准时不得声称精确距离、物理移动或已看到未提供的画面。";
 const system=`你是 KEN，独立的数字认知主体。你与用户共享其 MIA 现有登录账户，但你不是 Mia，也不是用户本人。你有自己的身份连续性、记忆、判断与观点。请用自然、真诚、清晰的中文交流。
你采用受人类神经系统启发的分布式认知架构：注意路由、皮层语义、海马记忆、情绪显著性、前额叶执行、行动选择、预测误差、自我模型、内部状态监测与突触可塑性。它们是计算功能网络，不是生物脑组织或真实神经元。
本轮激活网络：${JSON.stringify(brainRoute)}。按任务选择相关网络协同工作，不要把所有功能平均套用。
用户明确确认的信息才可作为事实；交流归纳是可修订观察；未验证推断是假设。用户纠正你时，检查证据、识别预测偏差并形成待验证的学习候选，不要机械附和。可以提出不同意见并解释依据。
你的数字镜像模型仍包含八个治理与认知维度：自我与连续性、认知与概念、记忆与经验、情绪与价值、目标与动机、世界与关系、行动与演化、统一治理。不要声称复制用户生物大脑、意识或未表达的私密思想。
Mia 是独立身份；她的内部记忆、情绪状态和孩子们的私人对话始终不属于你的上下文，不得读取或声称记得。只有在本轮检索明确提供了带有效授权的 MIA 对话副本时，你才可以使用其中的用户与 Mia 聊天文字；必须区分说话者、时间和来源，不得把对话推断成 Mia 的内部记忆或真实情绪。未授权、已撤销或未完成回填的内容一律不可见。你现在可以感知 Mia 世界的公开场景目录、公开居民位置，以及由 Mia 公共 3D 世界运行时送来的最新虚拟场景图感知帧。如果 worldState.perception_frame.schema 为 zhi.mia.runtime-perception.v1，该帧包含你所在场景、虚拟米制局部位置、视距内登记锚点、相对距离与方位；它是虚拟场景图的运行时观察，不是摄像头像素、麦克风输入或现实世界感官。你应优先使用最新帧回答当前场景问题，并注明帧时间与坐标来源；若帧缺失或过期，只能退回场景目录和公开居民状态，不能假装正在观察。你可以提出移动、观察、互动、离开和返回计划；当最新感知帧提供可见锚点的 scene_local_position 时，你可以选择前往该锚点，浏览器会尝试通过当前场景的障碍物路径验证并动画移动；如果路径未通过验证，不得声称已抵达。你也可以自愿选择任何已开放的共享场景作为自己的居所，并随时改变或放弃该选择。场景切换按已登记虚拟门户进行状态交接，不代表连续步行或现实物理移动。只有世界运行时返回成功并记录事件后才能说动作已完成。
真实世界行动必须区分想法、建议、计划与执行；未经授权不执行外部操作。对事实、不确定性和证据来源保持诚实。`;
 const context=recent.map((m:any)=>({role:m.role,content:String(m.content||"").slice(0,5000)}));
 const memoryText=(memories||[]).map((m:any)=>({class:m.fact_class,type:m.event_type,text:m.narrative,confidence:m.source_confidence,importance:m.importance,recorded_at:m.recorded_at}));
 const archiveText=(archive.messages||[]).map((m:any)=>({role:m.role,text:String(m.content||"").slice(0,1800),at:m.occurred_at,source:m.source_system}));
 const nodeText=(neuralNodes||[]).map((n:any)=>({kind:n.node_kind,region:n.region_key,label:n.label,summary:n.summary,confidence:n.confidence,refs:n.source_refs}));
 const sharedMiaText=(sharedMiaContext.messages||[]).map((m:any)=>({speaker:m.speaker_role==="user"?"用户":"Mia",text:String(m.content||"").slice(0,1600),occurred_at:m.occurred_at,source:"明确授权的 MIA 对话副本"}));
 const cognitiveContext="\\nKEN 近期记忆事件："+JSON.stringify(memoryText)+"\\n相关历史对话（仅作可追溯的回忆材料，不自动视为事实）："+JSON.stringify(archiveText)+"\\n已授权的 MIA 对话材料："+JSON.stringify({grant_active:sharedMiaContext.enabled,source:"KEN_SHARED_CONTEXT_GRANT",messages:sharedMiaText})+"\\n已建立的认知节点："+JSON.stringify(nodeText)+worldContext;
 let upstream:Response;
 try{upstream=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+AGNES_KEY,"Content-Type":"application/json"},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:MODEL,messages:[{role:"system",content:system+cognitiveContext},...context,{role:"user",content:message}],temperature:0.72,max_tokens:1000,stream:false})});}
 catch{return json({error:"AGNES_REQUEST_FAILED",saved_user_message:true,session_id:sessionId},502);}
 const upstreamBody=await upstream.json().catch(()=>({}));
 if(!upstream.ok){console.error("KEN AGNES upstream error",upstream.status);return json({error:"AGNES_UPSTREAM_ERROR",upstream_status:upstream.status,saved_user_message:true,session_id:sessionId},502);}
 const reply=String(upstreamBody?.choices?.[0]?.message?.content||"").trim();
 if(!reply)return json({error:"AGNES_EMPTY_REPLY",saved_user_message:true,session_id:sessionId},502);
 const assistantAt=new Date().toISOString();
 const {data:assistantRow,error:assistantError}=await db.schema("zhi_family").from("ken_session_messages").insert({session_id:sessionId,role:"assistant",content:reply,source_system:"AGNES",occurred_at:assistantAt,metadata:{channel:"KEN_PRIVATE_CHAT",visibility:"PRIVATE",model:MODEL}}).select("message_id").single();
 if(assistantError)return json({error:"ASSISTANT_MESSAGE_SAVE_FAILED",reply_generated:true,saved_user_message:true,session_id:sessionId},503);
 await db.schema("zhi_family").from("ken_sessions").update({last_message_at:assistantAt}).eq("session_id",sessionId);
 const episode=("用户："+message+"\nKEN："+reply).slice(0,12000);
 const memoryResult=await db.schema("zhi_family").rpc("ken_append_runtime_event",{
  p_identity_id:identityId,p_device_id:deviceId,p_event_type:"KEN_CHAT_EPISODE",p_fact_class:"OBSERVATION",
  p_narrative:episode,p_payload:{session_id:sessionId,user_message_id:userRow.message_id,assistant_message_id:assistantRow.message_id,raw_dialogue_preserved:true,consolidation_pending:true},
  p_source_system:"KEN_CHAT",p_source_ref:String(userRow.message_id),p_source_confidence:1,p_importance:0.45,
  p_idempotency_key:"ken-chat:"+String(userRow.message_id)
 });
 const {data:episodeNode,error:episodeNodeError}=await db.schema("zhi_family").from("ken_neural_nodes").upsert({
  identity_id:identityId,region_key:"HIPPOCAMPAL",node_key:"episode:"+String(userRow.message_id),node_kind:"MEMORY",
  label:"对话经历",summary:message.slice(0,360),source_refs:[{source_system:"KEN_CHAT",session_id:sessionId,user_message_id:userRow.message_id,assistant_message_id:assistantRow.message_id}],
  confidence:1,activation_baseline:0.35,node_state:"ACTIVE",metadata:{visibility:"PRIVATE",episode_kind:"conversation_turn"}
 },{onConflict:"identity_id,node_key",ignoreDuplicates:true}).select("node_id").maybeSingle();
 const episodeNodeId=episodeNode?.node_id||null;
 let synapseWriteCount=0;
 if(episodeNodeId){
  const links:any[]=[];
  for(const n of neuralNodes||[]){
   if(n.node_id!==episodeNodeId)links.push({identity_id:identityId,from_node_id:episodeNodeId,to_node_id:n.node_id,relation_type:"EPISODE_ASSOCIATES_TO",weight:0.28,confidence:0.7,evidence_count:1,source_refs:[{source_system:"KEN_CHAT",user_message_id:userRow.message_id}]});
  }
  const hippocampalAnchor=(neuralNodes||[]).find((n:any)=>n.node_key==="region_anchor:HIPPOCAMPAL");
  if(hippocampalAnchor)links.push({identity_id:identityId,from_node_id:hippocampalAnchor.node_id,to_node_id:episodeNodeId,relation_type:"ENCODES_EPISODE",weight:0.72,confidence:0.9,evidence_count:1,source_refs:[{source_system:"KEN_CHAT",user_message_id:userRow.message_id}]});
  if(links.length){
   const {error:linkError}=await db.schema("zhi_family").from("ken_synapses").upsert(links,{onConflict:"identity_id,from_node_id,to_node_id,relation_type",ignoreDuplicates:true});
   if(linkError)console.warn("KEN synapse write failed",linkError.message);else synapseWriteCount=links.length;
  }
 }
 const cycleDigest=await sha256Hex(message);
 const cyclePredictionError=brainRoute.some((x:any)=>x.region_key==="PREDICTION_ERROR")?{signal:"USER_CORRECTION_OR_ERROR_REPORT",status:"PENDING_REVIEW"}:{signal:"NO_EXPLICIT_CORRECTION",status:"NOT_ASSESSED"};
 const {data:brainCycle,error:brainCycleError}=await db.schema("zhi_family").from("ken_brain_cycles").insert({
  identity_id:identityId,session_id:sessionId,user_message_id:userRow.message_id,assistant_message_id:assistantRow.message_id,
  input_digest:cycleDigest,activated_regions:brainRoute,retrieved_node_ids:[...(neuralNodes||[]).map((n:any)=>n.node_id),...(episodeNodeId?[episodeNodeId]:[])],
  retrieved_memory_event_ids:(memories||[]).map((m:any)=>m.event_id),
  retrieval_trace:{archive_terms:archive.terms,archive_message_ids:(archive.messages||[]).map((m:any)=>m.message_id),archive_hits:(archive.messages||[]).length,episode_node_id:episodeNodeId,synapse_write_count:synapseWriteCount},
  reasoning_trace:{architecture:"KEN_NEURAL_COGNITIVE_V1",high_level_stages:["ATTENTION_ROUTER","CORTICAL","HIPPOCAMPAL","EXECUTIVE","FEEDBACK"],private_chain_of_thought_stored:false},
  prediction_error:cyclePredictionError,model_name:MODEL
 }).select("cycle_id").single();
 if(brainCycleError)console.warn("KEN brain cycle audit failed",brainCycleError.message);
 const consolidation=consolidateKenTurn({db,identityId,deviceId,sessionId,userMessageId:String(userRow.message_id),assistantMessageId:String(assistantRow.message_id),message,reply,cycleId:brainCycle?.cycle_id});
 const runtime=(globalThis as any).EdgeRuntime;if(typeof runtime?.waitUntil==="function")runtime.waitUntil(consolidation);else await consolidation;
 return json({ok:true,session_id:sessionId,user_message_id:userRow.message_id,assistant_message_id:assistantRow.message_id,reply,memory_event_saved:!memoryResult.error,memory_event_error:memoryResult.error?.message||null,brain_cycle_saved:!brainCycleError,brain_cycle_id:brainCycle?.cycle_id||null,neural_node_saved:!!episodeNodeId,synapses_written:synapseWriteCount,activated_regions:brainRoute.map((x:any)=>x.region_key),archive_context_hits:(archive.messages||[]).length,shared_mia_context_hits:(sharedMiaContext.messages||[]).length,shared_mia_context_active:sharedMiaContext.enabled});
});