import {panoramaPeriods,cycleResonance,resonanceLabels} from './market-panorama-periods.js';
import {panoramaSectors,panoramaSectorFor,sortPanoramaProducts} from './market-panorama-display.js';

// Display statistics only: never alter the source signals or candidate eligibility.
export function periodCounts(products,key){
 const counts={long:0,short:0,flat:0,missing:0,total:products.length};
 const stamps=[];
 for(const p of products){const signal=p.signals?.[key],side=signal?.side;counts[['long','short','flat'].includes(side)?side:'missing']++;if(['long','short','flat'].includes(side)&&signal?.stamp)stamps.push(signal.stamp)}
 const valid=counts.long+counts.short;
 return {...counts,valid,ratio:valid?counts.long/valid*100:null,earliest:stamps.sort()[0]||null,latest:stamps.at(-1)||null};
}
export function balanceLabel(ratio){return ratio===null?'数据不足':ratio>50?'多头占优':ratio<50?'空头占优':'多空均衡'}
export function sectorCycleStats(products,{sectors=panoramaSectors,sectorFor=panoramaSectorFor}={}){
 return sectors.map(name=>{
  const items=sortPanoramaProducts(products.filter(p=>sectorFor(p)===name));
  const periods=Object.fromEntries(panoramaPeriods.map(({key})=>[key,periodCounts(items,key)]));
  const ratios=Object.values(periods).map(p=>p.ratio),complete=ratios.every(Number.isFinite);
  const score=complete?ratios.reduce((sum,v)=>sum+v,0)/ratios.length:null;
  const structure=!complete?'数据不足':ratios.every(v=>v>50)?'五周期偏多':ratios.every(v=>v<50)?'五周期偏空':'混沌分歧';
  const groups=Object.fromEntries(resonanceLabels.map(label=>[label,[]]));
  for(const p of items)groups[cycleResonance(p.signals||{})].push(p);
  return {name,items,periods,score,structure,groups};
 }).filter(g=>g.items.length);
}
export function sortSectorCycles(groups,key='score',ascending=false,sectors=panoramaSectors){
 return [...groups].sort((a,b)=>{
  const fallback=sectors.indexOf(a.name)-sectors.indexOf(b.name);
  if(key==='default')return fallback;
  const value=g=>key==='score'?g.score:key==='total'?g.items.length:g.periods[key]?.ratio;
  const x=value(a),y=value(b);
  if(!Number.isFinite(x))return Number.isFinite(y)?1:fallback;
  if(!Number.isFinite(y))return -1;
  return (ascending?x-y:y-x)||fallback;
 });
}
