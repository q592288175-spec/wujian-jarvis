import {randomUUID} from 'node:crypto';
import {canonical,productCode} from './monitor-engine.mjs';

export const TREND_BIG_PERIODS=['1mo','1w','1d'];
export const TREND_SMALL_PERIODS=['30m','60m','120m'];
export const TREND_PERIOD_LABELS={'1mo':'月K','1w':'周K','1d':'日K','30m':'30分钟','60m':'1小时','120m':'2小时'};
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const isoDay=v=>datePattern.test(v||'')&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:null;
const side=(v,base=1)=>Math.abs(v)<=Math.max(1,Math.abs(base))*1e-12?0:v>0?1:-1;
const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
export const defaultTrendTask=()=>({title:'周日同向 · 30分钟拐头穿线',bigPeriods:['1w','1d'],smallPeriods:['30m'],direction:'both',scope:'all',codes:[],channels:['desktop','weixin'],status:'active'});

export function validateTrendTask(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('监控任务格式无效');
 const choose=(value,allowed,label)=>{
  if(!Array.isArray(value)||!value.length||value.some(p=>!allowed.includes(p)))throw Error('请选择有效的'+label);
  return allowed.filter(p=>value.includes(p));
 };
 const bigPeriods=choose(input.bigPeriods,TREND_BIG_PERIODS,'方向周期（月、周、日）');
 const smallPeriods=choose(input.smallPeriods,TREND_SMALL_PERIODS,'提醒周期（30分钟、1小时、2小时）');
 const direction=input.direction||'both',scope=input.scope||'all',status=input.status||'active';
 if(!['both','long','short'].includes(direction))throw Error('请选择双向、只看多或只看空');
 if(!['all','codes'].includes(scope))throw Error('监控范围无效');
 if(!['active','paused','archived'].includes(status))throw Error('监控任务状态无效');
 if(input.codes!==undefined&&!Array.isArray(input.codes))throw Error('品种列表格式无效');
 const codes=[...new Set((input.codes||[]).map(v=>String(v).trim().toUpperCase()))];
 if(codes.length>200||codes.some(code=>!/^([A-Z]{1,4})$/.test(code))||scope==='codes'&&!codes.length)throw Error('请选择有效的品种代码');
 if(input.channels!==undefined&&!Array.isArray(input.channels))throw Error('提醒通道格式无效');
 const channels=[...new Set(input.channels||['desktop','weixin'])];
 if(!channels.length||channels.some(v=>!['desktop','weixin'].includes(v)))throw Error('请选择桌面或微信提醒');
 return {title:String(input.title||input.name||'周期拐点监控').trim().slice(0,80)||'周期拐点监控',bigPeriods,smallPeriods,direction,scope,codes,channels,status,mode:'intrabar',maLength:10};
}

function stampDate(bar){
 const explicit=bar.date||bar.day||bar.tradingDay;
 if(explicit)return isoDay(explicit);
 const at=Date.parse(bar.stamp);return Number.isFinite(at)?new Date(at+28800000).toISOString().slice(0,10):null;
}
function orderedBars(rows){
 if(!Array.isArray(rows)||rows.length<11)return {error:'不足11根有效K线'};
 let previous=-Infinity;const output=[];
 for(const bar of rows){
  const at=Date.parse(bar?.stamp);
  if(!Number.isFinite(at)||at<=previous||!finite(bar.close)||bar.close<=0||typeof bar.complete!=='boolean')return{error:'K线时间、收盘价或完成标记无效'};
  previous=at;output.push({...bar,at});
 }
 if(output.at(-1).complete!==false||output.slice(0,-1).some(b=>!b.complete))return{error:'未取得连续完成K线及当前未完成K线'};
 return{rows:output};
}

export function aggregateTrendDaily(rows,period,tradingDay){
 const parsed=orderedBars(rows);if(parsed.error)return parsed;
 const groups=new Map();let priorDay='';
 for(const bar of parsed.rows){
  const day=stampDate(bar);
  if(!day||day<=priorDay||day>tradingDay)return{error:'日K交易日期无效或包含未来数据'};
  priorDay=day;
  let key=day;
  if(period==='1mo')key=day.slice(0,7);
  if(period==='1w'){
   const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);key=d.toISOString().slice(0,10);
  }
  const existing=groups.get(key);
  if(existing){existing.close=bar.close;existing.complete=existing.complete&&bar.complete;existing.date=day;}
  else groups.set(key,{stamp:bar.stamp,date:day,close:bar.close,complete:bar.complete});
 }
 if(priorDay!==tradingDay)return{error:'日K尚未覆盖报价所属交易日'};
 const aggregated=[...groups.values()];
 // The leading month/week may begin mid-period. Discard it conservatively.
 if(period!=='1d')aggregated.shift();
 return orderedBars(aggregated);
}

