import {readFile,readdir,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sortFireCandidates,fireDisplaySector,fireStructure} from '../dist/fire-display.js';

export const REVIEW_VERSION='v1-close-evidence';
export const REVIEW_MODES={'month-week-day':'月周日共振','month-week':'月周大周期','week-day':'周日小周期'};
export const COMPARISON_VERSION='v2-three-mode-comparison';
const modeKeys=Object.keys(REVIEW_MODES),candidate=value=>['多头观察','空头观察'].includes(value);
const clone=value=>structuredClone(value),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const positive=v=>finite(v)&&v>0;
const mean=values=>values.length?values.reduce((s,v)=>s+v,0)/values.length:null;
const signed=(v,suffix='',digits=2)=>finite(v)?`${v>0?'+':''}${v.toFixed(digits)}${suffix}`:'数据不足';
const percentage=v=>signed(v===null?null:v*100,'%');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export function reviewCalendar(days,at=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
 const today=`${p.year}-${p.month}-${p.day}`,closed=Number(p.hour)*60+Number(p.minute)>=930,ordered=[...new Set(days)].sort();
 if(!ordered.length||ordered.at(-1)<today)throw Error('现有交易日历未覆盖今天，不能认定最新收盘日');
 const eligible=ordered.filter(d=>closed?d<=today:d<today),targetDate=eligible.at(-1);
 if(!targetDate)throw Error('没有可核验的已收盘交易日');
 const previousDate=eligible.at(-2)||null,nextDate=ordered.find(d=>d>targetDate)||null;
 const week=d=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7));return t.toISOString().slice(0,10)};
 return {targetDate,previousDate,nextDate,days:eligible.slice(-25),source:'现有扫描使用的AKShare交易日历',weekState:nextDate&&week(nextDate)!==week(targetDate)?'本周已完成':'动态周K（未完成）',monthState:nextDate&&nextDate.slice(0,7)!==targetDate.slice(0,7)?'本月已完成':'动态月K（未完成）'};
}

