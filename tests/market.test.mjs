import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../integrations/market.mjs';
test('missing snapshot never fabricates quotes',()=>assert.deepEqual(assess(null).quotes,[]));
test('heartbeat expiration preserves old prices but flags stale',()=>{const s=assess({schemaVersion:1,status:'observing',receivedAt:'2026-09-18T00:00:00Z',quotes:[{last:123}]},Date.parse('2026-09-18T00:01:00Z'));assert.equal(s.status,'stale');assert.equal(s.quotes[0].last,123);assert.equal(s.permission,false)});
test('bad timestamp is not live',()=>assert.equal(assess({schemaVersion:1,status:'observing',receivedAt:'bad',quotes:[]}).status,'stale'));
test('connection failure not hidden by fresh heartbeat',()=>assert.equal(assess({schemaVersion:1,status:'disconnected',receivedAt:new Date().toISOString(),quotes:[]}).status,'disconnected'));
