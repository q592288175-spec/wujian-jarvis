import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {planFixture} from './helpers/plan-fixture.mjs';
const project=resolve('.'),root=planFixture(project);
const file=join(root,'.runtime/fire-scan/contract-bars/SH2611.json'),series=JSON.parse(readFileSync(file));
Object.assign(series.at(-2),{open:2200,high:2240,low:2100,close:2120});Object.assign(series.at(-1),{open:2140,high:2210,low:2110,close:2130});writeFileSync(file,JSON.stringify(series));
process.chdir(root);process.env.WUJIAN_WORKBENCH_DB=join(root,'business.sqlite');process.env.WUJIAN_BUNDLE_ROOT=resolve(project,'../资料包');
globalThis.fetch=async()=>{throw Error('隔离验收禁止联网')};
const w=await import(pathToFileURL(join(project,'integrations/five-workbench.mjs'))),g=w.goldPlanning;
const newAccount=(equity=1e6)=>w.saveAccount({alias:'四法隔离-'+randomUUID(),mode:'simulation',stageCapital:equity,equity,tier:'normal'});
async function prepare(){
 const a=newAccount(),b=newAccount(2e6),card=w.saveCard({symbol:'SH',name:'烧碱',contract:'SH2611',direction:'long',accountId:a.id});
 const analysis=await g.analyze(card.id),method=await g.choose(card.id,{analysisId:analysis.id,confirmed:true,choice:{method:'anti-break',start:series.at(-2).date,end:series.at(-1).date}});
 const plan={mainCycle:'day',entryMin:2241,entryMax:2242,stop:2100,tradingDay:'2099-10-20',validUntil:'2099-10-20T15:00:00+08:00',structureConfirmed:true,exitRule:'隔离案例退出',accounts:[a,b].map(x=>({id:x.id,riskPercent:1,profileConfirmed:true,lots:null}))};
 return {a,b,card,analysis,method,plan};
}
const approve=(card,r)=>g.approve(card.id,{reviewId:r.id,confirmationHash:r.confirmationHash,confirmed:true});
test('分析与确认不创建计划，最终拍板一次保存多账户，重试不重复',async()=>{
 const x=await prepare();assert.equal(w.getCard(x.card.id).plan,null);
 const r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});assert.deepEqual(r.errors,[]);assert.equal(w.getCard(x.card.id).plan,null);
 assert.deepEqual(r.rows.map(x=>x.risk.lots),[2,4]);
 const done=await approve(x.card,r);assert.equal(done.planIds.length,2);assert.equal(w.getCard(x.card.id).plan.payload.stop,2100);
 const again=await approve(x.card,r);assert.deepEqual(again.planIds,done.planIds);
 assert.equal(w.getCard(x.card.id).plan.version,1);assert.equal(w.getCard(x.card.id).plan.risk.permission,false);
});
test('第二账户不合格，整份不能拍板，不留下第一账户批准',async()=>{
 const x=await prepare();w.saveAccount({...x.b,stopped:true});
 const r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});assert.ok(r.errors.some(e=>e.includes('停机')));
 await assert.rejects(approve(x.card,r),/缺口/);assert.equal(w.getCard(x.card.id).plan,null);
});
test('审定后任一账户余额变化，旧摘要失效；修正后重算',async()=>{
 const x=await prepare(),r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});
 w.syncAccountBalance(x.b.id,{equity:2200000,reason:'隔离余额校准'});
 await assert.rejects(approve(x.card,r),/已变化/);assert.equal(w.getCard(x.card.id).plan,null);
 const fresh=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});assert.equal(fresh.rows[1].equity,2200000);
 await approve(x.card,fresh);
});
test('改选手法后旧摘要不能沿用，未确认手法不可跳步',async()=>{
 const x=await prepare(),r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});
 await assert.rejects(g.choose(x.card.id,{analysisId:x.analysis.id,choice:{method:'anti-close'}}),/本人确认/);
 await g.choose(x.card.id,{analysisId:x.analysis.id,confirmed:true,choice:{method:'anti-close',start:series.at(-2).date,end:series.at(-1).date}});
 await assert.rejects(approve(x.card,r),/新版/);assert.equal(w.getCard(x.card.id).plan,null);
});
test('多账户事务中第二次写入失败，首账户、运行绑定和审计一并回滚',async()=>{
 const x=await prepare(),r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});
 const d=new DatabaseSync(join(root,'business.sqlite'));
 d.exec(`CREATE TRIGGER gold_test_failure BEFORE INSERT ON plan_versions WHEN (SELECT account_id FROM cards WHERE id=NEW.card_id)='${x.b.id}' BEGIN SELECT RAISE(ABORT,'模拟第二账户磁盘写入失败'); END;`);
 try{await assert.rejects(approve(x.card,r),/写入失败/);assert.equal(w.getCard(x.card.id).plan,null);assert.equal(w.listCards({accountId:x.b.id}).length,0)}finally{d.exec('DROP TRIGGER gold_test_failure');d.close()}
});
test('风险比例不是保证金：周线新版不能使用旧2%，手数只能调低',async()=>{
 const x=await prepare();x.plan.mainCycle='week';x.plan.accounts[0].riskPercent=2;
 let r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});assert.ok(r.errors.some(e=>e.includes('超过1%')));
 x.plan.accounts[0].riskPercent=1;x.plan.accounts[0].lots=999;
 r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});assert.ok(r.errors.some(e=>e.includes('审定手数')));
 x.plan.accounts[0].lots=1;r=await g.review(x.card.id,{methodId:x.method.id,plan:x.plan});assert.deepEqual(r.errors,[]);assert.equal(r.rows[0].risk.lots,1);
});

