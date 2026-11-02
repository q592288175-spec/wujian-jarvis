import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {MonitorEngine,validateRule,canonical} from '../integrations/monitor-engine.mjs';
import {MonitorService} from '../integrations/monitor-service.mjs';
import {restoreMonitor} from '../scripts/restore-monitor.mjs';
import {protectLocalSecret} from '../integrations/local-secret.mjs';
import {Ledger,sendMonitorNotification,monitorNotificationConfig,monitorConversation} from '../integrations/feishu-core.mjs';

const out=resolve('output/monitor-tests');mkdirSync(out,{recursive:true});
const catalog=[{symbol:'SHFE.CU2611',name:'铜',code:'CU',exchange:'SHFE',tickSize:10},{symbol:'SHFE.AL2611',name:'铝',code:'AL',exchange:'SHFE',tickSize:5}];
const input={kind:'price',symbols:['SHFE.CU2611'],threshold:100,direction:'up',repeat:true,channels:['desktop']};
const start=Date.parse('2026-10-12T09:00:00+08:00');
test('规则、冷却、证据、通知发送状态在重启后保留',()=>{
 const directory=mkdtempSync(join(out,'restart-')),path=join(directory,'monitor.sqlite');let s=new MonitorStore(path);const rule=s.saveRule(validateRule(input,catalog,start));s.setStatus(rule.id,'active');new MonitorEngine({store:s,now:()=>start}).ingest({symbol:'SHFE.CU2611',last:100,sequence:1,quoteAt:new Date(start).toISOString(),sessionActive:true,sessionKey:'day',tradingDay:'2026-10-12'});const e=s.events()[0];s.delivery(e.id,'desktop','sending');s.close();
 s=new MonitorStore(path);s.recover();assert.equal(s.getRule(rule.id).status,'active');assert.equal(s.ruleState(rule.id,'SHFE.CU2611').lastTriggered,start);assert.equal(s.event(e.id).deliveries[0].status,'unknown');assert.equal(s.export().versions.length,1);s.close();
});
test('冷却中已恢复不满足，结束后可以再次达到而不刷屏',()=>{
 const s=new MonitorStore(':memory:'),rule=s.saveRule(validateRule({...input,cooldownMinutes:1},catalog,start));s.setStatus(rule.id,'active');let now=start,sequence=0;const engine=new MonitorEngine({store:s,now:()=>now}),quote=(price,ms)=>{now+=ms;return engine.ingest({symbol:'SHFE.CU2611',last:price,sequence:++sequence,quoteAt:new Date(now).toISOString(),sessionActive:true,sessionKey:'day',tradingDay:'2026-10-12'});};
 assert.equal(quote(100,0).events.length,1);quote(90,10000);assert.equal(quote(100,10000).events.length,0);for(let i=0;i<3;i++)assert.equal(quote(100,10000).events.length,0);assert.equal(quote(100,10000).events.length,1);assert.equal(quote(100,10000).events.length,0);s.close();
});
test('1/3/5/15分钟都有完整窗口且下跌计算不反向',()=>{
 for(const minutes of [1,3,5,15]){const s=new MonitorStore(':memory:'),rule=s.saveRule(validateRule({...input,kind:'movement',direction:'down',threshold:1,windowMinutes:minutes},catalog,start));s.setStatus(rule.id,'active');let now=start,sequence=0;const engine=new MonitorEngine({store:s,now:()=>now});for(let i=0;i<=minutes*6;i++){const result=engine.ingest({symbol:'SHFE.CU2611',last:i===minutes*6?98:100,sequence:++sequence,quoteAt:new Date(now).toISOString(),sessionActive:true,sessionKey:'day',tradingDay:'2026-10-12'});assert.equal(result.events.length,i===minutes*6?1:0);now+=10000;}s.close();}
});
test('批量监控仅停止失效成员，不停掉其他合约',async()=>{
 const service=new MonitorService({path:':memory:',getCatalog:async()=>catalog});const r=await service.save({...input,kind:'movement',symbols:catalog.map(c=>c.symbol)});service.activate(r.id);service.accept({type:'contract-status',symbol:'SHFE.CU2611',status:'expired'});assert.equal(service.store.getRule(r.id).status,'active');assert.deepEqual(service.subscriptions(),['SHFE.AL2611']);service.stop();service.store.close();
});
test('备份恢复到新库，默认暂停且不补发历史消息，拒绝覆盖',async()=>{
 const dir=mkdtempSync(join(out,'restore-')),file=join(dir,'backup.json'),dest=join(dir,'restored.sqlite');const s=new MonitorStore(':memory:'),r=s.saveRule(validateRule(input,catalog,start));s.setStatus(r.id,'active');s.recordEvent({id:'e',kind:'test',triggeredAt:new Date().toISOString(),channels:['desktop']});writeFileSync(file,JSON.stringify(s.export()));s.close();await restoreMonitor(file,dest);const restored=new MonitorStore(dest);assert.equal(restored.getRule(r.id).status,'paused');assert.equal(restored.pending('desktop').length,0);assert.equal(restored.event('e').deliveries[0].status,'unknown');restored.close();await assert.rejects(()=>restoreMonitor(file,dest),/禁止覆盖/);
});
test('郑商所三四位月份映射一致，凭据DPAPI密文可恢复',async()=>{
 assert.equal(canonical('CZCE.MA2701'),'CZCE.MA701');assert.equal(canonical('SHFE.CU2611'),'SHFE.CU2611');
 if(process.platform==='win32'){const result=await protectLocalSecret('isolated-test');assert.ok(!JSON.stringify(result).includes('isolated-test'));assert.equal(await protectLocalSecret(result,'decrypt'),'isolated-test');}
});
test('界面备份固定保存在项目目录，不导出账号凭据',()=>{
 const root=mkdtempSync(join(out,'export-')),service=new MonitorService({root,path:':memory:'});service.credentials={user:'private-account',password:'private-password'};const result=service.exportFile();assert.ok(result.path.startsWith(join(root,'output','monitor-backups')));const content=readFileSync(result.path,'utf8');assert.equal(JSON.parse(content).schemaVersion,1);assert.ok(!content.includes('private-account'));assert.ok(!content.includes('private-password'));service.stop();service.store.close();
});
test('飞书明确拒绝可以重试，成功与结果未知都不重复发送',async()=>{
 const directory=mkdtempSync(join(out,'phone-')),ledger=await new Ledger(join(directory,'ledger.json')).init();let calls=0,result={code:999};const client={im:{v1:{message:{async create(){calls++;if(result instanceof Error)throw result;return result;}}}}},config={type:'open_id',target:'owner',allowedUsers:['owner'],allowedChats:[]},send=key=>sendMonitorNotification({client,ledger,config,text:'隔离测试',key});
 await assert.rejects(()=>send('confirmed'),error=>error.deliveryUnknown===false);assert.equal(ledger.entries['send:confirmed'].status,'rejected');result={code:0,data:{message_id:'accepted'}};assert.equal((await send('confirmed')).messageId,'accepted');assert.equal((await send('confirmed')).duplicate,true);assert.equal(calls,2);
 result=Error('timeout');await assert.rejects(()=>send('unknown'),error=>error.deliveryUnknown===true);await assert.rejects(()=>send('unknown'),error=>error.deliveryUnknown===true);assert.equal(calls,3);assert.equal(ledger.entries['send:unknown'].status,'uncertain');
 result={code:0};await assert.rejects(()=>send('missing-receipt'),error=>error.deliveryUnknown===true);assert.equal(ledger.entries['send:missing-receipt'].status,'uncertain');
 await assert.rejects(()=>sendMonitorNotification({client,ledger,config:{...config,target:'someone-else'},text:'private',key:'blocked'}),/未授权/);assert.equal(calls,4);
});
test('监控单聊只绑定本人，换应用或未授权用户不能借用旧会话',()=>{
 const unconfigured={type:'open_id',allowedUsers:[],allowedChats:[]};assert.equal(monitorNotificationConfig(unconfigured),unconfigured);
 const c={appId:'app',type:'open_id',target:'owner',allowedUsers:['owner'],allowedChats:[]},m={chatType:'p2p',chatId:'oc_private',user:'owner'};const peer=monitorConversation(c,m),target=monitorNotificationConfig({...c,notificationChat:peer});assert.equal(target.type,'chat_id');assert.equal(target.target,'oc_private');assert.deepEqual(target.allowedChats,['oc_private']);assert.equal(monitorNotificationConfig({...c,appId:'other',notificationChat:peer}).type,'open_id');assert.equal(monitorNotificationConfig({...c,notificationChat:{...peer,user:'someone'}}).type,'open_id');assert.throws(()=>monitorConversation(c,{...m,chatType:'group'}),/本人/);assert.throws(()=>monitorConversation(c,{...m,user:'someone'}),/本人/);
});
test('休眠恢复未配置账号仍待配置；已保存账号重新连接而不冒充正常',()=>{
const s=new MonitorService({path:':memory:'});s.setRuntime(false,'电脑休眠');s.setRuntime(true);assert.equal(s.status().market.status,'unconfigured');let reconnect=false;s.credentials={user:'test',password:'test'};s.connect=()=>{reconnect=true;s.market={status:'connecting'};};s.setRuntime(true);assert.equal(reconnect,true);assert.equal(s.status().market.status,'idle');assert.equal(s.status().market.sourceStatus,'connecting');s.stop();s.store.close();
});
test('飞书令牌被访问控制拒绝属于明确失败，不冒充可能送达',async()=>{
 const dir=mkdtempSync(join(out,'token-denied-')),ledger=await new Ledger(join(dir,'ledger.json')).init();
 const client={im:{v1:{message:{async create(){throw Error('failed to get tenant_access_token, code: 21001, msg: Access denied by access control policy.')}}}}};
 await assert.rejects(()=>sendMonitorNotification({client,ledger,config:{type:'open_id',target:'owner',allowedUsers:['owner']},text:'隔离测试',key:'token'}),e=>e.providerCode===21001&&e.deliveryUnknown===false);
 assert.equal(ledger.entries['send:token'].status,'rejected');
});
