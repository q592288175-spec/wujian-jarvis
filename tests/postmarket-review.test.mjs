import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,readdir,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {JSDOM} from 'jsdom';
import {buildPostmarketReview,reviewCalendar,createPostmarketReview,REVIEW_VERSION} from '../integrations/postmarket-review.mjs';
import {postmarketReportHtml,createPostmarketUI} from '../dist/postmarket-review.js';

const days=['2026-09-24','2026-09-28','2026-09-29','2026-09-30','2026-10-08','2026-10-09','2026-10-12'];
const calendar=reviewCalendar(days,new Date('2026-10-09T08:00:00Z'));
function fixture(){
 const mk=(code,side,prices,sector)=>{const contract=code+'2611',bars=days.slice(0,6).map((date,i)=>({date,open:prices[i]-.5,high:prices[i]+1,low:prices[i]-1,close:prices[i],volume:10000+(i===5?10000:0),open_interest:20000+i*100,source:'合成验收正式日K',provisional:false,symbol:contract}));return {row:{code,name:code==='CU'?'铜':'锌',exchange:'SHFE',sector,main_contract:contract,data_date:calendar.targetDate,data_source:'合成验收正式日K',provisional:false,day_ma10:side==='long'?98:110,month_direction:side==='long'?'上升':'下降',week_direction:side==='long'?'上升':'下降',day_direction:side==='long'?'上升':'下降',modes:Object.fromEntries(['month-week-day','month-week','week-day'].map(m=>[m,side==='long'?'多头观察':'空头观察'])),latest_bar:{open:bars[5].open,high:bars[5].high,low:bars[5].low,close:bars[5].close,volume:bars[5].volume,open_interest:bars[5].open_interest}},set:{contract,source:'隔离验收路径',bars}}};
 const a=mk('CU','long',[100,101,102,103,104,106],'有色金属'),b=mk('ZN','short',[110,109,108,107,106,104],'有色金属');
 return {scan:{status:'ready',refreshing:false,target_date:calendar.targetDate,data_date:calendar.targetDate,rule_version:'隔离规则-v1',rows:[a.row,b.row],refreshedAt:'2026-10-09T08:00:00Z'},calendar,barSets:{CU:a.set,ZN:b.set}};
}
test('收盘与同合约昨收比较、六根完整K形成5日涨跌，结算不污染',()=>{
 const input=fixture(),before=structuredClone(input);input.barSets.CU.bars.at(-1).settle=999;
 const r=buildPostmarketReview(input,'month-week-day'),cu=r.rows.find(r=>r.code==='CU');
 assert.equal(cu.dayReturn,106/104-1);assert.equal(cu.fiveReturn,.06000000000000005);assert.equal(cu.volumeRatio,2);assert.equal(cu.oiChange,100);assert.equal(cu.judgment,'顺势推进');assert.equal(r.rows[1].judgment,'顺势推进');
 assert.equal(r.market.sample,2);assert.equal(cu.sectorSample,2);assert.equal(cu.relativeReturn,cu.dayReturn-r.sectors[0].meanReturn);
 assert.deepEqual(input.scan,before.scan);assert.match(cu.cause,/不等于资金净流入/);assert.equal(r.rows.length,2);
});
test('缺失、临时、陈旧与不同合约K不伪装为当日有效数据',()=>{
 for(const alter of [i=>i.barSets.CU.bars.pop(),i=>i.barSets.CU.bars.at(-1).provisional=true,i=>i.scan.rows[0].data_date='2026-10-08',i=>i.barSets.CU.bars.at(-1).symbol='CU2612',i=>i.barSets.CU.contract='CU2612']){
  const i=fixture();alter(i);const r=buildPostmarketReview(i,'month-week-day'),cu=r.rows.find(r=>r.code==='CU');assert.equal(cu.dayReturn,null);assert.equal(cu.judgment,'数据待核验');assert.ok(cu.gaps.length);assert.equal(r.rows.length,2);assert.equal(r.market.sample,1);
 }
});
test('换月仍用新具体合约自身前值，缺昨天不借旧主力拼收益',()=>{
 const i=fixture();i.barSets.CU.bars=i.barSets.CU.bars.filter(b=>b.date!==calendar.previousDate);
 const r=buildPostmarketReview(i,'month-week-day');assert.equal(r.rows[0].dayReturn,null);assert.equal(r.rows[0].fiveReturn,null);assert.equal(r.rows[0].judgment,'数据待核验');
});
test('郑商所三位合约年码按既有映射还原，同年月等价而非换月',()=>{
 const i=fixture();i.scan.rows[0]={...i.scan.rows[0],code:'SH',exchange:'CZCE',main_contract:'SH2611'};
 i.barSets.SH={...i.barSets.CU,contract:'SH2611',bars:i.barSets.CU.bars.map(b=>({...b,symbol:'SH611'}))};
 const sh=buildPostmarketReview(i,'month-week-day').rows.find(r=>r.code==='SH');assert.equal(sh.valid,true);assert.equal(sh.dayReturn,106/104-1);
 i.barSets.SH.bars.at(-1).symbol='SH701';assert.equal(buildPostmarketReview(i,'month-week-day').rows.find(r=>r.code==='SH').valid,false);
});
test('后台新K与扫描数值矛盾时显式待核，不截取未来日K',()=>{
 const i=fixture();i.barSets.CU.bars.push({...i.barSets.CU.bars.at(-1),date:'2026-10-12',close:999});
 assert.equal(buildPostmarketReview(i,'month-week-day').rows[0].close,106);
 i.barSets.CU.bars[5].close=105;const r=buildPostmarketReview(i,'month-week-day');assert.equal(r.rows[0].close,null);assert.match(r.rows[0].gaps.join(','),/不一致/);
});
test('临时历史K、缺5日或缺量仓只标相应缺口，不编造比例',()=>{
 const i=fixture();i.barSets.CU.bars[0].provisional=true;i.barSets.CU.bars[4].open_interest=null;
 const r=buildPostmarketReview(i,'week-day');assert.ok(r.rows[0].dayReturn>0);assert.equal(r.rows[0].fiveReturn,null);assert.equal(r.rows[0].volumeRatio,null);assert.equal(r.rows[0].oiChange,null);
});
test('无候选仍保留真实背景；候选不是全市场，股债不混入商品宽度',()=>{
 const i=fixture();i.scan.rows.forEach(r=>r.modes['month-week-day']='未纳入');i.scan.rows.push({...i.scan.rows[0],code:'IF',name:'股指',exchange:'CFFEX',main_contract:'IF2611'});
 i.barSets.IF={contract:'IF2611',bars:i.barSets.CU.bars.map(b=>({...b,symbol:'IF2611'}))};
 const r=buildPostmarketReview(i,'month-week-day');assert.equal(r.rows.length,0);assert.equal(r.market.total,2);assert.match(postmarketReportHtml({...r,id:'empty'}),/本周期没有候选/);assert.equal(r.changes.available,false);
});
test('缺历史不能对照，只有相邻交易日同规则同模式才能比较',()=>{
 const i=fixture(),r=buildPostmarketReview(i,'month-week-day');const p={...r,date:calendar.previousDate,rows:[{...r.rows[0],judgment:'正常回撤'}, {...r.rows[1],code:'AL'}]};
 const next=buildPostmarketReview(i,'month-week-day',p);assert.deepEqual(next.changes.new,['ZN']);assert.deepEqual(next.changes.exit,['AL']);assert.deepEqual(next.changes.improved,['CU']);
 assert.equal(buildPostmarketReview(i,'month-week',p).changes.available,false);assert.equal(buildPostmarketReview(i,'month-week-day',{...p,ruleVersion:'旧版'}).changes.available,false);
});
test('节假日前值与周/月完成状态按现有交易日历，不按自然日',()=>{
 assert.equal(calendar.previousDate,'2026-10-08');assert.equal(calendar.nextDate,'2026-10-12');assert.equal(calendar.weekState,'本周已完成');assert.match(calendar.monthState,/动态/);
 assert.equal(reviewCalendar(days,new Date('2026-10-09T06:00:00Z')).targetDate,'2026-10-08');assert.throws(()=>reviewCalendar(days,new Date('2027-01-01')),/未覆盖/);
});
test('报告渲染转义证据和模型内容，不执行来源文本',()=>{
 const r=buildPostmarketReview(fixture(),'month-week-day');r.rows[0].name='<img src=x onerror=alert(1)>';r.ai={status:'completed',text:'<script>bad()</script>'};
 const dom=new JSDOM(postmarketReportHtml(r));assert.equal(dom.window.document.querySelectorAll('img,script').length,0);assert.match(dom.window.document.body.textContent,/<script>/);dom.window.close();
});
const temp=async()=>{await mkdir('.runtime/test-postmarket',{recursive:true});return mkdtemp(resolve('.runtime/test-postmarket/run-'))};
test('只分析不落盘，主动保存才持久化；重复保存幂等，重启历史可读',async()=>{
 const i=fixture(),directory=await temp();let calls=0;
 const service=createPostmarketReview({directory,getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>{calls++;return i.barSets},refreshScan:async()=>{throw Error('不应刷新')}});
 const a=service.start('month-week-day'),b=service.start('month-week');assert.equal(a.id,b.id);assert.equal(b.reused,true);assert.equal((await service.status(a.id)).status,'running');await service.wait();
 const r=await service.result(a.id);assert.equal(calls,1);assert.equal(r.ai.status,'not-configured');assert.equal((await service.history()).length,0);assert.deepEqual(await readdir(directory),[]);
 assert.equal(r.saved,false);assert.equal(service.current(),null);
 await assert.rejects(()=>createPostmarketReview({directory}).result(a.id),/不存在/);
 const [s1,s2]=await Promise.all([service.save(a.id),service.save(a.id)]);assert.equal(s1.savedAt,s2.savedAt);assert.equal(s1.saved,true);assert.equal((await service.history()).length,1);
 assert.equal((await service.save(a.id)).savedAt,s1.savedAt);assert.equal((await readdir(directory)).filter(x=>!x.startsWith('.')).length,1);
 const restored=createPostmarketReview({directory});assert.equal((await restored.result(a.id)).inputHash,r.inputHash);assert.equal(JSON.parse(await readFile(join(directory,a.id,'input.json'),'utf8')).scan.rule_version,i.scan.rule_version);
});
test('旧数据复用刷新流程，刷新失败保留旧缓存且不输出假成功',async()=>{
 for(const failed of [false,true]){
  const i=fixture(),directory=await temp();let scan={...i.scan,data_date:'2026-10-08',target_date:'2026-10-08'},refreshed=0;
  const service=createPostmarketReview({directory,getScan:async()=>scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets,pollMs:1,refreshScan:async()=>{refreshed++;scan=failed?{...scan,refreshError:'隔离刷新失败'}:i.scan}});
  const j=service.start();await service.wait();assert.equal(refreshed,1);assert.equal((await service.status(j.id)).status,failed?'failed':'completed');
  if(failed){assert.equal(scan.data_date,'2026-10-08');await assert.rejects(()=>service.result(j.id));}else assert.equal((await service.result(j.id)).date,calendar.targetDate);
 }
});
test('扫描读取期间改变，整次失败，不生成混杂报告',async()=>{
 const i=fixture(),directory=await temp();let scan=i.scan;
 const service=createPostmarketReview({directory,getScan:async()=>scan,getCalendar:async()=>calendar,getBars:async()=>{scan={...scan,refreshedAt:'changed'};return i.barSets}});
 const j=service.start();await service.wait();assert.match((await service.status(j.id)).error,/变化/);await assert.rejects(()=>service.result(j.id));
});
test('部分缺失与AI失败保留全部名单和计算；重启中断可重试',async()=>{
 const i=fixture(),directory=await temp();i.barSets.CU.bars.pop();
 const service=createPostmarketReview({directory,getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets,explain:async()=>{throw Error('API密钥等原始错误不能泄露')}});
 const j=service.start();await service.wait();const r=await service.result(j.id);assert.equal(r.rows.length,2);assert.equal(r.ai.status,'failed');assert.equal((await service.status(j.id)).status,'partial');assert.ok(!JSON.stringify(r).includes('API密钥'));
 await service.save(j.id);await writeFile(join(directory,j.id,'status.json'),JSON.stringify({...await service.status(j.id),status:'running'}));const restored=createPostmarketReview({directory});assert.equal((await restored.status(j.id)).status,'interrupted');assert.equal((await restored.history()).length,0);
});
test('可用AI只回填解释，既有计算和输入哈希不被模型改变',async()=>{
 const i=fixture(),directory=await temp(),expected=buildPostmarketReview(i,'month-week-day');
 const service=createPostmarketReview({directory,getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets,explain:async r=>{r.rows[0].dayReturn=999;return {text:'隔离AI解释',model:'fake',provider:'test'}}});
 const j=service.start();await service.wait();const r=await service.result(j.id);assert.equal(r.ai.status,'completed');assert.equal(r.rows[0].dayReturn,expected.rows[0].dayReturn);assert.equal(r.reviewVersion,REVIEW_VERSION);
});

