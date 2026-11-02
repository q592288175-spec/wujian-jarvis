import {test} from "node:test";
import assert from "node:assert/strict";
import {simpleSizing,ENTRY_PAIRS} from "../integrations/simple-sizing.mjs";
const plan={direction:"long",entry:5000,stop:4900,multiplier:10,riskPercent:1};
test("按实际金额、百分比与合约乘数取整手数",()=>{const r=simpleSizing({equity:250000},plan);assert.equal(r.frozenBudget,2500);assert.equal(r.riskPerLot,1000);assert.equal(r.lots,2);assert.equal(r.plannedLoss,2000);assert.deepEqual(r.missing,[])});
test("空头使用上方止损，反向止损不能计算",()=>{assert.equal(simpleSizing({equity:250000},{...plan,direction:"short",stop:5100}).lots,2);assert.equal(simpleSizing({equity:250000},{...plan,direction:"short"}).lots,null)});
test("未填实际金额不能使用模拟本金代替",()=>{assert.equal(simpleSizing({equity:null,stageCapital:1000000},plan).lots,null)});
test("不要求保证金、滑点、流动性；不足一手为零",()=>{assert.equal(simpleSizing({equity:10000},plan).lots,0);assert.equal(simpleSizing({equity:250000},plan).missing.length,0)});
test("拒绝零价差与无效百分比，保留四种手法",()=>{assert.equal(simpleSizing({equity:250000},{...plan,stop:5000}).lots,null);assert.equal(simpleSizing({equity:250000},{...plan,riskPercent:0}).lots,null);assert.equal(ENTRY_PAIRS.length,4)});