test('独立分时按最新余额0.5%，完整人工流程保留累计风险，改日K不能绕到1%',async()=>{
 const a=newAccount(),b=newAccount(2e6);w.syncAccountBalance(a.id,{equity:1100000,reason:'隔离验收：最新余额'});
 const card=w.saveCard({symbol:'SH',name:'烧碱独立分时（合成）',contract:'SH2611',direction:'long',accountId:a.id});
 const analysis=await g.analyze(card.id),day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 const choice={method:'intraday',start:series.at(-1).date,end:series.at(-1).date,intraday:{algorithm:'合成：已确认的当日均价线口径',confirmation:'cross',tradingDay:day,referenceAt:day+'T00:00',pivot:2190,stop:2189,environmentConfirmed:true,structureConfirmed:true}};
 const method=await g.choose(card.id,{analysisId:analysis.id,confirmed:true,choice});
 const plan={mainCycle:'small',entryMin:2200,entryMax:2201,stop:2189,tradingDay:day,validUntil:day+'T23:59:59+08:00',holdingMode:'intraday',holdingUntil:day+'T23:58:00+08:00',reentryRule:'合成：未另审不复入，同一机会累计',exitRule:'合成验收截止时刻不代表实际收盘，人工核对后离场',structureConfirmed:true,accounts:[a,b].map(x=>({id:x.id,riskPercent:.5,profileConfirmed:true,lots:null}))};
 let r=await g.review(card.id,{methodId:method.id,plan});assert.deepEqual(r.errors,[]);assert.deepEqual(r.rows.map(x=>x.risk.frozenBudget),[5500,10000]);assert.deepEqual(r.rows.map(x=>x.risk.lots),[15,27]);assert.equal(r.rows[0].risk.riskPerLot,360);assert.equal(w.getCard(card.id).plan,null);
 const bad=await g.review(card.id,{methodId:method.id,plan:{...plan,mainCycle:'day',accounts:plan.accounts.map(x=>({...x,riskPercent:1}))}});assert.ok(bad.errors.some(e=>e.includes('0.5%')));assert.ok(bad.errors.some(e=>e.includes('小周期')));await assert.rejects(approve(card,bad),/缺口/);
 r=await g.review(card.id,{methodId:method.id,plan});await approve(card,r);const saved=w.getCard(card.id).plan;assert.equal(saved.payload.methodChoice.method,'intraday');assert.equal(saved.payload.holdingMode,'intraday');assert.equal(saved.payload.riskPercent,.5);assert.equal(saved.risk.permission,false);
 await assert.rejects(g.choose(card.id,{analysisId:analysis.id,confirmed:true,choice:{...choice,intraday:{...choice.intraday,referenceAt:'2999-01-01T09:30'}}}),/未来|已知/);
});
