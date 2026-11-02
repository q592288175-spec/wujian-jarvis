import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,copyFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const source=resolve('.');
mkdirSync('.runtime/test-governance',{recursive:true});
const root=mkdtempSync(resolve('.runtime/test-governance/run-'));
mkdirSync(join(root,'scripts'),{recursive:true});copyFileSync(join(source,'scripts/fire_scan.py'),join(root,'scripts/fire_scan.py'));
for(const f of ['docs/fire-resonance-rule-v2.6.md','docs/automatic-environment.md','docs/system-run.md','integrations/five-workbench.mjs','integrations/team-governance.mjs','integrations/trade-ledger.mjs','integrations/approval-boundary.mjs','integrations/environment.mjs','integrations/resonance-rule.mjs','integrations/simple-sizing.mjs','dist/position-sizing.js']){mkdirSync(dirname(join(root,f)),{recursive:true});copyFileSync(join(source,f),join(root,f))}
process.chdir(root);process.env.WUJIAN_WORKBENCH_DB=join(root,'business.sqlite');process.env.WUJIAN_BUNDLE_ROOT=resolve(source,'../资料包');
for(const f of ['docs/gold-methods-2026-10-19.md','docs/gold-intraday-2026-10-26.md','dist/gold-methods.js','integrations/gold-planning.mjs']){mkdirSync(dirname(join(root,f)),{recursive:true});copyFileSync(join(source,f),join(root,f))}
delete process.env.WUJIAN_KNOWLEDGE_ROOT;delete process.env.WUJIAN_FIRE_SKILL_ROOT;
globalThis.fetch=async()=>{throw Error('隔离验收禁止网络')};
for(const d of ['.runtime/fire-scan/.wujian-futures-multi-cycle-scan','.runtime/fire-scan/contract-bars','.runtime/environment'])mkdirSync(d,{recursive:true});
const cutoff='2026-09-30',bars=Array.from({length:400},(_,i)=>{const d=new Date('2025-08-27');d.setUTCDate(d.getUTCDate()+i);return{date:d.toISOString().slice(0,10),open:100+i,close:100+i,high:101+i,low:99+i}}).filter(x=>x.date<=cutoff);
const row={code:'SH',name:'烧碱（合成验收）',main_contract:'SH2611',data_date:cutoff,volume_date:cutoff,open_interest_date:cutoff,volume:50000,open_interest:50000,ok:true,month_direction:'上升',week_direction:'上升',day_direction:'上升'};
Object.assign(row,{month_ma10:110,previous_month_ma10:100,week_ma10:110,previous_week_ma10:100,day_ma10:110,previous_day_ma10:100});
writeFileSync('.runtime/fire-scan/.wujian-futures-multi-cycle-scan/test.json',JSON.stringify({scan_date:cutoff,data_date:cutoff,target_date:cutoff,rows:[row]}));
writeFileSync('.runtime/fire-scan/contract-bars/SH2611.json',JSON.stringify(bars));
writeFileSync('.runtime/environment/commodity-index.json',JSON.stringify({name:'合成指数',source:'合成测试',fetchedAt:new Date().toISOString(),bars}));
const w=await import(pathToFileURL(join(source,'integrations/five-workbench.mjs')));
const {ENTRY_PAIRS}=await import(pathToFileURL(join(source,'dist/position-sizing.js')));
const {constrainApproval}=await import(pathToFileURL(join(source,'integrations/approval-boundary.mjs')));
const a=()=>w.saveAccount({alias:'隔离账户-'+randomUUID(),mode:'simulation',stageCapital:1e6,equity:1e6,tier:'normal'});
const c=account=>w.saveCard({symbol:'SH',name:'烧碱',contract:'SH2611',direction:'long',accountId:account.id});
const p={sizingMode:'simple',mainCycle:'day',entry:2000,stop:1900,riskPercent:1,pairType:ENTRY_PAIRS[0],exitRule:'退出',reviewer:'本人自检'};
const open=(n=3)=>({requestId:randomUUID(),kind:'open',time:'2026-09-30T10:00',price:2000,stop:1900,quantity:n});
test('正常批准、拒绝留痕、预算上限与重复批准',async()=>{
 const account=a(),card=c(account);await w.savePlan(card.id,p);const approved=await w.approvePlan(card.id);
 assert.equal(approved.plan.risk.lots,3);assert.equal(approved.plan.risk.permission,false);
 const events=w.operationArchiveData().events.length;await w.approvePlan(card.id);assert.equal(w.operationArchiveData().events.length,events);
 const over=c(a());await w.savePlan(over.id,{...p,riskPercent:2});await assert.rejects(w.approvePlan(over.id),/权限/);
 assert.ok(w.fullCard(over.id).timeline.some(x=>x.action==='批准未通过'));
 const legacy=c(a());await w.savePlan(legacy.id,{mainCycle:'day',entry:2000,stop:1900,multiplier:30,costPerLot:0,frozenBudget:20000,marginCapLots:100,liquidityCapLots:100,trigger:'测试',entryWindow:'测试',validUntil:'2099-01-01',holdRule:'测试',exitRule:'测试',eventAction:'测试',reviewer:'本人'});
 await assert.rejects(w.approvePlan(legacy.id),/冻结预算超过/);
});
test('同品种多卡与并发批准不能重复占用额度；账户隔离',async()=>{
 const account=a(),first=c(account),second=c(account);await w.savePlan(first.id,p);await w.savePlan(second.id,p);
 const result=await Promise.allSettled([w.approvePlan(first.id),w.approvePlan(second.id)]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 const other=c(a());await w.savePlan(other.id,p);assert.equal((await w.approvePlan(other.id)).plan.risk.lots,3);
});
test('失效与超量成交照实保存；方向异常可记，保护退出不等待AI',async()=>{
 const account=a(),card=c(account);await w.savePlan(card.id,p);await w.approvePlan(card.id);w.saveAccount({...account,stopped:true});
 const trade=w.recordTrade(card.id,open(6));assert.ok(trade.anomalies.some(x=>x.includes('停机')));assert.ok(trade.anomalies.some(x=>x.includes('累计开仓')));
 w.recordTrade(card.id,{requestId:randomUUID(),kind:'protection',time:'2026-09-30T11:00',stop:1950});
 w.recordTrade(card.id,{requestId:randomUUID(),kind:'close',time:'2026-09-30T14:00',price:1950,quantity:6,reason:'止损',netPnl:-9000});
 assert.equal(w.fullCard(card.id).account.equity,991000);
 const wrong=c(a());const actual=w.recordTrade(wrong.id,{...open(1),actualDirection:'short',stop:2100});
 assert.equal(actual.card.executions[0].action,'开空');assert.ok(actual.anomalies.some(x=>x.includes('方向')));
});
test('运行快照持久化，职责一致；修改源不换框架，结束前不升档',async()=>{
 const before=await w.ruleRegistry(),run=w.systemGovernance().active;
 assert.ok(run);assert.equal(Object.keys(run.snapshot.responsibilities).length,5);
 const account=a();assert.throws(()=>w.saveAccount({...account,tier:'aggressive'}),/不能升档/);
 const path=resolve('docs/system-run.md'),old=readFileSync(path,'utf8');writeFileSync(path,old+'\n测试变更');
 const changed=await w.ruleRegistry();assert.equal(changed.combinedHash,before.combinedHash);assert.equal(changed.sourceChanged,true);
 await assert.rejects(w.savePlan(c(account).id,p),/框架发生变化/);writeFileSync(path,old);
 assert.throws(()=>w.endSystemRun('仍有异常'),/持仓|待处理|复盘|预留/);
 const connection=new DatabaseSync(process.env.WUJIAN_WORKBENCH_DB,{readOnly:true});assert.equal(connection.prepare("SELECT id FROM system_runs WHERE status='运行中'").get().id,run.id);connection.close();
});
test('组合池从登记计划汇总，盈利不补回已冻结的整轮预算',async()=>{
 const account=a(),card=c(account);await w.savePlan(card.id,p);await w.approvePlan(card.id);
 const target=w.getCard(card.id),connection=new DatabaseSync(process.env.WUJIAN_WORKBENCH_DB);
 const others=Array.from({length:5},(_,i)=>({...target,id:'synthetic-'+i,symbol:'TEST'+i,roundId:'other-'+i,plan:{...target.plan,id:'plan-'+i}}));
 const checked=constrainApproval(connection,target,account,target.plan.risk,others);
 assert.equal(checked.risk.poolRemaining,5000);assert.equal(checked.risk.lots,1);
 const richer={...account,equity:2000000};const again=constrainApproval(connection,target,richer,{...target.plan.risk,frozenBudget:20000,lots:6},[]);
 assert.equal(again.risk.frozenBudget,10000);assert.equal(again.risk.lots,3);connection.close();
});
test('冻结失败不改旧批准；释放未成交预留后新版本单独核算加仓',async()=>{
 const account=a(),card=c(account);await w.savePlan(card.id,p);await w.approvePlan(card.id);
 const before=w.getCard(card.id);await assert.rejects(w.savePlan(card.id,{...p,entry:2010}),/释放上一计划/);
 assert.deepEqual(w.getCard(card.id),before);
 w.recordTrade(card.id,open(1));w.releasePlan(card.id,'合成未成交委托已撤销');
 await w.savePlan(card.id,p);const next=await w.approvePlan(card.id);
 assert.equal(next.plan.version,2);assert.equal(next.plan.risk.lots,2);
 const actual=w.recordTrade(card.id,{...open(2),time:'2026-09-30T11:00'});
 assert.ok(!actual.anomalies.some(x=>x.includes('累计开仓')));assert.equal(actual.card.trade.remainingLots,3);
});
test('过期计划不能新增批准，实际缺保护与反向成交保留待核对事实',async()=>{
 const account=a(),card=c(account);await w.savePlan(card.id,{...p,validUntil:'2026-09-01'});
 await assert.rejects(w.approvePlan(card.id),/有效期/);
 const recorded=w.recordTrade(card.id,{...open(1),stop:null});assert.ok(recorded.anomalies.some(x=>x.includes('保护未设置')));
 const opposite=w.recordTrade(card.id,{...open(1),actualDirection:'short',stop:2100,time:'2026-09-30T11:00'});
 assert.ok(opposite.anomalies.some(x=>x.includes('反向持仓')));assert.equal(opposite.card.trade.remainingLots,null);
});
test('结束前核对全局持仓与事项，落地后才允许下一轮框架生效',async()=>{
 for(const card of w.listCards()){
  const t=w.fullCard(card.id).trade;
  if(t.requiresReconciliation)w.reconcileTradePosition(card.id,{requestId:randomUUID(),time:'2026-10-01T14:00',quantity:0,price:null,stop:null,direction:'short',reason:'合成回报核对已无持仓'});
  if(t.remainingLots>0)w.recordTrade(card.id,{requestId:randomUUID(),kind:'close',time:'2026-10-01T14:00',price:2000,quantity:t.remainingLots,reason:'主动退出',netPnl:0});
  if(t.openedLots)w.saveReview(card.id,{reviewMode:'simple',good:'实际记录',bad:'待改进',next:'下轮注意'});
  if(card.plan?.approvedAt)w.releasePlan(card.id,'隔离测试：合成委托已核对撤销');
 }
 for(const item of w.systemGovernance().issues)if(item.status==='待处理')w.recordIssue({id:item.id,resolution:'隔离验收已核对原始合成回报'});
 const old=w.systemGovernance().active;const ended=w.endSystemRun('本轮合成记录全部落地');assert.equal(ended.status,'已结束');assert.equal(w.systemGovernance().active,null);
 writeFileSync('docs/system-run.md',readFileSync('docs/system-run.md','utf8')+'\n下一轮测试修订');
 const next=await w.beginSystemRun();assert.notEqual(next.id,old.id);assert.notEqual(next.snapshot.combinedHash,old.snapshot.combinedHash);
});
