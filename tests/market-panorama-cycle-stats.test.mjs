import test from 'node:test';
import assert from 'node:assert/strict';
import {periodCounts,balanceLabel,sectorCycleStats,sortSectorCycles} from '../dist/market-panorama-cycle-stats.js';
import {panoramaPeriods,resonanceLabels} from '../dist/market-panorama-periods.js';
const product=(code,sides)=>({code,signals:Object.fromEntries(panoramaPeriods.map(({key},i)=>[key,{side:sides[i],stamp:'2026-10-23'}]))});

test('counts disclose neutral and unavailable observations, without counting them as short',()=>{
 const rows=['long','long','short','flat','missing',undefined].map(side=>({signals:{day:{side,stamp:'2026-10-23'}}}));
 const c=periodCounts(rows,'day');assert.equal(c.long,2);assert.equal(c.short,1);assert.equal(c.flat,1);assert.equal(c.missing,2);assert.equal(c.valid,3);assert.equal(c.total,6);assert.ok(Math.abs(c.ratio-200/3)<1e-10);
 assert.equal(periodCounts([],'day').ratio,null);assert.equal(periodCounts([{signals:{day:{side:'flat'}}}],'day').ratio,null);
 assert.deepEqual([null,0,50,100].map(balanceLabel),['数据不足','空头占优','多空均衡','多头占优']);
});
test('date coverage excludes unavailable K lines and exposes mixed cutoffs',()=>{
 const c=periodCounts([{signals:{day:{side:'long',stamp:'2026-10-22'}}},{signals:{day:{side:'short',stamp:'2026-10-23'}}},{signals:{day:{side:'missing',stamp:'2026-10-24'}}}],'day');assert.equal(c.earliest,'2026-10-22');assert.equal(c.latest,'2026-10-23');
});
test('eleven display groups partition every product once with energy and chemicals separate',()=>{
 const rows=[product('SC',Array(5).fill('long')),product('FU',Array(5).fill('short')),product('LU',['short','short','long','long','long']),product('PG',['long','long','short','short','short']),product('MA',['long','flat','long','short','long']),product('EG',['long','short','missing','short','long'])],original=structuredClone(rows);
 const groups=sectorCycleStats(rows);assert.deepEqual(groups.map(g=>g.name),['能源','化工']);for(const g of groups)assert.deepEqual(Object.keys(g.groups),resonanceLabels);assert.deepEqual(resonanceLabels.map(label=>groups.reduce((n,g)=>n+g.groups[label].length,0)),[1,1,1,1,1,1]);assert.equal(new Set(groups.flatMap(g=>Object.values(g.groups).flat()).map(p=>p.code)).size,6);assert.deepEqual(rows,original);
});
test('five-period aggregate is equal-weighted; absent period gets no synthetic score',()=>{
 const rows=[product('AU',['long','long','long','long','long']),product('AG',['short','long','flat','short','short']),product('CU',['short','short','short','short','missing'])];
 const groups=sectorCycleStats(rows),gold=groups.find(g=>g.name==='贵金属'),copper=groups.find(g=>g.name==='有色');assert.equal(gold.score,70);assert.equal(gold.structure,'混沌分歧');assert.equal(copper.score,null);assert.equal(copper.structure,'数据不足');
 for(const ascending of [true,false])assert.equal(sortSectorCycles(groups,'score',ascending).at(-1).name,'有色');
});
test('sort is stable, default order and source data remain unchanged',()=>{
 const groups=sectorCycleStats([product('FU',Array(5).fill('short')),product('AU',Array(5).fill('long')),product('IF',Array(5).fill('long'))]),before=structuredClone(groups);
 assert.deepEqual(sortSectorCycles(groups).map(g=>g.name),['股指','贵金属','能源']);assert.deepEqual(sortSectorCycles(groups,'day',true).map(g=>g.name),['能源','股指','贵金属']);assert.deepEqual(sortSectorCycles(groups,'default',true).map(g=>g.name),['股指','贵金属','能源']);assert.deepEqual(groups,before);
});
