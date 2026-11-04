import {hasLiquidity} from '../dist/liquidity.js';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {MonitorStore} from './monitor-store.mjs';
import {MonitorEngine,validateRule,conditionText,canonical,productCode} from './monitor-engine.mjs';
import {AnnouncementWatcher,ANNOUNCEMENT_SOURCES} from './monitor-announcements.mjs';
import {latestFire} from './five-workbench.mjs';
import {contractSpec} from './contract-specs.mjs';
import {feishuStatus,pushMonitorMessage} from './feishu.mjs';
import {SinaMonitorFeed} from './monitor-sina.mjs';
import {validateTqCredentials} from './tq-login.mjs';

export function monitorMessage(event){
 const at=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date(event.triggeredAt));
 if(event.kind==='ma-turn'){const period=({'30m':'30分钟','60m':'1小时','120m':'2小时'})[event.period||event.evidence?.period]||event.period||'小周期';return `小木 · ${event.label}\n${event.name} ${event.symbol||''}\n方向：${event.direction==='up'?'多头':'空头'} · 周期：${period}\n条件：${event.condition}\n最新成交价：${event.price} · ${event.evidence?.indicator?.type==='EMA'?'EMA10':'MA10'}：${event.ma??event.evidence?.smallSignal?.ma??'待核验'}\n盘中未收线：本次为即时观察，当前K线变化可使信号失效\n行情时间：${event.quoteAt}\n来源：${event.source}\n触发：${at}`;}
 if(event.kind==='announcement')return `小木 · ${event.label}\n${event.name}\n${event.evidence.title}\n发布：${event.evidence.published||'时间未核验'}\n发现：${at}\n${event.evidence.notice}\n${event.evidence.url}`;
 return `小木 · ${event.label}\n${event.name} ${event.symbol||''}\n条件：${event.condition}\n${event.price!==undefined?'最新成交价：'+event.price+'\n':''}${event.kind==='movement'?'窗口涨跌：'+event.value.toFixed(3)+'%\n':''}行情时间：${event.quoteAt||'通知测试'}\n来源：${event.source}\n触发：${at}`;
}

export function parseMonitorRequest(text,catalog,watchlist=[]){
 const request=String(text||'').trim();
 if(!request||request.length>1000)throw Error('请用1000字以内说明提醒条件');
 const kind=/公告|保证金|手续费|交割|涨跌停板|休市|夜盘安排/.test(request)?'announcement':/分钟|急涨|急跌|涨幅|跌幅|速度/.test(request)?'movement':'price';
 const all=/全市场|所有品种|全部品种/.test(request),watched=/关注列表|关注品种/.test(request);
 let members=all?catalog:watched?catalog.filter(item=>watchlist.includes(item.symbol)):catalog.filter(item=>[item.name,...(item.aliases||[])].some(alias=>alias&&request.toUpperCase().includes(alias.toUpperCase()))||new RegExp('(^|[^A-Z0-9])'+item.code+'([^A-Z0-9]|$)').test(request.toUpperCase()));
 const explicit=request.toUpperCase().match(/(?:SHFE|INE|DCE|CZCE|GFEX|CFFEX)\.[A-Z]+\d{3,4}|[A-Z]{1,3}\d{3,4}/g)||[];
 if(explicit.length)members=catalog.filter(item=>explicit.some(symbol=>canonical(symbol.includes('.')?symbol:item.exchange+'.'+symbol)===item.symbol));
 if(!all&&!watched&&members.length>1){const longest=Math.max(...members.map(item=>item.name.length));members=members.filter(item=>request.includes(item.name)&&item.name.length===longest);}
 const minute=request.match(/(1|3|5|15|一|三|五|十五)\s*分钟/),minuteMap={'一':1,'三':3,'五':5,'十五':15};
 const windowMinutes=minute?minuteMap[minute[1]]||Number(minute[1]):null;
 const direction=/下跌|跌到|跌破|跌至|跌幅|急跌|低于|以下/.test(request)?'down':/上涨|涨到|涨破|涨至|涨幅|急涨|高于|以上|突破/.test(request)?'up':null;
 const stripped=explicit.reduce((value,symbol)=>value.replaceAll(symbol,''),request.toUpperCase()).replace(/\d+\s*分钟/g,'');
 const percent=stripped.match(/(\d+(?:\.\d+)?)\s*[%％]/);
 const price=stripped.match(/(?:到|破|至|于|格|价|超过)\s*(\d+(?:\.\d+)?)\s*(万|千)?/);
 const threshold=kind==='movement'?percent?Number(percent[1]):null:price?Number(price[1])*(price[2]==='万'?10000:price[2]==='千'?1000:1):null;
 const missing=[];
 if(!members.length)missing.push('具体品种或合约');
 if(kind==='price'&&members.length>1)missing.push('到价提醒只能选择一个合约');
 if(kind!=='announcement'&&!direction)missing.push('上涨或下跌方向');
 if(kind!=='announcement'&&!threshold)missing.push(kind==='movement'?'涨跌幅百分比':'目标价格');
 if(kind==='movement'&&!windowMinutes)missing.push('1、3、5或15分钟窗口');
 if(/明天|今晚|到期|截止|之前|直到/.test(request))missing.push('请在提醒卡填写准确截止时间');
 return {input:{kind,symbols:members.map(member=>member.symbol),direction:direction||'up',threshold,windowMinutes:windowMinutes||5,cooldownMinutes:15,repeat:kind!=='price',channels:['desktop','feishu']},missing,request};
}

