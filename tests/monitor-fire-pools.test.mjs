import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createTrendMonitorPage,defaultTrendDraft,firePoolCodes,monitorFirePools} from '../dist/trend-monitor-ui.js';
const turn=()=>new Promise(r=>setImmediate(r));
const scan=()=>({dataDate:'2026-11-02',rows:[{code:'CU',modes:{'month-week-day':'多头观察','month-week':'多头观察','week-day':'不符合','day-trend':'多头观察'}},{code:'MA',modes:{'month-week-day':'空头观察','month-week':'不符合','week-day':'空头观察','day-trend':'不符合'}},{code:'AU',modes:{'month-week-day':'不符合'}}]});
test('四个池直接读取火原判定，多空合并、去重，不根据当前MA10重新放宽资格',()=>{assert.equal(monitorFirePools.length,4);const s=scan();s.rows.push(s.rows[0]);assert.deepEqual([...firePoolCodes(s,'month-week-day')],['CU','MA']);assert.deepEqual([...firePoolCodes(s,'week-day')],['MA']);assert.equal(firePoolCodes(s,'unknown').size,0)});
async function harness(work){
 const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1',pretendToBeVisual:true}),previous=globalThis.document;globalThis.document=dom.window.document;
 const host=document.getElementById('host'),calls=[],notices=[],rows=[{code:'CU',name:'沪铜',sector:'有色',signals:{}},{code:'MA',name:'甲醇',sector:'化工',signals:{}},{code:'AU',name:'黄金',sector:'贵金属',signals:{}}];let fire=scan(),fail=false,watch={mode:'codes',codes:['AU'],version:7};
 const task={...defaultTrendDraft(),id:'task',version:2};
 const fetchImpl=async(url,options={})=>{const body=options.body&&JSON.parse(options.body);calls.push({url,body});if(url==='/api/workbench/fire'){if(fail)throw Error('测试网络中断');return{ok:true,json:async()=>fire}}if(url.endsWith('/watchlist')){assert.equal(body.version,watch.version);watch={...body,version:watch.version+1};return{ok:true,json:async()=>watch}}return{ok:true,json:async()=>url.endsWith('/catalog')?{items:rows}:{watchlist:watch,tasks:[task],rows:rows.map(r=>({...r,watched:watch.codes.includes(r.code),monitored:watch.codes.includes(r.code)})),weixin:{}}}};
 const page=createTrendMonitorPage({host,fetchImpl,notify:n=>notices.push(n)});
 try{page.start();await turn();await turn();await work({host,page,calls,notices,task,get watch(){return watch},setFire:s=>fire=s,setFailure:v=>fail=v,click:s=>host.querySelector(s).click()});}finally{page.stop();globalThis.document=previous;dom.window.close()}
}
test('周期按钮与板块筛选相交，只过滤显示，不偷偷覆盖原来已关注的监控范围',async()=>harness(async h=>{
 assert.equal(h.host.querySelectorAll('[data-tm-fire-pool]').length,5);assert.match(h.host.querySelector('[data-tm-fire-pool="month-week-day"]').textContent,/2/);
 h.click('[data-tm-fire-pool="month-week-day"]');assert.equal(h.host.querySelectorAll('[data-tm-row]').length,2);assert.equal(h.host.querySelectorAll('[data-tm-watch-products] [data-tm-follow]').length,2);assert.deepEqual(h.watch.codes,['AU']);assert.equal(h.calls.filter(c=>c.body).length,0);
 h.click('[data-tm-sector="化工"]');assert.equal(h.host.querySelectorAll('[data-tm-row]').length,1);assert.equal(h.host.querySelector('[data-tm-row]').dataset.tmRow,'MA');h.click('[data-tm-sector="all"]');h.click('[data-tm-fire-pool="all"]');assert.equal(h.host.querySelectorAll('[data-tm-row]').length,3);
}));
test('仅监控本池真正调用现有后台关注接口，只改品种，不修改任务周期方向和提醒方式',async()=>harness(async h=>{
 const before=JSON.stringify(h.task);h.click('[data-tm-fire-pool="month-week-day"]');h.click('[data-tm-pool-only]');await turn();await turn();assert.deepEqual(h.watch.codes,['CU','MA']);assert.equal(h.watch.mode,'codes');assert.equal(JSON.stringify(h.task),before);assert.equal(h.calls.filter(c=>c.body).length,1);assert.ok(h.notices.some(n=>n.includes('仅监控本池')));
}));
test('刷新后候选数使用新扫描，空名单不退回全部；候选读取失败禁用应用并说明缓存',async()=>harness(async h=>{
 h.click('[data-tm-fire-pool="month-week-day"]');h.setFire({dataDate:'2026-11-03',rows:[]});h.click('[data-tm-refresh]');await turn();await turn();assert.equal(h.host.querySelectorAll('[data-tm-row]').length,0);assert.equal(h.host.querySelector('[data-tm-pool-only]').disabled,true);assert.match(h.host.querySelector('[data-tm-fire-pool-state]').textContent,/2026-11-03/);assert.deepEqual(h.watch.codes,['AU']);
 h.setFire(scan());h.click('[data-tm-refresh]');await turn();await turn();h.setFailure(true);h.click('[data-tm-refresh]');await turn();await turn();assert.match(h.host.querySelector('[data-tm-fire-pool-state]').textContent,/读取失败.*保留上次名单/);assert.equal(h.host.querySelector('[data-tm-pool-only]').disabled,true);assert.equal(h.calls.filter(c=>c.body).length,0);
}));
