import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createOperationArchive} from '../integrations/operation-archive.mjs';
import {checkTradeMarket} from '../integrations/trade-market-check.mjs';

mkdirSync(resolve('.runtime/test-trade'),{recursive:true});
const root=mkdtempSync(resolve('.runtime/test-trade/run-'));
process.env.WUJIAN_WORKBENCH_DB=join(root,'business.sqlite');
const w=await import('../integrations/five-workbench.mjs');
w.listAccounts();
const fixtureDb=new DatabaseSync(process.env.WUJIAN_WORKBENCH_DB);
function fixture(direction='short',equity=1100000){
 const a=w.saveAccount({alias:'隔离验收账户-'+randomUUID(),mode:'real',equity,tier:'normal'});
 const c=w.saveCard({name:'烧碱',symbol:'SH',contract:'SH2611',direction,accountId:a.id});
 // Isolated approved-plan fixture: actual permission gates have separate integration tests.
 const p={direction,mainCycle:'day',entry:direction==='short'?1200:1240,stop:direction==='short'?1240:1200,multiplier:30,accountEquity:equity,riskPercent:1,pairType:'穿10均线入场，平台止损',exitRule:'按计划退出'};
 const stamp=new Date().toISOString();
 fixtureDb.prepare('INSERT INTO plan_versions VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),c.id,1,JSON.stringify(p),JSON.stringify({lots:9,frozenBudget:11000}),'已批准','isolated-test',stamp,stamp);
 fixtureDb.prepare("UPDATE cards SET active_plan_version=1,status='已批准' WHERE id=?").run(c.id);
 return{a,c:w.getCard(c.id)};
}
const opening=(extra={})=>({requestId:randomUUID(),kind:'open',time:'2026-09-28T10:00',price:1200,quantity:9,stop:1240,notes:'入场记录',...extra});
const closing=(extra={})=>({requestId:randomUUID(),kind:'close',time:'2026-09-29T14:00',price:1160,quantity:9,reason:'止盈',netPnl:10000,notes:'实际净盈亏已含成本',...extra});
const balance=id=>w.listAccounts().find(a=>a.id===id).equity;

test('方向继承计划；开仓草稿不入账；重复平仓只入账一次',()=>{
 const {a,c}=fixture();const open=opening({action:'开多',direction:'long'});
 w.saveExecutionDraft(c.id,{kind:'execution',payload:open});
 assert.equal(balance(a.id),1100000);
 w.recordTrade(c.id,open);
 assert.equal(w.fullCard(c.id).executions[0].action,'开空');
 assert.equal(w.fullCard(c.id).trade.remainingLots,9);
 assert.deepEqual(w.fullCard(c.id).drafts,{});
 assert.equal(w.saveExecutionDraft(c.id,{kind:'execution',payload:open}).committed,true);
 const close=closing();w.recordTrade(c.id,close);
 assert.equal(balance(a.id),1110000);
 assert.equal(w.recordTrade(c.id,close).duplicate,true);
 assert.equal(balance(a.id),1110000);
 assert.throws(()=>w.recordTrade(c.id,{...close,netPnl:20000}),/已提交/);
 const t=w.fullCard(c.id).trade;
 assert.equal(t.realizedPnl,10000);assert.equal(t.remainingLots,0);assert.equal(t.outcome,'盈利');
 assert.equal(t.balanceBefore,1100000);assert.equal(t.balanceAfter,1110000);
 assert.equal(w.getCard(c.id).status,'已结束');
});
test('部分平仓、亏损和零盈亏；不得超量或倒序录入',()=>{
 const {a,c}=fixture();w.recordTrade(c.id,opening());
 assert.throws(()=>w.recordTrade(c.id,closing({quantity:10})),/超过/);
 assert.throws(()=>w.recordTrade(c.id,closing({time:'2026-09-27T10:00'})),/时间顺序/);
 assert.throws(()=>w.recordTrade(c.id,closing({netPnl:null})),/金额无效/);
 assert.equal(balance(a.id),1100000);
 w.recordTrade(c.id,closing({quantity:4,netPnl:-10000,reason:'止损'}));
 assert.equal(balance(a.id),1090000);assert.equal(w.fullCard(c.id).trade.remainingLots,5);
 assert.equal(w.getCard(c.id).status,'持仓中');
 w.recordTrade(c.id,closing({quantity:5,netPnl:0,time:'2026-09-30T10:00'}));
 assert.equal(balance(a.id),1090000);assert.equal(w.fullCard(c.id).trade.realizedPnl,-10000);
 assert.equal(w.fullCard(c.id).trade.outcome,'亏损');
});
test('盈亏更正只调整差额且保留原成交，多账户不串账',()=>{
 const {a,c}=fixture(),other=fixture('long');w.recordTrade(c.id,opening());
 const close=w.recordTrade(c.id,closing());
 const correction={requestId:randomUUID(),executionId:close.id,netPnl:-5000,reason:'核对结算单后更正'};
 w.correctTradePnl(c.id,correction);assert.equal(balance(a.id),1095000);
 w.correctTradePnl(c.id,correction);assert.equal(balance(a.id),1095000);
 assert.equal(balance(other.a.id),1100000);
 assert.equal(w.fullCard(c.id).executions.at(-1).payload.netPnl,10000);
 assert.equal(w.fullCard(c.id).trade.realizedPnl,-5000);
 assert.equal(w.fullCard(c.id).trade.ledger.at(-1).amount,-15000);
 assert.throws(()=>w.correctTradePnl(other.c.id,correction),/只能更正/);
});
test('连续加仓均价、保护调整和多头方向自动继承',()=>{
 const {a,c}=fixture('long');w.recordTrade(c.id,opening({quantity:2,price:1240,stop:1200}));
 w.recordTrade(c.id,opening({quantity:1,price:1270,stop:1220,time:'2026-09-28T11:00'}));
 assert.equal(w.fullCard(c.id).trade.averageEntry,1250);
 w.recordTrade(c.id,{requestId:randomUUID(),kind:'protection',time:'2026-09-29T10:00',stop:1230,notes:'上移保护'});
 assert.equal(w.fullCard(c.id).trade.stop,1230);assert.equal(balance(a.id),1100000);
 w.recordTrade(c.id,closing({quantity:3}));assert.equal(w.fullCard(c.id).executions.at(-1).action,'平多');
});
test('复盘三问自动保存、内容去重、保留版本且不改变账户',()=>{
 const {a,c}=fixture();const input={reviewMode:'simple',good:'严格按计划',bad:'犹豫了',next:'下次及时执行'};
 w.saveReview(c.id,input);w.saveReview(c.id,input);assert.equal(w.reviewForCard(c.id).length,1);
 w.saveReview(c.id,{...input,next:'先看环境，再执行'});assert.equal(w.reviewForCard(c.id).length,2);
 assert.equal(w.reviewForCard(c.id)[1].payload.next,'下次及时执行');assert.equal(balance(a.id),1100000);
});
test('账户变化让旧批准失效，下一计划按最新余额自动测算',()=>{
 const {a,c}=fixture();const second=w.saveCard({symbol:'SH',name:'烧碱',contract:'SH2612',direction:'short',accountId:a.id});
 w.recordTrade(c.id,opening());w.recordTrade(c.id,closing({netPnl:-10000}));
 const risk=w.calculateRisk({cardId:second.id,plan:{sizingMode:'simple',entry:1200,stop:1240,riskPercent:1,mainCycle:'day'}});
 assert.equal(risk.baseEquity,1090000);assert.equal(risk.riskCapLots,9);
 assert.equal(w.getCard(c.id).plan.status,'已失效');
 assert.throws(()=>w.saveAccount({...a,equity:1100000}),/账户金额已更新/);
 assert.throws(()=>w.saveCard({...w.getCard(c.id),direction:'long'}),/已有执行记录/);
});
test('未知余额和旧回报不能自动入账，未批准的真实开仓保存并标异常',()=>{
 const {a,c}=fixture('short',null);w.recordTrade(c.id,opening());
 assert.throws(()=>w.recordTrade(c.id,closing()),/金额未知/);assert.equal(balance(a.id),null);
 const plain=w.saveCard({symbol:'SH',name:'烧碱',direction:'short',accountId:a.id});
 const recorded=w.recordTrade(plain.id,opening());
 assert.ok(recorded.anomalies.some(x=>x.includes('有效批准')));
 assert.equal(w.fullCard(plain.id).trade.remainingLots,9);
 assert.equal(w.fullCard(plain.id).supervision.length,1);
 const old=fixture();w.addExecution(old.c.id,{externalId:'legacy-001',time:'2026-09-28T10:00',action:'开空',status:'全部成交',price:1200,quantity:1});
 assert.equal(w.fullCard(old.c.id).trade.remainingLots,null);
 const actual=w.recordTrade(old.c.id,closing({quantity:1}));
 assert.ok(actual.anomalies.some(x=>x.includes('尚未对账')));assert.equal(w.fullCard(old.c.id).trade.remainingLots,null);
 const reconciliation={requestId:randomUUID(),time:'2026-09-30T15:00',quantity:0,price:null,stop:null,direction:'short',reason:'原始结算回报核对：已平仓'};
 const before=balance(old.a.id);w.reconcileTradePosition(old.c.id,reconciliation);w.reconcileTradePosition(old.c.id,reconciliation);
 assert.equal(w.fullCard(old.c.id).trade.remainingLots,0);assert.equal(balance(old.a.id),before);
});
test('数据库事务失败不留下半笔成交或半笔资金',()=>{
 const {a,c}=fixture();w.recordTrade(c.id,opening());const before=w.fullCard(c.id).executions.length;
 fixtureDb.exec("CREATE TRIGGER test_reject_cash BEFORE INSERT ON account_entries WHEN NEW.kind='平仓盈亏' BEGIN SELECT RAISE(ABORT,'test failure'); END");
 try{assert.throws(()=>w.recordTrade(c.id,closing()),/test failure/)}finally{fixtureDb.exec('DROP TRIGGER test_reject_cash')}
 assert.equal(balance(a.id),1100000);assert.equal(w.fullCard(c.id).executions.length,before);
});
test('操作目录同步全部版本、资金流水和原文；重启后恢复',async()=>{
 const dir=join(root,'操作记录'),archive=createOperationArchive(dir,w.operationArchiveData);
 await Promise.all([archive.sync(),archive.sync(),archive.sync()]);assert.equal(archive.status().status,'ready');
 const data=JSON.parse(await readFile(join(dir,'全部记录.json'),'utf8'));
 assert.ok(data.cards.some(c=>c.planHistory.length));assert.ok(data.accountEntries.some(e=>e.kind==='盈亏更正'));
 assert.ok((await readFile(join(dir,'小木操作记录.md'),'utf8')).includes('先看环境，再执行'));
 assert.ok((await readFile(join(dir,'操作流水.jsonl'),'utf8')).includes('平空'));
 assert.ok((await readFile(join(dir,'账户资金流水.csv'),'utf8')).includes('-15000'));
 const restarted=spawnSync(process.execPath,['--input-type=module','-e',"const w=await import('./integrations/five-workbench.mjs');console.log(JSON.stringify(w.operationArchiveData()))"],{cwd:resolve('.'),env:process.env,encoding:'utf8'});
 assert.equal(restarted.status,0,restarted.stderr);
 const copy=JSON.parse(restarted.stdout);assert.deepEqual(copy.accountEntries,data.accountEntries);
 assert.equal(copy.cards.length,data.cards.length);assert.equal(copy.events.length,data.events.length);
});
test('导出失败不会谎报成功，恢复可写后自动重建',async()=>{
 const blocked=join(root,'blocked');await writeFile(blocked,'occupied');
 const archive=createOperationArchive(blocked,w.operationArchiveData);await archive.sync();
 assert.equal(archive.status().status,'error');await rename(blocked,blocked+'.old');await archive.sync();
 assert.equal(archive.status().status,'ready');
});
test('盘后核验只做价格提示：不推断同日成交，不把快照当完成日线',()=>{
 const t={remainingLots:9,direction:'short',averageEntry:1200,stop:1240,openedAt:'2026-09-28T02:00:00Z',lastTime:'2026-09-28T02:00:00Z'};
 const bar={date:'2026-09-28',close:1200,low:1190,high:1250};
 assert.equal(checkTradeMarket(t,[bar],{pointValue:30}).status,'insufficient');
 assert.equal(checkTradeMarket(t,[{...bar,date:'2026-09-29',provisional:true}],{pointValue:30}).status,'insufficient');
 const hit=checkTradeMarket(t,[{...bar,date:'2026-09-29',close:1180}],{pointValue:30});
 assert.equal(hit.status,'stop-touched');assert.equal(hit.referencePnl,5400);assert.equal(t.remainingLots,9);
 assert.equal(checkTradeMarket({...t,stop:null},[bar],{pointValue:30}).status,'unknown');
 assert.equal(checkTradeMarket({...t,remainingLots:0},[],{}).status,'flat');
});
