import test from 'node:test';
import assert from 'node:assert/strict';
import {tradingQuote,sortQuotes} from '../dist/structure.js';
import {alignment} from '../dist/opportunity.js';
test('live return uses previous close, never settlement',()=>{
const q={last:110,preClose:100,preSettlement:105,close:98,quality:{timeStatus:'recent'}};
assert.ok(Math.abs(tradingQuote(q).changePct-10)<1e-9);
assert.equal(tradingQuote({...q,preClose:null}).changePct,null);
});
test('sort both directions places missing returns last and preserves input',()=>{
const q=(symbol,last,preClose)=>({symbol,last,preClose,quality:{timeStatus:'recent'}});
const rows=[q('a',99,100),q('b',110,100),q('c',1,null)];
assert.deepEqual(sortQuotes(rows,'desc').map(x=>x.symbol),['b','a','c']);
assert.deepEqual(sortQuotes(rows,'asc').map(x=>x.symbol),['a','b','c']);
assert.equal(rows[0].symbol,'a');
});
test('weekly daily direction visible without enabling monthly trigger',()=>{
const s={day:{state:'下行同侧'},week:{state:'下行同侧'},month:{state:'分歧或走平'}};
assert.equal(alignment(s).visualDirection,'short');assert.equal(alignment(s).direction,null);
});
import {sizePosition} from '../dist/risk-sizing.js';
test('risk sizing rounds down and includes costs',()=>{
const r=sizePosition({direction:'long',entry:3100,stop:3080,multiplier:10,budget:1000,cost:10});
assert.equal(r.lots,4);assert.equal(r.plannedLoss,840);
assert.ok(sizePosition({direction:'short',entry:3100,stop:3080,multiplier:10,budget:1000,cost:0}).error);
assert.equal(sizePosition({direction:'long',entry:3100,stop:3080,multiplier:10,budget:100,cost:0}).lots,0);
});
