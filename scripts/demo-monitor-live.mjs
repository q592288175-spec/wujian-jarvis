import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join}from'node:path';
import{DatabaseSync,backup}from'node:sqlite';
import{randomUUID,createHash}from'node:crypto';
import{MonitorStore}from'../integrations/monitor-store.mjs';
import{evaluateTrend,validateTrendTask}from'../integrations/trend-monitor-engine.mjs';
import{monitorMessage}from'../integrations/monitor-service.mjs';
import{databaseManifest}from'./system-backup.mjs';
const base='http://127.0.0.1:4318',out=resolve('output/monitor-live-demo-'+Date.now());await mkdir(out,{recursive:true});
const status=await(await fetch(base+'/api/trend-monitor/status')).json();assert.equal(status.weixin?.pushReady,true,'微信必须已连接');
const task=status.tasks.find(t=>t.status==='active'&&JSON.stringify(t.bigPeriods)===JSON.stringify(['1w','1d'])&&['30m','120m'].every(p=>t.smallPeriods.includes(p)));assert.ok(task,'当前必须有周日、30分钟/2小时任务');
const eligible=status.rows.filter(r=>r.monitored!==false);assert.ok(eligible.length>=2);const cases=[{row:eligible[0],period:'30m',up:false},{row:eligible[1],period:'120m',up:true}];
const batch=randomUUID(),rulesBefore=JSON.stringify(status.tasks),watchBefore=JSON.stringify(status.watchlist),business=databaseManifest('.runtime/five-workbench.sqlite');
function run(c,live){
 const now=Date.now(),day=new Date(now+28800000).toISOString().slice(0,10),days=[];let d=new Date(day+'T00:00:00Z');while(days.length<390){if(![0,6].includes(d.getUTCDay()))days.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()-1)}
 const daily=days.reverse().map((date,i)=>({stamp:date+'T00:00:00+08:00',date,close:c.up?40+i*.1:160-i*.1,complete:i<389}));
 const span=c.period==='120m'?120:30,small=[c.up?90:110,...Array(9).fill(c.up?110:90)].map((close,i)=>({stamp:new Date(now-(10-i)*span*60000).toISOString(),close,complete:true}));small.push({stamp:new Date(now-15000).toISOString(),close:100,complete:false});
 const checked={...validateTrendTask({...task,scope:'codes',codes:[c.row.code],channels:['desktop','weixin']}),id:'test-'+batch,version:1};
 const frame=(price,seq)=>({symbol:c.row.symbol,code:c.row.code,name:'【测试】'+c.row.name,source:'模拟行情测试，价格非实盘，不是交易信号',bars:{'1d':daily,[c.period]:small},quote:{last:price,quoteAt:new Date(now-4000+seq*1000).toISOString(),receivedAt:new Date(now-4000+seq*1000).toISOString(),sequence:seq,sessionActive:true,sessionKey:day+':demo',tradingDay:day}});
 const a=evaluateTrend({task:checked,frame:frame(c.up?89:111,1),period:c.period,now:now-3000,generation:batch});assert.equal(a.event,null,'先建基线不得补报');
 const result=evaluateTrend({task:checked,frame:frame(c.up?111:89,2),period:c.period,state:a.state,now:now-2000,generation:batch});assert.ok(result.event,'拐头并穿线必须触发');
 assert.equal(evaluateTrend({task:checked,frame:frame(c.up?112:88,3),period:c.period,state:result.state,now:now-1000,generation:batch}).event,null,'同一拐点不得重复');
 const e=result.event;e.id=randomUUID();e.evidence={...e.evidence,test:true,batch,originalTaskId:task.id,originalTaskVersion:task.version,notice:'用户主动要求的全链路演示，所有价格和趋势均为模拟'};e.label='【测试】'+e.label;e.condition='【模拟行情测试，不是实盘信号】'+e.condition;e.name='【测试】'+c.row.name;e.source='模拟行情测试，价格非实盘，不是交易信号';e.triggeredAt=new Date(now).toISOString();return e;
}
const algorithm=[];for(const period of ['30m','120m'])for(const up of [false,true]){run({row:eligible[0],period,up});algorithm.push({period,direction:up?'up':'down',baselineNoReplay:true,turnAndCross:true,noDuplicate:true})}
const dbFile=resolve('.runtime/monitor/monitor.sqlite'),db=new DatabaseSync(dbFile,{readOnly:true});await backup(db,join(out,'monitor-before.sqlite'));db.close();
const events=cases.map(c=>run(c,true));await writeFile(join(out,'test-inputs-and-events.json'),JSON.stringify({batch,algorithm,events},null,2));
const receipt={out,batch,at:new Date().toISOString(),events:events.map(e=>({id:e.id,code:e.code,name:e.name,period:e.period,direction:e.direction,condition:e.condition})),algorithm};
await writeFile('output/monitor-alerts-2026-11-03/live-demo-latest.json',JSON.stringify(receipt,null,2));
const store=new MonitorStore(dbFile);for(const e of events)assert.ok(store.recordEvent(e));store.close();console.log(JSON.stringify({stage:'triggered',...receipt}));
let state;for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,1000));const res=await(await fetch(base+'/api/trend-monitor/status')).json();state=events.map(e=>res.events.find(r=>r.id===e.id));if(state.every(e=>e?.deliveries?.every(d=>['accepted','failed','unknown'].includes(d.status))))break}
const after=await(await fetch(base+'/api/trend-monitor/status')).json();assert.equal(JSON.stringify(after.tasks),rulesBefore);assert.equal(JSON.stringify(after.watchlist),watchBefore);assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),business);
const delivery={at:new Date().toISOString(),events:state.map(e=>({id:e?.id,name:e?.name,period:e?.period,readAt:e?.readAt,deliveries:e?.deliveries})),rulesUnchanged:true,watchlistUnchanged:true,businessUnchanged:true};await writeFile(join(out,'delivery-receipts.json'),JSON.stringify(delivery,null,2));console.log(JSON.stringify({stage:'receipts',...delivery}));
