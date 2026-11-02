import test from 'node:test';
import assert from 'node:assert/strict';
import {createEodRefresher} from '../integrations/eod-refresh.mjs';

test('EOD refresh shows current progress instead of old success and shares duplicate clicks',async()=>{
 let finish,calls=0;
 const saved={status:'eod-ready',finishedAt:'old'};
 const refresh=createEodRefresher({execute:()=>{calls++;return new Promise(resolve=>{finish=resolve})},readStatus:async()=>saved,writeStatus:async()=>{},now:()=> 'now'});
 const first=refresh.refresh(),second=refresh.refresh();
 assert.equal(first,second);
 assert.deepEqual(await refresh.status(),{status:'refreshing',startedAt:'now'});
 finish({stdout:'{"status":"eod-ready"}'});
 assert.equal((await first).status,'eod-ready');assert.equal(calls,1);
 assert.deepEqual(await refresh.status(),saved);
});
test('EOD timeout persists failure and a retry can recover',async()=>{
 let saved={status:'eod-ready'},attempts=0;
 const refresh=createEodRefresher({execute:async()=>{if(++attempts===1)throw Object.assign(new Error('private command data'),{killed:true});saved={status:'eod-ready',finishedAt:'new'};return{stdout:'{"status":"eod-ready"}'}},readStatus:async()=>saved,writeStatus:async value=>{saved={...value}},now:()=> 'now'});
 const result=await refresh.refresh();assert.equal(result.status,'failed');assert.match(result.error,/超时/);assert.doesNotMatch(result.error,/private/);
 assert.deepEqual(await refresh.status(),saved);assert.equal(saved.finishedAt,'now');
 await refresh.refresh();assert.equal((await refresh.status()).status,'eod-ready');
});
test('EOD malformed worker output reports failure even if the status file cannot be written',async()=>{
 const refresh=createEodRefresher({execute:async()=>({stdout:'not-json'}),readStatus:async()=>({status:'eod-ready'}),writeStatus:async()=>{throw Error('disk full')},now:()=> 'now'});
 assert.equal((await refresh.refresh()).status,'failed');
 const status=await refresh.status();assert.equal(status.status,'failed');assert.equal(status.statusWriteFailed,true);
});
