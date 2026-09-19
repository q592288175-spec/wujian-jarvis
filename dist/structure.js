// Measurements only. Missing strategy calibration never becomes permission.
const valid=b=>b&&typeof b.timeNs==='string'&&/^\d+$/.test(b.timeNs)&&['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
export function barDate(b){try{return new Date(Number(BigInt(b.timeNs)/1000000n)+8*3600000).toISOString().slice(0,10)}catch{return null}}
function key(b,period){const date=barDate(b);if(!date)return null;if(period==='M')return date.slice(0,7);if(period==='D')return date;const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}
export function completedSeries(quote,period='D'){
 const raw=[...(quote?.bars||[])].filter(valid).sort((a,b)=>BigInt(a.timeNs)<BigInt(b.timeNs)?-1:1);const unique=[...new Map(raw.map(b=>[b.timeNs,b])).values()];
 if(period==='D')return unique.filter(b=>b.complete===true);
 const groups=new Map();for(const b of unique){const k=key(b,period);if(!k)continue;const group=groups.get(k)||[];group.push(b);groups.set(k,group)}
 // Omit first possibly truncated and final possibly incomplete calendar periods.
 return [...groups.entries()].slice(1,-1).filter(([,bs])=>bs.every(b=>b.complete===true)).map(([date,bs])=>({timeNs:bs.at(-1).timeNs,date,open:bs[0].open,close:bs.at(-1).close,high:Math.max(...bs.map(b=>b.high)),low:Math.min(...bs.map(b=>b.low)),volume:bs.every(b=>Number.isFinite(b.volume))?bs.reduce((s,b)=>s+b.volume,0):null,complete:true}));
}
const mean=rows=>rows.reduce((s,b)=>s+b.close,0)/rows.length;
export function measureDirection(rows){const last=rows.at(-1);if(rows.length<11)return {count:rows.length,asOf:last?barDate(last):null,state:'历史不足',ma10:null,slope:null};const ma10=mean(rows.slice(-10)),previous=mean(rows.slice(-11,-1)),slope=ma10-previous;return {count:rows.length,asOf:barDate(last),close:last.close,ma10,slope,state:slope>0&&last.close>ma10?'上行同侧':slope<0&&last.close<ma10?'下行同侧':'分歧或走平'};}
export function analyzeStructure(quote){
 const daily=completedSeries(quote),last=daily.at(-1),day=measureDirection(daily),week=measureDirection(completedSeries(quote,'W')),month=measureDirection(completedSeries(quote,'M'));
 let cross='历史不足';if(daily.length>=11){const prev=daily.at(-2),old=mean(daily.slice(-11,-1));cross=prev.close<=old&&last.close>day.ma10?'完成日K上穿MA10':prev.close>=old&&last.close<day.ma10?'完成日K下穿MA10':'本根无穿越';}
 const range=daily.length>=60?{high:Math.max(...daily.slice(-60).map(b=>b.high)),low:Math.min(...daily.slice(-60).map(b=>b.low)),close:last.close}:null;
 const platforms=Array.from({length:6},(_,i)=>i+3).filter(n=>daily.length>=n).map(n=>{const bs=daily.slice(-n),high=Math.max(...bs.map(b=>b.high)),low=Math.min(...bs.map(b=>b.low));return {days:n,high,low,widthPct:(high-low)/last.close*100}});
 return {symbol:quote?.symbol,source:'TqSdk实际合约日K',asOf:last?barDate(last):null,day,week,month,cross,range,platforms,permission:false,notice:'周/月由日K按日历聚合，保守排除首尾周期。方向仅为MA10斜率与收盘同侧测量；明确斜率、60日区域及平台阈值未校准，不构成完整信号。'};
}
export function closingQuote(q){
 if(Number.isFinite(q?.close)&&q.close>0)return {value:q.close,previous:q.preClose,changePct:Number.isFinite(q.preClose)&&q.preClose>0?(q.close-q.preClose)/q.preClose*100:null,asOf:q.tradingDay||q.quoteTime,basis:'交易所收盘字段'};
 const rows=completedSeries(q),last=rows.at(-1),previous=rows.at(-2);
 return {value:last?.close??null,previous:previous?.close??null,changePct:last&&previous?(last.close-previous.close)/previous.close*100:null,asOf:last?barDate(last):null,basis:'最近完成日K收盘'};
}
