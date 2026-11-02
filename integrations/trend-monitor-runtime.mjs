import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createTrendMonitorService} from './trend-monitor-service.mjs';
import {TrendMarketFeed} from './trend-market.mjs';
import {createWeixinChannel} from './weixin-channel.mjs';
import {monitorMessage} from './monitor-service.mjs';
import {canonical} from './monitor-engine.mjs';
import {buildTrendTable} from './trend-monitor-table.mjs';
import {sortPanoramaProducts} from '../dist/market-panorama-display.js';

export function createTrendRuntime({root=resolve('.'),monitor,panorama,now=Date.now,fetchImpl=fetch}={}){
 const home=process.env.WUJIAN_TREND_HOME||(process.env.WUJIAN_MONITOR_HOME?resolve(process.env.WUJIAN_MONITOR_HOME,'trend-runtime'):root),listeners=new Set();let service,feed,started=false,deliveryBusy=false,timer=null,allCatalog=[];
 const emit=(type,value={})=>{for(const listener of listeners)try{listener(type,value)}catch{}};
 const weixin=createWeixinChannel({root:home,fetchImpl,now,onChange:()=>emit('change')});
 const catalog=async()=>{
  const snap=await panorama.snapshot();
  allCatalog=(snap.products||[]).map(p=>({...p,symbol:p.contract&&p.exchange?canonical(p.exchange+'.'+p.contract):null,mainSource:'小木已记录具体主力',mappingDate:p.contractDate||p.fireDate||null}));return allCatalog;
 };
 service=createTrendMonitorService({store:monitor.store,now,getCatalog:catalog,onEvent:event=>{monitor.emit('trigger',event);emit('trigger',event);void deliver()},onSubscriptions:async value=>{if(feed)await feed.configure(value);emit('change')}});
 feed=new TrendMarketFeed({root:home,monitor,fetchImpl,now,onFrame:frame=>service.ingest(frame)});
 const observe=(type,value)=>{
  if(type==='quote'){const quote=monitor.quotes.get(canonical(value.symbol));if(quote)feed.ingestQuote(quote)}
  if(type==='trend-bars')feed.acceptTqBars(value);
  if(type==='trend-status')feed.errors.set(value.symbol+'|'+value.period,{symbol:value.symbol,period:value.period,reason:value.message||value.reason||'行情周期数据尚未取得'});
  if(type==='reset')service.reset(value?.reason||'行情连接重建，重新建立基线');
 };
 async function deliver(){
  if(deliveryBusy||!weixin.status().pushReady)return;deliveryBusy=true;
  try{for(const item of monitor.store.pending('weixin',now())){
   if(now()-Date.parse(item.event.triggeredAt)>5*60000){monitor.store.delivery(item.event_id,'weixin','skipped','已超过及时提醒时效，请在小木查看历史事件');continue;}
   monitor.store.delivery(item.event_id,'weixin','sending');
   try{await weixin.sendMessage(monitorMessage(item.event),{id:item.event_id});monitor.store.delivery(item.event_id,'weixin','accepted','微信接口已接受；尚未确认本人收到');}
   catch(e){monitor.store.delivery(item.event_id,'weixin',e.deliveryStatus==='unknown'?'unknown':'failed',e.message||'微信发送未确认',Number.MAX_SAFE_INTEGER)}
   emit('change');
  }}finally{deliveryBusy=false}
 }
 function status(){
  const data=service.status(),source=feed.status(),raw=monitor.market||{},quotes=[...monitor.quotes.values()].filter(q=>feed.members.has(canonical(q.symbol))),fresh=quotes.filter(q=>q.sessionActive&&now()-Date.parse(q.quoteAt)>=0&&now()-Date.parse(q.quoteAt)<=30000),heartbeatFresh=!!raw.heartbeatAt&&now()-Date.parse(raw.heartbeatAt)<=15000;
  const market={...data.market,...raw,provider:monitor.provider,source:source.source,heartbeatFresh,lastQuoteAt:quotes.map(q=>q.quoteAt).sort().at(-1)||null,freshQuoteCount:fresh.length,pollIntervalMs:source.pollIntervalMs,loading:source.loading,status:raw.status==='connected'&&heartbeatFresh?(fresh.length?'connected':'waiting'):raw.status,message:raw.status==='connected'&&heartbeatFresh&&!fresh.length?'行情已连接，当前无新鲜交易时段报价，等待开市或数据更新':raw.message||'行情尚未连接'};
  const observations=[...data.observations],known=new Set(observations.map(o=>o.taskId+'|'+o.code+'|'+o.period));
  for(const task of data.tasks.filter(t=>t.status==='active'))for(const p of allCatalog.filter(p=>task.scope==='all'||task.codes.includes(p.code)))for(const period of task.smallPeriods){
   if(known.has(task.id+'|'+p.code+'|'+period))continue;
   const error=source.errors.find(e=>e.symbol===p.symbol&&(e.period===period||e.period==='1d'||!e.period));
   observations.push({taskId:task.id,taskTitle:task.title,code:p.code,name:p.name,symbol:p.symbol,period,status:'waiting-data',reason:!p.symbol?'具体主力合约未核验，暂不计算':error?.reason||(monitor.provider==='tqsdk'&&!monitor.credentials?'请在行情连接中登录快期/天勤，或使用公开行情':'等待当前合约报价和完整K线'),mappingDate:p.mappingDate});
  }
  return {...data,rows:buildTrendTable(sortPanoramaProducts(allCatalog),feed,data.events,now()),observations,coverage:{...data.coverage,catalog:allCatalog.length,loadedKlineSeries:source.loaded,loadingKlineSeries:source.loading,freshQuotes:fresh.length},market,weixin:weixin.status(),sources:source,notice:data.notice+' '+(monitor.provider==='sina'?'公开报价约每10秒检查，K线缺失或延迟时暂停该品种判断；不承诺逐笔即时。':'按天勤行情权限和实际更新时间判断。')+' 具体主力沿用小木现有映射，映射日期在品种目录中保留。'};
 }
 async function save(input,id){
  if(input.scope==='codes'){await service.refreshCatalog();const known=new Set(allCatalog.map(p=>p.code));if((input.codes||[]).some(c=>!known.has(String(c).toUpperCase())))throw Error('选择的品种不在已核验目录中');}
  const task=service.save(input,id);emit('change');return task;
 }
 function setStatus(id,action){const task=service.setStatus(id,action);emit('change');return task;}
 async function testWeixin(){
  if(!weixin.status().pushReady)throw Error('请先扫码绑定微信，并向机器人发送一条消息');
  const event={id:randomUUID(),kind:'test',name:'微信提醒测试',label:'微信提醒测试',condition:'本人点击测试，验证通知通道；这不是交易信号',source:'小木本机',triggeredAt:new Date(now()).toISOString(),channels:['weixin'],evidence:{test:true}};
  monitor.store.recordEvent(event);await deliver();const result=monitor.store.event(event.id);return{event:result,message:'测试已记录，请核对微信回执及手机实际接收情况'};
 }
 async function start(){if(started)return;started=true;monitor.listeners.add(observe);await weixin.init();weixin.start();await service.start();timer=setInterval(()=>void deliver(),3000);timer.unref()}
 function stop(){started=false;clearInterval(timer);monitor.listeners.delete(observe);service.stop();feed.stop();weixin.stop()}
 return{start,stop,status,save,setStatus,listeners,weixin,service,feed,deliver,testWeixin,catalog:async()=>{await service.refreshCatalog();return allCatalog}};
}
