import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp} from "node:fs/promises";
import {resolve} from "node:path";
import {execFileSync} from 'node:child_process';
await mkdir(resolve(".runtime/test-simple"),{recursive:true});
const folder=await mkdtemp(resolve(".runtime/test-simple/run-"));
process.env.WUJIAN_WORKBENCH_DB=resolve(folder,"business.sqlite");
const {listAccounts,saveAccount,calculateRisk,saveCard,savePlan,getCard}=await import("../integrations/five-workbench.mjs");
test("默认实盘金额留空，账户金额独立保存且不丢旧字段",()=>{
 const a=listAccounts()[0];assert.equal(a.mode,"real");assert.equal(a.equity,null);assert.equal(a.stageCapital,0);
 const one=saveAccount({...a,equity:250000,notes:"保留备注"});
 const two=saveAccount({id:one.id,alias:one.alias,equity:300000});assert.equal(two.mode,"real");assert.equal(two.notes,"保留备注");
 const plan={sizingMode:"simple",direction:"long",mainCycle:"day",entry:5000,stop:4900,multiplier:10,riskPercent:1};
 assert.equal(calculateRisk({accountId:a.id,plan}).lots,3);
 assert.equal(saveAccount({id:a.id,alias:a.alias,equity:0}).equity,0);assert.throws(()=>saveAccount({id:a.id,alias:a.alias,equity:-1}),/小于0/);
});
test("后端按交易卡识别烧碱，忽略伪造乘数并冻结点值快照",async()=>{
 const account=saveAccount({...listAccounts()[0],equity:1100000});
 const card=saveCard({accountId:account.id,symbol:'SH',name:'烧碱',contract:'SH2611',direction:'long'});
 const plan={sizingMode:'simple',mainCycle:'day',symbol:'CU',direction:'short',entry:1240,stop:1200,riskPercent:1,multiplier:-3};
 const r=calculateRisk({cardId:card.id,accountId:account.id,plan});
 assert.equal(r.riskPerLot,1200);assert.equal(r.lots,9);
 const saved=await savePlan(card.id,plan);
 assert.equal(saved.plan.payload.multiplier,30);assert.equal(saved.plan.payload.tickSize,1);
 assert.equal(saved.plan.payload.contractSpec.symbol,'SH');assert.equal(saved.plan.risk.lots,9);
 assert.equal(getCard(card.id).plan.payload.accountEquity,1100000);
});

test('快捷添加的实盘账户名称与金额独立保存，按各自余额测算',()=>{
 const before=listAccounts();
 const one=saveAccount({alias:'账户甲',equity:1100000,mode:'real'});
 const two=saveAccount({alias:'账户乙',equity:250000,mode:'real'});
 assert.notEqual(one.id,two.id);assert.equal(one.alias,'账户甲');assert.equal(two.equity,250000);
 assert.deepEqual(listAccounts().filter(a=>before.some(old=>old.id===a.id)),before);
 const plan={sizingMode:'simple',direction:'long',mainCycle:'day',entry:1240,stop:1200,multiplier:30,riskPercent:1};
 assert.equal(calculateRisk({accountId:one.id,plan}).lots,9);
 assert.equal(calculateRisk({accountId:two.id,plan}).lots,2);
 assert.equal(one.tier,'unknown');
});

test('重新启动后保留新增账户名称和独立金额',()=>{
 const output=execFileSync(process.execPath,['--input-type=module','-e',"const {listAccounts}=await import('./integrations/five-workbench.mjs');console.log(JSON.stringify(listAccounts()))"],{cwd:resolve('.'),env:process.env,encoding:'utf8',stdio:['ignore','pipe','ignore']});
 assert.deepEqual(JSON.parse(output),listAccounts());
});
