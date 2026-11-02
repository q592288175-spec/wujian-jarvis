import Decimal from './vendor/decimal/decimal.js';

export const GOLD_RULE = 'gold-2026-10-26-v2';
export const METHODS = [
 {id:'anti-break',name:'反K突破',pair:'反K突破入场 / 反K最低点止损',defense:'指定反K组另一侧极值'},
 {id:'anti-close',name:'反K收线',pair:'反K入场 / 前一根反K止损',defense:'同一回调内前一根有效反K极值'},
 {id:'ma10',name:'穿日MA10',pair:'穿10均线入场 / 平台止损',defense:'整段回调区间另一侧，包含所有K线和影线'},
 {id:'trend',name:'清晰单边',pair:'清晰单边入场 / 前一根最低点止损',defense:'穿分时均价线守前一完成日K；静K突破守最后完成静K'},
 {id:'intraday',name:'穿分时均线入场',pair:'独立分时均线入场 / 当日有效高低点外侧止损',defense:'事先标定的当日有效低点或高点外侧；不套用日K止损',maxRiskPercent:.5}
];
const finite = n => typeof n==='number' && Number.isFinite(n);
const opposite = (b,d) => d==='long'?b.close<b.open:b.close>b.open;
const extreme = (bars,d,entry=false) => (d==='long')===entry?Math.max(...bars.map(b=>b.high)):Math.min(...bars.map(b=>b.low));
export function completedBars(bars=[],cutoff='9999-12-31') {
 return [...new Map(bars.filter(b=>!b.provisional&&b.completed!==false&&String(b.date).slice(0,10)<=cutoff&&
  [b.open,b.high,b.low,b.close].every(finite)&&b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))
  .map(b=>[String(b.date).slice(0,10),{...b,date:String(b.date).slice(0,10)}])).values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function goldPermission(layers={},direction) {
 const flaws=[],missing=[];
 if(!['long','short'].includes(direction))missing.push('品种方向未知');
 for(const k of ['week','day'])if(layers[k]?.direction!==direction)missing.push(`${k==='week'?'周':'日'}线方向未与方案同向`);
 for(const [k,name] of [['market','大盘'],['sector','板块'],['month','月线']]){
  const l=layers[k]||{};
  if(!l.direction||l.direction==='unknown')missing.push(`${name}待核验`);
  else if(l.direction!==direction)flaws.push(`${name}不同向`);
  if(l.referenceOnly)flaws.push(`${name}为辅助代理，不能认定主线共振`);
  if(l.weekDirection&&l.weekDirection!==direction)flaws.push(`${name}周线未共振`);
 }
 const primary=!missing.length&&!['market','sector','month'].some(k=>layers[k]?.direction!==direction||layers[k]?.referenceOnly);
 return {cap:missing.length?0:.01,state:missing.length?'待核验':primary?'优先主线候选':'有瑕疵关注',reason:[...missing,...flaws].join('；')||'大盘、板块日线与品种同向',flaws,missing,primary};
}

// Range suggestions describe recent data, not a universal grouping or strength classifier.
export function analyzeMethods({bars:raw=[],direction,cutoff,tickSize,contract,source,layers={},water={}}) {
 const bars=completedBars(raw,cutoff),last=bars.at(-1),recent=bars.slice(-12),anti=recent.filter(b=>opposite(b,direction));
 const group=[];
 for(let i=bars.length-1;i>=0&&opposite(bars[i],direction);i--)group.unshift(bars[i]);
 const trend=bars.slice(-3),ordered=trend.length===3&&trend.every((b,i)=>i===0||(direction==='long'?b.low>=trend[i-1].low:b.high<=trend[i-1].high));
 const point=last?.close,ma10=bars.length>=10?bars.slice(-10).reduce((n,b)=>n+b.close,0)/10:null;
 const start=recent.length?recent.reduce((a,b)=>direction==='long'?(b.high>a.high?b:a):(b.low<a.low?b:a)):null;
 const range=(values)=>({start:values[0]?.date||last?.date||'',end:values.at(-1)?.date||last?.date||''});
 const previous=anti.at(-2),closeValid=!!(last&&opposite(last,direction)&&previous&&(direction==='long'?last.low>=previous.low:last.high<=previous.high));
 const candidates=[
  {...METHODS[0],range:range(group.length?group:[last].filter(Boolean)),available:group.length>0,reason:group.length?`最近${group.length}根连续反K提供可核对边界，等待价格恢复推进。`:'末端没有连续反K；需本人圈定同一回调，不能任意向历史合组。'},
  {...METHODS[1],range:{start:previous?.date||last?.date||'',end:last?.date||''},available:closeValid,reason:closeValid?'最新反K已完成，且未破前一有效反K防守；先确认是否同一轮回调。':'当前未满足“已收线且前一反K防守仍有效”，不推荐套用。'},
  {...METHODS[2],range:{start:start?.date||'',end:last?.date||''},available:bars.length>=11&&start?.date!==last?.date,reason:ma10===null?'日MA10数据不足。':`完成日MA10 ${Number(ma10.toFixed(3))}，收盘 ${point}；回调范围须确认，盘后不能证明盘中穿线。`},
  {...METHODS[3],range:range(last?[last]:[]),branch:'average',available:ordered,reason:ordered?'近期防守端有序推进（允许持平），优先研究穿当日均价线；静K需另核相对振幅与强势背景。':'近期防守端未呈连续有序推进；先核对结构，不把杂乱图形认作单边。'},
  {...METHODS[4],range:range(last?[last]:[]),available:false,reason:'独立分时小周期：需主线许可、易涨难跌或易跌难涨；填写已确认的分时算法、二次确认口径、当日高低点及截止时刻。日K数据不能证明盘中穿线。'}
 ];
 const previousMA=bars.length>=11?bars.slice(-11,-1).reduce((n,b)=>n+b.close,0)/10:null,prior=bars.at(-2);
 const crossed=previousMA!==null&&ma10!==null&&prior&&(direction==='long'?prior.close<=previousMA&&point>ma10:prior.close>=previousMA&&point<ma10);
 const settling=closeValid&&previous&&(direction==='long'?last.low>previous.low&&last.close>=previous.close:last.high<previous.high&&last.close<=previous.close);
 // Descriptive tie-breaks are suggestions, never extra eligibility thresholds.
 const preferred=crossed?'ma10':settling?'anti-close':group.length?'anti-break':ordered?'trend':'ma10';
 let recommended=candidates.find(c=>c.id===preferred&&c.available)?.id||null;
 const permission=goldPermission(layers,direction),missing=[];
 if(!last)missing.push('具体合约完成日K缺失');
 if(last?.date!==cutoff)missing.push('具体合约日K未覆盖扫描数据日');
 if(!finite(tickSize)||tickSize<=0)missing.push('最小变动价位待核验');
 if(missing.length||permission.missing.length)recommended=null;
 return {ruleVersion:GOLD_RULE,analyzedAt:new Date().toISOString(),contract,source,dataDate:last?.date||null,bars:bars.slice(-60),ma10,candidates,recommended,permission,missing,
  research:water.headline||water.change||'尚无本品种研究结论',counterEvidence:water.disproof||'基本面反证待核验',
  notice:'规则辅助分析，不是自动图形识别结论；先确认结构与手法，再审价格和账户。',tickSize};
}

export function deriveMethod(analysis,choice={}) {
 const {method,branch='average',start,end}=choice,direction=choice.direction;
 if(!METHODS.some(m=>m.id===method)||!['long','short'].includes(direction))throw Error('请选择有效入场手法和方向');
 const bars=analysis.bars,selected=bars.filter(b=>b.date>=start&&b.date<=end),last=selected.at(-1);
 if(!selected.length||selected[0].date!==start||last.date!==end)throw Error('结构起止日期不在本次完成日K内');
 if(end!==analysis.dataDate)throw Error('结构必须核对到最新完成日K，旧区间不能跳过后续行情');
 if(method==='intraday')return deriveIntraday(analysis,choice);
 const methods=METHODS.find(m=>m.id===method),anti=selected.filter(b=>opposite(b,direction));
 let stop,boundary=null,trigger,stopReference,entry=null;
 const side=direction==='long'?'上穿':'下穿',edge=direction==='long'?'高':'低';
 if(method==='anti-break'){
  if(!anti.length)throw Error('指定范围没有符合方向的反K，十字K不作反K');
  stop=extreme(anti,direction);boundary=extreme(anti,direction,true);
  if(direction==='long'?last.low<stop:last.high>stop)throw Error('反K组防守已被后续K线破坏');
  trigger=`盘中实际${direction==='long'?'超过':'跌破'}反K组${edge}点 ${boundary}（相等不触发）`;
  stopReference=`${anti.map(b=>b.date).join('、')} 反K组${direction==='long'?'低':'高'}点`;
 }else if(method==='anti-close'){
  if(!opposite(last,direction)||anti.length<2)throw Error('收线法须有当前完成反K及同轮前一有效反K');
  const previous=anti.at(-2);stop=extreme([previous],direction);
  if(direction==='long'?last.low<stop:last.high>stop)throw Error('当前反K曾破前一反K防守，原收线方案无效');
  entry=last.close;trigger=`${last.date} 反K已完成；仅在本人审定的首次适用交易日和价格范围参与，不补记收盘成交`;
  stopReference=`前一有效反K ${previous.date} ${direction==='long'?'最低':'最高'}点`;
 }else if(method==='ma10'){
  if(analysis.bars.length<11||selected.length<2)throw Error('日MA10或清楚回调区间不足');
  stop=extreme(selected,direction);trigger=`盘中顺势${side}动态日MA10；仅在线${direction==='long'?'上':'下'}不算穿线`;
  entry=analysis.ma10;stopReference=`${start} 至 ${end} 整段回调${direction==='long'?'最低':'最高'}点（含全部影线）`;
 }else if(branch==='static'){
  boundary=extreme(selected,direction,true);stop=extreme([last],direction);
  trigger=`强势单边中实际${direction==='long'?'超过':'跌破'}静K组${edge}点 ${boundary}（相等不触发）`;
  stopReference=`最后完成静K ${last.date} ${direction==='long'?'最低':'最高'}点，不取组极值`;
 }else if(branch==='average'){
  stop=extreme([last],direction);entry=last.close;trigger=`盘中顺势${side}分时当日均价线（非分钟MA10）；未成交回穿时提醒失效`;
  stopReference=`前一完成日K ${last.date} ${direction==='long'?'最低':'最高'}点`;
 }else throw Error('清晰单边分支无效');
 if(boundary!==null){
  if(!(analysis.tickSize>0))throw Error('缺少合法跳动单位');
  const b=new Decimal(boundary),t=new Decimal(analysis.tickSize);
  entry=(direction==='long'?b.div(t).floor().plus(1):b.div(t).ceil().minus(1)).mul(t).toNumber();
 }else if(finite(entry)&&analysis.tickSize>0){
  const v=new Decimal(entry).div(analysis.tickSize);entry=(direction==='long'?v.ceil():v.floor()).mul(analysis.tickSize).toNumber();
 }
 return {method,branch:method==='trend'?branch:null,start,end,direction,pairType:methods.pair,stop,boundary,entry,trigger,stopReference,
  invalidation:`防守价 ${stop} 到价失效；超出审定价区间不追；首次适用交易日收盘未成交转待复核`,
  status:'等待触发',liveTriggerVerified:false};
}

export function validateGoldPlan(derived,p,tickSize) {
 const errors=[],long=derived.direction==='long';
 if(![p.entryMin,p.entryMax,p.stop].every(n=>finite(n)&&n>0)||p.entryMin>p.entryMax)errors.push('入场价格范围或止损无效');
 if(finite(p.stop)&&finite(p.entryMin)&&finite(p.entryMax)&&!(long?p.stop<p.entryMin:p.stop>p.entryMax))errors.push('止损必须位于整个入场范围的防守侧');
 if(tickSize>0&&[p.entryMin,p.entryMax,p.stop].some(n=>!finite(n)||!new Decimal(n).mod(tickSize).isZero()))errors.push('价格不符合最小变动价位');
 if(derived.boundary!==null&&!(long?p.entryMin>derived.boundary:p.entryMax<derived.boundary))errors.push('突破入场范围必须实际越过结构边界');
 if(p.stop!==derived.stop&&!String(p.adjustmentReason||'').trim())errors.push('修改结构止损须留下原因并重新审定');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.tradingDay||'')||!Number.isFinite(Date.parse(p.validUntil))||p.validUntil.slice(0,10)!==p.tradingDay)errors.push('请明确首次适用交易日及该日收盘到期时间');
 if(!String(p.exitRule||'').trim())errors.push('请填写已有的持有与退出安排');
 if(p.structureConfirmed!==true)errors.push('请确认结构清晰及所选防守依据');
 if(derived.method==='intraday'){
  const q=derived.intraday,long=derived.direction==='long';
  if(p.mainCycle!=='small')errors.push('独立分时方法必须使用小周期口径，不能切换为日K持有');
  if(p.tradingDay!==q.tradingDay)errors.push('所属交易日变化，须重新确认分时结构与手法');
  if(!(long?p.stop<q.pivot:p.stop>q.pivot))errors.push('初始止损须在事前标定的当日有效高低点外侧');
  if(long?p.stop<derived.stop:p.stop>derived.stop)errors.push('不能随当日新低或新高向外移动止损；须重新核对结构，不能沿用原方法确认');
  const until=Date.parse(p.holdingUntil),entryUntil=Date.parse(p.validUntil);
  if(!Number.isFinite(until))errors.push('请填写持有或日内离场的截止时刻');
  if(p.holdingMode==='intraday'){
   if(p.holdingUntil?.slice(0,10)!==p.tradingDay||until>entryUntil)errors.push('日内离场须在本交易日的审定收盘截止前，不自动取得隔夜权限');
  }else if(p.holdingMode==='overnight'){
   if(p.overnightConfirmed!==true||!String(p.overnightReason||'').trim()||!(until>entryUntil))errors.push('隔夜须单独说明依据、截止时刻并由本人明确审定');
  }else errors.push('请明确日内离场或单独申请隔夜');
  if(!String(p.reentryRule||'').trim())errors.push('请说明离场后是否允许再次试错；仍累计同一机会风险');
 }
 return errors;
}

