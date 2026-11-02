import {canonical} from './monitor-engine.mjs';

const bj=now=>new Date(now+28800000).toISOString().slice(0,10);
export function tqQuoteFor(product,day,monitor,now=Date.now()){
 if(monitor.provider!=='tqsdk'||!monitor.watchMarket||day!==bj(now)||!product.exchange||!product.contract)return null;
 const q=monitor.quotes.get(canonical(product.exchange+'.'+product.contract));
 if(q?.source!=='TqSdk'||!Number.isFinite(q.last)||q.last<=0||!Number.isFinite(Date.parse(q.quoteAt))||Date.parse(q.quoteAt)>now+30000)return null;
 // Only today's quote or the preceding session for this trading day, never a future/historical replay.
 const date=new Date(Date.parse(q.quoteAt)+28800000).toISOString().slice(0,10);
 if(date>day||date<day&&q.tradingDay!==day)return null;
 return {...q,contract:product.contract,source:'TqSdk',updated:q.receivedAt};
}