function canonicalContract(symbol,exchange,date){
 const code=String(symbol).toUpperCase(),match=exchange==='CZCE'&&code.match(/^([A-Z]+)(\d)(\d{2})$/);
 if(!match)return code;
 const current=Number(date.slice(0,4));let year=Math.floor(current/10)*10+Number(match[2]);if(year<current-1)year+=10;
 return match[1]+String(year%100).padStart(2,'0')+match[3];
}
function normalizeBars(raw,contract,exchange,date){
 return (Array.isArray(raw)?raw:[]).map(b=>({...b,date:String(b.date||'').slice(0,10),openInterest:b.openInterest??b.open_interest,contract:canonicalContract(b.symbol||contract,exchange,date)})).sort((a,b)=>a.date.localeCompare(b.date));
}
function barValid(b,contract){
 return b&&b.contract===contract&&!b.provisional&&typeof b.source==='string'&&b.source.trim()&&['open','high','low','close'].every(k=>positive(b[k]))&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high);
}
function metrics(row,series,calendar){
 const gaps=[],contract=row.main_contract||'',bars=normalizeBars(series?.bars,contract,row.exchange,calendar.targetDate).filter(b=>b.date<=calendar.targetDate),last=bars.findLast(b=>b.date===calendar.targetDate),previous=bars.findLast(b=>b.date===calendar.previousDate);
 if(!/^[A-Z]{1,3}\d{3,4}$/.test(contract))gaps.push('缺少具体合约');
 if(row.data_date!==calendar.targetDate)gaps.push(`扫描行情陈旧：${row.data_date||'日期未知'}`);
 if(row.provisional)gaps.push('扫描为临时盘后快照，待正式复核');
 if(series?.contract&&series.contract!==contract)gaps.push('日K合约与扫描映射不一致');
 if(!row.data_source)gaps.push('扫描来源未知');
 if(!barValid(last,contract))gaps.push('当日完整正式日K缺失或异常');
 if(series?.error)gaps.push(series.error);
 if(last&&row.latest_bar&&['open','high','low','close','volume','open_interest'].some(k=>finite(row.latest_bar[k])&&row.latest_bar[k]!==last[k==='open_interest'?'openInterest':k]))gaps.push('日K与冻结扫描数值不一致');
 const valid=gaps.length===0,previousValid=barValid(previous,contract);
 if(!previousValid)gaps.push('同合约上一交易日完整日K缺失');
 const required=calendar.days.slice(-6),window=required.map(d=>bars.findLast(b=>b.date===d)),fiveValid=required.length===6&&window.every(b=>barValid(b,contract));
 if(!fiveValid)gaps.push('近5个交易日窗口不完整');
 const dayReturn=valid&&previousValid?last.close/previous.close-1:null,fiveReturn=valid&&fiveValid?last.close/window[0].close-1:null;
 const pastVolume=window.slice(0,-1).map(b=>b?.volume),avgVolume=fiveValid&&pastVolume.every(v=>finite(v)&&v>=0)?mean(pastVolume):null;
 const volumeRatio=valid&&positive(avgVolume)&&finite(last.volume)&&last.volume>=0?last.volume/avgVolume:null;
 const oiChange=valid&&previousValid&&finite(last.openInterest)&&last.openInterest>=0&&finite(previous.openInterest)&&previous.openInterest>=0?last.openInterest-previous.openInterest:null;
 if(volumeRatio===null)gaps.push('前5日成交均量不足');
 if(oiChange===null)gaps.push('同合约可比持仓前值不足');
 const closePosition=valid&&last.high>last.low?(last.close-last.low)/(last.high-last.low):null;
 return {code:row.code,name:row.name,contract,sector:fireDisplaySector(row).label,exchange:row.exchange,valid,gaps:[...new Set(gaps)],dayReturn,fiveReturn,volumeRatio,oiChange,closePosition,close:valid?last.close:null,high:valid?last.high:null,low:valid?last.low:null,previousHigh:previousValid?previous.high:null,previousLow:previousValid?previous.low:null,dayMa10:positive(row.day_ma10)?row.day_ma10:null,dataDate:row.data_date,source:row.data_source||'来源未知',barSource:last?.source||'来源未知',provisional:!!row.provisional||!!last?.provisional,seriesSource:series?.source||null,previousDate:calendar.previousDate,trend:{month:row.month_direction,week:row.week_direction,day:row.day_direction},inputBars:bars.slice(-25)};
}
function interpretation(item){
 const sign=item.direction==='long'?1:-1,gaps=[...item.gaps],aligned=finite(item.dayReturn)?sign*item.dayReturn:null;
 let judgment='数据待核验';
 const maBroken=item.dayMa10!==null&&item.close!==null&&sign*(item.close-item.dayMa10)<0;
 const structureBroken=item.direction==='long'?finite(item.previousLow)&&finite(item.low)&&item.low<item.previousLow:finite(item.previousHigh)&&finite(item.high)&&item.high>item.previousHigh;
 if(item.valid&&finite(aligned)&&item.dayMa10!==null){
  if(maBroken||structureBroken&&aligned<0)judgment='出现转弱迹象';
  else if(aligned>0&&finite(item.closePosition)&&(sign===1?item.closePosition>=.5:item.closePosition<=.5))judgment='顺势推进';
  else if(aligned<0)judgment='正常回撤';
  else judgment='整理';
 }else if(item.dayMa10===null)gaps.push('缺少日MA10背景，不能判断趋势质量');
 const contrary=[];
 if(maBroken)contrary.push('收盘已经处于日MA10的逆势侧');
 if(structureBroken)contrary.push(item.direction==='long'?'当日低点跌破上一交易日低点':'当日高点超过上一交易日高点');
 if(finite(item.fiveReturn)&&item.fiveReturn*sign<0)contrary.push('近5日累计表现与观察方向相反');
 if(finite(item.relativeReturn)&&item.relativeReturn*sign<0)contrary.push('当日表现没有相对同板块顺势走强');
 if(finite(item.oiChange)&&item.oiChange<0)contrary.push('持仓减少，不能将表现归因为新增风险参与');
 if(!contrary.length)contrary.push('已取得的上述指标未见明确反证，不代表风险消失');
 const quantity=`成交量/前5日均量 ${finite(item.volumeRatio)?item.volumeRatio.toFixed(2)+'倍':'不足'}；持仓 ${signed(item.oiChange,'手',0)}；收盘区间位置 ${finite(item.closePosition)?(item.closePosition*100).toFixed(0)+'%':'不足'}`;
 const next=item.valid?item.direction==='long'?`强化：收盘超过今日高点${item.high}且不破今日低点${item.low}；削弱：跌破${item.low}${item.dayMa10!==null?'或收盘低于日MA10'+item.dayMa10:''}。`:`强化：收盘低于今日低点${item.low}且不越今日高点${item.high}；削弱：超过${item.high}${item.dayMa10!==null?'或收盘高于日MA10'+item.dayMa10:''}。`:'先补齐同合约正式日K，再判断延续或转弱。';
 return {...item,gaps:[...new Set(gaps)],judgment,contrary,quantity,next:next+' 同时复核量仓与板块相对表现。',cause:'原因待核验；持仓增加不等于资金净流入，也不证明主力方向。'};
}

