import test from 'node:test';
import assert from 'node:assert/strict';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {MonitorEngine,validateRule} from '../integrations/monitor-engine.mjs';
import {parseMonitorRequest,MonitorService} from '../integrations/monitor-service.mjs';
import {AnnouncementWatcher,ANNOUNCEMENT_SOURCES,parseAnnouncementBody} from '../integrations/monitor-announcements.mjs';

const catalog=[{symbol:'SHFE.CU2611',name:'铜',code:'CU',exchange:'SHFE',tickSize:10,aliases:['沪铜']},{symbol:'CFFEX.T2612',name:'十年国债',code:'T',exchange:'CFFEX',tickSize:.005,aliases:[]}];
const start=Date.parse('2026-10-12T09:00:00+08:00');
function setup(input={}){
 const store=new MonitorStore(':memory:');let now=start,sequence=0;
 const payload=validateRule({kind:'price',symbols:['SHFE.CU2611'],direction:'up',threshold:100,channels:['desktop','feishu'],...input},catalog,now);
 const rule=store.saveRule(payload);store.setStatus(rule.id,'active');
 const engine=new MonitorEngine({store,now:()=>now});
 const quote=(price,delta=0,extra={})=>{now+=delta;return engine.ingest({symbol:'SHFE.CU2611',last:price,quoteAt:new Date(now).toISOString(),sequence:++sequence,sessionActive:true,sessionKey:'2026-10-12:day:09:00',tradingDay:'2026-10-12',...extra});};
 return {store,rule,engine,quote,clock:()=>now,advance:ms=>now+=ms};
}
test('到价包含等号，首次达到不冒充突破，事件与通知一同保存',()=>{
 const x=setup();const result=x.quote(100);assert.equal(result.events.length,1);assert.equal(result.events[0].label,'当前已达到目标价');assert.equal(x.store.getRule(x.rule.id).status,'completed');assert.equal(x.store.events()[0].deliveries.length,2);assert.equal(x.quote(101,1000).events.length,0);x.store.close();
});
test('连续价格穿越，反向到价，缺口恢复标签',()=>{
 for(const direction of ['up','down']){const x=setup({direction,repeat:true});x.quote(direction==='up'?90:110);const e=x.quote(100,1000).events[0];assert.match(e.label,/穿越/);x.advance(16*60000);x.engine.reset();assert.equal(x.quote(100).events[0].label,'当前已达到目标价');x.store.close();}
});
test('重复、乱序、陈旧、未来、非交易时段、无效数值不触发',()=>{
 const x=setup();x.quote(90);assert.equal(x.quote(120,0,{sequence:1}).accepted,false);assert.equal(x.quote(120,0,{quoteAt:new Date(start-1000).toISOString()}).accepted,false);
 for(const extra of [{quoteAt:new Date(start-31000).toISOString()},{quoteAt:new Date(start+2000).toISOString()},{sessionActive:false},{last:NaN},{last:0},{sequence:null}])assert.equal(x.quote(120,0,extra).accepted,false);
 assert.equal(x.store.events().length,0);x.store.close();
});
test('异动完整窗口，百分比，冷却后必须先恢复不满足',()=>{
 const x=setup({kind:'movement',threshold:1,windowMinutes:1,cooldownMinutes:1});
 for(let i=0;i<6;i++)assert.equal(x.quote(100,i?10000:0).events.length,0);
 assert.equal(x.quote(102,10000).events.length,1);
 for(let i=0;i<6;i++)assert.equal(x.quote(102,10000).events.length,0);
 x.quote(100,10000);for(let i=0;i<6;i++)x.quote(100,10000);
 assert.equal(x.quote(103,10000).events.length,1);x.store.close();
});
test('异动午休、夜盘切换、重连后重新预热',()=>{
 const x=setup({kind:'movement',threshold:1,windowMinutes:1});x.quote(100);for(let i=0;i<6;i++)x.quote(100,10000);
 assert.equal(x.quote(120,1000,{sessionKey:'night'}).events.length,0);x.engine.reset();assert.equal(x.quote(130,1000).events.length,0);x.store.close();
});
test('启用与恢复从第一笔核验，不继承其他规则的穿越证据',async()=>{
 let now=start;const s=new MonitorService({path:':memory:',getCatalog:async()=>catalog,now:()=>now});const r=await s.save({kind:'price',symbols:['SHFE.CU2611'],direction:'up',threshold:100,channels:[]});
 s.engine.ingest({symbol:'SHFE.CU2611',last:90,quoteAt:new Date(now).toISOString(),sequence:1,sessionActive:true,sessionKey:'day',tradingDay:'2026-10-12'});s.activate(r.id);now+=1000;
 const result=s.engine.ingest({symbol:'SHFE.CU2611',last:110,quoteAt:new Date(now).toISOString(),sequence:2,sessionActive:true,sessionKey:'day',tradingDay:'2026-10-12'});assert.equal(result.events[0].label,'当前已达到目标价');s.activate(r.id);now+=1000;
 assert.equal(s.engine.ingest({symbol:'SHFE.CU2611',last:110,quoteAt:new Date(now).toISOString(),sequence:3,sessionActive:true,sessionKey:'day',tradingDay:'2026-10-12'}).events.length,1);s.stop();s.store.close();
});
test('短时规则新启用不能使用之前已接收的窗口',async()=>{
 const x=setup({kind:'movement',threshold:1,windowMinutes:1});x.quote(100);for(let i=0;i<6;i++)x.quote(100,10000);x.store.saveState(x.rule.id,'SHFE.CU2611',{activationAt:x.clock(),needsBaseline:true});assert.equal(x.quote(110,1000).events.length,0);x.store.close();
});
test('合约、刻度、窗口、截止、通道校验；没有流动性硬门',()=>{
 assert.equal(validateRule({kind:'price',symbols:['SHFE.CU2611'],direction:'up',threshold:100},catalog,start).members.length,1);
 for(const input of [{symbols:['KQ.M@CU']},{threshold:105},{kind:'movement',windowMinutes:2},{expiresAt:'2020-01-01'},{channels:['sms']}])assert.throws(()=>validateRule({kind:'price',symbols:['SHFE.CU2611'],direction:'up',threshold:100,...input},catalog,start));
});
test('自然语言草稿不猜测模糊幅度，合约代码不混淆国债T',()=>{
 assert.deepEqual(parseMonitorRequest('提醒我沪铜跌到100',catalog).input.symbols,['SHFE.CU2611']);
 assert.equal(parseMonitorRequest('沪铜五分钟上涨超过1%',catalog).input.windowMinutes,5);
 assert.ok(parseMonitorRequest('沪铜涨得很快提醒我',catalog).missing.length);
 assert.equal(parseMonitorRequest('提醒我CU2611涨到100',catalog).missing.length,0);
});
test('编辑强制回到草稿，历史版本和原触发证据不改写',()=>{
 const x=setup();x.quote(100);x.store.saveRule({...x.rule,threshold:120},x.rule.id);assert.equal(x.store.getRule(x.rule.id).version,2);assert.equal(x.store.getRule(x.rule.id).status,'draft');assert.equal(x.store.events()[0].ruleVersion,1);assert.equal(x.store.export().versions.length,2);x.store.close();
});
test('事务回滚不产生无通知事件；去重、恢复未知发送结果',()=>{
 const x=setup();const event={id:'e',kind:'test',channels:['desktop','desktop'],triggeredAt:new Date(start).toISOString()};assert.throws(()=>x.store.recordEvent(event));assert.equal(x.store.events().length,0);
 event.channels=['desktop'];assert.equal(x.store.recordEvent(event,{uniqueKey:'one'}),true);assert.equal(x.store.recordEvent({...event,id:'e2'},{uniqueKey:'one'}),false);x.store.delivery('e','desktop','sending');x.store.recover();assert.equal(x.store.event('e').deliveries[0].status,'unknown');assert.equal(x.store.pending('desktop').length,0);x.store.read('e');assert.equal(x.store.unread(),0);x.store.close();
});
test('失效规则不触发；合成处理耗时小于1秒',()=>{
 const x=setup({expiresAt:new Date(start+1000).toISOString()});assert.equal(x.quote(120,2000).events.length,0);assert.equal(x.store.getRule(x.rule.id).status,'expired');const y=setup();const began=performance.now();y.quote(120);assert.ok(performance.now()-began<1000);x.store.close();y.store.close();
});
test('公告只识别正文，不把导航当成品种证据',()=>{
 assert.equal(parseAnnouncementBody('<nav>铜 保证金</nav><h1>公告</h1>'),'');assert.equal(parseAnnouncementBody('<div class="TRS_Editor">铜手续费调整</div>'),'铜手续费调整');
});
test('六源公告初始基线静默，新公告一次，实质修订另记',async()=>{
 const store=new MonitorStore(':memory:');const r=store.saveRule(validateRule({kind:'announcement',symbols:['SHFE.CU2611'],channels:[]},catalog,start));store.setStatus(r.id,'active');let version=0;
 const fetchImpl=async url=>{const source=ANNOUNCEMENT_SOURCES.find(s=>s.url===url);if(source)return new Response(`<li><a href="/old.html">关于铜手续费调整的通知</a>2026-10-09</li>${version?'<li><a href="/new.html">关于铜保证金调整的通知</a>2026-10-12</li>':''}`,{headers:{'Content-Type':'text/html'}});return new Response(`<div class="TRS_Editor">铜 ${url.includes('new')?'保证金':'手续费'}调整 ${version>1?'修订条款':''}</div>`,{headers:{'Content-Type':'text/html'}});};
 const watcher=new AnnouncementWatcher({store,fetchImpl,now:()=>start});await watcher.poll();assert.equal(store.events().length,0);version=1;await watcher.poll();assert.equal(store.events().length,1);await watcher.poll();assert.equal(store.events().length,1);version=2;await watcher.poll();assert.equal(store.events().length,3);assert.equal(watcher.coverage.length,6);store.close();
});