test('保存失败不进历史且不丢草稿，修复目录后可以重试',async()=>{
 const directory=await temp(),blocked=join(directory,'blocked');await writeFile(blocked,'not a directory');
 const i=fixture(),service=createPostmarketReview({directory:blocked,getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets}),job=service.start();await service.wait();
 assert.equal((await service.status(job.id)).status,'completed');await assert.rejects(()=>service.save(job.id));assert.equal((await service.result(job.id)).saved,false);assert.equal((await service.history()).length,0);
 await rename(blocked,blocked+'.backup');await service.save(job.id);assert.equal((await service.history()).length,1);
});

test('历史只列完成保存，按保存时间倒序；兼容此前自动保存的报告',async()=>{
 const i=fixture(),directory=await temp(),service=createPostmarketReview({directory,getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets});
 const first=service.start();await service.wait();const second=service.start('week-day');await service.wait();
 await service.save(second.id);await new Promise(r=>setTimeout(r,5));await service.save(first.id);
 assert.deepEqual((await service.history()).map(j=>j.id),[first.id,second.id]);
 const old=await service.status(second.id);delete old.saved;delete old.savedAt;delete old.savePolicy;await writeFile(join(directory,second.id,'status.json'),JSON.stringify(old));
 const restored=createPostmarketReview({directory});assert.equal((await restored.history()).length,2);assert.equal((await restored.result(second.id)).saved,true);
 await assert.rejects(()=>service.save('../bad'),/不存在/);
});

