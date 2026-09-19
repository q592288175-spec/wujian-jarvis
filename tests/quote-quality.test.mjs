import {test} from 'node:test';import assert from 'node:assert/strict';import {quoteQuality,filterLiquidity} from '../integrations/market.mjs';
test('exchange time is parsed in Shanghai regardless of host zone',()=>{assert.equal(quoteQuality({quoteTime:'2026-09-18 15:00:00.999500'},Date.parse('2026-09-18T07:00:01.999Z')).quoteAgeMs,1000)});
test('weekend old quote is historical, not a claimed disconnection',()=>{assert.equal(quoteQuality({quoteTime:'2026-09-18 15:00:00'},Date.parse('2026-09-19T02:00:00Z')).timeStatus,'historical')});
test('missing and future quote times are explicit',()=>{assert.equal(quoteQuality({}).timeStatus,'unknown');assert.equal(quoteQuality({quoteTime:'2026-09-18 15:00:00'},0).timeStatus,'future')});
test('provider change cannot override previous close basis',()=>{const s=filterLiquidity({quotes:[{last:110,preClose:100,changePct:99,volume:10001,openInterest:10001}]});assert.ok(Math.abs(s.quotes[0].changePct-10)<1e-8)});
test('invalid prices never produce market return',()=>{const s=filterLiquidity({quotes:[{last:0,preClose:100,volume:10001,openInterest:10001}]});assert.equal(s.quotes[0].changePct,null);assert.equal(s.quality.invalidPrice,1)});
