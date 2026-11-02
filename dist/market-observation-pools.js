import {rankTrendStrength} from './market-panorama-strength.js';
import {quoteLeaders} from './market-intraday.js';
import {sortPanoramaProducts} from './market-panorama-display.js';

export const observationPools=[['quote','最新强弱'],['month-week-day','月周日强弱'],['week-day','周日强弱'],['day-trend','日K顺势多空'],['all','全部品种']];
const sideNames={long:'多头观察',short:'空头观察'};
function tagged(rows,side,pool,date){
 const label=pool==='quote'?(side==='long'?'相对强':'相对弱'):sideNames[side];
 return rows.map(p=>({...p,observation:{pool,side,label,tag:pool==='quote'?(side==='long'?'强':'弱'):(side==='long'?'多':'空'),date:pool==='week-day'||pool==='day-trend'?p.fireDate:date}}));
}
export function observationPool(products,key,date,{fireAsOf}={}){
 let long=[],short=[],stale=0,asOf=null;
 if(key==='quote'){const q=quoteLeaders(products,date);long=q.strong;short=q.weak}
 else if(key==='month-week-day'){const ranks=rankTrendStrength(products);long=ranks.long;short=ranks.short}
 else if(key==='week-day'||key==='day-trend'){
  // Reuse the Fire result, including its liquidity and structure gates. Do not recalculate eligibility here.
  // Calendar rollover must not erase the latest completed scan. Use one source date for both sides.
  asOf=fireAsOf===undefined?products.map(p=>p.fireDate).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&d<=date).sort().at(-1)||null:fireAsOf&&fireAsOf<=date?fireAsOf:null;
  const eligible=products.filter(p=>asOf&&p.fireDate===asOf);
  stale=products.filter(p=>p.fireDate&&p.fireDate<asOf&&Object.values(sideNames).includes(p.fireModes?.[key])).length;
  long=sortPanoramaProducts(eligible.filter(p=>p.fireModes?.[key]===sideNames.long));
  short=sortPanoramaProducts(eligible.filter(p=>p.fireModes?.[key]===sideNames.short));
 }
 if(key==='all')return {key,label:'全部品种',long:[],short:[],rows:sortPanoramaProducts(products),stale};
 long=tagged(long,'long',key,date);short=tagged(short,'short',key,date);
 return {key,label:observationPools.find(([id])=>id===key)?.[1]||key,long,short,rows:[...long,...short],stale,asOf};
}
export function defaultPoolSelection(pool,limit=6){return pool.key==='all'?pool.rows.slice(0,4).map(p=>p.code):[...pool.long.slice(0,limit),...pool.short.slice(0,limit)].map(p=>p.code)}

// The observation identity never depends on today's return or the position of a line relative to zero.
export function observationSeries(p,index=0){
 const o=p.observation;if(!o)return {name:p.code+' '+p.name,endLabel:{show:true,formatter:p.name,fontSize:11}};
 const colors=o.side==='long'?['#b9352b','#cb5444','#d77261','#a9493e','#d98b77','#9e433e']:['#24734d','#358c5f','#4d9e72','#3c7964','#6aad84','#408058'];
 const hash=[...p.code].reduce((sum,ch)=>sum+ch.charCodeAt(0),0),color=colors[hash%colors.length];
 return {name:'【'+o.tag+'】'+p.code+' '+p.name,lineStyle:{color,width:2,type:o.side==='short'?'dashed':'solid'},itemStyle:{color},endLabel:{show:true,formatter:'【'+o.tag+'】'+p.name,color,fontSize:11},labelLayout:{moveOverlap:'shiftY'}};
}
