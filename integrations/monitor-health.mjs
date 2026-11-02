export function marketHealth(market,rules,quotes,now=Date.now()){
 const prices=rules.filter(r=>r.status==='active'&&r.kind!=='announcement');
 const symbols=new Set(prices.flatMap(r=>r.members.map(m=>m.symbol.toUpperCase())));
 const observed=[...quotes.values()].filter(q=>symbols.has(q.symbol.toUpperCase()));
 const fresh=observed.filter(q=>q.sessionActive&&now-Date.parse(q.quoteAt)>=0&&now-Date.parse(q.quoteAt)<=30000);
 return{...market,sourceStatus:market.status,priceRules:prices.length,subscribed:symbols.size,freshQuoteCount:fresh.length,observedCount:observed.length,lastQuoteAt:observed.map(q=>q.quoteAt).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null,
  status:!prices.length&&!['stopped','unconfigured'].includes(market.status)?'idle':market.status,
  message:!prices.length&&!['stopped','unconfigured'].includes(market.status)?'无启用的价格规则，当前待命。公告和通知通道单独核验。':market.message};
}
export function channelHealth(health,events,channel){
 const event=events.find(item=>item.deliveries?.some(d=>d.channel===channel));
 const delivery=event?.deliveries.find(d=>d.channel===channel);
 return {...health,lastDelivery:delivery?{status:delivery.status,note:delivery.note,at:event.triggeredAt,receipt:delivery.receipt||null}:null};
}
export const phoneHealth=(phone,events)=>channelHealth(phone,events,'feishu');
