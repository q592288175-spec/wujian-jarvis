import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchBrief} from '../integrations/research.mjs';
test('empty data yields no return or permission',()=>{const s=buildResearchBrief({status:'unavailable',quotes:[]});assert.equal(s.breadth.equalWeightChangePct,null);assert.equal(s.permission,false);assert.equal(s.coverage.totalMarket,null)});
test('return uses previous close and MA excludes forming bar',()=>{const s=buildResearchBrief({status:'observing',quotes:[{symbol:'SHFE.cu2610',last:110,preClose:100,preSettlement:90,bars:[...Array.from({length:10},()=>({close:100,complete:true})),{close:999,complete:false}]}]});assert.ok(Math.abs(s.rows[0].changePct-10)<1e-9);assert.equal(s.rows[0].ma10,100)});
test('null quote never becomes zero return',()=>{const s=buildResearchBrief({quotes:[{last:null,preClose:100,preSettlement:90}]});assert.equal(s.coverage.valid,0)});
test('stale remains stale and IM missing data stays explicit',()=>{const s=buildResearchBrief({status:'stale',quotes:[]},'im');assert.equal(s.status,'stale');assert.ok(s.missing.some(x=>x.includes('IM')));assert.equal(s.permission,false)});
test('invalid template fails closed',()=>assert.throws(()=>buildResearchBrief({},'other')));
test('provider close is distinct from last and settlement',()=>{const s=buildResearchBrief({quotes:[{last:110,close:105,preClose:100,preSettlement:80}]});assert.equal(s.rows[0].close,105);assert.ok(Math.abs(s.rows[0].closeChangePct-5)<1e-8);assert.ok(Math.abs(s.rows[0].changePct-10)<1e-8)});
test('missing official close is not replaced by latest trade',()=>{const s=buildResearchBrief({quotes:[{last:110,close:null,preClose:100}]});assert.equal(s.rows[0].close,null);assert.equal(s.rows[0].closeChangePct,null)});
test('close breadth excludes missing close and distinguishes intraday reversal',()=>{
 const result=buildResearchBrief({quotes:[{last:110,close:95,preClose:100},{last:120,close:null,preClose:100},{last:100,close:100,preClose:100}]});
 assert.equal(result.breadth.up,2);
 assert.equal(result.closeBreadth.valid,2);
 assert.equal(result.closeBreadth.up,0);
 assert.equal(result.closeBreadth.down,1);
 assert.equal(result.closeBreadth.flat,1);
 assert.ok(Math.abs(result.closeBreadth.equalWeightChangePct+2.5)<1e-8);
 assert.equal(buildResearchBrief({quotes:[]}).closeBreadth.equalWeightChangePct,null);
});
test('coverage distinguishes subscribed universe from retained research pool',()=>{
 const brief=buildResearchBrief({liquidity:{total:88},quotes:[{last:110,preClose:100}]});
 assert.equal(brief.coverage.subscribed,88);
 assert.equal(brief.coverage.retained,1);
 assert.equal(brief.coverage.valid,1);
 assert.equal(brief.coverage.totalMarket,null);
});
