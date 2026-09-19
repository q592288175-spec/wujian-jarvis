import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priorReport,compareEvidence,reviewReport} from '../integrations/research-audit.mjs';
test('same product across rollover keeps newest completed report',()=>{const old={id:'old',symbol:'SHFE.cu2609',created:'2026-09-01',status:'completed'};assert.equal(priorReport([old,{symbol:'SHFE.cu2610',created:'2026-09-02',status:'failed'}],'SHFE.cu2610').id,'old')});
test('rollover never interprets price gap as outcome',()=>{const r=compareEvidence({id:'a',symbol:'SHFE.cu2609',evidence:{quote:{last:100}}},{symbol:'SHFE.cu2610',last:200});assert.equal(r.status,'rollover');assert.equal(r.priceChange,null)});
test('same contract changes require numeric evidence',()=>{const r=compareEvidence({id:'a',symbol:'SHFE.cu2610',evidence:{quote:{last:100,openInterest:null}}},{symbol:'SHFE.cu2610',last:110,openInterest:30000});assert.equal(r.priceChange,10);assert.equal(r.openInterestChange,null)});
test('invented source and missing sections are visible',()=>{const r=reviewReport('[来源](https://example.com/fake)',[]);assert.equal(r.unverifiedLinks.length,1);assert.ok(r.missingSections.includes('失效条件'));assert.equal(r.readSources,0)});
test('search snippets do not count as read sources',()=>{const r=reviewReport('[来源](https://www.shfe.com.cn/a)',[{result:{items:[{url:'https://www.shfe.com.cn/a'}]}}]);assert.equal(r.unverifiedLinks.length,0);assert.equal(r.readSources,0)});

test('Chinese annotations are not part of source URLs',()=>{assert.equal(reviewReport('https://www.shfe.com.cn/a（已读正文）',[{result:{url:'https://www.shfe.com.cn/a',text:'正文'}}]).unverifiedLinks.length,0)});
