import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sectorFor} from '../dist/sectors.js';
import {applyDayTrendRule,DAY_TREND_MODE,DAY_TREND_VERSION} from './day-trend.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const COMPARISON_VERSION='relative-strength-day-leaders-v2.0';
const TARGET=3;
const CORRELATION_LIMIT=0.8;
const families=[{name:'国债利率',codes:'TS TF T TL'},{name:'原油及燃料链',codes:'SC FU LU PG BU'},{name:'股指',codes:'IH IF IC IM'},{name:'橡胶',codes:'RU NR BR'},{name:'铜',codes:'CU BC'}];
const familyFor=code=>families.find(group=>group.codes.split(' ').includes(String(code).toUpperCase()))?.name||null;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite=value=>value!==null&&value!==undefined&&Number.isFinite(Number(value));
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const sign=side=>side==='long'?1:-1;
function normalizedBars(raw,cutoff){
 const dates=new Map();
 for(const bar of raw||[]){const date=String(bar.date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>cutoff)continue;if(dates.has(date))throw Error('日线日期重复');if(!['open','high','low','close'].every(k=>finite(bar[k])&&Number(bar[k])>0)||Number(bar.high)<Math.max(Number(bar.open),Number(bar.close),Number(bar.low))||Number(bar.low)>Math.min(Number(bar.open),Number(bar.close)))throw Error('日线价格无效');dates.set(date,{...bar,date,close:Number(bar.close)})}
 return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function correlation(a,b,size=20){
 const changes=bars=>new Map(bars.slice(1).map((bar,i)=>[bars[i].date+'/'+bar.date,bar.close/bars[i].close-1]));
 const aa=changes(a),bb=changes(b),dates=[...aa.keys()].filter(d=>bb.has(d)).sort().slice(-size);
 if(dates.length<(size===20?15:40))return {value:null,samples:dates.length};
 const x=dates.map(d=>aa.get(d)),y=dates.map(d=>bb.get(d)),mx=mean(x),my=mean(y);
 const covariance=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0),variance=Math.sqrt(x.reduce((s,v)=>s+(v-mx)**2,0)*y.reduce((s,v)=>s+(v-my)**2,0));
 return {value:variance?Math.max(-1,Math.min(1,covariance/variance)):null,samples:dates.length};
}
function persistence(bars,side){
 const returns=bars.slice(1).map((b,i)=>Math.log(b.close/bars[i].close)),avg=mean(returns);
 const volatility=Math.sqrt(mean(returns.map(r=>(r-avg)**2)));
 const net=returns.reduce((s,r)=>s+r,0)*sign(side),travel=returns.reduce((s,r)=>s+Math.abs(r),0);
 let extreme=Math.log(bars[0].close)*sign(side),adverse=0;
 for(const bar of bars){const price=Math.log(bar.close)*sign(side);extreme=Math.max(extreme,price);adverse=Math.max(adverse,extreme-price)}
 const scale=Math.max(volatility,1e-8);
 return {return20:bars.at(-1).close/bars[0].close-1,volatility20:volatility,efficiency20:travel?net/travel:0,
  favorableDays:returns.filter(r=>r*sign(side)>0).length,adverse20:side==='long'?1-Math.exp(-adverse):Math.expm1(adverse),
  strength20:net/(scale*Math.sqrt(20)),strength5:Math.log(bars.at(-1).close/bars.at(-6).close)*sign(side)/(scale*Math.sqrt(5)),
  resilience20:-adverse/(scale*Math.sqrt(20))};
}
function rank(items){
 for(const item of items){
  const percentile=key=>items.length===1?1:items.reduce((n,other)=>n+(other[key]<item[key]?1:other!==item&&other[key]===item[key]?0.5:0),0)/(items.length-1);
  item.comparisonScore=mean(['strength5','strength20','efficiency20','resilience20'].map(percentile));
 }
 return items.sort((a,b)=>Number(b.trendConfirmed)-Number(a.trendConfirmed)||b.comparisonScore-a.comparisonScore||sign(a.side)*(b.return20-a.return20)||a.code.localeCompare(b.code)).map((item,i)=>({...item,rank:i+1}));
}
const permutations=items=>items.length<2?[items]:items.flatMap((item,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[item,...rest]));
function selectDiversified(items,barsByCode){
 const selected=[],skipped=[];
 for(const item of items){
  let reason=!item.trendConfirmed?'近5日与20日未同时沿观察方向推进，暂不作为持续龙头':null,keptCode=null,correlations=null;
  for(const existing of selected){
   if(reason)break;
   const short=correlation(barsByCode.get(item.code),barsByCode.get(existing.code)),long=correlation(barsByCode.get(item.code),barsByCode.get(existing.code),60);
   if(item.riskFamily&&item.riskFamily===existing.riskFamily)reason=`同方向${item.riskFamily}仅保留龙头${existing.name}`;
   else if([short.value,long.value].some(v=>v!==null&&v>=CORRELATION_LIMIT))reason=`与已选${existing.name}高度同向相关，避免重复风险`;
   else if(short.value===null)reason=`与已选${existing.name}近期相关性数据不足，不能认定已分散`;
   if(reason){keptCode=existing.code;correlations={short,long}}
  }
  if(!reason&&selected.length===TARGET)reason='已达到本方向3个候选名额';
  if(reason)skipped.push({...item,reason,keptCode,correlations});
  else selected.push(item);
 }
 return {selected,skipped};
}