export function buildPostmarketReview(input,mode,previous=null){
 if(!REVIEW_MODES[mode])throw Error('复盘周期无效');
 const {scan,calendar,barSets}=input;
 if((scan.target_date||scan.data_date)!==calendar.targetDate||scan.data_date!==calendar.targetDate)throw Error('扫描交易日不是最新有效收盘日，不能生成当日复盘');
 const all=(scan.rows||[]).map(row=>metrics(row,barSets[row.code],calendar));
 const sectors=[...new Set(all.map(r=>r.sector))].map(sector=>{
  const total=all.filter(r=>r.sector===sector),valid=total.filter(r=>finite(r.dayReturn));
  return {sector,sample:valid.length,total:total.length,codes:valid.map(r=>r.code),meanReturn:mean(valid.map(r=>r.dayReturn)),meanFiveReturn:mean(valid.filter(r=>finite(r.fiveReturn)).map(r=>r.fiveReturn)),method:'同一交易日、各品种具体主力昨收口径等权；含本品种，不按资金规模加权'};
 });
 const selected=sortFireCandidates((scan.rows||[]).filter(r=>['多头观察','空头观察'].includes(r.modes?.[mode])),mode);
 const rows=selected.map(row=>{
  const m=all.find(r=>r.code===row.code),sector=sectors.find(s=>s.sector===m.sector),relativeReturn=finite(m.dayReturn)&&sector.sample>=2?m.dayReturn-sector.meanReturn:null;
  return interpretation({...m,direction:row.modes[mode]==='多头观察'?'long':'short',relativeReturn,sectorSample:sector.sample,sectorTotal:sector.total});
 });
 const commodities=all.filter(r=>!['股指','国债'].includes(r.sector)),usable=commodities.filter(r=>finite(r.dayReturn));
 const market={name:'已取得的商品期货样本（非文华商品指数）',total:commodities.length,sample:usable.length,up:usable.filter(r=>r.dayReturn>0).length,down:usable.filter(r=>r.dayReturn<0).length,flat:usable.filter(r=>r.dayReturn===0).length,meanReturn:mean(usable.map(r=>r.dayReturn)),codes:usable.map(r=>r.code),method:'每品种一个冻结具体主力；收盘比同合约昨收等权，股指与国债单列板块；不是全市场加权指数'};
 const compatible=previous?.date===calendar.previousDate&&previous.mode===mode&&previous.ruleVersion===scan.rule_version&&previous.reviewVersion===REVIEW_VERSION;
 const changes=compatible?{available:true,previousDate:previous.date,new:rows.filter(r=>!previous.rows.some(p=>p.code===r.code&&p.direction===r.direction)).map(r=>r.code),exit:previous.rows.filter(p=>!rows.some(r=>r.code===p.code&&r.direction===p.direction)).map(r=>r.code),improved:rows.filter(r=>r.valid&&r.judgment==='顺势推进'&&previous.rows.some(p=>p.code===r.code&&p.direction===r.direction&&p.valid&&p.judgment!=='数据待核验'&&p.judgment!=='顺势推进')).map(r=>r.code),weakened:rows.filter(r=>r.valid&&r.judgment==='出现转弱迹象'&&previous.rows.some(p=>p.code===r.code&&p.direction===r.direction&&p.valid&&p.judgment!=='数据待核验'&&p.judgment!=='出现转弱迹象')).map(r=>r.code)}:{available:false,reason:'缺少上一交易日同周期、同扫描版本的复盘底稿，无法比较新增、退出、改善和转弱'};
 const focus=side=>rows.filter(r=>r.direction===side&&r.judgment==='顺势推进'&&finite(r.fiveReturn)&&r.fiveReturn*(side==='long'?1:-1)>0&&finite(r.relativeReturn)&&r.relativeReturn*(side==='long'?1:-1)>0).sort((a,b)=>(side==='long'?1:-1)*(b.relativeReturn-a.relativeReturn)).slice(0,3).map(r=>r.name+' '+r.contract);
 const long=rows.filter(r=>r.direction==='long'),short=rows.filter(r=>r.direction==='short'),pending=rows.filter(r=>r.gaps.length),longFocus=focus('long'),shortFocus=focus('short');
 const overview=`${calendar.targetDate} ${REVIEW_MODES[mode]}共${rows.length}个候选，多头${long.length}、空头${short.length}。已取得商品样本${market.sample}/${market.total}，上涨${market.up}、下跌${market.down}、持平${market.flat}，昨收口径等权表现${percentage(market.meanReturn)}；该样本不是全市场指数。候选中顺势推进${rows.filter(r=>r.judgment==='顺势推进').length}个，转弱迹象${rows.filter(r=>r.judgment==='出现转弱迹象').length}个，有数据缺口${pending.length}个。多头延续观察：${longFocus.join('、')||'暂未发现数据充分且同时相对走强的品种'}；空头延续观察：${shortFocus.join('、')||'暂未发现数据充分且同时相对走弱的品种'}。下一日先看今日高低点是否被突破、日MA10能否守住，再核验量仓和板块相对表现。${calendar.weekState}，${calendar.monthState}；事件原因待核验。本报告仅供观察，不产生计划或交易许可。`;
 return {reviewVersion:REVIEW_VERSION,date:calendar.targetDate,mode,modeLabel:REVIEW_MODES[mode],ruleVersion:scan.rule_version,scanAt:scan.refreshedAt,capturedAt:input.capturedAt,scanHash:hash(scan),inputHash:hash(input),sourcePath:scan.sourcePath,calendar,market,sectors,rows,changes,focus:{long:longFocus,short:shortFocus},overview,ai:{status:'not-configured',text:null},priceBasis:'收盘/同合约上一交易日收盘-1；不使用结算或昨结算',boundary:'研究与人工判断；不改变候选、原排序，不创建交易计划、仓位或账户许可'};
}

