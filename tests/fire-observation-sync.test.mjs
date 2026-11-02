import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mergeFireSnapshot,publishFireSnapshot} from '../dist/fire-observation-sync.js';
import {observationPool} from '../dist/market-observation-pools.js';
const market={selectedDate:'2026-10-28',products:[{code:'FU',name:'燃油',close:4000,fireDate:'2026-10-20',fireModes:{'week-day':'空头观察'}},{code:'AL',name:'沪铝',close:20000,fireDate:'2026-10-20',fireModes:{'week-day':'多头观察'}}]};
const fire={data_date:'2026-10-27',rows:[{code:'fu',data_date:'2026-10-27',modes:{'week-day':'多头观察','day-trend':'空头观察'}},{code:'AL',data_date:'2026-10-27',modes:{'week-day':'空头观察','day-trend':'多头观察'}}]};
test('calendar rollover uses the last Fire scan with its actual date, replacing stale market eligibility',()=>{
 const merged=mergeFireSnapshot(market,fire),pool=observationPool(merged.products,'week-day',merged.selectedDate,{fireAsOf:merged.fireAsOf});
 assert.equal(pool.asOf,'2026-10-27');assert.deepEqual(pool.long.map(p=>p.code),['FU']);assert.deepEqual(pool.short.map(p=>p.code),['AL']);
 assert.equal(merged.products[0].close,4000);assert.equal(market.products[0].fireModes['week-day'],'空头观察');
});
test('next scan and same-day corrections replace membership even if the cached market snapshot is unchanged',()=>{
 const first=mergeFireSnapshot(market,fire),next=structuredClone(fire);next.data_date='2026-10-28';next.rows=next.rows.map(r=>({...r,data_date:'2026-10-28',modes:{'week-day':'未纳入','day-trend':'多头观察'}}));
 const merged=mergeFireSnapshot(first,next);assert.notEqual(first.fireRevision,merged.fireRevision);assert.equal(merged.fireAsOf,'2026-10-28');
 assert.equal(observationPool(merged.products,'week-day',market.selectedDate,{fireAsOf:merged.fireAsOf}).rows.length,0);
 next.rows[0].modes['week-day']='空头观察';const correction=mergeFireSnapshot(merged,next);assert.notEqual(correction.fireRevision,merged.fireRevision);assert.equal(correction.products[0].fireModes['week-day'],'空头观察');
});
test('historical view never borrows future membership; failed reads keep the last successful values',()=>{
 const historical=mergeFireSnapshot({...market,selectedDate:'2026-10-26'},fire);assert.equal(historical.fireAsOf,null);assert(historical.products.every(p=>!Object.keys(p.fireModes).length));
 const current=mergeFireSnapshot(market,fire),failed=mergeFireSnapshot(current,{rows:[]});assert.deepEqual(failed.products,current.products);assert.match(failed.fireSyncError,/保留/);
});
test('Fire notification is sent on new membership, including corrections on the same date',()=>{
 const window=new JSDOM('',{url:'http://127.0.0.1'}).window,events=[];window.addEventListener('xiaomu:fire-updated',e=>events.push(e.detail));
 publishFireSnapshot(fire,window);publishFireSnapshot(structuredClone(fire),window);assert.equal(events.length,1);
 const changed=structuredClone(fire);changed.rows[0].modes['week-day']='空头观察';publishFireSnapshot(changed,window);assert.equal(events.length,2);assert(window.localStorage.getItem('wj-fire-revision'));window.close();
});
