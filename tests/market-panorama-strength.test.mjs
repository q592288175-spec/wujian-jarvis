import test from 'node:test';
import assert from 'node:assert/strict';
import {strengthSectors,strengthSectorFor,strengthPeriods,trendEvidence,rankTrendStrength,rangePosition} from '../dist/market-panorama-strength.js';
const p=(code,slopes,scale=1)=>({code,signals:Object.fromEntries(strengthPeriods.map((key,i)=>{const previousMa=100*scale,ma=previousMa*(1+slopes[i]/100),side=slopes[i]>0?'long':'short';return [key,{previousMa,ma,side,samples:20,close:ma+(side==='long'?1:-1)*scale,stamp:'2026-10-23'}]}))});
test('strength sectors split energy and chemistry only within this page',()=>{
 assert.deepEqual(strengthSectors,['股指','国债','贵金属','有色','新能源','黑色系','能源','化工','农产品','农副产品','其他']);
 for(const code of ['SC','FU','LU','PG'])assert.equal(strengthSectorFor({code}),'能源');for(const code of ['BU','MA','UR','SP'])assert.equal(strengthSectorFor({code}),'化工');assert.equal(strengthSectorFor({code:'JM'}),'黑色系');assert.equal(strengthSectorFor({code:'EC'}),'其他');
});
test('requires three aligned MA10 slopes and closes; minute signals cannot add or remove candidates',()=>{
 const good=p('FU',[1,2,3]);good.signals.hour={side:'short'};assert.equal(trendEvidence(good).side,'long');
 for(const bad of [p('FU',[1,-1,1]),p('FU',[1,0,1])])assert.equal(trendEvidence(bad),null);
 for(const change of [{side:'missing'},{samples:10},{samples:undefined},{previousMa:0},{close:0},{ma:NaN},{previousMa:null}]){const bad=structuredClone(good);Object.assign(bad.signals.day,change);assert.equal(trendEvidence(bad),null)}
 const opposite=p('FU',[1,1,1]);opposite.signals.day.close=opposite.signals.day.ma-1;assert.equal(trendEvidence(opposite),null);
});
test('normalization is price-scale invariant and source signals are untouched',()=>{
 const a=p('AU',[1,2,3]),b=p('FU',[1,2,3],1000),before=structuredClone([a,b]);const ranked=rankTrendStrength([a,b]);assert.ok(Math.abs(ranked.long[0].trend.score-ranked.long[1].trend.score)<1e-8);assert.deepEqual([a,b],before);
});
test('equal-period percentile ranks do not let large month units dominate; short is mirrored',()=>{
 const rows=[p('FU',[80,8,8]),p('AU',[90,1,1]),p('CU',[10,9,9])];assert.deepEqual(rankTrendStrength(rows).long.map(x=>x.code),['CU','FU','AU']);
 const mirrored=[p('FU',[-80,-8,-8]),p('AU',[-90,-1,-1]),p('CU',[-10,-9,-9])];assert.deepEqual(rankTrendStrength(mirrored).short.map(x=>x.code),['CU','FU','AU']);
 assert.equal(rankTrendStrength([rows[0]]).long[0].trend.sample,1);assert.equal(rankTrendStrength([rows[0]]).long[0].trend.score,100);assert.deepEqual(rankTrendStrength([]),{long:[],short:[]});
});
test('position uses completed 60-bar range, discloses missing fields and snapshot mismatch',()=>{
 const bars=Array.from({length:61},(_,i)=>({complete:true,stamp:String(i),close:i+10,high:i+12,low:i+8}));const signal={stamp:'60',close:70};const r=rangePosition(bars,signal);assert.equal(r.high,72);assert.equal(r.low,9);assert.equal(r.samples,60);assert.ok(Math.abs(r.position-61/63*100)<1e-9);
 assert.equal(rangePosition(bars.slice(0,59),signal).status,'missing');assert.equal(rangePosition(bars,{stamp:'59',close:70}).status,'missing');assert.equal(rangePosition(bars,{stamp:'60',close:71}).status,'missing');
 const broken=structuredClone(bars);broken[40].high=null;assert.equal(rangePosition(broken,signal).status,'missing');
 assert.deepEqual(rangePosition([...bars,{complete:false,stamp:'61',close:999,high:999,low:999}],signal),r);
});
