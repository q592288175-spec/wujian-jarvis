import {randomUUID} from 'node:crypto';

export const WINDOWS=[1,3,5,15];
export const EXCHANGES=['SHFE','INE','DCE','CZCE','GFEX','CFFEX'];
export const canonical=value=>String(value||'').trim().toUpperCase().replace(/^(CZCE\.[A-Z]+)\d(\d{3})$/,'$1$2');
export const productCode=value=>canonical(value).split('.').pop().replace(/\d+$/,'');
const finite=value=>typeof value==='number'&&Number.isFinite(value);

export function validateRule(input,catalog,now=Date.now()){
 if(!input||typeof input!=='object'||!Array.isArray(input.symbols)||input.channels!==undefined&&!Array.isArray(input.channels))throw Error('提醒条件格式无效');
 if(!['price','movement','announcement'].includes(input.kind))throw Error('请选择到价、短时异动或交易所公告');
 const symbols=[...new Set((input.symbols||[]).map(canonical))];
 if(!symbols.length||symbols.length>200)throw Error('请选择1至200个具体合约');
 const members=symbols.map(symbol=>{
  const item=catalog.find(row=>canonical(row.symbol)===symbol);
  if(!item||!EXCHANGES.includes(item.exchange)||!/^\w+\.[A-Z]+\d{3,4}$/.test(symbol))throw Error('合约未核验，请从合约列表选择');
  if(item.expiresAt&&Date.parse(item.expiresAt)<=now)throw Error('行情源标明合约已失效，请选择有效合约');
  return {symbol,name:item.name,announcementNames:[...new Set([item.officialName,item.name,...(item.aliases||[])].filter(Boolean))],code:item.code||productCode(symbol),exchange:item.exchange,tickSize:item.tickSize||null,expiresAt:item.expiresAt||null};
 });
 if(input.kind==='price'&&members.length!==1)throw Error('到价提醒需要绑定一个具体合约');
 const direction=input.direction||'up',threshold=Number(input.threshold);
 if(input.kind!=='announcement'&&(!['up','down'].includes(direction)||!finite(threshold)||threshold<=0))throw Error('方向和正数阈值必须填写');
 if(input.kind==='price'&&members[0].tickSize&&Math.abs(threshold/members[0].tickSize-Math.round(threshold/members[0].tickSize))>1e-7)throw Error('目标价格必须符合合约最小变动价位：'+members[0].tickSize);
 const windowMinutes=Number(input.windowMinutes||5),cooldownMinutes=Number(input.cooldownMinutes??15);
 if(input.kind==='movement'&&!WINDOWS.includes(windowMinutes))throw Error('异动窗口支持1、3、5或15分钟');
 if(!Number.isInteger(cooldownMinutes)||cooldownMinutes<1||cooldownMinutes>1440)throw Error('冷却时间需为1至1440分钟');
 const expiresAt=input.expiresAt||null;
 if(expiresAt&&(!finite(Date.parse(expiresAt))||Date.parse(expiresAt)<=now))throw Error('有效期必须晚于当前时间');
 const channels=[...new Set(input.channels||['desktop','feishu'])];
 if(channels.some(channel=>!['desktop','feishu'].includes(channel)))throw Error('通知通道无效');
 const categories=input.categories||['margin','limit','fee','delivery','session'];
 if(!Array.isArray(categories)||!categories.length||categories.some(category=>!['margin','limit','fee','delivery','session'].includes(category)))throw Error('公告类别无效');
 return {kind:input.kind,members,direction:input.kind==='announcement'?null:direction,threshold:input.kind==='announcement'?null:threshold,windowMinutes,cooldownMinutes,repeat:input.kind==='announcement'||input.kind==='movement'||input.repeat===true,expiresAt,channels,categories,title:String(input.title||'').trim().slice(0,100),session:'day-night'};
}

export function conditionText(rule){
 if(rule.kind==='announcement')return '保证金 / 涨跌停板 / 手续费 / 交割 / 交易时间公告';
 const direction=rule.direction==='up'?'≥':'≤';
 return rule.kind==='price'?`最新成交价 ${direction} ${rule.threshold}`:`${rule.windowMinutes}分钟${rule.direction==='up'?'上涨':'下跌'} ≥ ${rule.threshold}%`;
}

