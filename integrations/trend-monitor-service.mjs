import {randomUUID} from 'node:crypto';
import {canonical,productCode} from './monitor-engine.mjs';
import {validateTrendTask,defaultTrendTask,evaluateTrend,TREND_PERIOD_LABELS} from './trend-monitor-engine.mjs';

const TASK_KEY='trend-monitor:tasks',INIT_KEY='trend-monitor:initialized';
export class TrendMonitorService{
 constructor({store,now=Date.now,onEvent=()=>{},onSubscriptions=()=>{},getCatalog=async()=>[]}={}){
  if(!store)throw Error('监控任务存储未连接');
  Object.assign(this,{store,now,onEvent,onSubscriptions,getCatalog});this.generation=randomUUID();this.observations=new Map();this.catalogItems=[];this.lastFrameAt=null;this.running=false;this.catalogError=null;
 }
 tasks(){return this.store.meta(TASK_KEY,[]).map(task=>({...task,bigLabels:task.bigPeriods.map(p=>TREND_PERIOD_LABELS[p]),smallLabels:task.smallPeriods.map(p=>TREND_PERIOD_LABELS[p])}));}
 ensureDefaultTask(){
  if(this.store.meta(INIT_KEY,false))return;
  this.store.setMeta(INIT_KEY,true);
  if(!this.tasks().length)this.save(defaultTrendTask());
 }
 save(input,id=null){
  const payload=validateTrendTask(input),tasks=this.store.meta(TASK_KEY,[]),existing=id?tasks.find(t=>t.id===id):null;
  if(id&&!existing)throw Error('监控任务不存在');
  const at=new Date(this.now()).toISOString(),task={...payload,id:id||randomUUID(),version:(existing?.version||0)+1,createdAt:existing?.createdAt||at,updatedAt:at};
  this.store.setMeta(TASK_KEY,[task,...tasks.filter(t=>t.id!==task.id)]);
  this.store.setMeta('trend-monitor:versions:'+task.id,[...this.store.meta('trend-monitor:versions:'+task.id,[]),task]);
  this.clearObservations(task.id);this.notifySubscriptions();return task;
 }
 setStatus(id,status){
  if(!['active','paused','archived'].includes(status))throw Error('监控任务状态无效');
  const tasks=this.store.meta(TASK_KEY,[]),task=tasks.find(t=>t.id===id);if(!task)throw Error('监控任务不存在');
  if(task.status===status)return task;
  task.status=status;task.updatedAt=new Date(this.now()).toISOString();task.activation=(task.activation||0)+1;
  this.store.setMeta(TASK_KEY,tasks);this.clearObservations(id);this.generation=randomUUID();this.notifySubscriptions();return task;
 }
 clearObservations(taskId){for(const [key,row]of this.observations)if(row.taskId===taskId)this.observations.delete(key);}
 async refreshCatalog(){
  try{const items=await this.getCatalog();if(!Array.isArray(items))throw Error('品种目录格式无效');
   const byCode=new Map();for(const item of items){const code=String(item.code||productCode(item.symbol||item.contract||'')).toUpperCase(),symbol=canonical(item.symbol||(item.exchange&&item.contract?item.exchange+'.'+item.contract:''));if(code&&/^\w+\.[A-Z]+\d{3,4}$/.test(symbol))byCode.set(code,{...item,code,symbol});}
   this.catalogItems=[...byCode.values()];this.catalogError=null;
   for(const [key,row]of this.observations){const current=byCode.get(row.code);if(!current||current.symbol!==row.symbol)this.observations.delete(key);}
   this.notifySubscriptions();
  }catch{this.catalogError='全品种具体主力目录未取得，等待重新核验';}
  return this.catalogItems;
 }
 subscriptions(){
  const active=this.tasks().filter(t=>t.status==='active'),codes=new Set(active.flatMap(t=>t.codes)),all=active.some(t=>t.scope==='all');
  return{symbols:this.catalogItems.filter(p=>all||codes.has(p.code)).map(p=>p.symbol),periods:[...new Set(active.flatMap(t=>t.smallPeriods))],needsDaily:active.length>0,enabled:active.length>0};
 }
 notifySubscriptions(){
  const value=this.subscriptions();
  try{const result=this.onSubscriptions(value);if(result?.then)result.then(()=>{this.subscriptionError=null}).catch(()=>{this.subscriptionError='行情订阅未成功，等待重试';});else this.subscriptionError=null;}
  catch{this.subscriptionError='行情订阅未成功，等待重试';}
  return value;
 }
 ingest(frame){
  const events=[],tasks=this.tasks().filter(task=>task.status==='active'),symbol=canonical(frame?.symbol),code=String(frame?.code||productCode(symbol)).toUpperCase();
  if(!this.running)return{accepted:false,reason:'全品种监控服务已暂停',events};
  const member=this.catalogItems.find(item=>item.code===code);
  if(!member||member.symbol!==symbol)return{accepted:false,reason:'具体主力目录未核验或已换月，旧合约不参与新信号',events};
  this.lastFrameAt=new Date(this.now()).toISOString();
  for(const task of tasks){if(task.scope==='codes'&&!task.codes.includes(code))continue;
   for(const period of task.smallPeriods){
    const key=task.id+':'+symbol+':'+period,stateKey=symbol+':'+period,state=this.store.ruleState('trend:'+task.id,stateKey);
    const result=evaluateTrend({task,frame:{...frame,code,name:frame.name||member.name},period,state,now:this.now(),generation:this.generation});
    if(result.event){
     // A signal, its observation state and delivery rows commit in the same store transaction.
     const inserted=this.store.recordEvent(result.event,{symbol:stateKey,lastTriggered:this.now(),met:true,uniqueKey:result.uniqueKey,state:result.state});
     if(inserted){events.push(result.event);try{this.onEvent(result.event)}catch{}}
    }else this.store.saveState('trend:'+task.id,stateKey,result.state);
    if(result.observation.status!=='ignored')this.observations.set(key,result.observation);
   }
  }
  return{accepted:true,events};
 }
 reset(reason='行情重连，重新建立基线'){
  this.generation=randomUUID();for(const [key,row]of this.observations)this.observations.set(key,{...row,status:'waiting-data',reason});
  this.lastReset={at:new Date(this.now()).toISOString(),reason};
 }
 status(){
  const tasks=this.tasks(),active=tasks.filter(t=>t.status==='active'),observations=[...this.observations.values()];
  const stale=row=>!Number.isFinite(Date.parse(row.lastObserved))||this.now()-Date.parse(row.lastObserved)>30000;
  return{running:this.running,tasks,observations:observations.map(row=>stale(row)?{...row,status:'waiting-data',reason:'该品种超过30秒没有新行情，暂停信号判断'}:row),coverage:{catalog:this.catalogItems.length,subscribed:this.subscriptions().symbols.length,observed:new Set(observations.map(r=>r.code)).size,activeTasks:active.length},market:{lastFrameAt:this.lastFrameAt,catalogError:this.catalogError,subscriptionError:this.subscriptionError||null,lastReset:this.lastReset||null},events:this.store.events({limit:300}).filter(e=>e.kind==='ma-turn'),notice:'大周期MA10判断方向，小周期MA10新拐头并发生价格穿越才提醒。当前K线未收线；启动、重连、休市恢复不补报既有信号。电脑休眠、关机或退出服务期间无法监控。'};
 }
 async start(){if(this.running)return;this.running=true;this.ensureDefaultTask();await this.refreshCatalog();this.timer=setInterval(()=>void this.refreshCatalog(),60000);this.timer.unref();}
 stop(){this.running=false;clearInterval(this.timer);this.reset('监控服务已停止');try{this.onSubscriptions({symbols:[],periods:[],needsDaily:false,enabled:false})}catch{}}
}
export const createTrendMonitorService=options=>new TrendMonitorService(options);
