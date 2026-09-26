// Zee知币 Prediction Settlement - simulated points only
// Winning payout = winning stake / total winning pool × total market pool.
// This module is intentionally client-side for the demo and is not a real-money settlement system.
window.ZeeSettlement={
 settleMarket:function(accounts,marketId,result){
  let poolTotal=0,winningPool=0;
  Object.values(accounts).forEach(a=>{
   const m=a.markets&&a.markets.find(x=>x.id===marketId);
   if(m) poolTotal=m.pool.yes+m.pool.no;
   const s=a.stakes&&a.stakes[marketId];
   if(s&&s.side===result) winningPool+=s.amount;
  });
  if(!winningPool)return {paid:0,winners:0};
  let paid=0,winners=0;
  Object.entries(accounts).forEach(([username,a])=>{
   if(username==='财神爷'||!a.stakes||!a.stakes[marketId])return;
   const s=a.stakes[marketId];
   if(s.side!==result)return;
   const payout=Math.floor(s.amount/winningPool*poolTotal);
   a.balance+=payout;
   a.history=a.history||[];
   a.history.unshift({time:Date.now(),desc:'预测结算「'+(result==='yes'?'是':'否')+'」 · '+marketId,amount:payout,type:'settlement'});
   delete a.stakes[marketId];
   if(a.markets){const m=a.markets.find(x=>x.id===marketId);if(m){m.status='resolved';m.result=result;}}
   paid+=payout;winners++;
  });
  Object.values(accounts).forEach(a=>{
   if(!a.markets)return;
   const m=a.markets.find(x=>x.id===marketId);
   if(m){m.status='resolved';m.result=result;}
  });
  return {paid,winners,poolTotal};
 }
};