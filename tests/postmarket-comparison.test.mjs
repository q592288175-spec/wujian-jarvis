import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {JSDOM} from 'jsdom';
import {buildThreeModeReview,reviewCalendar,createPostmarketReview,reviewMarkdown} from '../integrations/postmarket-review.mjs';
import {postmarketReportHtml} from '../dist/postmarket-review.js';
import {POSTMARKET_PROMPT,loadPostmarketEvidence,explainPostmarketReport,explanationProblems} from '../integrations/postmarket-evidence.mjs';

const days=['2026-09-29','2026-09-30','2026-10-08','2026-10-09','2026-10-12','2026-10-13','2026-10-14'],calendar=reviewCalendar(days,new Date('2026-10-13T08:00:00Z'));
const modes=['month-week-day','month-week','week-day'];
function fixture(){
 const rows=['CU','AL','ZN','NI'].map((code,i)=>({code,name:code,exchange:'SHFE',main_contract:code+'2611',data_date:calendar.targetDate,data_source:'隔离正式数据',month_direction:'上升',week_direction:'上升',day_direction:'上升',day_ma10:90,modes:Object.fromEntries(modes.map((mode,n)=>[mode,i===0?'多头观察':i===1?n===2?'未纳入':'多头观察':i===2?n===2?'空头观察':'未纳入':'未纳入']))}));
 const barSets=Object.fromEntries(rows.map((row,i)=>[row.code,{contract:row.main_contract,bars:days.slice(0,6).map((date,n)=>({date,open:100,high:115,low:90,close:i===2?110-n:i===3?100:100+n,volume:12000,openInterest:15000+n,source:'隔离正式数据'}))}]));
 return {scan:{status:'ready',target_date:calendar.targetDate,data_date:calendar.targetDate,rule_version:'fixture',rows},barSets,calendar};
}
test('三个模式独立多空统计、去重、两两交集与未入选差异',()=>{
 const input=fixture(),original=structuredClone(input),r=buildThreeModeReview(input);
 assert.equal(r.rows.length,3);assert.deepEqual(r.modeStats.map(s=>[s.long,s.short]),[[2,0],[2,0],[1,1]]);
 assert.equal(r.overlap.three,1);assert.equal(r.overlap.two,1);assert.equal(r.overlap.one,1);assert.deepEqual(r.overlap.pairs.map(p=>p.count),[2,1,1]);
 assert.equal(r.markets[0].sample,4);assert.deepEqual([r.markets[0].up,r.markets[0].down,r.markets[0].flat],[2,1,1]);assert.equal(r.rows[1].membership['week-day'].status,'未纳入');
 assert.match(r.rows[1].membership['week-day'].reason,/日MA10/);assert.deepEqual(input,original);
});
test('缺失不计持平，方向冲突不混入多空重点',()=>{
 const input=fixture();input.barSets.CU.bars.pop();input.scan.rows[1].modes['week-day']='空头观察';const r=buildThreeModeReview(input);
 assert.equal(r.overlap.conflict,1);assert.equal(r.rows.find(v=>v.code==='AL').direction,'conflict');assert.equal(r.markets[0].missing,1);assert.equal(r.markets[0].flat,1);
 assert.ok(!r.focus.long.includes('AL')&&!r.focus.short.includes('AL'));assert.equal(r.modeStats[0].sides[0].missing,1);
});
test('整合报告HTML和Markdown覆盖全部候选、三模式表和来源转义',()=>{
 const r={...buildThreeModeReview(fixture()),id:'fixture'};r.rows[0].name='<script>bad</script>';
 const dom=new JSDOM(postmarketReportHtml(r));assert.equal(dom.window.document.querySelectorAll('script').length,0);assert.equal(dom.window.document.querySelectorAll('[data-review-comparison-table] tbody tr').length,3);assert.equal(dom.window.document.querySelectorAll('[data-review-mode-stats] tbody tr').length,6);dom.window.close();
 const md=reviewMarkdown(r);assert.match(md,/候选对照/);assert.match(md,/三模式统计/);assert.match(md,/差异依据/);
});
test('整合任务冻结三模式和证据、仅显式保存，重启读回相同输入',async()=>{
 await mkdir('.runtime/test-postmarket',{recursive:true});const directory=await mkdtemp(resolve('.runtime/test-postmarket/compare-')),i=fixture();
 const service=createPostmarketReview({directory,getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets,getEvidence:async()=>({status:'ok',items:[{title:'隔离证据'}],products:[],missing:[]})});
 const j=service.start('all');await service.wait();assert.deepEqual(await readdir(directory),[]);assert.equal((await service.status(j.id)).status,'completed');
 await service.save(j.id);const frozen=JSON.parse(await readFile(join(directory,j.id,'input.json'),'utf8'));assert.equal(frozen.evidence.items[0].title,'隔离证据');
 assert.equal((await createPostmarketReview({directory}).result(j.id)).modeStats.length,3);
});
test('任一模式候选陈旧触发刷新，无候选仍呈现全样本统计',async()=>{
 const i=fixture();i.scan.rows[2].data_date='2026-10-12';let refresh=0;
 const service=createPostmarketReview({getScan:async()=>i.scan,getCalendar:async()=>calendar,getBars:async()=>i.barSets,pollMs:1,refreshScan:async()=>{refresh++;i.scan.rows[2].data_date=calendar.targetDate}});
 const j=service.start('all');await service.wait();assert.equal(refresh,1);assert.equal((await service.result(j.id)).rows.length,3);
 for(const row of i.scan.rows)for(const mode of modes)row.modes[mode]='未纳入';const empty=buildThreeModeReview(i);assert.equal(empty.rows.length,0);assert.equal(empty.market.sample,4);
});
test('官方正文失败与缺产业记录显式缺口，不拿未来资料解释当日',async()=>{
 const r=buildThreeModeReview(fixture());const e=await loadPostmarketEvidence(r,{collect:async()=>({items:[],providers:[],documents:[]}),dbPath:resolve('.runtime/not-a-db.sqlite'),search:async()=>({items:[{title:'CU未来资料',url:'https://www.shfe.com.cn/notice'}]}),read:async()=>({url:'https://www.shfe.com.cn/notice',text:'发布时间：2026-10-14 CU市场资料'})});
 assert.equal(e.items.length,0);assert.equal(e.products.length,3);assert.ok(e.missing.length);assert.equal(e.status,'partial');assert.match(POSTMARKET_PROMPT,/三模式/);assert.match(POSTMARKET_PROMPT,/不等于资金净流入/);
});
test('相关且有日期的正文纳入证据，无关通知不占位',async()=>{
 const r=buildThreeModeReview(fixture()),args={collect:async()=>({items:[],providers:[],documents:[]}),dbPath:resolve('.runtime/not-a-db.sqlite'),search:async()=>({items:[{title:'节假日安排',url:'https://www.shfe.com.cn/holiday'},{title:'CU库存更新',url:'https://www.shfe.com.cn/inventory'}]}),read:async()=>({url:'https://www.shfe.com.cn/inventory',text:'发布时间：2026-10-13 CU库存更新'})};
 const e=await loadPostmarketEvidence(r,args);assert.equal(e.items.length,1);assert.equal(e.items[0].classification,'复盘日资料');assert.equal(e.items[0].id,'S1');assert.equal(e.items[0].title,'CU库存更新');assert.match(e.prompt,/不自行猜测/);
});
test('AI称三周期同向与冻结方向冲突时重写，仍冲突则拒绝解释',async()=>{
 const r=buildThreeModeReview(fixture());r.rows[0].trend.day='下降';const wrong='CU月周日均线向上。';assert.equal(explanationProblems(wrong,r).length,1);
 let calls=0;const fixed=await explainPostmarketReport(r,async()=>({text:++calls===1?wrong:'CU顺势推进，下一日观察今日高低点。',totalTokens:10}));assert.equal(calls,2);assert.equal(fixed.totalTokens,20);
 await assert.rejects(()=>explainPostmarketReport(r,async()=>({text:wrong})),/冲突/);assert.ok(explanationProblems('参考[S999]。',r).length);
 assert.ok(explanationProblems('CU站稳100则验证。',r).length);assert.ok(explanationProblems('CU日MA10 90。',r).length);
});