export function intrabarMaSignal(rows,last,quoteAt){
 const parsed=orderedBars(rows);if(parsed.error)return{status:'missing',reason:parsed.error};
 const current=parsed.rows.at(-1),quoteTime=Date.parse(quoteAt),lastCompleted=parsed.rows.at(-2);
 if(!Number.isFinite(quoteTime)||lastCompleted.at>quoteTime)return{status:'missing',reason:'已完成K线时间晚于报价'};
 if(current.stampKind==='end'){
  const end=Date.parse(current.endStamp||current.stamp);
  if(!Number.isFinite(end)||end<=quoteTime)return{status:'missing',reason:'分钟K线结束时间未覆盖当前报价，等待更新'};
 }else{
  if(current.at>quoteTime)return{status:'missing',reason:'当前K线开始时间晚于报价'};
  if(current.endStamp&&(!Number.isFinite(Date.parse(current.endStamp))||quoteTime>=Date.parse(current.endStamp)))return{status:'missing',reason:'分钟K线已结束但新K线未取得，等待更新'};
 }
 const completed=parsed.rows.slice(0,-1),tail=completed.slice(-10);
 const previousMa=mean(tail.map(b=>b.close)),ma=mean([...tail.slice(-9).map(b=>b.close),last]);
 const slope=ma-previousMa;
 return{status:'ok',ma,previousMa,slope,direction:side(slope,previousMa),relation:side(last-ma,ma),stamp:current.stamp,stampKind:current.stampKind||'start',endStamp:current.endStamp||null,completedAt:completed.at(-1).stamp,unclosed:true,closes:tail.map(b=>({stamp:b.stamp,close:b.close}))};
}

export function trendEnvironment(task,frame){
 const q=frame.quote||{},signals={};
 for(const period of task.bigPeriods){
  let rows=frame.bars?.[period];
  if(!rows&&['1mo','1w'].includes(period)){
   const result=aggregateTrendDaily(frame.bars?.['1d'],period,q.tradingDay);
   if(result.error)return{status:'missing',reason:TREND_PERIOD_LABELS[period]+'：'+result.error,signals};
   rows=result.rows;
  }
  if(period==='1d'){
   const result=aggregateTrendDaily(rows,period,q.tradingDay);
   if(result.error)return{status:'missing',reason:'日K：'+result.error,signals};
   rows=result.rows;
  }
  const signal=intrabarMaSignal(rows,q.last,q.quoteAt);signals[period]=signal;
  if(signal.status!=='ok')return{status:'missing',reason:TREND_PERIOD_LABELS[period]+'：'+signal.reason,signals};
 }
 const directions=Object.values(signals).map(s=>s.direction),direction=directions.every(v=>v===1)?1:directions.every(v=>v===-1)?-1:0;
 if(!direction)return{status:'opposed',direction:0,reason:'所选大周期MA10未全部同向',signals};
 if(task.direction==='long'&&direction!==1||task.direction==='short'&&direction!==-1)return{status:'opposed',direction,reason:'大周期方向与任务要求不一致',signals};
 return{status:'ok',direction,signals,reason:'所选大周期MA10'+(direction===1?'同向向上':'同向向下')};
}