function distribution(rows){
 const values=rows.map(r=>r.dayReturn).filter(finite).sort((a,b)=>a-b),n=values.length;
 return {total:rows.length,sample:n,missing:rows.length-n,up:values.filter(v=>v>0).length,down:values.filter(v=>v<0).length,flat:values.filter(v=>v===0).length,meanReturn:mean(values),medianReturn:n?(values[Math.floor(n/2)]+values[Math.floor((n-1)/2)])/2:null};
}
function modeEvidence(row,mode){
 const status=row.modes?.[mode]||'数据不足',periods=mode==='month-week'?['month','week']:mode==='week-day'?['week','day']:['month','week','day'];
 const names={month:'月',week:'周',day:'日'},number=v=>finite(v)?String(Number(v.toFixed(4))):'未知';
 const lines=periods.map(p=>`${names[p]}MA10 ${row[p+'_direction']||'未知'}（${number(row['previous_'+p+'_ma10'])}→${number(row[p+'_ma10'])}）`);
 if(mode==='month-week')lines.push(...fireStructure(row,mode,'week').map(s=>s.label+'：'+s.values),`月突破：向上${row.month_break_up===true?'满足':row.month_break_up===false?'未满足':'未知'} / 向下${row.month_break_down===true?'满足':row.month_break_down===false?'未满足':'未知'}`);
 if(mode==='week-day')lines.push(...fireStructure(row,mode,'day').map(s=>s.label+'：'+s.values));
 lines.push(`成交${number(row.volume)}手 / 持仓${number(row.open_interest)}手；均须严格>10,000手`);
 const reasons=row.attention?.[mode]?.reasons||[];
 return {status,reason:[status,...reasons,...lines].join('；')};
}
export function buildThreeModeReview(input,previous=null){
 const modes=modeKeys.map(mode=>buildPostmarketReview(input,mode)),base=modes[0],scanRows=input.scan.rows||[];
 const metricsByCode=new Map(modes.flatMap(r=>r.rows).map(r=>[r.code,r]));
 const selected=scanRows.filter(row=>modeKeys.some(mode=>candidate(row.modes?.[mode])));
 selected.sort((a,b)=>fireDisplaySector(a).index-fireDisplaySector(b).index);
 const rows=selected.map(row=>{
  const membership=Object.fromEntries(modeKeys.map(mode=>[mode,modeEvidence(row,mode)])),sides=modeKeys.filter(mode=>candidate(membership[mode].status)).map(mode=>membership[mode].status),conflict=new Set(sides).size>1;
  const direction=conflict?'conflict':sides[0]==='多头观察'?'long':'short';
  const source=modes.flatMap(r=>r.rows).find(r=>r.code===row.code&&r.direction===direction)||metricsByCode.get(row.code);
  const agreement=conflict?'方向冲突':sides.length===3?'三模式同向':sides.length===2?'两模式同向':'单模式入选';
  const item={...source,direction,membership,agreement,modeCount:sides.length};
  if(conflict)return {...item,judgment:'方向待复核',next:'先核对三个模式的冻结判定与合约映射。'};
  const sign=direction==='long'?1:-1,aligned=finite(item.dayReturn)?sign*item.dayReturn:null;
  const maBroken=finite(item.close)&&finite(item.dayMa10)&&sign*(item.close-item.dayMa10)<0;
  const broken=direction==='long'?finite(item.low)&&finite(item.previousLow)&&item.low<item.previousLow:finite(item.high)&&finite(item.previousHigh)&&item.high>item.previousHigh;
  const quality=finite(item.fiveReturn)&&sign*item.fiveReturn>0&&finite(item.relativeReturn)&&sign*item.relativeReturn>=0&&finite(item.closePosition)&&(sign===1?item.closePosition>=.5:item.closePosition<=.5);
  const judgment=!item.valid||!finite(aligned)||!finite(item.fiveReturn)||!finite(item.dayMa10)?'数据待核验':maBroken||broken&&aligned<0?'出现转弱迹象':aligned>0&&quality?'顺势推进':aligned<0?'回调 / 反弹':'整理';
  return {...item,judgment};
 });
 const modeStats=modes.map(r=>({mode:r.mode,label:r.modeLabel,...distribution(r.rows),long:r.rows.filter(v=>v.direction==='long').length,short:r.rows.filter(v=>v.direction==='short').length,missingDecisions:scanRows.filter(v=>!v.modes?.[r.mode]||v.modes[r.mode]==='数据不足').length,sides:['long','short'].map(side=>({direction:side,...distribution(r.rows.filter(v=>v.direction===side))}))}));
 const all=scanRows.map(row=>metrics(row,input.barSets[row.code],input.calendar));
 const markets=[{name:'商品期货样本（非文华指数）',rows:all.filter(r=>!['股指','国债'].includes(r.sector))},{name:'股指',rows:all.filter(r=>r.sector==='股指')},{name:'国债',rows:all.filter(r=>r.sector==='国债')}].map(({name,rows})=>({name,...distribution(rows)}));
 const sectors=base.sectors.map(s=>{const items=all.filter(r=>r.sector===s.sector),valid=items.filter(r=>finite(r.dayReturn)).sort((a,b)=>a.dayReturn-b.dayReturn),stats=distribution(items),extreme=valid.at(-1)&&Math.abs(valid.at(-1).dayReturn)>=Math.abs(valid[0].dayReturn)?valid.at(-1):valid[0];return {...s,...stats,extreme:extreme?{name:extreme.name,dayReturn:extreme.dayReturn}:null,withoutExtreme:valid.length>=3?mean(valid.filter(r=>r!==extreme).map(r=>r.dayReturn)):null,breadth:!stats.sample?'数据不足':stats.up===stats.sample?'样本普涨':stats.down===stats.sample?'样本普跌':'板块分化'};});
 const pairs=modeKeys.flatMap((a,i)=>modeKeys.slice(i+1).map(b=>({a,b,count:rows.filter(r=>candidate(r.membership[a].status)&&candidate(r.membership[b].status)).length})));
 const overlap={union:rows.length,three:rows.filter(r=>r.agreement==='三模式同向').length,two:rows.filter(r=>r.agreement==='两模式同向').length,one:rows.filter(r=>r.agreement==='单模式入选').length,conflict:rows.filter(r=>r.agreement==='方向冲突').length,pairs};
 const compatible=previous?.reviewVersion===COMPARISON_VERSION&&previous.date===input.calendar.previousDate&&previous.ruleVersion===base.ruleVersion;
 const changes=compatible?{available:true,previousDate:previous.date,new:rows.filter(r=>!previous.rows.some(p=>p.code===r.code&&p.direction===r.direction)).map(r=>r.code),exit:previous.rows.filter(p=>!rows.some(r=>r.code===p.code&&r.direction===p.direction)).map(r=>r.code),improved:rows.filter(r=>r.judgment==='顺势推进'&&previous.rows.some(p=>p.code===r.code&&p.judgment!=='顺势推进'&&p.judgment!=='数据待核验')).map(r=>r.code),weakened:rows.filter(r=>r.judgment==='出现转弱迹象'&&previous.rows.some(p=>p.code===r.code&&p.judgment!=='出现转弱迹象'&&p.judgment!=='数据待核验')).map(r=>r.code)}:{available:false,reason:'尚无上一交易日同版本三模式复盘，历史变化暂无法比较'};
 const focus=Object.fromEntries(['long','short'].map(side=>[side,rows.filter(r=>r.direction===side&&r.judgment==='顺势推进').sort((a,b)=>(side==='long'?1:-1)*(b.relativeReturn-a.relativeReturn)).slice(0,5).map(r=>r.code)]));
 const leading=[...sectors].filter(s=>s.sample>=2&&!['股指','国债'].includes(s.sector)).sort((a,b)=>b.meanReturn-a.meanReturn),market=markets[0];
 const overview=`${base.date}商品有效样本${market.sample}/${market.total}，涨${market.up}、跌${market.down}、平${market.flat}，等权${percentage(market.meanReturn)}，中位数${percentage(market.medianReturn)}。${leading.length?`相对强侧${leading[0].sector}（${percentage(leading[0].meanReturn)}），弱侧${leading.at(-1).sector}（${percentage(leading.at(-1).meanReturn)}）。`:''}${modeStats.map(s=>`${s.label}${s.total}个（多${s.long}/空${s.short}）`).join('；')}。去重${rows.length}个，三模式同向${overlap.three}、两模式同向${overlap.two}、单模式${overlap.one}、方向冲突${overlap.conflict}。候选顺势推进${rows.filter(r=>r.judgment==='顺势推进').length}、转弱${rows.filter(r=>r.judgment==='出现转弱迹象').length}。先核对模式差异，再结合消息与供需验证主线。`;
 return {...base,reviewVersion:COMPARISON_VERSION,mode:'all',modeLabel:'三模式对比',rows,modeStats,markets,sectors,market:{...base.market,...market},overlap,changes,focus,overview,qualityMethod:'日MA10逆势或逆向日结构破坏标为转弱；顺势推进须当日与近5日同向、相对板块不弱、收盘位于顺势半区；其余标回调/反弹、整理或待核验。量仓与事件为补充证据，不推断资金方向。'};
}