// Only contiguous observed quotes can establish a crossing or a movement window.
export class MonitorEngine{
 constructor({store,now=Date.now,onEvent=()=>{}}){this.store=store;this.now=now;this.onEvent=onEvent;this.samples=new Map();this.latest=new Map();this.generation=0;}
 reset(){this.samples.clear();this.latest.clear();this.generation++;for(const rule of this.store.rules())for(const member of rule.members){const state=this.store.ruleState(rule.id,member.symbol);this.store.saveState(rule.id,member.symbol,{...state,windowReady:false,needsBaseline:true});}}
 ingest(quote){
  const now=this.now(),symbol=canonical(quote.symbol),at=Date.parse(quote.quoteAt);
  if(!finite(quote.last)||quote.last<=0||!finite(at)||at>now+1000||now-at>30000||quote.sessionActive!==true||!quote.sessionKey||!quote.tradingDay)return {accepted:false,reason:'数据陈旧、价格无效或交易时段未核验'};
  const previous=this.latest.get(symbol);
  if(!Number.isSafeInteger(quote.sequence)||quote.sequence<0)return {accepted:false,reason:'报价序号无效'};
  if(previous&&(at<previous.at||(at===previous.at&&quote.sequence<=previous.sequence)))return {accepted:false,reason:'重复或乱序报价'};
  const contiguous=previous&&previous.sessionKey===quote.sessionKey&&previous.generation===this.generation&&now-previous.receivedAt<=15000&&at-previous.at<=15000;
  if(!contiguous)this.samples.set(symbol,[]);
  const point={at,price:quote.last,receivedAt:now,sessionKey:quote.sessionKey,sequence:quote.sequence,generation:this.generation};
  this.latest.set(symbol,point);
  const history=this.samples.get(symbol)||[];
  history.push(point);while(history.length&&history[0].at<at-16*60000)history.shift();this.samples.set(symbol,history);
  const events=[];
  for(const rule of this.store.rules().filter(item=>item.status==='active'&&item.kind!=='announcement'&&item.members.some(member=>member.symbol===symbol))){
   const member=rule.members.find(item=>item.symbol===symbol);
   if(rule.expiresAt&&Date.parse(rule.expiresAt)<=now){this.store.setStatus(rule.id,'expired');continue;}
   const state=this.store.ruleState(rule.id,symbol);
   if(state.expired)continue;
   if(member.expiresAt&&Date.parse(member.expiresAt)<=now){this.store.saveState(rule.id,symbol,{...state,expired:true});if(rule.members.every(item=>this.store.ruleState(rule.id,item.symbol).expired))this.store.setStatus(rule.id,'expired');continue;}
   let value=quote.last,baseline=null;
   if(rule.kind==='movement'){
    const target=at-rule.windowMinutes*60000;
    baseline=history.findLast(sample=>sample.at<=target);
    if(!baseline||target-baseline.at>10000||baseline.receivedAt<(state.activationAt||0))continue;
    value=(quote.last/baseline.price-1)*100;
   }
   const met=rule.kind==='price'?(rule.direction==='up'?value>=rule.threshold:value<=rule.threshold):(rule.direction==='up'?value>=rule.threshold:value<=-rule.threshold);
   const needsBaseline=state.needsBaseline||!contiguous;
   const armed=rule.kind==='price'&&needsBaseline?true:state.armed??!state.met;
   this.store.saveState(rule.id,symbol,{...state,met,armed:!met?true:armed,needsBaseline:false,windowReady:true,lastObserved:quote.quoteAt});
   if(!met||!armed||state.lastTriggered&&now-state.lastTriggered<rule.cooldownMinutes*60000)continue;
   const observedCross=rule.kind==='price'&&!needsBaseline&&previous&&(rule.direction==='up'?previous.price<rule.threshold:previous.price>rule.threshold);
   const event={id:randomUUID(),ruleId:rule.id,ruleVersion:rule.version,kind:rule.kind,symbol,name:member.name,direction:rule.direction,condition:conditionText(rule),value,price:quote.last,quoteAt:quote.quoteAt,source:quote.source||'TqSdk',receivedAt:new Date(now).toISOString(),triggeredAt:new Date(now).toISOString(),label:rule.kind==='movement'?'短时异动':observedCross?'连续观测到价格穿越':'当前已达到目标价',evidence:{threshold:rule.threshold,previous:contiguous?previous:null,baseline,sessionKey:quote.sessionKey,tradingDay:quote.tradingDay,providerTime:quote.quoteAt,receivedAt:quote.receivedAt||new Date(now).toISOString()},channels:rule.channels};
   this.store.recordEvent(event,{symbol,lastTriggered:now,met:true,complete:!rule.repeat});events.push(event);this.onEvent(event);
  }
  return {accepted:true,events};
 }
}
