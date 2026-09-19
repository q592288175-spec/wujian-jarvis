import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterLiquidity} from '../integrations/market.mjs';
import {resolveProduct} from '../integrations/research-agent.mjs';
test('both volume and open interest must strictly exceed 10000; missing is excluded',()=>{
 const quotes=[{symbol:'a',volume:10001,openInterest:10001},{symbol:'b',volume:10000,openInterest:20000},{symbol:'c',volume:20000,openInterest:10000},{symbol:'d',volume:null,openInterest:20000},{symbol:'e',volume:20000}];
 const s=filterLiquidity({quotes,status:'observing'});assert.deepEqual(s.quotes.map(q=>q.symbol),['a']);assert.equal(s.liquidity.excluded,4);assert.equal(quotes.length,5);
});
test('research resolves Chinese alias and rejects ambiguity or excluded product',()=>{
 const q=[{symbol:'CFFEX.IM2612',name:'IM2612'},{symbol:'SHFE.au2610',name:'沪金2610'},{symbol:'SHFE.ag2610',name:'沪银2610'}];
 assert.equal(resolveProduct(q,'中证1000').symbol,'CFFEX.IM2612');assert.equal(resolveProduct(q,'im').symbol,'CFFEX.IM2612');assert.throws(()=>resolveProduct(q,'沪'));assert.throws(()=>resolveProduct(q,'不存在'));
});
