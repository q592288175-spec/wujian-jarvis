import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createPanorama} from '../integrations/market-panorama.mjs';

test('cached market snapshots immediately re-read changed Fire membership without a price sync or restart',async()=>{
 const parent=resolve('output/fire-pool-sync-20261028/catalog-tests');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'case-'));
 let fire={rows:[{code:'FU',name:'燃油',exchange:'SHFE',main_contract:'FU2701',data_date:'2026-10-27',modes:{'week-day':'多头观察'}},{code:'AL',name:'沪铝',exchange:'SHFE',data_date:'2026-10-27',modes:{'week-day':'空头观察'}}]};
 const p=createPanorama({root,folder:join(root,'panorama'),getFire:async()=>structuredClone(fire)});
 try{
  const first=await p.snapshot('2026-10-28');assert.equal(first.products.find(p=>p.code==='FU').fireModes['week-day'],'多头观察');
  fire.rows[0].modes['week-day']='空头观察';
  const corrected=await p.snapshot('2026-10-28');assert.equal(corrected.products.find(p=>p.code==='FU').fireModes['week-day'],'空头观察');assert(corrected.revision>first.revision);
  fire.rows=[{...fire.rows[0],data_date:'2026-10-28',modes:{'week-day':'未纳入','day-trend':'多头观察'}}];
  const next=await p.snapshot('2026-10-28');assert.equal(next.products.find(p=>p.code==='FU').fireDate,'2026-10-28');assert.equal(next.products.find(p=>p.code==='FU').fireModes['day-trend'],'多头观察');
  assert.deepEqual(next.products.find(p=>p.code==='AL').fireModes,{});
  assert.deepEqual((await p.snapshot('2026-10-26')).products.find(p=>p.code==='FU').fireModes,{});
 }finally{p.stop()}
});
