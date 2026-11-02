import {sortFireCandidates} from './fire-display.js';
import {displaySectors as sectorGroups,displaySectorFor as sectorFor} from './display-sectors.js';
import {isFireCandidate} from './fire-display.js';

export const COCKPIT_SECTORS=[
 {key:'all',label:'全部板块'},
 ...sectorGroups
];

export const MONTH_WEEK_MODE='month-week';
export const RESONANCE_MODE='month-week-day';
export const DAY_TREND_MODE='day-trend';
export const POOL_MODES={
 [DAY_TREND_MODE]:{label:'日K顺势',shortLabel:'日K',description:'日线观察池'},
 [MONTH_WEEK_MODE]:{label:'月周大周期',shortLabel:'月周',description:'长期观察池'},
 [RESONANCE_MODE]:{label:'月周日共振',shortLabel:'月周日',description:'盘后观察池'}
};

export function isPoolCandidate(row,mode=MONTH_WEEK_MODE){
 return isFireCandidate(row,mode);
}

export function isMonthWeekCandidate(row){
 return isPoolCandidate(row,MONTH_WEEK_MODE);
}

export function sideForRow(row,mode=MONTH_WEEK_MODE){
 const result=row?.modes?.[mode];
 return result==='多头观察'?'long':result==='空头观察'?'short':'neutral';
}

export function sectorForKey(key){
 return COCKPIT_SECTORS.find(item=>item.key===key)||COCKPIT_SECTORS[0];
}

export function rowInSector(row,key){
 const sector=sectorForKey(key);
 return sector.key==='all'||sector.label===sectorFor(row);
}

export function dominantTone(long,short){return long>short?'long':short>long?'short':'neutral'}

export function poolCandidates(rows,mode=MONTH_WEEK_MODE,key='all',side='all'){
 const filtered=(rows||[]).filter(row=>isPoolCandidate(row,mode)&&rowInSector(row,key)&&(side==='all'||sideForRow(row,mode)===side));
 return sortFireCandidates(filtered,mode);
}

export function monthWeekCandidates(rows,key='all',side='all'){
 return poolCandidates(rows,MONTH_WEEK_MODE,key,side);
}

export function sectorSummaries(rows,mode=MONTH_WEEK_MODE){
 return COCKPIT_SECTORS.map(sector=>{
  const candidates=poolCandidates(rows,mode,sector.key);
  const month=poolCandidates(rows,MONTH_WEEK_MODE,sector.key);
  const resonance=poolCandidates(rows,RESONANCE_MODE,sector.key);
  const day=poolCandidates(rows,DAY_TREND_MODE,sector.key);
  const dayCounts={dayTotal:day.length,dayLong:day.filter(row=>sideForRow(row,DAY_TREND_MODE)==='long').length,dayShort:day.filter(row=>sideForRow(row,DAY_TREND_MODE)==='short').length};
  return {...sector,...dayCounts,long:candidates.filter(row=>sideForRow(row,mode)==='long').length,short:candidates.filter(row=>sideForRow(row,mode)==='short').length,total:candidates.length,monthTotal:month.length,monthLong:month.filter(row=>sideForRow(row,MONTH_WEEK_MODE)==='long').length,monthShort:month.filter(row=>sideForRow(row,MONTH_WEEK_MODE)==='short').length,resonanceTotal:resonance.length,resonanceLong:resonance.filter(row=>sideForRow(row,RESONANCE_MODE)==='long').length,resonanceShort:resonance.filter(row=>sideForRow(row,RESONANCE_MODE)==='short').length};
 });
}

export function cycleTone(status){
 return status==='多头观察'?'long':status==='空头观察'?'short':'neutral';
}

export function workflowSummary(summary={}){
 const cards=summary.cards||[];
 const day=(summary.fireCounts?.[DAY_TREND_MODE]?.long||0)+(summary.fireCounts?.[DAY_TREND_MODE]?.short||0);
 const resonance=(summary.fireCounts?.[RESONANCE_MODE]?.long||0)+(summary.fireCounts?.[RESONANCE_MODE]?.short||0);
 return [
  {key:'fire',label:'火 · 机会',detail:`日K ${day} 个 · 共振 ${resonance} 个`},
  {key:'water',label:'水 · 分析',detail:cards.filter(card=>card.water?.researchStatus==='completed').length+' 份已完成'},
  {key:'metal',label:'金 · 决策',detail:(summary.approvedCount||0)+' 张已批准'},
  {key:'earth',label:'土 · 执行',detail:(summary.executionCount||0)+' 条流水'},
  {key:'wood',label:'木 · 迭代',detail:cards.reduce((sum,card)=>sum+(card.reviews?.length||0),0)+' 条复盘'}
 ];
}
