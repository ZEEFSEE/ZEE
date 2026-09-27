// ZHI Prediction Settlement compatibility module.
// Real settlement is handled by Supabase RPCs; this object remains for backward compatibility.
window.ZHISettlement={
 settleMarket:function(){ return {paid:0,winners:0}; }
};

(function(){
 function money(n){return Number(n||0).toLocaleString();}
 function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function ensurePanel(){
   if(document.getElementById('unifiedFundsFlow')) return document.getElementById('unifiedFundsFlow');
   const h=[...document.querySelectorAll('h2')].find(x=>x.textContent.includes('我的记录'));
   if(!h)return null;
   const card=document.createElement('div');
   card.id='unifiedFundsFlow';
   card.className='card';
   card.style.cssText='margin-top:-4px;background:linear-gradient(135deg,#fffdf4,#fff8df);border-color:#ead28a';
   card.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer" id="flowToggle"><span style="font-weight:900">📒 统一资金流水 / Unified Funds Flow</span><span id="flowArrow">▼</span></div>'+
     '<div class="meta">存款、贷款、利息、还款全部从这里追踪；同一笔业务使用相同流水号。</div>'+
     '<div id="flowBody" style="display:none"><div id="flowSummary" class="finance-grid"></div><div id="flowList" style="margin-top:10px"></div></div>';
   h.insertAdjacentElement('afterend',card);
   card.querySelector('#flowToggle').onclick=()=>{const b=card.querySelector('#flowBody');b.style.display=b.style.display==='none'?'block':'none';card.querySelector('#flowArrow').textContent=b.style.display==='none'?'▼':'▲';};
   return card;
 }
 async function load(){
   const panel=ensurePanel();
   if(!panel||!window.zhiSupabase||!window.user?.id)return;
   const body=panel.querySelector('#flowBody');
   if(body.style.display==='none')return;
   const sb=window.zhiSupabase;
   const {data,error}=await sb.from('transactions').select('id,amount,description,metadata,created_at,flow_id,flow_type,type').eq('user_id',window.user.id).order('created_at',{ascending:false}).limit(100);
   if(error){panel.querySelector('#flowList').innerHTML='<div class="notice">流水加载失败 / Failed to load flow</div>';return;}
   const rows=data||[];
   const groups=[];
   const map=new Map();
   rows.forEach(x=>{
     const key=x.flow_id||('single-'+x.id);
     if(!map.has(key)){const g={key,flow_type:x.flow_type||x.type,created_at:x.created_at,rows:[]};map.set(key,g);groups.push(g);}
     map.get(key).rows.push(x);
   });
   const deposits=rows.filter(x=>x.flow_type==='savings_deposit'&&Number(x.amount)<0).reduce((s,x)=>s+Math.abs(Number(x.amount)),0);
   const loans=rows.filter(x=>x.flow_type==='loan_disbursement'&&Number(x.amount)>0).reduce((s,x)=>s+Number(x.amount),0);
   const savingsInterest=rows.filter(x=>x.flow_type==='savings_interest'&&Number(x.amount)>0).reduce((s,x)=>s+Number(x.amount),0);
   const repayments=rows.filter(x=>x.flow_type==='loan_repayment'&&Number(x.amount)<0).reduce((s,x)=>s+Math.abs(Number(x.amount)),0);
   panel.querySelector('#flowSummary').innerHTML=[
    ['🏦 存款',deposits],['💳 贷款',loans],['📈 存款利息',savingsInterest],['↩️ 还款',repayments]
   ].map(x=>'<div class="finance-stat"><span>'+x[0]+'</span><b>'+money(x[1])+' ZHI</b></div>').join('');
   const label={savings_deposit:'🏦 存款',loan_disbursement:'💳 贷款',savings_interest:'📈 存款利息',loan_interest_accrual:'📊 贷款计息',loan_repayment:'↩️ 还款'};
   panel.querySelector('#flowList').innerHTML=groups.length?groups.slice(0,50).map(g=>{
     const total=g.rows.reduce((s,x)=>s+Number(x.amount||0),0);
     const detail=g.rows.map(x=>{
       const n=Number(x.amount||0);
       return '<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0"><span>'+esc(x.description||x.type)+'</span><b style="white-space:nowrap;color:'+(n>=0?'#087443':'#b42318')+'">'+(n>=0?'+':'')+money(n)+' ZHI</b></div>';
     }).join('');
     return '<div style="padding:10px 0;border-bottom:1px solid #eee"><div style="display:flex;justify-content:space-between;gap:8px"><b>'+esc(label[g.flow_type]||g.flow_type||'资金流水')+'</b><span class="meta" style="margin:0">'+new Date(g.created_at).toLocaleString('zh-CN')+'</span></div>'+detail+'<div class="meta" style="margin:4px 0 0">流水号 / Flow ID: '+esc(g.key)+' · 本组净额: '+(total>=0?'+':'')+money(total)+' ZHI</div></div>';
   }).join(''):'<div class="notice">暂无资金流水 / No funds flow yet</div>';
 }
 function boot(){
   ensurePanel();
   setInterval(load,2500);
   load();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();