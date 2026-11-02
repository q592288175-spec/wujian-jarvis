import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {planFixture} from './helpers/plan-fixture.mjs';
const project=resolve('.'),root=planFixture(project);
process.chdir(root);process.env.WUJIAN_WORKBENCH_DB=join(root,'business.sqlite');process.env.WUJIAN_BUNDLE_ROOT=resolve(project,'../资料包');
delete process.env.WUJIAN_KNOWLEDGE_ROOT;delete process.env.WUJIAN_FIRE_SKILL_ROOT;
globalThis.fetch=async()=>{throw Error('隔离测试禁止网络')};
const w=await import(pathToFileURL(join(project,'integrations/five-workbench.mjs')));
const {ENTRY_PAIRS}=await import(pathToFileURL(join(project,'dist/position-sizing.js')));
const account=()=>w.saveAccount({alias:'隔离-'+randomUUID(),mode:'simulation',stageCapital:1e6,equity:1e6,tier:'normal'});
const card=a=>w.saveCard({accountId:a.id,name:'烧碱',symbol:'SH',contract:'SH2611',direction:'long'});
const plan={sizingMode:'simple',mainCycle:'day',entry:2000,stop:1900,riskPercent:1,pairType:ENTRY_PAIRS[0],exitRule:'按原计划退出',reviewer:'合成验收'};
const remove=c=>w.deleteCard(c.id,{token:w.cardRemovalPreview(c.id).token,confirmed:true,noOpenOrdersConfirmed:true,reason:'隔离测试，不执行'});
const open={kind:'open',time:'2026-10-12T09:10',price:2000,stop:1900,quantity:1};
test('纯研究、待确认计划均归档，不物理删除；三页面共用列表，账户隔离',async()=>{
 const a=account(),b=account(),c=card(a),other=card(b);w.saveCard({...c,water:{conclusion:'测试研究'}});
 assert.throws(()=>w.deleteCard(c.id),/确认/);remove(c);
 assert.equal(w.getCard(c.id).water.conclusion,'测试研究');assert.equal((await w.summary(a.id)).cards.length,0);assert.equal((await w.summary(a.id)).archivedCards.length,1);assert.equal((await w.summary(b.id)).cards[0].id,other.id);
 assert.ok(w.operationArchiveData().cards.some(x=>x.id===c.id));
 const p=card(a);await w.savePlan(p.id,plan);remove(p);assert.equal(w.fullCard(p.id).planHistory.length,1);assert.equal(w.getCard(p.id).plan.status,'已取消');
});
test('批准未成交可取消并释放预留，恢复不恢复批准、不重置轮次和冻结预算',async()=>{
 const a=account(),c=card(a);await w.savePlan(c.id,plan);await w.approvePlan(c.id);const before=w.getCard(c.id);
 remove(c);const d=new DatabaseSync(process.env.WUJIAN_WORKBENCH_DB);assert.ok(d.prepare('SELECT * FROM released_reservations WHERE plan_id=?').get(before.plan.id));
 const budget=d.prepare('SELECT * FROM round_budgets WHERE account_id=? AND round_id=?').get(a.id,c.roundId);const restored=w.restoreCard(c.id);
 assert.equal(restored.roundId,c.roundId);assert.equal(restored.accountId,a.id);assert.equal(restored.status,'观察');assert.equal(restored.plan.status,'已取消');assert.equal(restored.plan.approvedAt,before.plan.approvedAt);
 await assert.rejects(w.approvePlan(c.id),/已取消/);await w.savePlan(c.id,plan);await w.approvePlan(c.id);
 assert.deepEqual(d.prepare('SELECT * FROM round_budgets WHERE account_id=? AND round_id=?').get(a.id,c.roundId),budget);d.close();
});
test('有持仓、未确认委托、未知历史成交、待办异常均不能归档',async()=>{
 const a=account(),c=card(a);await w.savePlan(c.id,plan);await w.approvePlan(c.id);w.recordTrade(c.id,{...open,requestId:randomUUID()});assert.throws(()=>remove(c),/实际持仓/);
 const pending=card(account());w.addExecution(pending.id,{externalId:'order-1',time:'2026-10-12T09:00',status:'撤单待确认',action:'开多',quantity:1,price:2000});assert.throws(()=>remove(pending),/委托/);
 const unknown=card(account());w.addExecution(unknown.id,{externalId:'legacy-1',time:'2026-10-12T09:00',status:'全部成交',action:'开多',quantity:1,price:2000});assert.throws(()=>remove(unknown),/待对账/);
 const issue=card(account());w.recordIssue({cardId:issue.id,owner:'earth',description:'待核验',nextAction:'核对回报'});assert.throws(()=>remove(issue),/异常/);
});
test('移除预览后有修改必须重新确认，失败不留下半条归档',()=>{
 const c=card(account()),preview=w.cardRemovalPreview(c.id);w.saveCard({...c,water:{conclusion:'已变更'}});
 assert.throws(()=>w.deleteCard(c.id,{token:preview.token,confirmed:true,noOpenOrdersConfirmed:true,reason:'测试'}),/已变化/);assert.equal(w.getCard(c.id).archivedAt,null);
});
test('已平仓历史归档保留盈亏、执行、复盘和审计；恢复继续占用原轮次亏损',async()=>{
 const a=account(),c=card(a);await w.savePlan(c.id,plan);await w.approvePlan(c.id);const approved=Date.parse(w.getCard(c.id).plan.approvedAt);w.recordTrade(c.id,{...open,time:new Date(approved+1000).toISOString(),requestId:randomUUID()});
 w.recordTrade(c.id,{kind:'close',requestId:randomUUID(),time:new Date(approved+2000).toISOString(),price:1900,quantity:1,netPnl:-3000,reason:'止损'});w.saveReview(c.id,{reviewMode:'simple',good:'执行保护',bad:'测试',next:'观察'});
 const before=w.fullCard(c.id);remove(c);const after=w.fullCard(c.id);assert.deepEqual(after.executions,before.executions);assert.deepEqual(after.reviews,before.reviews);assert.deepEqual(after.trade,before.trade);assert.deepEqual(after.account,before.account);
 w.restoreCard(c.id);await w.savePlan(c.id,plan);const next=await w.approvePlan(c.id);assert.equal(next.plan.risk.roundUsed,3000);assert.equal(next.plan.risk.frozenBudget,9970);assert.equal(next.plan.risk.lots,2);
});
test('归档后补录实际成交自动重新显示，即使账户停用；失败或重复回报不改变归档',()=>{
 const a=account(),c=card(a);remove(c);w.deleteOrDisableAccount(a.id,{confirmed:true});
 assert.throws(()=>w.recordTrade(c.id,{...open,quantity:-1,requestId:randomUUID()}),/正整数/);assert.ok(w.getCard(c.id).archivedAt);
 const r=w.recordTrade(c.id,{...open,requestId:randomUUID()});assert.equal(r.card.archivedAt,null);assert.equal(r.card.trade.remainingLots,1);assert.ok(r.anomalies.length);
});
test('归档卡禁止后台覆盖研究、冻结或批准；火重新添加先提示恢复原卡',async()=>{
 const a=account(),c=await w.selectFireCandidate({accountId:a.id,code:'SH',mode:'month-week-day'});remove(c);
 assert.throws(()=>w.saveCard({...c,water:{}}),/归档/);await assert.rejects(w.savePlan(c.id,plan),/归档/);
 const selected=await w.selectFireCandidate({accountId:a.id,code:'SH',mode:'month-week-day'});assert.equal(selected.id,c.id);assert.equal(selected.restoreRequired,true);
});
test('交接预览只读，确认绑定版本和风险，余额变化后不得使用旧确认',async()=>{
 const a=account(),c=card(a);await w.savePlan(c.id,plan);const before=w.getCard(c.id),preview=await w.approvePlan(c.id,{preview:true,planId:before.plan.id});assert.deepEqual(w.getCard(c.id),before);assert.equal(preview.risk.lots,3);
 w.syncAccountBalance(a.id,{balance:1000010,sourcePage:'隔离测试'});await assert.rejects(w.approvePlan(c.id,{planId:preview.planId,confirmationHash:preview.confirmationHash}),/账户金额/);assert.equal(w.getCard(c.id).plan.approvedAt,null);
});
test('并行修改旧确认拒绝；正常确认仍保留两步审计',async()=>{
 const a=account(),c=card(a);await w.savePlan(c.id,plan);const preview=await w.approvePlan(c.id,{preview:true});
 await w.savePlan(c.id,{...plan,entry:2010});await assert.rejects(w.approvePlan(c.id,{planId:preview.planId,confirmationHash:preview.confirmationHash}),/计划已更新/);
 const next=await w.approvePlan(c.id,{preview:true});const result=await w.approvePlan(c.id,{planId:next.planId,confirmationHash:next.confirmationHash});assert.equal(result.plan.status,'已批准');
 assert.ok(w.fullCard(c.id).timeline.some(x=>x.action==='冻结计划'));assert.ok(w.fullCard(c.id).timeline.some(x=>x.action==='人工批准'));
});
test('确认期间别卡占用风险，不能沿用旧手数批准',async()=>{
 const a=account(),first=card(a),second=card(a);await w.savePlan(first.id,plan);const preview=await w.approvePlan(first.id,{preview:true});
 await w.savePlan(second.id,{...plan,riskPercent:.3});await w.approvePlan(second.id);
 await assert.rejects(w.approvePlan(first.id,{planId:preview.planId,confirmationHash:preview.confirmationHash}),/风险占用已变化/);
 assert.equal(w.getCard(first.id).plan.approvedAt,null);const next=await w.approvePlan(first.id,{preview:true});assert.equal(next.risk.lots,2);
});
test('旧轮次差异逐文件可查，不自动换规则，不改旧快照；新增风险保持拦截',async()=>{
 const before=w.systemGovernance().active,original=readFileSync('scripts/fire_scan.py','utf8');writeFileSync('scripts/fire_scan.py',original+'\n# isolated change\n');
 try{const rules=await w.ruleRegistry();assert.equal(rules.sourceChanged,true);assert.ok(rules.differences.some(x=>x.name==='动态月行情适配'));assert.deepEqual(w.systemGovernance().active,before);await assert.rejects(w.savePlan(card(account()).id,plan),/框架发生变化/)}finally{writeFileSync('scripts/fire_scan.py',original)}
});
