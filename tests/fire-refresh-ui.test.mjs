import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createFireRefreshPoller,updateFireRefresh} from '../dist/fire-refresh.js';

const snapshot={status:'ready',sourcePath:'scan.json',refreshedAt:'2026-10-21T07:30:00Z',data_date:'2026-10-21',refreshing:true,refresh:{stage:'market'}};
function fixture(options={}){
 const callbacks=[],progress=[],results=[],errors=[];
 const poller=createFireRefreshPoller({load:async()=>snapshot,isActive:()=>true,onProgress:f=>progress.push(f),onResult:f=>results.push(f),onError:e=>errors.push(e),setTimer:fn=>{callbacks.push(fn);return fn},clearTimer:fn=>{const i=callbacks.indexOf(fn);if(i>=0)callbacks.splice(i,1)},...options});
 return {poller,progress,results,errors,tick:async()=>{const fn=callbacks.shift();assert.ok(fn,'poll scheduled');await fn()},pending:()=>callbacks.length};
}

test('unchanged scan only patches progress, never rebuilds candidates',async()=>{
 const f=fixture();f.poller.start(snapshot);
 for(let i=0;i<5;i++)await f.tick();
 assert.equal(f.progress.length,5);assert.equal(f.results.length,0);assert.equal(f.pending(),1);
 f.poller.stop();assert.equal(f.pending(),0);
});

test('completion or new snapshot updates results once and stops the old poll',async()=>{
 for(const next of [{...snapshot,refreshing:false},{...snapshot,refreshedAt:'2026-10-21T08:00:00Z'}]){
  const f=fixture({load:async()=>next});f.poller.start(snapshot);await f.tick();
  assert.deepEqual(f.results,[next]);assert.equal(f.pending(),0);
 }
});

test('failed refresh restores controls without endlessly rebuilding',async()=>{
 const next={...snapshot,refreshing:false,refreshError:'行情来源暂不可用',refresh:{stage:'failed'}};
 const f=fixture({load:async()=>next});f.poller.start(snapshot);await f.tick();
 assert.equal(f.results.length,1);assert.equal(f.pending(),0);
});

test('navigation and newer renders invalidate pending requests',async()=>{
 for(const cancel of ['navigation','restart','stop']){
  let release,active=true;
  const f=fixture({isActive:()=>active,load:()=>new Promise(r=>release=r)});
  f.poller.start(snapshot);const running=f.tick();
  if(cancel==='navigation')active=false;else if(cancel==='restart')f.poller.start(snapshot);else f.poller.stop();
  release({...snapshot,refreshing:false});await running;
  assert.equal(f.progress.length,0);assert.equal(f.results.length,0);
  assert.equal(f.pending(),cancel==='restart'?1:0);
 }
});

test('connection failures keep the snapshot and retry without multiplying timers',async()=>{
 const f=fixture({load:async()=>{throw Error('offline')}});f.poller.start(snapshot);
 await f.tick();assert.equal(f.errors.length,1);assert.equal(f.results.length,0);assert.equal(f.pending(),1);
 f.poller.start(snapshot);assert.equal(f.pending(),1);
});

test('status updates preserve focused controls, list nodes, and identical text nodes',()=>{
 const doc=new JSDOM('<main><button id="refreshFire"></button><button id="postmarketReview"></button><time id="fireRefreshTime"></time><p id="fireRefreshStatus"></p><select id="filter"><option>观察候选</option></select><table><tbody><tr><td>燃料油</td></tr></tbody></table></main>').window.document;
 const root=doc.querySelector('main'),table=root.querySelector('table'),filter=root.querySelector('select');filter.focus();
 updateFireRefresh(root,snapshot);const text=root.querySelector('#fireRefreshStatus').firstChild;
 assert.equal(root.querySelector('#postmarketReview').disabled,true);
 updateFireRefresh(root,snapshot);
 assert.equal(root.querySelector('#fireRefreshStatus').firstChild,text);
 assert.equal(root.querySelector('table'),table);assert.equal(doc.activeElement,filter);
 updateFireRefresh(root,{...snapshot,refreshing:false,refresh:{stage:'completed',finishedAt:'2026-10-21T08:00:00Z'}});
 assert.equal(root.querySelector('#refreshFire').disabled,false);
 assert.equal(root.querySelector('#postmarketReview').disabled,false);
 assert.equal(root.querySelector('#fireRefreshTime').textContent,'2026-10-21 16:00');
 assert.match(root.querySelector('#fireRefreshStatus').textContent,/刷新完成/);
});
