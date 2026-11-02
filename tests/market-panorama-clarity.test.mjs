import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedRows,visibleMembers,seriesStyle,seatGap} from '../dist/market-panorama-clarity.js';
import {memberGroups,seatPairs} from '../integrations/market-panorama.mjs';
import {sectorCycleStats,sortSectorCycles} from '../dist/market-panorama-cycle-stats.js';
import {strengthSectors,strengthSectorFor} from '../dist/market-panorama-strength.js';

test('metric ordering is stable; nulls stay last in both directions and inputs are unchanged',()=>{
 const rows=[{code:'PG',value:4.86},{code:'MA',value:6.01},{code:'FU',value:6.38},{code:'AU',value:null},{code:'LU',value:6.38}],copy=structuredClone(rows);
 assert.deepEqual(orderedRows(rows,'value').map(p=>p.code),['FU','LU','MA','PG','AU']);
 assert.deepEqual(orderedRows(rows,'value',true).map(p=>p.code),['PG','MA','FU','LU','AU']);assert.deepEqual(rows,copy);
});
test('default members are explicitly capped at twelve, explicit selections are complete',()=>{
 const names=Array.from({length:20},(_,i)=>'席位'+i),hist=[{pairs:names.map(member=>({member,groups:['机构']}))}],before=structuredClone(hist);
 assert.equal(visibleMembers(hist,'all',new Set()).shown.length,12);
 assert.equal(visibleMembers(hist,'机构',new Set(names.slice(0,13))).shown.length,13);
 assert.equal(visibleMembers(hist,'外资',new Set(names)).shown.length,0);
 assert.deepEqual(hist,before);
});
test('client and proprietary suffixes match existing institution identities without merging rows',()=>{
 for(const name of ['中信期货（代客）','中信期货(自营)','国泰君安（代客）','永安期货（自营）'])assert.ok(memberGroups(name).includes('机构'));
 for(const name of ['中信建投期货（代客）','中信期货（未知）','其他中信期货（代客）'])assert.deepEqual(memberGroups(name),[]);
 const rows=['中信期货（代客）','中信期货（自营）'].flatMap(member=>['long','short'].map(side=>({member,side,contract:'MA701',product:'MA',day:'2026-10-23',value:side==='long'?100:80,change:1})));
 const pairs=seatPairs(rows,new Map([['MA701',3000]]),10);assert.equal(pairs.length,2);assert.equal(new Set(pairs.map(p=>p.member)).size,2);assert.ok(pairs.every(p=>p.net===20&&p.groups.includes('机构')));
});
test('eleven display sectors partition without changing signals or continuous trading taxonomy',()=>{
 const signals=Object.fromEntries(['month','week','day','hour','halfHour'].map(k=>[k,{side:'long'}]));
 const rows=['IF','T','AU','CU','LC','FG','SC','MA','M','LH','EC'].map(code=>({code,signals})),before=structuredClone(rows);
 const groups=sectorCycleStats(rows,{sectors:strengthSectors,sectorFor:strengthSectorFor});assert.deepEqual(groups.map(p=>p.name),strengthSectors);
 assert.equal(groups.flatMap(g=>g.items).length,rows.length);assert.deepEqual(sortSectorCycles(groups,'default',false,strengthSectors).map(g=>g.name),strengthSectors);assert.deepEqual(rows,before);
});
test('line identity survives reordering and does not cycle every eight members',()=>{
 const names=Array.from({length:53},(_,i)=>'测试席位'+i),styles=names.map(seriesStyle);
 assert.equal(new Set(styles.map(s=>JSON.stringify(s))).size,53);
 for(const n of names.toReversed())assert.deepEqual(seriesStyle(n),styles[names.indexOf(n)]);
});
test('seat gaps distinguish unclassified samples, incomparable change and missing valuation',()=>{
 assert.equal(seatGap({pairs:[]}),'该观察组未取得样本');
 assert.equal(seatGap({pairs:[{delta:null,amountChange:null}]}),'缺少可比双侧仓差');
 assert.equal(seatGap({pairs:[{delta:0,amountChange:null}]}),'金额缺结算价或合约参数');
 assert.equal(seatGap({pairs:[{delta:0,amountChange:0}]}),'');
});
