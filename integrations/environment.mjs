import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {sectorFor,sectorGroups} from '../dist/sectors.js';
const run=promisify(execFile),root=resolve('.');
const cache=resolve('.runtime/environment/commodity-index.json');
let indexJob=null,lastAttempt=0;
export const environmentCycle=cycle=>cycle==='week'?'week':'day';
export const refreshEnvironmentIndex=()=>commodityIndex(true);
const periodLabel=cycle=>({month:'月',week:'周',day:'日'})[cycle];
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
export function maDirection(current,previous){return !finite(current)||!finite(previous)?'unknown':Number(current)>Number(previous)?'long':Number(current)<Number(previous)?'short':'neutral'}
export function periodCloses(bars,cycle='day',cutoff='9999-12-31'){
 const dates=new Map();
 for(const bar of bars){const date=String(bar.date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>cutoff||!finite(bar.close)||Number(bar.close)<=0)continue;dates.set(date,{date,close:Number(bar.close)})}
 const periods=new Map();
 for(const bar of [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date))){
  let key=bar.date;
  if(cycle==='month')key=key.slice(0,7);
  if(cycle==='week'){const date=new Date(bar.date+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));key=date.toISOString().slice(0,10)}
  periods.set(key,bar);
 }
 return [...periods.values()];
}
export function movingAverageEvidence(bars,cycle,cutoff){
 const closes=periodCloses(bars,cycle,cutoff);
 if(closes.length<11)return{direction:'unknown',ma10:null,previousMa10:null,dataDate:closes.at(-1)?.date||null,reason:`不足11根${periodLabel(cycle)}K，不能比较相邻MA10`};
 const avg=values=>values.reduce((sum,bar)=>sum+bar.close,0)/10;
 const ma10=avg(closes.slice(-10)),previousMa10=avg(closes.slice(-11,-1));
 return{direction:maDirection(ma10,previousMa10),ma10,previousMa10,dataDate:closes.at(-1).date,reason:''};
}
// Normalize constituent prices before averaging so expensive contracts do not dominate.
export function equalWeightIndex(series,cutoff){
 const normalized=series.map(item=>({...item,bars:periodCloses(item.bars,'day',cutoff)})).filter(item=>item.bars.length>=11&&item.bars.at(-1).date===cutoff);
 if(!normalized.length)return{bars:[],included:[],missing:series.map(item=>item.code)};
 const maps=normalized.map(item=>new Map(item.bars.map(bar=>[bar.date,bar.close])));
 const dates=normalized[0].bars.map(bar=>bar.date).filter(date=>maps.every(map=>map.has(date)));
 if(dates.length<11)return{bars:[],included:[],missing:series.map(item=>item.code)};
 const bases=maps.map(map=>map.get(dates[0]));
 return{bars:dates.map(date=>({date,close:1000*maps.reduce((sum,map,i)=>sum+map.get(date)/bases[i],0)/maps.length})),included:normalized.map(item=>item.code),missing:series.filter(item=>!normalized.some(row=>row.code===item.code)).map(item=>item.code)};
}
async function commodityIndex(force=false){
 let saved=null;try{saved=JSON.parse(await readFile(cache,'utf8'))}catch{}
 if((force||!saved||Date.now()-Date.parse(saved.fetchedAt)>30*60*1000)&&Date.now()-lastAttempt>60000){
  if(!indexJob){lastAttempt=Date.now();const python=resolve(process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python');indexJob=run(python,[resolve('integrations/environment_index.py')],{cwd:root,timeout:25000,maxBuffer:200000}).then(async()=>JSON.parse(await readFile(cache,'utf8'))).catch(()=>null).finally(()=>{indexJob=null})}
  const updated=await indexJob;if(updated)saved=updated;
 }
 return saved;
}
const numberLabel=value=>finite(value)?Number(value).toLocaleString('zh-CN',{maximumFractionDigits:3}):'未知';
function evidence(values,{target,cycle,asOf,cutoff,source,extra=''}){
 const stale=values.dataDate!==cutoff;
 return{...values,direction:stale?'unknown':values.direction,target,cycle,asOf:asOf||'',source:`${target} · ${periodLabel(cycle)}MA10 ${numberLabel(values.previousMa10)} → ${numberLabel(values.ma10)}；行情 ${values.dataDate||'缺失'}；${source}${extra?`；${extra}`:''}${values.reason?`；${values.reason}`:''}${stale?'；未覆盖本次行情截止':''}`,automatic:true};
}
export async function buildEnvironment(card,fire,{cycle='day',gold=false,force=false,indexData}={}){
 const selectedCycle=gold?'day':environmentCycle(cycle),cutoff=fire.target_date||fire.data_date;
 const row=fire.rows?.find(item=>item.code===card.symbol&&item.main_contract===card.contract);
 const layers={};
 for(const period of ['month','week','day']){
  const values={ma10:row?.[`${period}_ma10`]??null,previousMa10:row?.[`previous_${period}_ma10`]??null,dataDate:row?.data_date||null};
  values.direction=maDirection(values.ma10,values.previousMa10);
  layers[period]=evidence(values,{target:card.contract||card.symbol,cycle:period,asOf:fire.refreshedAt,cutoff,source:row?.data_source||'具体合约扫描数据缺失',extra:period==='day'?'完成日K':`含当前动态${periodLabel(period)}K`});
 }
 const index=indexData===undefined?await commodityIndex(force):indexData;
 const indexValues=movingAverageEvidence(index?.bars||[],selectedCycle,cutoff);
 layers.market=evidence(indexValues,{target:index?.name||'中证商品期货价格指数（文华替代）',cycle:selectedCycle,asOf:index?.fetchedAt,cutoff,source:index?.source||'指数数据读取失败'});
 const sector=sectorFor(card),codes=sectorGroups.find(group=>group.label===sector)?.products.split(' ')||[];
 if(sector==='股指/国债'){layers.market.direction='unknown';layers.market.source='股指/国债不适用商品大盘，金融基准指数数据待接入';}
 const series=await Promise.all(codes.map(async code=>{const item=fire.rows?.find(item=>item.code===code);if(!/^[A-Z]{1,3}\d{3,4}$/.test(item?.main_contract||''))return{code,bars:[]};try{return{code,bars:JSON.parse(await readFile(resolve('.runtime/fire-scan/contract-bars',item.main_contract+'.json'),'utf8'))}}catch{return{code,bars:[]}}}));
 const composite=equalWeightIndex(series,cutoff),values=movingAverageEvidence(composite.bars,selectedCycle,cutoff);
 layers.sector=evidence(values,{target:`${sector}等权参考指数（非文华）`,cycle:selectedCycle,asOf:fire.refreshedAt,cutoff,source:'扫描具体合约日线归一化等权合成',extra:`覆盖 ${composite.included.length}/${codes.length}；缺失 ${composite.missing.join('、')||'无'}`});
 layers.sector.constituents=composite.included;layers.sector.missing=composite.missing;
 if(gold){
  layers.market.weekDirection=movingAverageEvidence(index?.bars||[],'week',cutoff).direction;
  layers.sector.weekDirection=movingAverageEvidence(composite.bars,'week',cutoff).direction;
  layers.sector.referenceOnly=true;
 }
 const hash=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(layers).map(([key,value])=>[key,{direction:value.direction,ma10:value.ma10,previousMa10:value.previousMa10,dataDate:value.dataDate,target:value.target,cycle:value.cycle,source:value.source,constituents:value.constituents,weekDirection:value.weekDirection,referenceOnly:value.referenceOnly}])))).digest('hex');
 return{layers,hash,cycle:selectedCycle,dataDate:cutoff,calculatedAt:new Date().toISOString()};
}
