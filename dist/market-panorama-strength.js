import {displaySectorLabels,displaySectorFor} from './display-sectors.js';
import {panoramaSectorFor,sortPanoramaProducts} from './market-panorama-display.js';

export const strengthPeriods=['month','week','day'];
export const strengthSectors=displaySectorLabels;
export const strengthSectorFor=displaySectorFor;

export function trendEvidence(p){
 const slopes={};
 for(const key of strengthPeriods){
  const s=p.signals?.[key];
  if(!s||!['long','short'].includes(s.side)||![s.ma,s.previousMa,s.close,s.samples].every(Number.isFinite)||s.ma<=0||s.previousMa<=0||s.samples<11)return null;
  const delta=s.ma-s.previousMa;
  if(Math.abs(delta)<=1e-9)return null;
  const side=delta>0?'long':'short';
  if(s.side!==side||(side==='long'?s.close<=s.ma:s.close>=s.ma))return null;
  slopes[key]=delta/Math.abs(s.previousMa)*100;
 }
 const side=slopes.month>0?'long':'short';
 if(!strengthPeriods.every(key=>side==='long'?slopes[key]>0:slopes[key]<0))return null;
 return {side,slopes};
}

// Percentile ranks put month/week/day on equal footing without favoring high prices
// or letting the naturally larger monthly percentage dominate the daily slope.
function percentile(value,values){
 if(values.length===1)return 100;
 const equal=(x,y)=>Math.abs(x-y)<=1e-10;
 const below=values.filter(v=>v<value&&!equal(v,value)).length,ties=values.filter(v=>equal(v,value)).length;
 return (below+(ties-1)/2)/(values.length-1)*100;
}
export function rankTrendStrength(products){
 const eligible=sortPanoramaProducts(products).flatMap(p=>{const evidence=trendEvidence(p);return evidence?[{...p,trend:evidence}]:[]});
 return Object.fromEntries(['long','short'].map(side=>{
  const rows=eligible.filter(p=>p.trend.side===side);
  const distributions=Object.fromEntries(strengthPeriods.map(key=>[key,rows.map(p=>Math.abs(p.trend.slopes[key]))]));
  const ranked=rows.map(p=>{const ranks=Object.fromEntries(strengthPeriods.map(key=>[key,percentile(Math.abs(p.trend.slopes[key]),distributions[key])]));return {...p,trend:{...p.trend,ranks,score:strengthPeriods.reduce((s,key)=>s+ranks[key],0)/3,weakest:Math.min(...Object.values(ranks)),sample:rows.length}}});
  ranked.sort((a,b)=>b.trend.score-a.trend.score||b.trend.weakest-a.trend.weakest);
  return [side,ranked];
 }));
}

export function rangePosition(bars,expectedSignal,lookback=60){
 const rows=bars.filter(b=>b.complete!==false&&b.complete!==0).slice(-lookback);
 if(rows.length<lookback)return {status:'missing',reason:`不足${lookback}根完整日K`};
 if(rows.some(b=>![b.close,b.high,b.low].every(Number.isFinite)||b.close<=0||b.high<b.close||b.low>b.close||b.high<b.low))return {status:'missing',reason:'区间K线缺失或价格不完整'};
 const last=rows.at(-1);
 if(expectedSignal?.stamp!==last.stamp||!Number.isFinite(expectedSignal?.close)||Math.abs(expectedSignal.close-last.close)>Math.max(1e-8,Math.abs(last.close)*1e-9))return {status:'missing',reason:'日K与本次快照不一致'};
 const high=Math.max(...rows.map(b=>b.high)),low=Math.min(...rows.map(b=>b.low));
 if(high===low)return {status:'missing',reason:'区间高低点重合'};
 return {status:'ok',position:(last.close-low)/(high-low)*100,high,low,close:last.close,stamp:last.stamp,start:rows[0].stamp,samples:lookback};
}
