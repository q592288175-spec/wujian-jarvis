import {displaySectors,displaySectorFor,displaySectorIndex} from './display-sectors.js';

export function fireColumns(mode){
 return mode==='day-trend'
  ?{title:'日 MA10',keys:['day'],structures:[{period:'day',title:'日K结构（今日对昨日）'}]}
  :mode==='month-week'
  ?{title:'月 / 周 MA10',keys:['month','week'],structures:[{period:'week',title:'周K结构'}]}
  :mode==='week-day'
   ?{title:'周 / 日 MA10',keys:['week','day'],structures:[{period:'week',title:'周K结构（辅助）'},{period:'day',title:'日K结构（辅助）'}]}
   :{title:'月 / 周 / 日 MA10',keys:['month','week','day'],structures:[{period:'week',title:'周K结构（辅助）'},{period:'day',title:'日K结构（辅助）'}]};
}
export function refreshMinute(value){
 if(!value||!Number.isFinite(Date.parse(value)))return '时间未知';
 const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute;
}
export function fireStructure(row,mode,period){
 const result=row.modes?.[mode];
 const directionKeys=mode==='day-trend'?['day']:mode==='month-week'?['month','week']:mode==='week-day'?['week','day']:['month','week','day'];
 const directions=directionKeys.map(key=>row[key+'_direction']);
 const side=result==='多头观察'?'long':result==='空头观察'?'short':directions.every(value=>value==='上升')?'long':directions.every(value=>value==='下降')?'short':null;
 const points=side==='short'?['high','low']:['low','high'];
 const format=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:8});
 const items=points.map(point=>{
  const previous=row['previous_'+period+'_'+point],current=row[period+'_'+point];
  const prior=period==='day'?row['prior_day_'+point]:null;
  const twoDays=mode==='day-trend'&&period==='day';
  const valid=typeof previous==='number'&&typeof current==='number'&&Number.isFinite(previous)&&Number.isFinite(current)&&(period!=='day'||twoDays||typeof prior==='number'&&Number.isFinite(prior));
  if(!valid)return {point,condition:null,label:'数据不足',values:(point==='low'?'低点':'高点')+'：缺少结构数据'};
  const rising=period==='day'&&!twoDays?previous>prior&&current>=previous:current>previous;
  const falling=period==='day'&&!twoDays?previous<prior&&current<=previous:current<previous;
  const condition=side==='long'?rising:side==='short'?falling:null;
  const name=point==='low'?'低点':'高点';
  const label=side
   ?name+(condition?(side==='long'?'抬高':'抬低'):(side==='long'?'未抬高':'未抬低'))
   :name+(rising?'抬高':falling?'抬低':'未形成同向结构');
  const values=period==='week'
   ?'上周 '+format(previous)+' → 本周 '+format(current)
   :twoDays?'昨日 '+format(previous)+' → 今日 '+format(current)
   :'前2日 '+format(prior)+' → 前1日 '+format(previous)+' → 最新 '+format(current);
  return {point,condition,label,values};
 });
 const validItems=items.filter(item=>item.condition!==null);
 const strength=side&&validItems.length===2
  ?validItems.every(item=>item.condition)?'strong':validItems.some(item=>item.condition)?'partial':'none'
  :'neutral';
 return items.map(item=>({...item,tone:side&&strength!=='neutral'?side+'-'+(item.condition?strength:'none'):'neutral'}));
}

const rankingPeriods={
 'day-trend':{directions:['day'],structures:['day'],breakout:null},
 'month-week':{directions:['month','week'],structures:['week'],breakout:'month'},
 'week-day':{directions:['week','day'],structures:['day'],breakout:null},
 'month-week-day':{directions:['month','week','day'],structures:[],breakout:null}
};

function relativeChange(current,previous,side){
 if(!Number.isFinite(current)||!Number.isFinite(previous)||previous===0)return 0;
 return side==='long'?(current-previous)/Math.abs(previous):(previous-current)/Math.abs(previous);
}

function average(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0}

export function fireCandidateQuality(row,mode){
 const result=row.modes?.[mode];
 const side=result==='多头观察'?'long':result==='空头观察'?'short':null;
 const config=rankingPeriods[mode];
 if(!side||!config)return Number.NEGATIVE_INFINITY;
 const directions=config.directions.map(period=>relativeChange(row[period+'_ma10'],row['previous_'+period+'_ma10'],side));
 const structures=config.structures.flatMap(period=>{
  if(period==='day'){
   const point=side==='long'?'low':'high';
   if(mode==='day-trend')return [relativeChange(row['day_'+point],row['previous_day_'+point],side)];
   return [
    relativeChange(row['previous_day_'+point],row['prior_day_'+point],side),
    relativeChange(row['day_'+point],row['previous_day_'+point],side)
   ];
  }
  const point=side==='long'?'low':'high';
  return [relativeChange(row[period+'_'+point],row['previous_'+period+'_'+point],side)];
 });
 const signals=[average(directions)];
 if(config.structures.length)signals.push(average(structures));
 if(config.breakout){
  const point=side==='long'?'high':'low';
  signals.push(relativeChange(row[config.breakout+'_break_recent_'+point],row[config.breakout+'_break_previous_'+point],side));
 }
 return average(signals);
}