/** Evaluate observed transitions only. Reconnecting at a fulfilled state never creates a crossing. */
export function evaluateTrend({task,frame,period,state={},now=Date.now(),generation=0}){
 const q=frame.quote||{},symbol=canonical(frame.symbol),at=Date.parse(q.quoteAt),receivedAt=Date.parse(q.receivedAt||q.quoteAt);
 const observation={taskId:task.id,taskTitle:task.title,symbol,code:frame.code||productCode(symbol),name:frame.name||frame.code||symbol,period,lastObserved:q.quoteAt||null,price:q.last??null};
 const reject=(reason,status='waiting-data',reset=true)=>({observation:{...observation,status,reason},state:reset?{...state,needsBaseline:true,armed:false}:state,event:null});
 if(!/^\w+\.[A-Z]+\d{3,4}$/.test(symbol)||!finite(q.last)||q.last<=0||!Number.isFinite(at)||at>now+1000||now-at>30000||!Number.isFinite(receivedAt)||receivedAt>now+1000||now-receivedAt>30000)return reject('报价陈旧、时间或具体合约无效，暂停判断');
 if(q.sessionActive!==true||!q.sessionKey||!isoDay(q.tradingDay))return reject('当前休市或交易时段未核验，暂停判断');
 if(!Number.isSafeInteger(q.sequence)||q.sequence<0)return reject('报价序号未核验，暂停判断');
 if(state.version===task.version&&state.generation===generation&&state.symbol===symbol&&state.at!==undefined&&(at<state.at||at===state.at&&q.sequence<=state.sequence))return reject('重复或乱序报价已忽略','ignored',false);
 const environment=trendEnvironment(task,frame),small=intrabarMaSignal(frame.bars?.[period],q.last,q.quoteAt);
 if(small.status!=='ok')return reject(TREND_PERIOD_LABELS[period]+'：'+small.reason);
 observation.smallSignal=small;observation.bigSignals=environment.signals;observation.direction=environment.direction===1?'long':environment.direction===-1?'short':null;
 const base={...state,version:task.version,generation,symbol,source:frame.source||q.source||'来源未核验',sessionKey:q.sessionKey,at,receivedAt:now,sequence:q.sequence,smallDirection:small.direction,relation:small.relation,ma:small.ma,quoteAt:q.quoteAt,lastPrice:q.last,needsBaseline:false};
 if(environment.status!=='ok')return{observation:{...observation,status:environment.status==='missing'?'waiting-data':'waiting-direction',reason:environment.reason},state:{...base,needsBaseline:true,armed:false,turnId:null},event:null};
 const continuous=!state.needsBaseline&&state.version===task.version&&state.generation===generation&&state.symbol===symbol&&state.source===base.source&&state.sessionKey===q.sessionKey&&at>=(state.at||0)&&at-(state.at||0)<=30000&&now-(state.receivedAt||0)<=30000;
 if(!continuous)return{observation:{...observation,status:'baseline',reason:'已建立盘中基线，等待新拐头与穿越；不补报既有信号'},state:{...base,armed:false,turnId:null,triggered:false},event:null};
 const dir=environment.direction,turned=small.direction===dir&&state.smallDirection!==dir;
 let armed=state.armed===true,turnId=state.turnId||null,triggered=state.triggered===true;
 if(small.direction!==dir){armed=false;turnId=null;triggered=false;}
 if(turned){armed=true;turnId=small.stamp+':'+q.quoteAt+':'+q.sequence;triggered=false;}
 const next={...base,armed,turnId,triggered};
 const crossed=dir===1?state.relation<=0&&small.relation>0:state.relation>=0&&small.relation<0;
 if(!armed||small.direction!==dir)return{observation:{...observation,status:'waiting-turn',reason:'大周期同向，等待'+TREND_PERIOD_LABELS[period]+'MA10新拐头'},state:next,event:null};
 if(!crossed)return{observation:{...observation,status:triggered?'triggered':'waiting-cross',reason:triggered?'本轮已提醒，等待新的反向后再拐头':'MA10已顺大周期拐头，等待价格'+(dir===1?'上穿':'下穿')+'MA10'},state:next,event:null};
 if(triggered)return{observation:{...observation,status:'triggered',reason:'本轮已提醒，同一拐点不重复推送'},state:next,event:null};
 const bigText=task.bigPeriods.map(p=>TREND_PERIOD_LABELS[p]).join('、'),verb=dir===1?'上穿':'下穿';
 const event={id:randomUUID(),ruleId:'trend:'+task.id,ruleVersion:task.version,kind:'ma-turn',taskId:task.id,symbol,name:observation.name,code:observation.code,direction:dir===1?'up':'down',period,condition:bigText+'MA10'+(dir===1?'向上':'向下')+'；'+TREND_PERIOD_LABELS[period]+'MA10拐头且价格'+verb+'MA10',price:q.last,value:q.last,ma:small.ma,quoteAt:q.quoteAt,source:base.source,receivedAt:q.receivedAt||new Date(now).toISOString(),triggeredAt:new Date(now).toISOString(),label:TREND_PERIOD_LABELS[period]+'拐头'+verb+' · 盘中未收线',channels:[...task.channels],evidence:{mode:'intrabar',unclosed:true,maLength:10,tradingDay:q.tradingDay,sessionKey:q.sessionKey,turnId,period,bigSignals:environment.signals,smallSignal:small,previous:{quoteAt:state.quoteAt,price:state.lastPrice,ma:state.ma,direction:state.smallDirection,relation:state.relation},notice:'盘中即时观察，当前K线未收线；行情变化可能使信号失效。仅供人工判断。'}};
 return{observation:{...observation,status:'triggered',reason:'已观测新拐头与价格'+verb+'，本轮提醒一次'},state:{...next,armed:true,triggered:true,lastTriggered:now},event,uniqueKey:['trend',task.id,task.version,symbol,period,turnId].join('|')};
}
