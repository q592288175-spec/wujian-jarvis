import Decimal from '../dist/vendor/decimal/decimal.js';
export function checkTradeMarket(trade,bars,spec){
 if(!(trade.remainingLots>0))return{status:'flat',message:'当前没有未平持仓'};
 const since=trade.stopSince||trade.openedAt;
 if(!since||!spec?.pointValue||!Number.isFinite(trade.stop)||!Number.isFinite(trade.averageEntry))return{status:'unknown',message:'缺少持仓时间、保护价或合约点值'};
 const chinaDate=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(time));
 const startDate=chinaDate(since),entryDate=chinaDate(trade.lastTime||trade.openedAt),now=new Date(),today=chinaDate(now);
 const shanghaiTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const sorted=bars.filter(b=>b.date&&(b.date<today||b.date===today&&shanghaiTime>='15:30')&&!b.provisional&&[b.close,b.low,b.high].every(Number.isFinite)).sort((a,b)=>a.date.localeCompare(b.date)),last=sorted.at(-1);
 if(!last||last.date<=entryDate)return{status:'insufficient',message:'暂无覆盖最近成交之后的完成日线；入场当日无法判断触及先后'};
 const relevant=sorted.filter(b=>b.date>startDate&&!b.provisional);
 const hit=relevant.find(b=>trade.direction==='long'?b.low<=trade.stop:b.high>=trade.stop);
 const pnl=new Decimal(last.close).minus(trade.averageEntry).mul(spec.pointValue).mul(trade.remainingLots).mul(trade.direction==='long'?1:-1).toDecimalPlaces(2).toNumber();
 return{status:hit?'stop-touched':'eod',dataDate:last.date,referencePrice:last.close,referencePnl:pnl,hitDate:hit?.date||null,
  message:hit?'日线价格已触及止损，待核对实际成交':'后续完成日线暂未发现触及止损；入场或调整保护当日先后未知'};
}
