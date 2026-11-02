import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {JSDOM} from 'jsdom';
import {createFireRefresh} from '../integrations/fire-refresh.mjs';
import {fireRefreshText,bindFireRefresh} from '../dist/fire-refresh.js';

const result={status:'ready',rows:[{code:'MA'}],data_date:'2026-10-09',target_date:'2026-10-09',current_count:81,no_trade_count:4,universe_size:87};
async function fixture(t,callbacks={}){
 const parent=resolve('.runtime/test-fire-refresh');await mkdir(parent,{recursive:true});
 const dir=await mkdtemp(join(parent,'run-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const options={path:join(dir,'status.json'),checkRules:async()=>{},refreshMarket:async()=>({status:'eod-ready'}),scan:async()=>result,afterScan:async()=>{},now:()=>new Date().toISOString(),...callbacks};
 return {options,service:createFireRefresh(options)};
}

test('点击刷新先更新行情再扫描；最新刷新时间与旧交易日分别持久化',async t=>{
 const order=[],{service,options}=await fixture(t,{refreshMarket:async()=>{order.push('行情');return{status:'eod-ready'}},scan:async()=>{order.push('扫描');return result},afterScan:async()=>order.push('索引')});
 const start=await service.start();assert.equal(start.status,'running');
 const done=await service.wait();assert.deepEqual(order,['行情','扫描','索引']);assert.equal(done.status,'completed');assert.equal(done.dataDate,'2026-10-09');assert.ok(done.finishedAt>=done.startedAt);
 assert.deepEqual(await createFireRefresh(options).status(),done);
});

test('重复点击只运行一次，失败可重试且失败时间保留',async t=>{
 let release,calls=0,fail=true;
 const {service}=await fixture(t,{scan:async()=>{calls++;await new Promise(r=>release=r);if(fail)throw Error('行情请求失败');return result}});
 await service.start();await service.start();
 while(!release)await new Promise(r=>setTimeout(r,1));release();
 const failed=await service.wait();assert.equal(calls,1);assert.equal(failed.status,'failed');assert.ok(failed.finishedAt);assert.equal(failed.error,'行情请求失败');
 fail=false;release=null;await service.start();while(!release)await new Promise(r=>setTimeout(r,1));release();assert.equal((await service.wait()).status,'completed');assert.equal(calls,2);
});

test('锁定框架变化明确失败，不开始取数；进程中断不冒充仍在刷新',async t=>{
 const {service,options}=await fixture(t,{checkRules:async()=>{throw Error('本轮规则发生变化')},refreshMarket:async()=>assert.fail('不能在规则变化后更新')});
 await service.start();assert.equal((await service.wait()).error,'本轮规则发生变化');
 await writeFile(options.path,JSON.stringify({status:'running',stage:'scan',startedAt:'2026-10-12T00:00:00Z'}));
 const state=await createFireRefresh(options).status();assert.equal(state.status,'interrupted');assert.match(state.error,/重新刷新/);
});

test('主力更新失败仍逐品种采集，缺口保留；无新结果明确失败',async t=>{
 const {service}=await fixture(t,{refreshMarket:async()=>({status:'failed'})});await service.start();const done=await service.wait();assert.equal(done.status,'completed');assert.match(done.warning,/缺失数据/);
 const {service:empty}=await fixture(t,{scan:async()=>({status:'ready',rows:[]})});await empty.start();assert.equal((await empty.wait()).status,'failed');
});

test('页面显示北京时间刷新记录；拒绝请求恢复按钮并给出错误',async()=>{
 assert.deepEqual(fireRefreshText({data_date:'2026-10-09',refresh:{finishedAt:'2026-10-12T00:16:00Z',stage:'completed'}}),{time:'2026-10-12 08:16',message:'刷新完成'});
 const doc=new JSDOM('<button>刷新盘后数据</button>').window.document,button=doc.querySelector('button');let error;
 bindFireRefresh({button,api:async()=>{assert.equal(button.disabled,true);throw Error('网络未连接')},onStarted:()=>assert.fail(),onError:e=>error=e});
 await button.onclick();assert.equal(button.disabled,false);assert.equal(button.textContent,'刷新盘后数据');assert.equal(error.message,'网络未连接');
});
