import {aggregateTrendDaily,intrabarMaSignal} from './trend-monitor-engine.mjs';
import {panoramaSectorFor} from '../dist/market-panorama-display.js';
const periods=['1mo','1w','1d','120m','30m','60m'];
const mean=values=>values.reduce((s,v)=>s+v,0)/values.length;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
function completedDirection(rows,quoteAt){
 const at=Date.parse(quoteAt),values=(rows||[]).filter(r=>Date.parse(r.endStamp||r.stamp)<=at&&finite(r.close));
 if(values.length<11)return{status:'missing',direction:null,reason:'不足11根已完成K线，无法比较前后MA10'};
 const tail=values.slice(-11),ma=mean(tail.slice(1).map(r=>r.close)),previousMa=mean(tail.slice(0,10).map(r=>r.close)),slope=ma-previousMa;
 return{status:'closed',direction:Math.abs(slope)<1e-10?0:slope>0?1:-1,ma,previousMa,slope,stamp:tail.at(-1).stamp,reason:'截至最后真实完成K线，当前休市'};
}
export function trendTableSignals(frame,{now=Date.now()}={}){
 const signals={};for(const period of periods){
  if(!frame){signals[period]={status:'missing',direction:null,reason:'当前合约报价或K线尚未取得'};continue;}
  const q=frame.quote,active=q.sessionActive===true,fresh=now-Date.parse(q.quoteAt)>=0&&now-Date.parse(q.quoteAt)<=30000;
  let rows=frame.bars?.[period];
  if(['1mo','1w','1d'].includes(period)){const result=aggregateTrendDaily(frame.bars?.['1d'],period,q.tradingDay);if(result.error){signals[period]={status:'missing',direction:null,reason:result.error};continue;}rows=result.rows;}
  let value=intrabarMaSignal(rows,q.last,q.quoteAt);
  if(value.status!=='ok'&&!active&&['30m','60m','120m'].includes(period))value=completedDirection(frame.observedBars?.[period]||rows,q.quoteAt);
  signals[period]={...value,direction:value.direction??null,quoteAt:q.quoteAt,status:value.status==='missing'?'missing':active?(fresh?'ok':'stale'):'closed',reason:value.status==='missing'?value.reason:active?(fresh?'当前未收线，按真实最新价更新MA10':'报价超过30秒未更新，仅供回看，暂停信号判断'):'休市，显示最后真实报价对应MA10方向'};
 }
 return signals;
}

export function buildTrendTable(catalog,feed,events=[],now=Date.now()){
 return catalog.map(p=>{
  const frame=p.symbol?feed.displayFrame(p.symbol):null,q=frame?.quote||feed.monitor.quotes.get(p.symbol);
  return {code:p.code,name:p.name,symbol:p.symbol,sector:panoramaSectorFor(p),mappingDate:p.mappingDate,signals:trendTableSignals(frame,{now}),alerts:events.filter(e=>e.kind==='ma-turn'&&e.symbol===p.symbol),quoteAt:q?.quoteAt||null,sessionActive:q?.sessionActive===true,source:frame?.source||feed.status().source};
 });
}
