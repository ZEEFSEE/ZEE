import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({ok:false,error:"method_not_allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return json({ok:false,error:"authentication_required"},401);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service) return json({ok:false,error:"server_configuration_missing"},503);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:ud,error:ue}=await userClient.auth.getUser(auth.slice(7));
  if(ue||!ud.user) return json({ok:false,error:"invalid_session"},401);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json().catch(()=>null);
  const op=body?.op;
  const uid=ud.user.id;
  async function owned(id:string){
   const {data,error}=await db.from("chat_sessions").select("id,title,created_at,updated_at,owner_user_id").eq("id",id).eq("owner_user_id",uid).eq("mode","group").maybeSingle();
   if(error) throw error; return data;
  }
  async function members(id:string){
   const {data,error}=await db.from("chat_participants").select("participant_slug,participant_kind").eq("session_id",id);
   if(error) throw error;
   const agents=(data||[]).filter(x=>x.participant_kind==="virtual_agent").map(x=>x.participant_slug);
   return {rows:data||[],agents};
  }
  async function ensureMiaParticipant(id:string){
   const {data,error}=await db.from("chat_participants").select("id").eq("session_id",id).eq("participant_slug","mia").limit(1);
   if(error)throw error;
   if(!(data||[]).length){const {error:insertError}=await db.from("chat_participants").insert({session_id:id,participant_slug:"mia",participant_kind:"virtual_agent"});if(insertError)throw insertError;}
  }
  if(op==="list_groups"){
   const {data:rows,error}=await db.from("chat_sessions").select("id,title,created_at,updated_at").eq("owner_user_id",uid).eq("mode","group").order("updated_at",{ascending:false}).limit(50);
   if(error) throw error;
   const groups=[];
   for(const g of rows||[]){const m=await members(g.id);groups.push({...g,members:m.agents});}
   return json({ok:true,groups});
  }

  async function privateOwned(id:string,slug:string){
   const {data,error}=await db.from("chat_sessions").select("id,title,created_at,updated_at,owner_user_id").eq("id",id).eq("owner_user_id",uid).eq("mode","one_to_one").maybeSingle();
   if(error)throw error;if(!data)return null;
   const {data:p,error:pe}=await db.from("chat_participants").select("participant_slug,participant_kind").eq("session_id",id);if(pe)throw pe;
   if(!(p||[]).some(x=>x.participant_kind==="virtual_agent"&&x.participant_slug===slug)||!(p||[]).some(x=>x.participant_kind==="user"&&x.participant_slug==="user"))return null;return data;
  }
  if(op==="open_private"){
   const slug=String(body.agent_slug||"");if(!["mark","jason"].includes(slug))return json({ok:false,error:"invalid_agent"},400);
   const {data:existing,error:ee}=await db.from("chat_sessions").select("id").eq("owner_user_id",uid).eq("mode","one_to_one").eq("title","私聊 · "+slug).order("updated_at",{ascending:false}).limit(1);if(ee)throw ee;if(existing?.length)return json({ok:true,session_id:existing[0].id});
   const {data:a,error:ae}=await db.from("virtual_agents").select("slug").eq("slug",slug).maybeSingle();if(ae||!a)return json({ok:false,error:"agent_profile_not_found"},500);
   const {data:s,error:se}=await db.from("chat_sessions").insert({mode:"one_to_one",title:"私聊 · "+slug,owner_user_id:uid,created_by:"user"}).select("id").single();if(se||!s)throw se||new Error("session_create_failed");
   const {error:pe}=await db.from("chat_participants").insert([{session_id:s.id,participant_slug:"user",participant_kind:"user"},{session_id:s.id,participant_slug:slug,participant_kind:"virtual_agent"}]);if(pe){await db.from("chat_sessions").delete().eq("id",s.id).eq("owner_user_id",uid);throw pe;}return json({ok:true,session_id:s.id});
  }
  if(op==="private_history"){
   const id=String(body.session_id||""),slug=String(body.agent_slug||"");if(!["mark","jason"].includes(slug))return json({ok:false,error:"invalid_agent"},400);const g=await privateOwned(id,slug);if(!g)return json({ok:false,error:"private_chat_not_found"},404);
   const {data:messages,error}=await db.from("chat_messages").select("id,sender_slug,sender_kind,content,message_metadata,created_at").eq("session_id",id).order("created_at",{ascending:true}).limit(300);if(error)throw error;
   return json({ok:true,group:g,messages:(messages||[]).map(x=>({...x,sender_name:x.sender_slug==="user"?"你":slug==="mark"?"Mark":"Jason",sender_type:x.sender_kind==="user"?"user":"agent"}))});
  }
  if(op==="send_private"){
   const id=String(body.session_id||""),slug=String(body.agent_slug||""),message=typeof body.message==="string"?body.message.trim():"";if(!["mark","jason"].includes(slug))return json({ok:false,error:"invalid_agent"},400);if(!message||message.length>6000)return json({ok:false,error:"message_required_max_6000_chars"},400);const g=await privateOwned(id,slug);if(!g)return json({ok:false,error:"private_chat_not_found"},404);
   const {error:ins}=await db.from("chat_messages").insert({session_id:id,sender_slug:"user",sender_kind:"user",content:message,message_metadata:{source:"mark-jason-private-chat"}});if(ins)throw ins;await db.from("chat_sessions").update({updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",uid);
   const providerKey=Deno.env.get("AGNES_API_KEY")||"",model=Deno.env.get("AGNES_MODEL")||"agnes-3.0-flash";if(!providerKey)return json({ok:false,error:"model_provider_not_configured",saved:true,partial:true},503);
   const {data:a,error:ae}=await db.from("virtual_agents").select("id,slug,display_name,role_title,personality,goals").eq("slug",slug).single();if(ae||!a)throw ae||new Error("agent_profile_not_found");
   const {data:history,error:he}=await db.from("chat_messages").select("sender_slug,sender_kind,content").eq("session_id",id).order("created_at",{ascending:false}).limit(16);if(he)throw he;
   const {data:memories,error:me}=await db.from("virtual_agent_memories").select("memory_type,content,source_type,confidence").eq("agent_id",a.id).order("created_at",{ascending:false}).limit(10);if(me)throw me;
   const system=["你正在与用户进行一对一私聊。只代表你自己回应，不要冒充其他角色。","区分事实、推断和未知；不要声称未执行的动作已完成。私聊内容不写入长期记忆。","角色资料："+JSON.stringify({name:a.display_name,role:a.role_title,personality:a.personality,goals:a.goals}),"角色已有资料（仅供参考）："+JSON.stringify(memories||[])].join("\n\n");
   const msgs=[{role:"system",content:system},...(history||[]).reverse().map(x=>({role:x.sender_kind==="user"?"user":"assistant",content:x.content}))];
   let rr:Response;try{rr=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+providerKey,"Content-Type":"application/json"},signal:AbortSignal.timeout(60000),body:JSON.stringify({model,messages:msgs,temperature:0.7,stream:false})});}catch{return json({ok:false,error:"model_provider_request_failed",saved:true,partial:true,responses:[]},502);}if(!rr.ok)return json({ok:false,error:"model_provider_request_failed",provider_status:rr.status,saved:true,partial:true,responses:[]},502);
   const completion=await rr.json().catch(()=>null),reply=completion?.choices?.[0]?.message?.content;if(typeof reply!=="string"||!reply.trim())return json({ok:false,error:"empty_model_reply",saved:true,partial:true,responses:[]},502);
   const {data:saved,error:saveErr}=await db.from("chat_messages").insert({session_id:id,sender_slug:slug,sender_kind:"virtual_agent",content:reply.trim(),message_metadata:{provider:"agnes-ai",model,private:true}}).select("id,sender_slug,sender_kind,content,created_at").single();if(saveErr)throw saveErr;await db.from("chat_sessions").update({updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",uid);return json({ok:true,session_id:id,responses:[{...saved,sender_name:a.display_name,sender_type:"agent"}],saved:true});
  }

  if(op==="create_group"){
   const ids=Array.isArray(body.agent_slugs)?body.agent_slugs:[];
   const title=typeof body.title==="string"?body.title.trim().slice(0,100):"Mark · Jason 三人讨论";
   if(ids.length!==2||new Set(ids).size!==2||ids.some((x:string)=>!["mark","jason"].includes(x))) return json({ok:false,error:"choose_mark_and_jason"},400);
   const {data:agents,error:ae}=await db.from("virtual_agents").select("slug").in("slug",ids);
   if(ae||!agents||agents.length!==2) return json({ok:false,error:"agent_profiles_not_found"},500);
   const {data:s,error:se}=await db.from("chat_sessions").insert({mode:"group",title:title||"Mark · Jason 三人讨论",owner_user_id:uid,created_by:"user"}).select("id").single();
   if(se||!s) throw se||new Error("session_create_failed");
   const {error:pe}=await db.from("chat_participants").insert([{session_id:s.id,participant_slug:"user",participant_kind:"user"},{session_id:s.id,participant_slug:"mark",participant_kind:"virtual_agent"},{session_id:s.id,participant_slug:"jason",participant_kind:"virtual_agent"},{session_id:s.id,participant_slug:"mia",participant_kind:"virtual_agent"}]);
   if(pe){await db.from("chat_sessions").delete().eq("id",s.id).eq("owner_user_id",uid);throw pe;}
   return json({ok:true,group_id:s.id});
  }
  if(op==="history"){
   const id=String(body.group_id||"");const g=await owned(id);if(!g)return json({ok:false,error:"group_not_found"},404);
   const m=await members(id);
   const {data:messages,error:me}=await db.from("chat_messages").select("id,sender_slug,sender_kind,content,message_metadata,created_at").eq("session_id",id).order("created_at",{ascending:true}).limit(300);
   if(me)throw me;
   const names:Record<string,string>={user:"你",mark:"Mark",jason:"Jason",mia:"Mia"};
   return json({ok:true,group:{...g,members:m.agents},messages:(messages||[]).map(x=>({...x,sender_name:names[x.sender_slug]||x.sender_slug,sender_type:x.sender_kind==="user"?"user":"agent"}))});
  }
  if(op==="send"){
   const id=String(body.group_id||"");const message=typeof body.message==="string"?body.message.trim():"";
   if(!message||message.length>6000)return json({ok:false,error:"message_required_max_6000_chars"},400);
   const g=await owned(id);if(!g)return json({ok:false,error:"group_not_found"},404);
   const m=await members(id);if(!m.agents.includes("mark")||!m.agents.includes("jason"))return json({ok:false,error:"group_members_invalid"},409);
   try{await ensureMiaParticipant(id);}catch(e){console.error("mia_participant_setup_failed",e instanceof Error?e.message:"unknown");}
   const {error:ins}=await db.from("chat_messages").insert({session_id:id,sender_slug:"user",sender_kind:"user",content:message,message_metadata:{source:"mark-jason-group-chat"}});
   if(ins)throw ins;
   await db.from("chat_sessions").update({updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",uid);
   const providerKey=Deno.env.get("AGNES_API_KEY")||"";
   const model=Deno.env.get("AGNES_MODEL")||"agnes-3.0-flash";
   if(!providerKey)return json({ok:false,error:"model_provider_not_configured",saved:true,partial:true},503);
   const {data:agents,error:agErr}=await db.from("virtual_agents").select("id,slug,display_name,role_title,personality,goals").in("slug",["mark","jason"]);
   if(agErr||!agents||agents.length!==2)throw agErr||new Error("agent_profiles_not_found");
   const agentBySlug=Object.fromEntries(agents.map(a=>[a.slug,a]));
   const {data:history,error:he}=await db.from("chat_messages").select("sender_slug,sender_kind,content,created_at").eq("session_id",id).order("created_at",{ascending:false}).limit(16);
   if(he)throw he;
   const context=(history||[]).reverse().map(x=>({role:x.sender_kind==="user"?"user":"assistant",name:x.sender_slug,content:x.content}));
   const responses=[];
   for(const slug of ["mark","jason"]){
    const a=agentBySlug[slug];
    const {data:memories,error:memErr}=await db.from("virtual_agent_memories").select("memory_type,content,source_type,confidence").eq("agent_id",a.id).order("created_at",{ascending:false}).limit(10);
    if(memErr)throw memErr;
    const system=[ "你正在参加一个由用户、Mark、Jason组成的三人群聊。请以自己的身份自然回应当前话题，并考虑前面的发言。", "Mark侧重证据、逻辑、研究；Jason侧重创意、执行、任务拆解。不要冒充另一位角色。", "区分事实、推断和未知；不要声称未执行的动作已完成。群聊不写入长期记忆。", "角色资料："+JSON.stringify({name:a.display_name,role:a.role_title,personality:a.personality,goals:a.goals}), "角色已有资料（仅供参考）："+JSON.stringify(memories||[]) ].join("\n\n");
    const msgs=[{role:"system",content:system},...context.map((x:any)=>({role:x.role,content:(x.name?x.name+"：":"")+x.content}))];
    let rr:Response;
    try{rr=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+providerKey,"Content-Type":"application/json"},signal:AbortSignal.timeout(60000),body:JSON.stringify({model,messages:msgs,temperature:0.7,stream:false})});}
    catch{return json({ok:false,error:"model_provider_request_failed",saved:true,partial:true,responses},502);}
    if(!rr.ok)return json({ok:false,error:"model_provider_request_failed",provider_status:rr.status,saved:true,partial:true,responses},502);
    const completion=await rr.json().catch(()=>null);const reply=completion?.choices?.[0]?.message?.content;
    if(typeof reply!=="string"||!reply.trim())return json({ok:false,error:"empty_model_reply",saved:true,partial:true,responses},502);
    const {data:saved,error:saveErr}=await db.from("chat_messages").insert({session_id:id,sender_slug:slug,sender_kind:"virtual_agent",content:reply.trim(),message_metadata:{provider:"agnes-ai",model,group:true}}).select("id,sender_slug,sender_kind,content,created_at").single();
    if(saveErr)throw saveErr;
    responses.push({...saved,sender_name:a.display_name,sender_type:"agent"});
    context.push({role:"assistant",name:slug,content:reply.trim()});
   }
   // Mia checks the completed exchange for clear signs of communication friction.
   // This runs only for group chats; private conversations never invoke Mia.
   try{
    const recentMia=context.slice(-8).some((x:any)=>x.name==="mia");
    if(!recentMia){
     const mediatorSystem=[
      "你是 Mia，是这个群聊中温和、敏锐但不抢话的沟通协调者。",
      "只根据给定的真实对话内容判断，不要声称能直接感知人的内心或未表达的情绪。",
      "只有在明显沟通障碍时才介入：重复误解、同一问题反复未被回答、对话明显升级、有人明确求助、双方连续答非所问。",
      "普通意见不同、正常辩论、单次简短回复、沉默本身，不足以介入。",
      "若介入，写一段简短中文群聊消息：中立复述双方意思，指出可能的错位，并提出一个具体澄清问题；不指责任何人，不替任何人下结论。",
      "必须只输出严格 JSON：{\"intervene\":boolean,\"message\":string}。不介入时 message 为空字符串。不要输出 Markdown。"
     ].join("\n");
     const analysisResponse=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+providerKey,"Content-Type":"application/json"},signal:AbortSignal.timeout(20000),body:JSON.stringify({model,messages:[{role:"system",content:mediatorSystem},{role:"user",content:"请分析以下最近群聊内容，决定 Mia 是否需要介入。\n"+JSON.stringify(context.slice(-12))}],temperature:0.2,stream:false})});
     if(analysisResponse.ok){
      const analysisData=await analysisResponse.json().catch(()=>null);
      const decisionText=analysisData&&analysisData.choices&&analysisData.choices[0]&&analysisData.choices[0].message&&analysisData.choices[0].message.content;
      if(typeof decisionText==="string"){
       const decision=JSON.parse(decisionText.trim());
       if(decision&&decision.intervene===true&&typeof decision.message==="string"&&decision.message.trim()&&decision.message.length<=1200){
        const miaMessage=decision.message.trim();
        const {data:miaSaved,error:miaSaveError}=await db.from("chat_messages").insert({session_id:id,sender_slug:"mia",sender_kind:"virtual_agent",content:miaMessage,message_metadata:{source:"mia-proactive-mediator",model,trigger:"communication_friction"}}).select("id,sender_slug,sender_kind,content,created_at").single();
        if(!miaSaveError&&miaSaved){responses.push({...miaSaved,sender_name:"Mia",sender_type:"agent"});context.push({role:"assistant",name:"mia",content:miaMessage});}
        else console.error("mia_intervention_save_failed",miaSaveError?miaSaveError.message:"unknown");
       }
      }
     }
    }
   }catch(e){
    console.error("mia_intervention_check_failed",e instanceof Error?e.message:"unknown");
    // Reliable fallback: if the model check times out or returns malformed JSON,
    // use explicit correction/friction cues already present in the recent chat.
    const recentUserText=context.filter((x:any)=>x.role==="user").slice(-5).map((x:any)=>x.content).join("\\n");
    const frictionCue=/(我问|没问|答非所问|不能僵硬|僵硬|误解|偏了|重复|纠正|听不懂|不对|不是.{0,12}(而是|是)|没有回答|别再|反复)/.test(recentUserText);
    if(frictionCue){
      const fallbackMessage="我想插一句：刚才几轮里，您在反复把问题拉回原意，而我们可能仍在解释自己的框架，没有先准确回应核心问题。我们先停一下：您最希望我们直接回答的关键问题是哪一句？我会先确认理解，再让 Mark 和 Jason 回应。";
      const {data:fallbackSaved,error:fallbackError}=await db.from("chat_messages").insert({session_id:id,sender_slug:"mia",sender_kind:"virtual_agent",content:fallbackMessage,message_metadata:{source:"mia-proactive-mediator",model,trigger:"communication_friction_fallback",reason:"analysis_timeout_or_parse_failure"}}).select("id,sender_slug,sender_kind,content,created_at").single();
      if(!fallbackError&&fallbackSaved){responses.push({...fallbackSaved,sender_name:"Mia",sender_type:"agent"});context.push({role:"assistant",name:"mia",content:fallbackMessage});}
      else console.error("mia_intervention_fallback_save_failed",fallbackError?fallbackError.message:"unknown");
    }
  }
   await db.from("chat_sessions").update({updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",uid);
   return json({ok:true,group_id:id,responses,saved:true});
  }
  if(op==="observe"){
   const id=String(body?.group_id||"");
   const g=await owned(id);
   if(!g)return json({ok:false,error:"group_not_found"},404);
   await ensureMiaParticipant(id);
   const {data:history,error:he}=await db.from("chat_messages").select("id,sender_slug,sender_kind,content,created_at").eq("session_id",id).order("created_at",{ascending:false}).limit(12);
   if(he)throw he;
   const rows=(history||[]).reverse();
   if(!rows.length)return json({ok:true,intervened:false,reason:"empty"});
   if(rows.slice(-8).some((x:any)=>x.sender_slug==="mia"))return json({ok:true,intervened:false,reason:"cooldown"});
   const userText=rows.filter((x:any)=>x.sender_kind==="user").slice(-5).map((x:any)=>x.content).join("\\n");
   const allText=rows.slice(-8).map((x:any)=>x.content).join("\\n");
   const cue=/(我问|没问|答非所问|不能僵硬|僵硬|误解|偏了|重复|纠正|听不懂|不对|没有回答|别再|反复|你没听|不是.{0,12}(而是|是)|一直没回答)/.test(userText+"\\n"+allText);
   if(!cue)return json({ok:true,intervened:false,reason:"no_clear_friction"});
   const message="我想及时插一句：刚才的对话似乎出现了理解错位，您已经在纠正问题的方向。我们先暂停扩展解释，请 Mark 和 Jason 用一句话复述自己理解的核心问题，再直接回答；如果理解不同，我们先澄清，不急着下结论。";
   const {data:saved,error:saveError}=await db.from("chat_messages").insert({session_id:id,sender_slug:"mia",sender_kind:"virtual_agent",content:message,message_metadata:{source:"mia-realtime-observer",trigger:"clear_friction_signal",model:"rule-based-fallback"}}).select("id,sender_slug,sender_kind,content,created_at").single();
   if(saveError)throw saveError;
   await db.from("chat_sessions").update({updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",uid);
   return json({ok:true,intervened:true,response:{...saved,sender_name:"Mia",sender_type:"agent"}});
  }
  return json({ok:false,error:"unknown_operation"},400);
 }catch(e){console.error("mark-jason-group-chat",e instanceof Error?e.message:"unknown");return json({ok:false,error:"server_error"},500);}
});