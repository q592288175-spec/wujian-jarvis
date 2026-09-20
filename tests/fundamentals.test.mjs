import test from 'node:test';import assert from 'node:assert/strict';
import {sourcePlan,readIndicators} from '../integrations/fundamentals.mjs';
import {allowedSource} from '../integrations/research-sources.mjs';
import {reviewReport} from '../integrations/research-audit.mjs';
test('product sources route agriculture and energy independently',()=>{assert.ok(sourcePlan({symbol:'CZCE.SR701',name:'白糖2701'}).sources.some(s=>s.url.includes('moa.gov.cn')));assert.ok(sourcePlan({symbol:'INE.sc2611',name:'原油2611'}).sources.some(s=>s.url.includes('eia.gov')))});
test('official reader cannot follow arbitrary or credential bearing hosts',()=>{assert.equal(allowedSource('https://evil.example/moa.gov.cn'),false);assert.equal(allowedSource('https://user@www.moa.gov.cn/'),false);assert.equal(allowedSource('https://www.moa.gov.cn/'),true)});
test('indicator requests reject guessed malformed ids and backwards dates',async()=>{await assert.rejects(readIndicators({ids:[-1],start:'2026-01-01',end:'2026-02-01'}));await assert.rejects(readIndicators({ids:[1],start:'2026-02-01',end:'2026-01-01'}))});
test('audit accepts only actually read nested articles',()=>{const a=reviewReport('https://www.stats.gov.cn/test.html',[{result:{documents:[{articles:[{url:'https://www.stats.gov.cn/test.html',text:'source'}]}]}}]);assert.equal(a.readSources,1);assert.deepEqual(a.unverifiedLinks,[])});