export function sortFireCandidates(rows,mode){
 return rows.map((row,index)=>({row,index,side:row.modes?.[mode]==='多头观察'?0:1,sector:fireDisplaySector(row).index}))
  .sort((a,b)=>a.side-b.side||a.sector-b.sector||a.index-b.index)
  .map(item=>item.row);
}

// Candidate display subdivisions only; the existing risk/research taxonomy stays intact.
export const fireDisplaySectors=displaySectors.map(s=>[s.label,s.products]);
export function fireDisplaySector(row){return {index:displaySectorIndex(row),label:displaySectorFor(row)}}
export const isFireCandidate=(row,mode)=>['多头观察','空头观察'].includes(row?.modes?.[mode]);

export function fireStrengthTones(rows,mode){
 const tones=new Map();
 for(const label of ['多头观察','空头观察']){
  const members=rows.filter(row=>row.modes?.[mode]===label);
  const scored=members.map(row=>{
   const valid=rankingPeriods[mode]?.directions.every(period=>[row[period+'_ma10'],row['previous_'+period+'_ma10']].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0));
   return {row,quality:valid?fireCandidateQuality(row,mode):null};
  });
  const levels=[...new Set(scored.filter(item=>item.quality!==null).map(item=>item.quality))].sort((a,b)=>a-b);
  for(const {row,quality} of scored){
   const position=levels.length>1?levels.indexOf(quality)/(levels.length-1):.5;
   tones.set(row,quality===null?'unknown':position>=2/3?'strong':position<=1/3?'weak':'medium');
  }
 }
 return tones;
}

export function renderFireGroups(rows,mode,columnCount,renderRow){
 return ['多头观察','空头观察'].map((label,index)=>{
  const members=rows.filter(row=>row.modes?.[mode]===label);
  if(!members.length)return '';
  const side=index===0?'long':'short';
  return `<tbody class="fire-group fire-${side}" aria-label="${label}"><tr class="fire-group-heading"><th scope="rowgroup" colspan="${columnCount}"><span>${label}</span><small>${members.length} 个品种</small></th></tr>${members.map(renderRow).join('')}</tbody>`;
 }).join('');
}

export function renderFireOverview(rows,mode,escapeHtml){
 const sorted=sortFireCandidates(rows.filter(row=>['多头观察','空头观察'].includes(row.modes?.[mode])),mode);
 const tones=fireStrengthTones(sorted,mode),toneLabels={strong:'较强',medium:'中等',weak:'较弱',unknown:'强弱数据不足'};
 return `<section class="fire-overview" aria-label="候选品种多空排序">${['多头观察','空头观察'].map((label,index)=>{
  const members=sorted.filter(row=>row.modes[mode]===label),side=index===0?'long':'short';
  return `<div class="fire-overview-group fire-${side}" data-overview-side="${side}"><h3>${label}<small>${members.length} 个品种</small></h3>${members.length?`<ol>${members.map((row,rank)=>{const tone=tones.get(row),sector=fireDisplaySector(row).label;return `<li data-display-sector="${sector}"><span class="fire-rank" aria-hidden="true">${rank+1}</span><button type="button" class="fire-strength-${tone}" data-strength="${tone}" data-fire-detail="${escapeHtml(row.code)}" title="${escapeHtml(row.name)} · ${escapeHtml(row.main_contract||row.code)} · ${sector} · 技术力度${toneLabels[tone]}"><span>${escapeHtml(row.name)}</span><small>${escapeHtml(row.code)}</small></button></li>`}).join('')}</ol>`:'<p class="muted">暂无候选</p>'}</div>`;
 }).join('')}</section>`;
}

const cycleOrder=['month-week-day','month-week','week-day','day-trend'];
const cycleLabels={'month-week-day':'月周日','month-week':'月周','week-day':'周日','day-trend':'日K顺势'};

export function sortFireUniverse(rows){
 const rank=row=>displaySectorIndex(row);
 return rows.map((row,index)=>({row,index})).sort((a,b)=>rank(a.row)-rank(b.row)||a.index-b.index).map(item=>item.row);
}

export function fireDecisions(row,mode,allCycles=false){
 return (allCycles?cycleOrder:[mode]).map(key=>{
  const status=row.modes?.[key]||'数据不足';
  return {cycle:cycleLabels[key]||key,status,tone:status==='多头观察'?'long':status==='空头观察'?'short':'neutral'};
 });
}
