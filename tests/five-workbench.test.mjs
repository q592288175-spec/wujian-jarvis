import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateRisk,previewCsv} from '../integrations/five-workbench.mjs';

const directions=(values)=>Object.fromEntries(['market','sector','month','week','day'].map((key,index)=>[key,{direction:values[index]}]));
const account={mode:'simulation',stageCapital:1_000_000,equity:null,tier:'normal',stopped:false};
const plan={direction:'long',mainCycle:'week',entry:100,stop:90,multiplier:10,costPerLot:8,marginCapLots:99,liquidityCapLots:99,roundLossAndFees:0,existingPlannedRisk:0,pendingReservedRisk:0,portfolioUsedRisk:0,correlationUsedRisk:0};

test('五层同向仍受账户正常档单轮1%约束',()=>{
 const risk=calculateRisk({account,layers:directions(['long','long','long','long','long']),plan});
 assert.equal(risk.environment.cap,.02);
 assert.equal(risk.finalPct,.01);
 assert.equal(risk.frozenBudget,10_000);
 assert.equal(risk.riskPerLot,108);
 assert.equal(risk.lots,92);
});

test('四层同向加一层中性降为0.5%',()=>{
 const risk=calculateRisk({account,layers:directions(['long','long','long','long','neutral']),plan});
 assert.equal(risk.environment.state,'保守测试');
 assert.equal(risk.finalPct,.005);
 assert.equal(risk.frozenBudget,5_000);
});

test('任一层未知或反向都不给交易许可',()=>{
 const unknown=calculateRisk({account,layers:directions(['long','long','long','long','unknown']),plan});
 const reverse=calculateRisk({account,layers:directions(['long','long','long','long','short']),plan});
 assert.equal(unknown.finalPct,0);
 assert.match(unknown.missing.join(','),/未知/);
 assert.equal(reverse.finalPct,0);
 assert.match(reverse.missing.join(','),/反向/);
});

test('费用每手只计算一次且盈利不补回冻结预算',()=>{
 const risk=calculateRisk({account,layers:directions(['long','long','long','long','long']),plan:{...plan,frozenBudget:1_000,roundLossAndFees:100,existingPlannedRisk:200,pendingReservedRisk:100}});
 assert.equal(risk.riskPerLot,108);
 assert.equal(risk.remainingBudget,600);
 assert.equal(risk.lots,5);
 const profitable=calculateRisk({account:{...account,realizedProfit:99_999},layers:directions(['long','long','long','long','long']),plan:{...plan,frozenBudget:1_000}});
 assert.equal(profitable.frozenBudget,1_000);
});

test('保证金和流动性共同取最小整数，不足一手为0',()=>{
 const capped=calculateRisk({account,layers:directions(['long','long','long','long','long']),plan:{...plan,marginCapLots:3,liquidityCapLots:2}});
 assert.equal(capped.lots,2);
 const zero=calculateRisk({account,layers:directions(['long','long','long','long','long']),plan:{...plan,frozenBudget:100}});
 assert.equal(zero.lots,0);
});

test('CSV导入预览校验必需列和执行状态',()=>{
 const valid=previewCsv('externalId,time,status,action,price,quantity\nA1,2026-09-28T15:00,部分成交,开多,100,1');
 assert.equal(valid.canCommit,true);
 assert.equal(valid.rows[0].quantity,1);
 assert.throws(()=>previewCsv('id,time\nA1,now'),/CSV缺少列/);
});