function validDay(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
function deriveIntraday(analysis,choice){
 const q=choice.intraday||{},direction=choice.direction,long=direction==='long';
 const algorithm=String(q.algorithm||'').trim(),confirmation=q.confirmation,confirmationRule=String(q.confirmationRule||'').trim();
 if(!algorithm)throw Error('请填写已确认的分时均线算法，不默认采用分钟MA10或当日均价线');
 if(!['cross','second'].includes(confirmation)||confirmation==='second'&&!confirmationRule)throw Error('请明确是否二次确认及具体条件');
 if(!validDay(q.tradingDay))throw Error('请填写分时结构所属交易日，夜盘按交易日核对');
 const referenceAt=String(q.referenceAt||'');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(referenceAt)||!validDay(referenceAt.slice(0,10)))throw Error('请填写当日高低点的取值截止时刻');
 const stamp=Date.parse(referenceAt+(referenceAt.length===16?':00':'')+'+08:00');
 if(!Number.isFinite(stamp)||stamp>Date.parse(analysis.analyzedAt||new Date().toISOString())||referenceAt.slice(0,10)>q.tradingDay)throw Error('高低点须在决策时已知，不能使用未来时刻或盘后回填');
 if(q.environmentConfirmed!==true)throw Error('请核对主线许可和易涨难跌/易跌难涨，不在无方向反复穿线中试做');
 if(q.structureConfirmed!==true)throw Error('请确认日内结构属于本交易日，且在所记截止时刻已经可知');
 const pivot=q.pivot,stop=q.stop;
 if(![pivot,stop].every(n=>finite(n)&&n>0)||!(long?stop<pivot:stop>pivot))throw Error('止损须位于当日有效低点或高点外侧；请本人指定，不自动外加点数');
 if(!(analysis.tickSize>0)||[pivot,stop].some(n=>!new Decimal(n).mod(analysis.tickSize).isZero()))throw Error('日内高低点或止损不符合最小变动价位');
 const intraday={algorithm,confirmation,confirmationRule:confirmation==='second'?confirmationRule:'',tradingDay:q.tradingDay,referenceAt,pivot,environmentConfirmed:true,structureConfirmed:true};
 return {method:'intraday',branch:null,start:choice.start,end:choice.end,direction,pairType:METHODS[4].pair,stop,boundary:null,entry:null,intraday,maxRiskPercent:.5,
  trigger:`盘中实际${long?'上穿做多':'下穿做空'}本人确认的分时均线：${algorithm}；${confirmation==='second'?'二次确认：'+confirmationRule:'按计划穿越确认'}；尚未核验实际触发`,
  stopReference:`${q.tradingDay} 日内有效${long?'低':'高'}点 ${pivot} 外侧；取值截至 ${referenceAt.replace('T',' ')}（北京时间）`,
  invalidation:`防守价 ${stop} 到价失效；不得随新低或新高向外移动；持有、隔夜和复入须单独审定；同一机会累计风险`,status:'等待触发',liveTriggerVerified:false};
}