test('AI还在分析不能保存半成品，计算先可读，完整后才允许保存',async()=>{
 const i=fixture(),directory=await temp();let finish,started;const ready=new Promise(r=>started=r);
 const service=createPostmarketReview({directory,getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets,explain:async()=>{started();return new Promise(r=>finish=r)}});
 const job=service.start();await ready;assert.equal(service.current().id,job.id);assert.equal((await service.result(job.id)).ai.status,'pending');await assert.rejects(()=>service.save(job.id),/尚未完成/);
 finish({text:'完成解释'});await service.wait();await service.save(job.id);assert.equal((await service.result(job.id)).ai.text,'完成解释');
});

test('已保存入口和空历史均不启动分析；保存按钮显式调用保存接口',async()=>{
 const r={...buildPostmarketReview(fixture(),'month-week-day'),id:'12345678-1234-1234-1234-123456789012'},dom=new JSDOM('<button id="postmarketReview"></button><button id="postmarketSaved"></button><dialog><h2></h2><div id="body"></div></dialog>'),doc=dom.window.document,modal=doc.querySelector('dialog'),original=globalThis.document;globalThis.document=doc;
 modal.showModal=()=>modal.open=true;modal.close=()=>{modal.open=false;modal.dispatchEvent(new dom.window.Event('close'))};let saved=false,posts=0,saves=0;
 const job=()=>({id:r.id,date:r.date,modeLabel:r.modeLabel,status:'completed',stage:saved?'已保存':'分析完成 · 未保存',saved,createdAt:'2026-10-09T08:00:00Z'});
 const api=async(path,opt)=>{if(path.endsWith('/save')){saves++;saved=true;return job()}if(opt?.method==='POST'){posts++;return job()}if(path.endsWith('/current'))return null;if(path.endsWith('/result'))return {...r,saved};if(path.endsWith(r.id))return job();return saved?[job()]:[]};
 try{
  createPostmarketUI({api,modal,title:doc.querySelector('h2'),body:doc.querySelector('#body'),getMode:()=>r.mode,getFire:()=>({}),toast:()=>{}}).bind();
  await doc.querySelector('#postmarketSaved').onclick();assert.equal(posts,0);assert.match(doc.body.textContent,/还没有/);modal.close();
  await doc.querySelector('#postmarketReview').onclick();assert.equal(posts,1);assert.equal(saves,0);assert.equal(doc.querySelector('#postmarketSave').disabled,false);
  await doc.querySelector('#postmarketSave').onclick();assert.equal(saves,1);assert.equal(doc.querySelector('#postmarketSave').textContent,'已保存');modal.close();
  await doc.querySelector('#postmarketSaved').onclick();assert.equal(posts,1);assert.equal(doc.querySelectorAll('[data-review-report]').length,1);assert.equal(doc.querySelector('#postmarketSave').disabled,true);modal.close();
 }finally{globalThis.document=original;dom.window.close()}
});

test('复盘窗口关闭后的迟到响应不启动新任务，重复打开只建一个窗口',async()=>{
 const dom=new JSDOM('<button id="postmarketReview"></button><dialog><h2></h2><div id="body"></div></dialog>'),doc=dom.window.document,modal=doc.querySelector('dialog');
 const original=globalThis.document;globalThis.document=doc;let resolveHistory,posts=0;
 modal.showModal=()=>modal.open=true;modal.close=()=>{modal.open=false;modal.dispatchEvent(new dom.window.Event('close'))};
 try{
  const ui=createPostmarketUI({api:async(path,opt)=>{if(opt?.method==='POST')posts++;return new Promise(r=>resolveHistory=r)},modal,title:doc.querySelector('h2'),body:doc.querySelector('#body'),getMode:()=> 'month-week-day',getFire:()=>({refreshing:false}),toast:()=>{}});ui.bind();
  const click=doc.querySelector('button').onclick;const opened=click();await click();modal.close();resolveHistory([]);await opened;
  assert.equal(posts,0);assert.equal(modal.classList.contains('postmarket-dialog'),false);assert.equal(doc.querySelector('button').disabled,false);
 }finally{globalThis.document=original;dom.window.close()}
});