export function reviewMarkdown(r){
 const lines=[`# ${r.date} ${r.modeLabel} · 盘后数据复盘`,'',`规则：${r.ruleVersion}；复盘口径：${r.reviewVersion}；输入哈希：${r.inputHash}`,`价格口径：${r.priceBasis}`,`扫描刷新：${r.scanAt||'未知'}；输入固定：${r.capturedAt||'未知'}；来源快照：${r.sourcePath||'未知'}`,'',r.overview,'',`AI状态：${r.ai.status}${r.ai.error?'；'+r.ai.error:''}`,...(r.ai.text?['',r.ai.text]:[]),'','## 全部候选','| 品种 | 合约 | 方向 | 当日 | 近5日 | 板块相对 | 量价仓 | 判断 | 下一日验证 |','|---|---|---|---|---|---|---|---|---|'];
 const safe=v=>String(v??'').replace(/\|/g,'/').replace(/\r?\n/g,' ');
 if(r.mode==='all'){
  const extra=['## 市场与板块','| 范围 | 有效/总样本 | 涨/跌/平 | 等权 | 中位数 |','|---|---|---|---|---|'];
  for(const s of [...r.markets,...r.sectors.map(s=>({...s,name:s.sector}))])extra.push(`| ${s.name} | ${s.sample}/${s.total} | ${s.up}/${s.down}/${s.flat} | ${percentage(s.meanReturn)} | ${percentage(s.medianReturn)} |`);
  extra.push('','## 三模式统计','| 模式 | 方向 | 有效/候选 | 涨/跌/平 | 等权 | 中位数 |','|---|---|---|---|---|---|');
  for(const s of r.modeStats)for(const side of s.sides)extra.push(`| ${s.label} | ${side.direction==='long'?'多头':'空头'} | ${side.sample}/${side.total} | ${side.up}/${side.down}/${side.flat} | ${percentage(side.meanReturn)} | ${percentage(side.medianReturn)} |`);
  extra.push('',`去重${r.overlap.union}个；三模式同向${r.overlap.three}、两模式同向${r.overlap.two}、单模式${r.overlap.one}、方向冲突${r.overlap.conflict}。`,'','## 候选对照','| 品种 | 月周日共振 | 月周大周期 | 周日小周期 | 对照 |','|---|---|---|---|---|');
  for(const row of r.rows)extra.push('|'+[row.name,...modeKeys.map(m=>row.membership[m].status),row.agreement].map(safe).join('|')+'|');
  extra.push('',`判断口径：${r.qualityMethod}`,'');
  const index=lines.indexOf('## 全部候选');lines.splice(index,0,...extra);
 }
 for(const row of r.rows)lines.push('|'+[row.name,row.contract,row.direction==='long'?'多头':row.direction==='short'?'空头':'方向冲突',percentage(row.dayReturn),percentage(row.fiveReturn),finite(row.relativeReturn)?signed(row.relativeReturn*100,'个百分点'):'不足',row.quantity,row.judgment,row.next].map(safe).join('|')+'|');
 for(const row of r.rows)lines.push('',`### ${row.name} ${row.contract}`,`来源：${row.source} / ${row.barSource}；行情：${row.dataDate}；${row.provisional?'临时快照':row.valid?'完整日K已核验':'日K待核验'}`,`反证：${row.contrary.join('；')}`,`缺口：${row.gaps.join('；')||'上述指标未见缺口'}`,row.cause);
 if(r.mode==='all'){
  for(const row of r.rows)for(const mode of modeKeys)lines.push(`差异依据 ${row.name} ${REVIEW_MODES[mode]}：${row.membership[mode].reason}`);
  lines.push('','## 消息与供需证据');
  for(const s of r.evidence?.items||[])lines.push(`[${s.id}] ${s.title}；${s.source}；${s.published||'日期未知'}；${s.url}`);
  for(const s of r.evidence?.items||[])lines.push(`证据 [${s.id}] ${s.classification||''}：${s.text||'仅线索，正文未取得'}`);
  for(const p of r.evidence?.providers||[])lines.push(`${p.name}：${p.status==='ok'?'已取得':p.status==='sampled'?'窗口取样':p.status==='partial'?'部分取得':'未获取'}；${p.coverage||p.reason||''}`);
  lines.push(`缺口：${r.evidence?.missing?.join('；')||'见输入证据快照'}`);
 }
 lines.push('',`历史对照：${r.changes.available?JSON.stringify(r.changes):r.changes.reason}`,'',r.boundary);return lines.join('\n');
}

