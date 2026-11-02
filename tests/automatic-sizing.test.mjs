import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contractSpec,contractSpecs} from '../integrations/contract-specs.mjs';
import {sectorGroups} from '../dist/sectors.js';
import {simpleSizing} from '../dist/position-sizing.js';
const plan={sizingMode:'simple',symbol:'SH',direction:'long',entry:1240,stop:1200,riskPercent:1,multiplier:30,tickSize:1};

test('现有87品种都有正数点值与跳值，期权不混入',()=>{
 const products=contractSpecs().products;
 const symbols=sectorGroups.flatMap(s=>s.products.split(' '));
 assert.equal(symbols.length,87);
 for(const symbol of symbols){const p=products[symbol];assert.ok(p,symbol);assert.ok(p.pointValue>0);assert.ok(p.tickSize>0);assert.equal(p.tickValue,p.pointValue*p.tickSize);}
 assert.equal(contractSpec('SH2611').pointValue,30);
 assert.equal(contractSpec('CZCE.sh611').symbol,'SH');
 assert.equal(contractSpec('SH2611C1200'),null);
 assert.equal(contractSpec('UNKNOWN'),null);
 assert.equal(products.IO,undefined);
});
test('烧碱110万、1%、40点止损，自动取9手',()=>{
 const r=simpleSizing({equity:1100000},plan);
 assert.equal(r.frozenBudget,11000);assert.equal(r.stopDistance,40);assert.equal(r.riskPerLot,1200);assert.equal(r.lots,9);assert.equal(r.plannedLoss,10800);
});
test('9.8、9.5、9.1手都向下取9手，整10手不减成9',()=>{
 for(const equity of [1176000,1140000,1092000])assert.equal(simpleSizing({equity},{...plan}).lots,9);
 assert.equal(simpleSizing({equity:1200000},plan).lots,10);
});
test('黄金小数价差及国债跳值精确计算，不混淆每点与每跳',()=>{
 const gold=contractSpec('AU'),bond=contractSpec('TS');
 assert.equal(simpleSizing({equity:2000},{...plan,entry:500.12,stop:500.10,multiplier:gold.pointValue,tickSize:gold.tickSize}).lots,1);
 const r=simpleSizing({equity:4000},{...plan,entry:100.002,stop:100,multiplier:bond.pointValue,tickSize:bond.tickSize});
 assert.equal(r.riskPerLot,40);assert.equal(r.lots,1);assert.equal(bond.tickValue,40);
 assert.equal(contractSpec('CU').pointValue,5);assert.equal(contractSpec('CU').tickValue,50);
});
test('先填金额与比例就显示预算，缺参数不猜手数，错误价位不可计算',()=>{
 assert.equal(simpleSizing({equity:1100000},{riskPercent:1}).frozenBudget,11000);
 assert.equal(simpleSizing({equity:1100000},{...plan,multiplier:null}).riskCapLots,null);
 assert.equal(simpleSizing({equity:1100000},{...plan,entry:1240.5}).riskCapLots,null);
 assert.equal(simpleSizing({equity:1100000},{...plan,stop:1240}).riskCapLots,null);
 assert.equal(simpleSizing({equity:1000},plan).riskCapLots,0);
});
test('价差手数与方向资格分开：空头下方止损显示算术手数但不能批准',()=>{
 const r=simpleSizing({equity:1100000},{...plan,direction:'short'});
 assert.equal(r.riskCapLots,9);assert.equal(r.lots,null);assert.match(r.missing.join(''),/空头止损须高于/);
 assert.equal(simpleSizing({equity:1100000},{...plan,direction:'short',stop:1280}).lots,9);
});
