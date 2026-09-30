(function(){
  const ADMIN_ID='8ea33807-8b68-4f8f-b145-398937c7bba1';
  const db=()=>window.zhiSupabase;
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let agents=[],selected=null;
  let chatBusy=false;
  let brainModels=[];
  const BRAIN_BRIDGE='http://127.0.0.1:11435';
  const BRAIN_UI_VERSION='brainv5';
  if(!window.__zhiSponsorFetchPatched){
    window.__zhiSponsorFetchPatched=true;
    const nf=window.fetch.bind(window);
    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:(input?.url||'');
      if(String(url).includes('/functions/v1/zhi-admin-sponsor')){
        const o=init?{...init}:{},h=new Headers(o.headers||{});
        const c=window.zhiSupabase;
        const k=c?.rest?.headers?.['api'+'key'];
        if(k&&!h.has('api'+'key'))h.set('api'+'key',k);
        o.headers=h;
        return nf(input,o);
      }
      return nf(input,init);
    };
  }
  function css(){
    if(document.getElementById('zhiAdminChatStyle'))return;
    const s=document.createElement('style');s.id='zhiAdminChatStyle';s.textContent=
    '#zhiAdminChatBtn{position:fixed;right:20px;bottom:20px;z-index:2000;padding:12px 16px;border:1px solid #ffe38a;border-radius:999px;background:linear-gradient(135deg,#fff08a,#ffb300 48%,#ff5a00);color:#2b1000;font-weight:1000;box-shadow:0 8px 28px #0009;cursor:pointer}'+
    '#zhiAdminChat{position:fixed;right:20px;bottom:76px;width:min(420px,calc(100vw - 30px));height:min(650px,calc(100vh - 110px));z-index:2001;background:#12091ef7;border:1px solid #ffd76a88;border-radius:18px;box-shadow:0 20px 70px #000c;display:none;overflow:hidden;backdrop-filter:blur(12px)}'+
    '#zhiAdminChat.open{display:flex;flex-direction:column;min-height:0;height:min(650px,calc(100vh - 110px))}'+
    '#zhiAdminChat .zac-body{display:grid;grid-template-columns:130px minmax(0,1fr);flex:1 1 auto;min-height:0;height:auto;overflow:hidden}'+
    '#zhiAdminChat .zac-chat{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}'+
    '#zhiAdminChat .zac-messages{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden}'+
    '#zhiAdminChat .zac-compose{flex:0 0 auto;min-height:60px}'+
    '.zac-head{padding:13px 15px;border-bottom:1px solid #ffd76a33;display:flex;justify-content:space-between;align-items:center}.zac-head strong{color:#ffe58c}.zac-close{border:0;background:#ffffff14;color:#fff;padding:5px 9px;border-radius:8px;cursor:pointer}'+
    '.zac-body{display:grid;grid-template-columns:130px 1fr;min-height:0;flex:1}.zac-list{overflow:auto;border-right:1px solid #ffffff12;padding:7px}.zac-agent{padding:9px 7px;border-radius:10px;cursor:pointer;margin-bottom:4px}.zac-agent:hover,.zac-agent.active{background:#ffd76a16;border:1px solid #ffd76a44}.zac-agent b{display:block;color:#fff0a5}.zac-agent span{font-size:10px;color:#bfb1d0}.zac-chat{display:flex;flex-direction:column;min-width:0}.zac-messages{flex:1;overflow:auto;padding:12px}.zac-empty{color:#a99bb7;font-size:12px;text-align:center;padding:30px 10px}.zac-msg{max-width:86%;padding:8px 10px;border-radius:12px;margin:6px 0;font-size:12px;line-height:1.45}.zac-msg.admin{margin-left:auto;background:#5a2c86;color:#fff}.zac-msg.agent{margin-right:auto;background:#fff7d9;color:#321900}.zac-msg .time{display:block;font-size:9px;opacity:.6;margin-top:3px}.zac-compose{padding:9px;border-top:1px solid #ffffff12;display:flex;gap:6px}.zac-compose textarea{flex:1;resize:none;min-height:42px;max-height:100px;padding:9px;color:#fff;background:#08050f;border:1px solid #ffd76a44;border-radius:10px}.zac-send{border:1px solid #ffe38a;border-radius:10px;background:#ffb300;color:#2b1000;font-weight:1000;padding:8px 11px}.zac-status{padding:5px 12px;font-size:10px;color:#cdbfda;min-height:18px}';
    document.head.appendChild(s);
  }
  async function checkBrainBridge(showStatus=true){
    const status=document.getElementById('zacStatus');
    try{
      const h=await fetch(BRAIN_BRIDGE+'/health',{cache:'no-store'});
      const ht=await h.text(); if(!h.ok) throw new Error('HTTP '+h.status+' · '+ht);
      const t=await fetch(BRAIN_BRIDGE+'/ready',{cache:'no-store'});
      const tt=await t.text(); if(!t.ok) throw new Error('Brain READY HTTP '+t.status+' · '+tt);
      let j={}; try{j=JSON.parse(tt)}catch(_){ }
      const models=j.model?[j.model]:[];
      if(showStatus) status.textContent='🟢 Brain Bridge + Ollama 正常 · '+(models.join(', ')||'未发现模型');
      return {ok:true,models};
    }catch(e){
      const detail=e?.message||String(e);
      if(showStatus) status.textContent='❌ Brain Bridge 不可用 · '+detail+' · 请运行 start-zhi-brain.bat';
      console.error('[ZHI Brain Bridge]',e);
      return {ok:false,models:[]};
    }
  }
  function ui(){
    css();
    if(document.getElementById('zhiAdminChatBtn'))return;
    const b=document.createElement('button');b.id='zhiAdminChatBtn';b.textContent='💬 智能人与我';b.onclick=()=>document.getElementById('zhiAdminChat').classList.toggle('open');
    document.body.appendChild(b);
    const p=document.createElement('div');p.id='zhiAdminChat';p.innerHTML='<div class="zac-head"><strong>👑 管理员 · 智能人沟通</strong><button class="zac-close" type="button">✕</button></div><div class="zac-body"><div class="zac-list" id="zacList"><div class="zac-empty">读取智能人…</div></div><div class="zac-chat"><div class="zac-messages" id="zacMessages"><div class="zac-empty">请选择一位智能人开始交流</div></div><div class="zac-status" id="zacStatus"></div><div class="zac-compose"><textarea id="zacInput" placeholder="对智能人说点什么…"></textarea><button class="zac-send" id="zacSend">发送</button></div></div></div>';
    document.body.appendChild(p);
    const hb=document.getElementById('zhiAdminChatHeroBtn');
    if(hb){hb.style.display='inline-flex';hb.onclick=()=>document.getElementById('zhiAdminChat').classList.add('open');}
    p.querySelector('.zac-close').onclick=()=>p.classList.remove('open');
    const status=document.getElementById('zacStatus'); if(status) status.textContent='🧪 ZHI Brain '+BRAIN_UI_VERSION+' 已加载';
    document.getElementById('zacSend').onclick=send;
    document.getElementById('zacInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
  }
  async function loadAgents(){
    const core=window.zhiCoreSupabase;if(!core)return;
    const [a,r]=await Promise.all([
      core.from('zhi_agents').select('id,name,gender,personality,life_status,active').eq('active',true).order('name'),
      core.from('zhi_agent_activities').select('agent_id,activity_type,status,location_name')
    ]);
    if(a.error)return;
    const am=new Map((r.data||[]).map(x=>[x.agent_id,x]));
    agents=(a.data||[]).map(x=>({...x,activity:am.get(x.id)||null}));
    const box=document.getElementById('zacList');if(!box)return;
    box.innerHTML=agents.map(x=>'<div class="zac-agent" data-id="'+x.id+'"><b>'+esc(x.name)+'</b><span>'+esc(x.activity?.location_name||'生态园')+' · '+esc(x.activity?.activity_type||'空闲')+'</span></div>').join('');
    box.querySelectorAll('.zac-agent').forEach(el=>el.onclick=()=>selectAgent(el.dataset.id));
  }
  async function selectAgent(id){
    selected=agents.find(x=>x.id===id);if(!selected)return;
    document.querySelectorAll('.zac-agent').forEach(x=>x.classList.toggle('active',x.dataset.id===id));
    await loadMessages();
  }
  async function loadMessages(){
    if(!selected)return;
    const {data,error}=await db().from('admin_agent_messages').select('sender_type,content,created_at').eq('admin_user_id',ADMIN_ID).eq('agent_id',selected.id).order('created_at',{ascending:true}).limit(100);
    const box=document.getElementById('zacMessages');if(!box)return;
    if(error){box.innerHTML='<div class="zac-empty">聊天记录读取失败</div>';return}
    box.innerHTML=(data||[]).map(m=>'<div class="zac-msg '+esc(m.sender_type)+'">'+esc(m.content)+'<span class="time">'+new Date(m.created_at).toLocaleString('zh-CN')+'</span></div>').join('')||'<div class="zac-empty">还没有聊天记录。你可以先向 '+esc(selected.name)+' 打招呼。</div>';
    box.scrollTop=box.scrollHeight;
  }
  async function selfCheck(){
    const status=document.getElementById('zacStatus');
    if(!status)return;
    const started=performance.now();
    status.textContent='🧪 Brain 版本自检 '+BRAIN_UI_VERSION+'…';
    const results=[];
    for(const path of ['/health','/bridge-test']){
      const t0=performance.now();
      try{
        const r=await fetch(BRAIN_BRIDGE+path,{cache:'no-store'});
        const body=await r.text();
        results.push(path+' '+r.status+' '+Math.round(performance.now()-t0)+'ms');
        console.info('[ZHI Brain SelfCheck]',path,{status:r.status,body});
        if(!r.ok)throw new Error(path+' HTTP '+r.status+' · '+body);
      }catch(e){
        status.textContent='❌ Brain 链路自检失败 · '+path+' · '+(e?.message||e);
        console.error('[ZHI Brain SelfCheck]',e);
        return false;
      }
    }
    const elapsed=Math.round(performance.now()-started);
    status.textContent='🟢 Brain '+BRAIN_UI_VERSION+' · Bridge /health + /bridge-test 正常 · '+elapsed+'ms';
    return true;
  }
  async function fastFactReply(agent,msg){
    const core=window.zhiCoreSupabase;
    if(!core||!agent)return null;
    const q=String(msg||'').toLowerCase();
    try{
      if(/多少|余额|钱|zhi|财富|资产|存款|贷款|收入|赚钱/.test(q)){
        const {data,error}=await core.from('zhi_agent_wallets').select('balance').eq('agent_id',agent.id).maybeSingle();
        if(error)return null;
        return agent.name+'目前的钱包余额是 '+Number(data?.balance??0).toLocaleString('en-US')+' ZHI。';
      }
      if(/为什么|为何|怎么会|原因|动机/.test(q)){return null;}
      if(/在哪|哪里|位置|地点|去哪里|到了吗/.test(q)){
        const [p,a]=await Promise.all([
          core.from('zhi_agent_world_positions').select('current_scene,walking,destination_scene').eq('agent_id',agent.id).maybeSingle(),
          core.from('zhi_agent_activities').select('activity_type,status,location_name').eq('agent_id',agent.id).maybeSingle()
        ]);
        if(p.error||a.error)return null;
        const pos=p.data,act=a.data;
        if(pos?.walking&&pos.destination_scene)return agent.name+'正在从 '+(pos.current_scene||'当前位置')+' 前往 '+pos.destination_scene+'，还在路上。';
        return agent.name+'现在在 '+(pos?.current_scene||act?.location_name||'未知地点')+'。';
      }
      if(/做什么|干什么|活动|正在|现在/.test(q)){
        const [a,p]=await Promise.all([
          core.from('zhi_agent_activities').select('activity_type,status,location_name').eq('agent_id',agent.id).maybeSingle(),
          core.from('zhi_agent_world_positions').select('current_scene,walking,destination_scene').eq('agent_id',agent.id).maybeSingle()
        ]);
        if(a.error||p.error)return null;
        const x=a.data,pos=p.data;
        if(pos?.walking&&pos.destination_scene)return agent.name+'正在前往 '+pos.destination_scene+'，目前还在移动。';
        return agent.name+'现在正在 '+(x?.location_name||pos?.current_scene||'世界中')+' '+(x?.activity_type||'活动')+'。';
      }
      if(/结婚|老婆|老公|配偶|婚姻/.test(q)){
        const {data,error}=await core.from('zhi_agent_marriages').select('male_agent_id,female_agent_id,married_at,status').or('male_agent_id.eq.'+agent.id+',female_agent_id.eq.'+agent.id).order('married_at',{ascending:false}).limit(1).maybeSingle();
        if(error)return null;
        if(!data||!['married','active',null].includes(data.status))return agent.name+'目前没有婚姻记录。';
        const sid=data.male_agent_id===agent.id?data.female_agent_id:data.male_agent_id;
        const s=await core.from('zhi_agents').select('name').eq('id',sid).maybeSingle();
        return agent.name+'已经结婚，配偶是 '+(s.data?.name||'已登记的配偶')+'。';
      }
    }catch(e){console.warn('[ZHI fast fact]',e)}
    return null;
  }
  async function send(){
    if(!selected||chatBusy)return;
    const input=document.getElementById('zacInput'),msg=input.value.trim(),status=document.getElementById('zacStatus');
    if(!msg)return;
    chatBusy=true;
    input.value='';
    status.textContent='正在读取智能人的自身信息…';
    const ins=await db().from('admin_agent_messages').insert({admin_user_id:ADMIN_ID,agent_id:selected.id,agent_name:selected.name,sender_type:'admin',content:msg});
    if(ins.error){status.textContent='发送失败：'+ins.error.message;return}
    await loadMessages();

    const core=window.zhiCoreSupabase;
    const {data:{session}}=await db().auth.getSession();
    if(!session?.access_token||!core){
      status.textContent='登录会话已失效，请重新登录';
      return;
    }

    const fastReply=await fastFactReply(selected,msg);
    if(fastReply){
      status.textContent='⚡ '+selected.name+' 已从世界事实层快速回答';
      const savedFast=await core.functions.invoke('zhi-agent-brain',{
        body:{mode:'save_reply',agent_id:selected.id,message:msg,reply:fastReply},
        headers:{Authorization:`Bearer ${session.access_token}`}
      });
      const fastSaveError=savedFast.error?.message||savedFast.data?.error;
      if(fastSaveError){status.textContent='已快速回答，但保存智能人记忆失败：'+fastSaveError;chatBusy=false;return;}
      status.textContent='⚡ '+selected.name+' 快速回复完成 · 世界事实层';
      await loadMessages();
      chatBusy=false;
      return;
    }

    const brain=await core.functions.invoke('zhi-agent-brain',{
      body:{mode:'prepare',agent_id:selected.id,message:msg},
      headers:{Authorization:`Bearer ${session.access_token}`}
    });

    // 不再吞掉 FunctionsHttpError：把 Edge Function 的真实 HTTP 状态和响应体显示出来。
    let brainError='';
    if(brain.error){
      const e=brain.error;
      brainError=e.message||String(e);
      try{
        const ctx=e.context;
        if(ctx){
          const statusCode=ctx.status;
          const bodyText=await ctx.clone().text();
          let bodyDetail=bodyText;
          try{
            const parsed=JSON.parse(bodyText);
            bodyDetail=parsed?.error||parsed?.message||bodyText;
          }catch(_){}
          brainError=(statusCode?`HTTP ${statusCode} · `:'')+bodyDetail;
        }
      }catch(_){}
    }
    if(brain.data?.error) brainError=String(brain.data.error);
    if(brainError||!brain.data?.system||!brain.data?.prompt){
      const detail=brainError||'HTTP 200，但响应缺少 system/prompt';
      status.textContent='❌ Core Brain 错误：'+detail;
      console.error('[ZHI Core Brain]',{error:brain.error,data:brain.data});
      return;
    }

    const model=brain.data.model||'llama3.1:8b';
    const compact={system:String(brain.data.system||''),prompt:String(brain.data.prompt||''),chars:String(brain.data.system||'').length+String(brain.data.prompt||'').length,compressed:false};
    if(brainModels.length && !brainModels.some(x=>x===model || x.startsWith(model+':'))){status.textContent='❌ 找不到模型 '+model+' · 已安装：'+brainModels.join(', ');return;}
    status.textContent='🧠 '+selected.name+' 正在根据自己的资料思考…';
    let ollama;
    try{
      const ollamaUrl=BRAIN_BRIDGE+'/api/chat';
      const controller=new AbortController();
      const timeoutId=setTimeout(()=>controller.abort(),180000);
      const startedAt=performance.now();
      const originalSystemChars=String(brain.data.system||'').length;
      const originalPromptChars=String(brain.data.prompt||'').length;
      const systemChars=compact.system.length;
      const promptChars=compact.prompt.length;
      const totalChars=systemChars+promptChars;
      status.textContent='🧠 '+selected.name+' 正在连接本机 Ollama… · 上下文 '+totalChars.toLocaleString()+' 字';
      const waitTimer=setTimeout(()=>{
        const sec=Math.round((performance.now()-startedAt)/1000);
        status.textContent='🟠 Ollama 尚未返回首个 HTTP 响应 · 已等待 '+sec+' 秒 · 上下文 '+totalChars.toLocaleString()+' 字';
        console.warn('[ZHI Ollama waiting]',{model,system_chars:systemChars,prompt_chars:promptChars,total_chars:totalChars,wait_seconds:sec});
      },3000);
      let r;
      try{
        r=await fetch(ollamaUrl,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            model,
            stream:false,
            messages:[
              {role:'system',content:compact.system},
              {role:'user',content:compact.prompt}
            ],
            keep_alive:'15m',options:{temperature:0.35,num_ctx:1536,num_predict:96}
          }),
          signal:controller.signal
        });
      }finally{clearTimeout(timeoutId);clearTimeout(waitTimer)}
      if(!r.ok){
        const errorText=await r.text();
        status.textContent='❌ Ollama HTTP '+r.status+' · '+(errorText||r.statusText||'请求失败');
        console.error('[ZHI Ollama]',{url:ollamaUrl,status:r.status,body:errorText});
        return;
      }
      status.textContent='🟢 Ollama HTTP '+r.status+' · '+model+' · 已收到模型响应…';
      const item=await r.json();
      if(item?.error) throw new Error(String(item.error));
      ollama=String(item?.message?.content||'').trim();
      const elapsed=Math.round(performance.now()-startedAt);
        if(!ollama){
        status.textContent='❌ Ollama 已连接但没有生成文字';
        console.error('[ZHI Ollama]',{url:ollamaUrl,status:r.status,elapsed_ms:elapsed,response_type:'json'});
        chatBusy=false;
        return;
      }
      status.textContent='🟢 '+selected.name+' 回复完成 · '+model+' · '+elapsed+'ms · '+ollama.length+'字';
      console.info('[ZHI Ollama]',{url:ollamaUrl,status:r.status,elapsed_ms:elapsed,response_type:'json',chars:ollama.length,original_context_chars:originalSystemChars+originalPromptChars,sent_context_chars:totalChars,compressed:compact.compressed});
    }catch(e){
      const detail=e?.message||String(e);
      const name=e?.name||'Error';
      const diagnosis=name==='AbortError'
        ?'请求超过 180 秒，已自动终止'
        :'请检查本机 Ollama / Brain Bridge 连接';
      status.textContent='❌ Ollama 请求异常 · '+name+' · '+detail+' · '+diagnosis;
      chatBusy=false;
      console.error('[ZHI Ollama]',{error:e,name,message:detail,page_protocol:location.protocol,diagnosis});
      chatBusy=false;
      return;
    }

    const saved=await core.functions.invoke('zhi-agent-brain',{
      body:{mode:'save_reply',agent_id:selected.id,message:msg,reply:ollama},
      headers:{Authorization:`Bearer ${session.access_token}`}
    });
    const saveError=saved.error?.message||saved.data?.error;
    if(saveError){
      status.textContent='模型已回答，但保存智能人记忆失败：'+saveError;
      return;
    }

    status.textContent='🟢 已收到真正模型回复 · '+model+' · 已写入智能人记忆';
    await loadMessages();
    chatBusy=false;
  }
  let started=false;
  async function init(){
    if(started)return;
    const database=db(),core=window.zhiCoreSupabase;
    if(!database||!core)return;
    // IMPORTANT: this page may use a Supabase client configured with an accessToken callback.
    // getUser() is not supported on that client; use verified JWT claims instead.
    const {data:{claims},error:claimsError}=await database.auth.getClaims();
    if(claimsError||claims?.sub!==ADMIN_ID)return;
    started=true;
    ui();
    loadAgents();
    const initialBridge=await checkBrainBridge(true); if(initialBridge.ok) brainModels=initialBridge.models;
    setInterval(loadAgents,15000);
    setInterval(()=>{if(!chatBusy) checkBrainBridge(false).then(x=>{if(x.ok)brainModels=x.models})},30000);
    setInterval(()=>{if(selected&&!chatBusy)loadMessages()},5000);
  }
  const t=setInterval(()=>{try{init()}catch(e){}},1000);
})();\n