const exec=promisify(execFile);
export async function loadReviewCalendar(){
 const python=resolve(process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python');
 const {stdout}=await exec(python,[resolve('scripts/postmarket_calendar.py')],{timeout:30000,maxBuffer:1024*1024});
 return reviewCalendar(JSON.parse(stdout).days);
}
export async function loadReviewBars(scan){
 const sets={};
 for(const row of scan.rows||[]){
  if(!/^[A-Z]{1,3}\d{3,4}$/.test(row.main_contract||'')){sets[row.code]={bars:[],error:'具体合约未映射'};continue}
  const path=resolve('.runtime/fire-scan/contract-bars',row.main_contract+'.json');
  try{sets[row.code]={contract:row.main_contract,source:path,bars:JSON.parse(await readFile(path,'utf8')).filter(b=>String(b.date).slice(0,10)<=scan.data_date).slice(-25)}}
  catch{sets[row.code]={contract:row.main_contract,source:path,bars:[],error:'保存的具体合约日K无法读取'}}
 }
 return sets;
}
async function atomic(path,value){const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,typeof value==='string'?value:JSON.stringify(value,null,2),'utf8');await rename(temporary,path)}
export function createPostmarketReview({directory=resolve('.runtime/postmarket-reviews'),getScan,refreshScan,getCalendar=loadReviewCalendar,getBars=loadReviewBars,getEvidence=null,explain=null,refreshTimeout=15*60*1000,pollMs=1200}={}){
 let active=null,pending=null;
 const drafts=new Map(),saving=new Map();
 const validId=id=>/^[0-9a-f-]{36}$/.test(id);
 async function status(id){
  if(!validId(id))throw Error('复盘记录不存在');
  if(drafts.has(id))return clone(drafts.get(id).job);
  let job;try{job=JSON.parse(await readFile(join(directory,id,'status.json'),'utf8'))}catch{throw Error('复盘记录不存在')}
  if(job.status==='running'&&active?.id!==id)return {...job,saved:false,status:'interrupted',stage:'运行已中断',error:'服务已重启，本次未完成；请重新复盘，原始输入保留'};
  return {...job,saved:['completed','partial'].includes(job.status),storagePath:join(directory,id)};
 }
 async function history(mode){
  let ids;try{ids=await readdir(directory)}catch{return[]}
  const jobs=[];for(const id of ids)if(validId(id)){try{const job=await status(id);if(job.saved&&(!mode||job.mode===mode))jobs.push(job)}catch{}}
  return jobs.sort((a,b)=>(b.savedAt||b.createdAt).localeCompare(a.savedAt||a.createdAt)||b.id.localeCompare(a.id));
 }
 async function result(id){
  const job=await status(id),draft=drafts.get(id);
  if(draft){if(!draft.report)throw Error('本次尚无计算结果');return clone({...draft.report,saved:!!job.saved,savedAt:job.savedAt,storagePath:job.storagePath})}
  try{return {...JSON.parse(await readFile(join(directory,id,'result.json'),'utf8')),saved:job.saved,savedAt:job.savedAt,storagePath:job.storagePath}}catch{throw Error('本次尚无计算结果')}
 }
 async function persist(id){
  const job=await status(id);
  if(job.saved)return job;
  const draft=drafts.get(id);
  if(!['completed','partial'].includes(job.status)||!draft?.report||!draft?.input)throw Error('复盘尚未完成，暂不能保存');
  const savedAt=new Date().toISOString(),storagePath=join(directory,id);
  const savedJob={...job,saved:true,savedAt,storagePath,savePolicy:'manual',stage:job.status==='partial'?'已保存（有缺口）':'已保存'};
  const report={...draft.report,saved:true,savedAt,storagePath};
  // Publish only after all files exist; incomplete saves never appear in history.
  const staging=join(directory,'.pending-'+randomUUID());
  await mkdir(staging,{recursive:true});
  await atomic(join(staging,'input.json'),draft.input);
  await atomic(join(staging,'result.json'),report);
  await atomic(join(staging,'复盘报告.md'),reviewMarkdown(report));
  await atomic(join(staging,'status.json'),savedJob);
  await rename(staging,storagePath);
  Object.assign(draft.job,savedJob);draft.report=report;
  return clone(savedJob);
 }
 function save(id){
  if(saving.has(id))return saving.get(id);
  const operation=persist(id).finally(()=>saving.delete(id));saving.set(id,operation);return operation;
 }
 async function run(job){
  const draft=drafts.get(job.id);
  const stage=async(message,extra={})=>{Object.assign(job,{stage:message,updatedAt:new Date().toISOString()},extra)};
  try{
   await stage('核验交易日与扫描日期');const calendar=await getCalendar();let scan=clone(await getScan());
   const stale=()=>scan.data_date!==calendar.targetDate||scan.target_date!==calendar.targetDate||(scan.rows||[]).some(r=>(job.mode==='all'?modeKeys.some(m=>candidate(r.modes?.[m])):candidate(r.modes?.[job.mode]))&&(r.data_date!==calendar.targetDate||r.provisional));
   if(scan.refreshing||stale()){
    await stage('等待现有盘后刷新完成');if(!scan.refreshing)await refreshScan();const until=Date.now()+refreshTimeout;
    while(true){await delay(pollMs);scan=clone(await getScan());if(!scan.refreshing)break;if(Date.now()>until)throw Error('等待盘后刷新超时，旧报告保留，请重试')}
    if(scan.refreshError)throw Error(scan.refreshError);
   }
   if(scan.status!=='ready'||scan.data_date!==calendar.targetDate||(scan.target_date||scan.data_date)!==calendar.targetDate)throw Error('刷新后仍未取得最新交易日扫描，旧数据不能冒充当日复盘');
   await stage('冻结名单与同合约日K', {date:calendar.targetDate,ruleVersion:scan.rule_version});
   const barSets=await getBars(scan),after=await getScan();
   if(after.refreshing||hash(after)!==hash(scan))throw Error('扫描在读取期间变化，本次未混合数据；请等待刷新后重试');
   const input={scan,calendar,barSets,capturedAt:new Date().toISOString()};draft.input=input;
   const old=(await history(job.mode)).find(j=>j.date===calendar.previousDate&&['completed','partial'].includes(j.status));let previous=null;if(old)previous=await result(old.id);
   const report=job.mode==='all'?buildThreeModeReview(input,previous):buildPostmarketReview(input,job.mode,previous);report.id=job.id;report.createdAt=job.createdAt;
   report.ai={status:explain&&report.rows.length?'pending':'not-configured',text:null};
   draft.report=report;await stage('计算完成 · 未保存', {candidateCount:report.rows.length});
   if(job.mode==='all'){
    await stage('核对当天消息与供需资料（统计表已可查看）');
    try{report.evidence=getEvidence?await getEvidence(clone(report)):null}catch{report.evidence=null}
    report.evidence||={status:'unavailable',items:[],products:[],missing:['消息与供需资料尚未取得，原因待核验']};
    input.evidence=clone(report.evidence);report.inputHash=hash(input);
    delete report.evidence.documents;
   }
   if(explain&&report.rows.length){
    await stage('AI解释已核验结果（计算表已可查看）');
    try{const ai=await explain(clone(report));if(!ai?.text?.trim())throw Error('AI未返回有效解释');report.ai={status:'completed',text:ai.text,model:ai.model,provider:ai.provider,totalTokens:ai.totalTokens}}
    catch{report.ai={status:'failed',text:null,error:'AI解释未完成，以下为真实计算结果；可重新复盘重试'}}
   }
   const partial=report.rows.some(r=>r.gaps.length)||report.ai.status==='failed'||job.mode==='all'&&report.evidence?.status!=='ok';
   await stage(partial?'分析完成（有缺口）· 未保存':'分析完成 · 未保存',{status:partial?'partial':'completed',aiStatus:report.ai.status,inputHash:report.inputHash});
  }catch(error){await stage('复盘未完成',{status:'failed',error:error.message}).catch(()=>{})}
  finally{active=null}
 }
 return {history,status,result,save,current:()=>active?clone(active):null,isCapturing:()=>active?.status==='running'&&['核验交易日与扫描日期','冻结名单与同合约日K'].includes(active.stage),
  start(mode='month-week-day'){
   if(mode!=='all'&&!REVIEW_MODES[mode])throw Error('复盘周期无效');
   if(active)return {...clone(active),reused:true};
   // Bound unsaved memory without removing reports while they are being saved.
   for(const [id] of drafts){if(drafts.size<20)break;if(!saving.has(id))drafts.delete(id)}
   const job={id:randomUUID(),mode,modeLabel:mode==='all'?'三模式对比':REVIEW_MODES[mode],status:'running',stage:'准备复盘',saved:false,createdAt:new Date().toISOString()};active=job;drafts.set(job.id,{job});
   pending=run(job);return {id:job.id,mode:job.mode,modeLabel:job.modeLabel,status:'running',stage:job.stage,createdAt:job.createdAt};
  },async wait(){await pending}
 };
}
