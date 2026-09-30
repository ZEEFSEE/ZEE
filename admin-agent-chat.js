(function(){
  const ADMIN_ID='8ea33807-8b68-4f8f-b145-398937c7bba1';
  const db=()=>window.zhiSupabase;
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let agents=[],selected=null;
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
  async function send(){
    if(!selected)return;
    const input=document.getElementById('zacInput'),msg=input.value.trim(),status=document.getElementById('zacStatus');
    if(!msg)return;
    input.value='';status.textContent='正在读取智能人的自身信息…';
    const ins=await db().from('admin_agent_messages').insert({admin_user_id:ADMIN_ID,agent_id:selected.id,agent_name:selected.name,sender_type:'admin',content:msg});
    if(ins.error){status.textContent='发送失败：'+ins.error.message;return}
    await loadMessages();

    const core=window.zhiCoreSupabase;
    const {data:{session}}=await db().auth.getSession();
    if(!session?.access_token||!core){
      status.textContent='登录会话已失效，请重新登录';
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
    status.textContent='🧠 '+selected.name+' 正在根据自己的资料思考…';
    let ollama;
    try{
      const ollamaUrl='http://localhost:11434/api/chat';
      const controller=new AbortController();
      const timeoutId=setTimeout(()=>controller.abort(),120000);
      const startedAt=performance.now();
      status.textContent='🧠 '+selected.name+' 正在连接本机 Ollama…';
      let r;
      try{
        r=await fetch(ollamaUrl,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            model,
            stream:false,
            messages:[
              {role:'system',content:brain.data.system},
              {role:'user',content:brain.data.prompt}
            ],
            options:{temperature:0.75}
          }),
          signal:controller.signal
        });
      }finally{clearTimeout(timeoutId)}
      status.textContent='🧠 Ollama 已建立 HTTP 连接，正在读取响应…';
      const responseText=await r.text();
      const elapsed=Math.round(performance.now()-startedAt);
      let responseDetail=responseText||'(空响应)';
      let parsed=null;
      try{parsed=JSON.parse(responseText);}catch(_){}
      if(parsed?.error) responseDetail=String(parsed.error);
      if(!r.ok){
        status.textContent='❌ Ollama HTTP '+r.status+' '+(r.statusText||'')+' · '+responseDetail;
        console.error('[ZHI Ollama]',{url:ollamaUrl,status:r.status,statusText:r.statusText,body:responseText,elapsed_ms:elapsed});
        return;
      }
      ollama=parsed?.message?.content?.trim();
      if(!ollama){
        status.textContent='❌ Ollama HTTP '+r.status+' · 返回内容为空 · '+responseDetail;
        console.error('[ZHI Ollama]',{url:ollamaUrl,status:r.status,statusText:r.statusText,body:responseText,elapsed_ms:elapsed});
        return;
      }
      status.textContent='🟢 Ollama HTTP '+r.status+' · '+model+' · '+elapsed+'ms';
      console.info('[ZHI Ollama]',{url:ollamaUrl,status:r.status,statusText:r.statusText,body:responseText,elapsed_ms:elapsed});
    }catch(e){
      const detail=e?.message||String(e);
      const name=e?.name||'Error';
      let diagnosis='';
      if(name==='AbortError') diagnosis='请求超过 120 秒，已自动终止';
      else if(location.protocol==='https:' && /fetch|network|failed|cors/i.test(detail)) diagnosis='当前 ZHI 页面是 HTTPS，浏览器可能拦截 HTTPS → HTTP localhost（Mixed Content/CORS）';
      else diagnosis='浏览器没有拿到 Ollama 的 HTTP 响应，可能是 Ollama 未运行、localhost 连接失败或浏览器安全策略拦截';
      status.textContent='❌ Ollama 请求异常 · '+name+' · '+detail+' · '+diagnosis;
      console.error('[ZHI Ollama]',{error:e,name,message:detail,page_protocol:location.protocol,ollama_url:'http://localhost:11434/api/chat',diagnosis});
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
  }
  let started=false;
  async function init(){
    if(started)return;
    const database=db(),core=window.zhiCoreSupabase;
    if(!database||!core)return;
    const {data:{user:authUser}}=await database.auth.getUser();
    if(authUser?.id!==ADMIN_ID)return;
    started=true;
    ui();
    loadAgents();
    setInterval(loadAgents,15000);
    setInterval(()=>{if(selected)loadMessages()},5000);
  }
  const t=setInterval(()=>{try{init()}catch(e){}},1000);
})();