export class MonitorService{
 constructor({root=resolve('.'),path=process.env.WUJIAN_MONITOR_DB||resolve(root,'.runtime/monitor/monitor.sqlite'),getCatalog=null,sendFeishu=pushMonitorMessage,fetchImpl=fetch,now=Date.now,spawnProcess=spawn}={}){
  Object.assign(this,{root,now,getCatalog,sendFeishu,spawnProcess});this.store=new MonitorStore(path);this.store.recover();this.listeners=new Set();this.quotes=new Map();this.catalogItems=[];this.runtime=true;this.child=null;this.subscription='';this.trendSymbols=[];this.trendPeriods=[];this.trendSubscription='';this.deliveryBusy=false;this.desktop={at:0,supported:false};this.credentials=process.env.TQ_USER&&process.env.TQ_PASSWORD?{user:process.env.TQ_USER,password:process.env.TQ_PASSWORD}:null;this.market={status:'unconfigured',message:'请配置免费行情账号',heartbeatAt:null};
  this.engine=new MonitorEngine({store:this.store,now,onEvent:event=>this.emit('trigger',event)});
  this.provider=this.store.meta('marketProvider')||'tqsdk';this.publicFeed=null;this.publicFetch=fetchImpl;
  this.announcements=new AnnouncementWatcher({store:this.store,fetchImpl,now,onEvent:event=>this.emit('trigger',event)});
  const interruption=this.store.meta('lastRuntime');if(interruption)this.store.setMeta('interruption',{from:interruption.at,to:new Date(now()).toISOString(),reason:'服务重启，重新积累短时窗口'});
 }
 emit(type,value){for(const listener of this.listeners){try{listener(type,value)}catch{}}}
 async catalog(){
  if(this.getCatalog)return this.getCatalog();
  let profiles=[];try{profiles=JSON.parse(readFileSync(resolve(this.root,'../资料包/技能包/wujian-commodity-research/data/products.json'),'utf8'))}catch{}
  const fire=await latestFire().catch(()=>({rows:[]}));
  const rows=(fire.rows||[]).filter(row=>row.main_contract&&row.exchange).map(row=>({symbol:canonical(row.exchange+'.'+row.main_contract),code:canonical(row.code),name:row.name,exchange:row.exchange,tickSize:contractSpec(row.code)?.tickSize||null,source:'盘后具体主力映射',verifiedAt:fire.refreshedAt||null}));
  const combined=new Map(rows.map(row=>[row.symbol,row]));
  for(const member of this.store.rules().flatMap(rule=>rule.members))if(!combined.has(member.symbol))combined.set(member.symbol,{...member,source:'已保存合约'});
  for(const item of this.catalogItems){const profile=profiles.find(row=>canonical(row.symbol)===productCode(item.symbol));combined.set(item.symbol,{...item,name:profile?.name||item.name.replace(/\d+$/,''),code:productCode(item.symbol),source:'TqSdk当前主力',verifiedAt:this.market.catalogAt});}
  return [...combined.values()].filter(row=>!this.enforceLiquidity||(this.quotes.has(row.symbol)?hasLiquidity(this.quotes.get(row.symbol)):(fire.rows||[]).some(r=>canonical(r.exchange+'.'+r.main_contract)===row.symbol&&hasLiquidity(r)))).map(row=>{const profile=profiles.find(item=>item.symbol===row.code);return {...row,officialName:profile?.name||row.name.replace(/^沪/,''),aliases:(profile?.aliases||'').split(/[,，;；]/).filter(Boolean)};});
 }
 rules(){return this.store.rules().map(rule=>{
  const quotes=rule.members.map(member=>this.quotes.get(member.symbol)).filter(Boolean);
  let observation=rule.status==='active'?'待行情':({draft:'待确认',paused:'已暂停',completed:'已触发完成',archived:'已归档',expired:'已过期'})[rule.status];
  if(rule.status==='active')observation=!this.runtime?'监控已停止':rule.kind==='announcement'?'按官方来源检查':this.provider!=='sina'&&!this.credentials?'待配置行情':(!this.child&&!this.publicFeed)||this.market.status!=='connected'?'行情未连接':quotes.some(q=>q.sessionActive&&this.now()-Date.parse(q.quoteAt)<=30000)?rule.kind==='movement'?'积累窗口 / 条件核对':'条件核对中':quotes.length&&!quotes.some(q=>q.sessionActive)?'当前休市':'行情未更新';
  const changes=rule.members.filter(member=>{const main=this.catalogItems.find(item=>productCode(item.symbol)===member.code);return main&&main.symbol!==member.symbol;});
  const expiredMembers=rule.members.filter(member=>this.store.ruleState(rule.id,member.symbol).expired);if(rule.status==='active'&&expiredMembers.length)observation+='；'+expiredMembers.map(member=>member.symbol).join('、')+'已失效';const unavailableMembers=rule.members.filter(member=>this.store.ruleState(rule.id,member.symbol).unavailable);if(rule.status==='active'&&unavailableMembers.length)observation+='；'+unavailableMembers.map(member=>member.symbol).join('、')+'不可订阅，请核验合约与权限';if(rule.kind==='movement'&&rule.status==='active'&&rule.members.some(member=>this.store.ruleState(rule.id,member.symbol).windowReady))observation=observation.replace('积累窗口 / 条件核对','窗口就绪 / 条件核对');return {...rule,condition:conditionText(rule),observation,quotes:quotes.map(q=>({symbol:q.symbol,last:q.last,quoteAt:q.quoteAt,sessionActive:q.sessionActive})),rollover:changes.map(item=>item.symbol)};
 });}
 status(){const events=this.store.events({limit:100});return {runtime:this.runtime,activeRules:this.store.rules().filter(rule=>rule.status==='active').length,unread:this.store.unread(),market:{...marketHealth(this.market,this.store.rules(),this.quotes,this.now()),provider:this.provider,configured:this.provider==='sina'||!!this.credentials,heartbeatFresh:!!this.market.heartbeatAt&&this.now()-Date.parse(this.market.heartbeatAt)<=15000,quoteCount:this.quotes.size},desktop:channelHealth({available:this.now()-this.desktop.at<20000&&this.desktop.supported,at:this.desktop.at?new Date(this.desktop.at).toISOString():null},events,'desktop'),phone:phoneHealth(feishuStatus(),events),announcements:this.announcements.coverage.length?this.announcements.coverage:ANNOUNCEMENT_SOURCES.map(source=>({source:source.id,name:source.name,status:'not-checked',url:source.url})),interruption:this.store.meta('interruption'),notice:'电脑休眠、关机或退出监控后停止；公告为轮询发现。行情、运行和通知状态分别核对。'};}
 exportFile(){const directory=resolve(this.root,'output/monitor-backups');mkdirSync(directory,{recursive:true});const path=resolve(directory,'monitor-'+new Date(this.now()).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.json');writeFileSync(path,JSON.stringify(this.store.export(),null,2),{flag:'wx'});return {path,notice:'已保存在当前D盘项目，不包含行情或飞书凭据'};}
 async preview(input){
  const catalog=await this.catalog();
  if(input.text){const parsed=parseMonitorRequest(input.text,catalog,[...new Set(this.store.rules().filter(rule=>rule.status!=='archived').flatMap(rule=>rule.members.map(member=>member.symbol)))]);if(parsed.missing.length)return {...parsed,ready:false};input=parsed.input;}
  const rule=validateRule(input,catalog,this.now());return {ready:true,input:{...rule,symbols:rule.members.map(member=>member.symbol)},rule,condition:conditionText(rule),mapping:rule.members,notice:'确认后绑定这些具体合约；主力换月不会迁移价格阈值。'};
 }
 async save(input,id=null){const draft=await this.preview(input);if(!draft.ready)throw Error('尚需填写：'+draft.missing.join('、'));const result=this.store.saveRule(draft.rule,id);this.syncSubscriptions();this.emit('change',{});return result;}
 activate(id){const rule=this.store.getRule(id);if(!rule)throw Error('提醒规则不存在');if(rule.status==='active')return rule;if(rule.status==='archived'||rule.status==='expired')throw Error('归档或过期提醒请编辑为新版本后确认');if(rule.expiresAt&&Date.parse(rule.expiresAt)<=this.now())throw Error('提醒已过有效期');this.store.transaction(()=>{for(const member of rule.members){const state=this.store.ruleState(id,member.symbol);this.store.saveState(id,member.symbol,{...state,met:false,armed:true,needsBaseline:true,windowReady:false,activationAt:this.now(),lastTriggered:rule.status==='completed'?0:state.lastTriggered});}this.store.setStatus(id,'active');});this.runtime=true;this.syncSubscriptions();if(rule.kind==='announcement')void this.announcements.poll().then(()=>this.emit('change',{}));this.emit('change',{});return this.store.getRule(id);}
 setStatus(id,status){const rule=this.store.setStatus(id,status);this.syncSubscriptions();this.emit('change',{});return rule;}
 start(){if(this.timer)return;this.timer=setInterval(()=>{this.store.setMeta('lastRuntime',{at:new Date(this.now()).toISOString(),runtime:this.runtime});this.tick();},5000);this.timer.unref();this.announcementTimer=setInterval(()=>{if(this.runtime&&this.store.rules().some(rule=>rule.status==='active'&&rule.kind==='announcement'))void this.announcements.poll().then(()=>this.emit('change',{}));},5*60000);this.announcementTimer.unref();this.syncSubscriptions();}
 tick(){
  if((this.child||this.publicFeed)&&this.market.heartbeatAt&&this.now()-Date.parse(this.market.heartbeatAt)>15000&&this.market.status==='connected'){this.market.status='stale';this.market.message='采集器心跳中断';this.engine.reset();this.emit('reset',{reason:'采集器心跳中断，重新建立基线'});this.emit('change',{});}
  for(const rule of this.store.rules().filter(rule=>rule.status==='active'&&rule.expiresAt&&Date.parse(rule.expiresAt)<=this.now()))this.setStatus(rule.id,'expired');
  void this.deliverPhone();
 }
 subscriptions(){return [...new Set([...this.trendSymbols,...(this.provider==='tqsdk'&&this.watchMarket?this.marketSymbols||[]:[]),...this.store.rules().filter(rule=>rule.status==='active'&&rule.kind!=='announcement').flatMap(rule=>rule.members.filter(member=>!this.store.ruleState(rule.id,member.symbol).expired&&(this.provider==='sina'||!this.store.ruleState(rule.id,member.symbol).unavailable)).map(member=>member.symbol))])].sort();}
 setTrendSubscriptions(symbols=[],periods=[]){
  if(!Array.isArray(symbols)||symbols.length>200||!Array.isArray(periods)||periods.some(p=>!['1d','30m','60m','120m'].includes(p)))throw Error('周期监控订阅无效');
  const values=[...new Set(symbols.map(canonical))].sort();if(values.some(s=>!/^(SHFE|INE|DCE|CZCE|GFEX|CFFEX)\.[A-Z]+\d{3,4}$/.test(s)))throw Error('周期监控需要具体合约');
  this.trendSymbols=values;this.trendPeriods=[...new Set(periods)].sort();
  if(!values.length&&!this.runtime&&!(this.watchMarket&&this.provider==='tqsdk')){this.disconnect();this.market.status='stopped';this.market.message='无启用的监控任务';return {symbols:values,periods:this.trendPeriods};}
  this.syncSubscriptions();return {symbols:values,periods:this.trendPeriods};
 }
 syncSubscriptions(){
  const symbols=this.subscriptions(),key=symbols.join(','),trendKey=JSON.stringify([this.trendSymbols,this.trendPeriods]),changed=key!==this.subscription||trendKey!==this.trendSubscription;
  if(!this.runtime&&!(this.watchMarket&&this.provider==='tqsdk')&&!this.trendSymbols.length)return;
  if(this.provider==='sina'){
   if(this.publicFeed){if(changed){if(key!==this.subscription)this.engine.reset();this.emit('reset',{reason:'行情订阅变化，重新建立基线'});this.publicFeed.subscribe(symbols);this.subscription=key;this.trendSubscription=trendKey;}}
   else this.connectPublic({resume:this.runtime});return;
  }
  if(this.child){if(changed){if(key!==this.subscription)this.engine.reset();this.emit('reset',{reason:'行情订阅变化，重新建立基线'});this.child.stdin.write(JSON.stringify({type:'subscribe',symbols,trendSymbols:this.trendSymbols,trendPeriods:this.trendPeriods})+'\n');this.subscription=key;this.trendSubscription=trendKey;}}
  else if(this.credentials&&symbols.length)this.connect(this.credentials,{resume:this.runtime});
 }
 connect(credentials,{resume=true}={}){
  credentials=validateTqCredentials(credentials);
  this.selectProvider('tqsdk');
  this.disconnect();this.credentials={user:credentials.user.trim(),password:credentials.password};if(resume)this.runtime=true;
  const candidates=[process.env.TQ_PYTHON,resolve(this.root,'.runtime/python313/python.exe'),resolve(this.root,process.platform==='win32'?'.venv-data/Scripts/python.exe':'.venv-data/bin/python')].filter(Boolean),python=candidates.find(path=>existsSync(path));
  if(!python){this.market={status:'runtime-missing',message:'Python运行环境未找到',heartbeatAt:null};this.emit('change',{});return this.status();}
  const symbols=this.subscriptions(),child=this.spawnProcess(python,['-u',resolve(this.root,'integrations/monitor_market.py')],{cwd:this.root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',TQ_USER:'',TQ_PASSWORD:''}});this.child=child;this.subscription=symbols.join(',');this.trendSubscription=JSON.stringify([this.trendSymbols,this.trendPeriods]);this.market={status:'connecting',message:'正在登录天勤并核验行情权限',heartbeatAt:null};
  child.stdin.on('error',()=>{});child.stdin.write(JSON.stringify({...this.credentials,symbols,trendSymbols:this.trendSymbols,trendPeriods:this.trendPeriods})+'\n');
  let oversized=false;child.stdout.on('data',chunk=>{if(chunk.length>2*1024*1024){oversized=true;child.kill();}});
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{if(oversized||this.child!==child||line.length>2*1024*1024)return;try{this.accept(JSON.parse(line));}catch{}});
  child.stderr.resume();child.on('error',()=>{if(this.child===child){this.market.status='runtime-missing';this.market.message='行情运行环境无法启动';this.child=null;this.emit('reset',{reason:'行情运行环境启动失败'});this.emit('change',{});}});
  child.on('exit',()=>{if(this.child!==child)return;this.child=null;this.engine.reset();this.emit('reset',{reason:'行情采集停止，重新建立基线'});if(!['permission-denied','runtime-missing','failed'].includes(this.market.status)){this.market.status='disconnected';this.market.message='行情采集已停止';}this.emit('change',{});});this.emit('change',{});return this.status();
 }
 async useProvider(provider){
  if(!['sina','tqsdk'].includes(provider))throw Error('不支持该行情源');
  this.disconnect();this.selectProvider(provider);this.runtime=true;
  if(provider==='sina')this.connectPublic();else if(this.credentials)this.connect(this.credentials);else this.market={status:'unconfigured',message:'请在APP内配置快期/天勤账号',heartbeatAt:null};
  this.emit('change',{});return this.status();
 }
 selectProvider(provider){
  if(this.provider!==provider)for(const rule of this.store.rules())for(const member of rule.members){const state=this.store.ruleState(rule.id,member.symbol);if(state.unavailable)this.store.saveState(rule.id,member.symbol,{...state,unavailable:false,needsBaseline:true,windowReady:false});}
  this.provider=provider;this.store.setMeta('marketProvider',provider);
 }
 connectPublic({resume=true}={}){
  if(this.publicFeed)return;this.disconnect();if(resume)this.runtime=true;this.market={status:'connecting',message:'正在检查免账号公开行情',heartbeatAt:null};
  const feed=new SinaMonitorFeed({root:this.root,getCatalog:()=>this.catalog(),fetchImpl:this.publicFetch,now:this.now,onMessage:message=>{if(this.publicFeed===feed)this.accept(message);}});this.publicFeed=feed;this.subscription=this.subscriptions().join(',');this.trendSubscription=JSON.stringify([this.trendSymbols,this.trendPeriods]);void feed.start(this.subscriptions());
 }
 accept(message){
  if(message.type==='trend-bars'||message.type==='trend-status'){this.emit(message.type,message);return;}
  if(message.type==='contract-status'&&message.status==='unavailable'&&this.provider==='tqsdk'){
   const symbol=canonical(message.symbol);this.market.unavailableContracts={...this.market.unavailableContracts,[symbol]:message.reason==='permission-denied'?'行情权限不足':'合约不可用'};
  }
  if(message.type==='status'){const previous=this.market.status;Object.assign(this.market,message);delete this.market.type;if(message.status&&message.status!=='connected'){this.engine.reset();this.emit('reset',{reason:'行情连接状态变化，重新建立基线'});}else if(message.status==='connected'&&previous!=='connected')this.emit('reset',{reason:'行情已重连，重新建立基线'});this.emit('change',{});}
  if(message.type==='catalog'){this.catalogItems=message.items.map(item=>({...item,symbol:canonical(item.symbol)}));this.market.catalogAt=message.verifiedAt;this.store.setMeta('lastCatalog',this.catalogItems);if(this.watchMarket){const codes=new Set((this.marketSymbols||[]).map(productCode));this.marketSymbols=[...new Set([...(this.marketSymbols||[]),...this.catalogItems.filter(item=>!codes.size||codes.has(productCode(item.symbol))).map(item=>item.symbol)])];this.syncSubscriptions();}this.emit('change',{});}
  if(message.type==='contract-status'&&['expired','unavailable'].includes(message.status)){const symbol=canonical(message.symbol);for(const rule of this.store.rules().filter(rule=>rule.status==='active'&&rule.kind!=='announcement'&&rule.members.some(member=>member.symbol===symbol))){const state=this.store.ruleState(rule.id,symbol);this.store.saveState(rule.id,symbol,{...state,[message.status]:true});if(rule.members.every(member=>this.store.ruleState(rule.id,member.symbol).expired))this.setStatus(rule.id,'expired');}this.syncSubscriptions();this.emit('change',{});}
  if(message.type==='heartbeat'){const recovery=this.market.status==='stale';this.market.heartbeatAt=message.at;this.market.activeContracts=message.activeContracts;this.market.subscribed=message.subscribed;if(recovery){this.market.status='connected';this.engine.reset();this.emit('reset',{reason:'行情心跳恢复，重新建立基线'});}this.emit('status',{});}
  if(message.type==='quote'){const quote={...message,symbol:canonical(message.symbol)};const valid=Number.isFinite(quote.last)&&quote.last>0&&Number.isFinite(Date.parse(quote.quoteAt));if(!valid)return;const existing=this.quotes.get(quote.symbol);if(existing&&Date.parse(quote.quoteAt)<Date.parse(existing.quoteAt))return;this.quotes.set(quote.symbol,quote);if(this.provider==='sina')for(const rule of this.store.rules().filter(rule=>rule.members.some(member=>member.symbol===quote.symbol))){const state=this.store.ruleState(rule.id,quote.symbol);if(state.unavailable)this.store.saveState(rule.id,quote.symbol,{...state,unavailable:false});}if(this.runtime&&(!this.enforceLiquidity||hasLiquidity(quote)))this.engine.ingest(quote);this.emit('quote',quote);}
 }
 disconnect(){this.publicFeed?.stop();this.publicFeed=null;const child=this.child;this.child=null;if(child){child.stdin.end(JSON.stringify({type:'stop'})+'\n');child.kill();}this.engine.reset();this.quotes.clear();this.subscription='';this.trendSubscription='';delete this.market.unavailableContracts;this.emit('reset',{reason:'行情连接已断开，重新建立基线'});}
 setRuntime(enabled,reason='本人操作'){const from=this.store.meta('lastRuntime')?.at;this.runtime=enabled;if(!enabled){this.disconnect();this.market.status='stopped';this.market.message=reason;this.store.setMeta('interruption',{from:new Date(this.now()).toISOString(),to:null,reason});if(this.trendSymbols.length)this.syncSubscriptions();}else{this.engine.reset();const old=this.store.meta('interruption');if(old)this.store.setMeta('interruption',{...old,to:new Date(this.now()).toISOString()});if(this.provider==='sina')this.connectPublic();else if(this.credentials&&!this.child)this.connect(this.credentials);else if(!this.credentials)this.market={status:'unconfigured',message:'请配置免费行情账号',heartbeatAt:null};this.syncSubscriptions();}this.store.setMeta('lastRuntime',{at:new Date(this.now()).toISOString(),runtime:enabled});this.emit('change',{});return this.status();}
 test(channels=['desktop','feishu']){if(!Array.isArray(channels)||channels.some(channel=>!['desktop','feishu'].includes(channel)))throw Error('通知通道无效');const event={id:randomUUID(),kind:'test',name:'通知测试',label:'通知测试',condition:'本人主动测试通知',source:'小木本机',triggeredAt:new Date(this.now()).toISOString(),channels,evidence:{test:true}};this.store.recordEvent(event);this.emit('trigger',event);void this.deliverPhone();return event;}
 async deliverPhone(){
  if(this.deliveryBusy||!feishuStatus().ready||!feishuStatus().targetConfigured)return;this.deliveryBusy=true;
  try{for(const item of this.store.pending('feishu',this.now())){
   this.store.delivery(item.event_id,'feishu','sending');
   try{const result=await this.sendFeishu(monitorMessage(item.event),'monitor:'+item.event_id);this.store.delivery(item.event_id,'feishu','accepted',result?.messageId?'通道已接收':'飞书通道已接收，不代表本人已读');}
   catch(error){this.store.delivery(item.event_id,'feishu',error.deliveryUnknown?'unknown':'failed',error.providerCode?'飞书拒绝发送（'+error.providerCode+'）':'手机消息尚未确认',this.now()+[5000,30000,120000][Math.min(item.attempts,2)]);}
   this.emit('change',{});
  }}finally{this.deliveryBusy=false;}
 }
 stop(){clearInterval(this.timer);clearInterval(this.announcementTimer);this.disconnect();this.store.setMeta('lastRuntime',{at:new Date(this.now()).toISOString(),runtime:false});}
}

let singleton;
export function monitorService(){return singleton||(singleton=new MonitorService());}
export const monitorTools=[
 {name:'create_monitor_draft',description:'根据本人要求建立提醒草稿；只支持具体合约到价、1/3/5/15分钟涨跌幅和官方公告。不得替本人启用，必须在小木提醒卡确认。',parameters:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}},
 {name:'get_monitor_status',description:'查询持续监控、实时行情和通知状态。盘后行情不代表实时监控已接通。',parameters:{type:'object',properties:{},additionalProperties:false}},
 {name:'list_monitor_rules',description:'查询已保存的提醒规则及运行状态。',parameters:{type:'object',properties:{},additionalProperties:false}}
];
export async function monitorTool(name,args){const service=monitorService();if(name==='get_monitor_status')return service.status();if(name==='list_monitor_rules')return service.rules();if(name==='create_monitor_draft'){const draft=await service.preview(args);if(!draft.ready)return draft;const saved=await service.save(draft.input);return {...draft,draftId:saved.id};}throw Error('提醒工具不存在');}
import {marketHealth,phoneHealth,channelHealth} from './monitor-health.mjs';