// This only compares the existing observation pool. It cannot alter scan or trading rules.
export function compareStrength(scan,rawByContract,{generatedAt=new Date().toISOString()}={}){
 const current=applyDayTrendRule(scan),cutoff=current.data_date,eligible=current.rows.filter(r=>['多头观察','空头观察'].includes(r.modes?.[DAY_TREND_MODE]));
 const excluded=[],loaded=[],seen=new Set();
 for(const row of eligible){
  try{
   const code=String(row.code||'').toUpperCase();
   if(seen.has(code))throw Error('品种重复，不重复占用观察名额');
   if(!row.main_contract||row.market_current===false||row.data_date!==cutoff)throw Error('具体合约或当日行情缺失');
   const raw=rawByContract[row.main_contract];if(!raw)throw Error('缺少具体合约日线');
   const bars=normalizedBars(raw,cutoff),last=bars.at(-1);
   if(!last||last.date!==cutoff)throw Error('具体合约日线尚未到截止日');
   if(!finite(row.latest_bar?.close)||Math.abs(last.close-Number(row.latest_bar.close))>1e-8)throw Error('日线与扫描收盘价不一致，等待刷新');
   loaded.push({row,bars});seen.add(code);
  }catch(e){excluded.push({code:row.code,name:row.name,contract:row.main_contract,reason:e.message})}
 }
 const dateCounts=new Map();for(const item of loaded)for(const bar of item.bars)dateCounts.set(bar.date,(dateCounts.get(bar.date)||0)+1);
 const tradingDates=[...dateCounts].filter(([,n])=>n>=Math.max(1,Math.ceil(loaded.length*.6))).map(([d])=>d).sort(),window=tradingDates.slice(-21),metrics=[];
 for(const {row,bars} of loaded){
  const map=new Map(bars.map(b=>[b.date,b]));
  if(window.length!==21||window.at(-1)!==cutoff||!window.every(d=>map.has(d))){excluded.push({code:row.code,name:row.name,contract:row.main_contract,reason:'最近20个交易日的共同日线窗口不完整'});continue}
  const last=map.get(cutoff),side=row.modes[DAY_TREND_MODE]==='多头观察'?'long':'short',return3=last.close/map.get(window.at(-4)).close-1,return5=last.close/map.get(window.at(-6)).close-1;
  const trend=persistence(window.map(d=>map.get(d)),side),trendConfirmed=return5*sign(side)>0&&trend.return20*sign(side)>0;
  const aligned=return3*sign(side)>0&&return5*sign(side)>0;
  const distance=finite(row.day_ma10)&&Number(row.day_ma10)>0?last.close/Number(row.day_ma10)-1:null;
  const weekStructure=side==='long'?[row.week_low>row.previous_week_low,row.week_high>row.previous_week_high]:[row.week_high<row.previous_week_high,row.week_low<row.previous_week_low];
  const counterevidence=[];
  if(!aligned)counterevidence.push('近3日或5日收益方向与观察方向分歧');
  if(row.provisional||window.some(d=>map.get(d).provisional))counterevidence.push('窗口含盘后快照，待交易所正式数据复核');
  if(!weekStructure.every(Boolean))counterevidence.push('周K高低点未同时沿观察方向推进');
  if(distance!==null)counterevidence.push(`收盘相对日MA10偏离 ${(distance*100).toFixed(2)}%，回撤风险需结合结构核验`);
  if(!trendConfirmed)counterevidence.push('近5日与20日缺少持续同向证据，仅列观察备选');
  metrics.push({code:row.code,name:row.name,contract:row.main_contract,sector:sectorFor(row),riskFamily:familyFor(row.code),sourceSector:row.sector,exchange:row.exchange,side,close:last.close,return3,return5,...trend,trendConfirmed,weekMA10:row.week_ma10,dayMA10:row.day_ma10,distance,volume:row.volume,openInterest:row.open_interest,source:row.data_source,provisional:!!row.provisional,windowDates:window,barHash:hash(bars),evidence:trendConfirmed?(aligned?'持续同向':'持续同向 / 近3日回调'):'持续性待确认',prior:row.day_trend_rule_reason,counterevidence,reviseWhen:'退出日K顺势观察池、近期持续性反转、同向相关性升高或行情缺口扩大时重新评估'});
 }
 const longs=rank(metrics.filter(m=>m.side==='long')),shorts=rank(metrics.filter(m=>m.side==='short'));
 const barsByCode=new Map(loaded.map(x=>[x.row.code,x.bars]));
 const longSelection=selectDiversified(longs,barsByCode),shortSelection=selectDiversified(shorts,barsByCode),selectedLongs=longSelection.selected,selectedShorts=shortSelection.selected;
 // Select each side independently: a missing long must not hide a valid short.
 const pairedShorts=permutations(selectedShorts).sort((a,b)=>{
  const score=arr=>arr.reduce((sum,item,i)=>{const long=selectedLongs[i];if(!long)return sum;const corr=correlation(barsByCode.get(long.code),barsByCode.get(item.code));return sum+(corr.value??-2)},0);
  return score(b)-score(a);
 })[0]||[];
 const slots=Array.from({length:TARGET},(_,i)=>({number:i+1,long:selectedLongs[i]||null,short:pairedShorts[i]||null}));
 const pairs=slots.filter(p=>p.long&&p.short).map(({number,long,short})=>({number,long,short,crossSector:long.sector!==short.sector,spread3:long.return3-short.return3,spread5:long.return5-short.return5,correlation:correlation(barsByCode.get(long.code),barsByCode.get(short.code))}));
 const selected=[...selectedLongs,...selectedShorts],relationships=[];
 for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
  const a=selected[i],b=selected[j],corr=correlation(barsByCode.get(a.code),barsByCode.get(b.code));
  relationships.push({a:{code:a.code,name:a.name,side:a.side},b:{code:b.code,name:b.name,side:b.side},...corr,longWindow:correlation(barsByCode.get(a.code),barsByCode.get(b.code),60),directionalValue:corr.value===null?null:corr.value*sign(a.side)*sign(b.side)});
 }
 const missing={long:TARGET-selectedLongs.length,short:TARGET-selectedShorts.length},selectionSkipped=[...longSelection.skipped,...shortSelection.skipped];
 const selectionPolicy={targetPerSide:TARGET,scope:'日K顺势',sourceMode:DAY_TREND_MODE,correlationLimit:CORRELATION_LIMIT,correlationWindows:[20,60],minimumSamples:[15,40],families,rankingWeights:{strength5:.25,strength20:.25,efficiency20:.25,resilience20:.25}};
 return {version:COMPARISON_VERSION,cutoff,generatedAt,scanRuleVersion:scan.rule_version,dayTrendRuleVersion:DAY_TREND_VERSION,inputHash:hash({version:COMPARISON_VERSION,cutoff,rule:scan.rule_version,dayTrend:DAY_TREND_VERSION,metrics,excluded,selectionPolicy}),status:!missing.long&&!missing.short?'ready':'partial',pool:{long:eligible.filter(r=>r.modes[DAY_TREND_MODE]==='多头观察').length,short:eligible.filter(r=>r.modes[DAY_TREND_MODE]==='空头观察').length,usableLong:longs.length,usableShort:shorts.length,selectedLong:selectedLongs.length,selectedShort:selectedShorts.length},windowDates:window,pairs,slots,longs,shorts,selectedLongs,selectedShorts,selectionSkipped,selectionPolicy,relationships,excluded,missing,missingPairs:TARGET-pairs.length,method:'来源为现有日K顺势池（日MA10方向、今日高低点、双严格1万手），不改火原规则。近5日与20日均同向才列持续龙头；按5日/20日波动调整收益、20日顺向效率、20日抗逆向回撤四项方向内百分位等权排序。允许同板块；同方向同风险族只留排名最前者，20或60个共同日收益相关系数达到0.80则避开，20日样本不足不认定分散。各取3个，不足留空。配对优先价格正相关，不强求跨板块。20/60日、0.80和等权评分是本版可复核的观察参数，未经收益回测，不是作者原规则或统计胜率。',boundary:'观察候选，不自动形成交易计划。未校准胜率；三多三空不等于风险中性，也不代表各开1手。相关性只用收盘日收益，回撤只用收盘路径，不含盘中跳空与费用；历史关系不保证未来对冲。手数、波动、止损、利率敏感度与已有持仓仍按原金规则核验。'};
}

export async function latestStrength(scan,{root=ROOT}={}){
 const raw={};await Promise.all(applyDayTrendRule(scan).rows.filter(r=>['多头观察','空头观察'].includes(r.modes?.[DAY_TREND_MODE])).map(async row=>{
  if(!/^[A-Za-z]+\d{3,4}$/.test(row.main_contract||''))return;
  try{raw[row.main_contract]=JSON.parse(await readFile(resolve(root,'.runtime/fire-scan/contract-bars',row.main_contract+'.json'),'utf8'))}catch{}
 }));
 const result=compareStrength(scan,raw),folder=resolve(root,'.runtime/relative-strength');await mkdir(folder,{recursive:true});
 const path=resolve(folder,`${result.cutoff||'unknown'}-${result.inputHash}.json`);
 try{const saved=JSON.parse(await readFile(path,'utf8'));return {...saved,refreshing:!!scan.refreshing}}catch{}
 try{await writeFile(path,JSON.stringify(result,null,2),{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}
 return {...result,refreshing:!!scan.refreshing};
}
