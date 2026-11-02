// Compare quotes within the latest observed trading session, never mix stale day and live night quotes.
export function quoteSession(stamp){const time=typeof stamp==='string'?stamp.slice(11,19):'';return /^\d{2}:\d{2}:\d{2}$/.test(time)?(time>='18:00:00'||time<'06:00:00'?'night':'day'):null}
export function quoteLeaders(products,date,limit=6){
 const eligible=products.filter(p=>p.priceType==='具体合约最新价'&&p.contract&&Number.isFinite(p.quoteChangePct)&&Number.isFinite(p.previousSettlement)&&p.previousSettlement>0&&typeof p.priceTime==='string'&&p.priceTime.slice(0,10)===date&&quoteSession(p.priceTime));
 const newest=eligible.map(p=>p.priceTime).sort().at(-1),session=quoteSession(newest),rows=eligible.filter(p=>quoteSession(p.priceTime)===session);
 const sorted=[...rows].sort((a,b)=>b.quoteChangePct-a.quoteChangePct||a.code.localeCompare(b.code));
 const strong=sorted.slice(0,limit),used=new Set(strong.map(p=>p.code));
 const weak=[...sorted].reverse().filter(p=>!used.has(p.code)).slice(0,limit);
 return {strong,weak,total:sorted.length,session};
}
// A page refresh can precede the required backend restart. Never relabel old 1h values as 2h.
export function signalsForMarketService(signals,periods){
 if(periods?.hour==='2小时')return signals;
 return {...signals,hour:{side:'missing',ma:null,previousMa:null,maChange:null,close:null,samples:0,distance:null,stamp:null,reason:'数据服务尚未更新，请退出并重新打开小木'}};
}
