import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestPool} from '../dist/market-request-pool.js';
const turn = () => new Promise(resolve => setImmediate(resolve));
test('同一请求共用结果；完成后下次重新读取', async () => {
 const pool=createRequestPool(2);let calls=0;
 const task=async()=>++calls;
 const a=pool.run('a',task),b=pool.run('a',task);
 assert.equal(a,b);assert.deepEqual(await Promise.all([a,b]),[1,1]);
 await turn();assert.equal(await pool.run('a',task),2);
});
test('限制并发，前台请求优先于排队的后台请求', async () => {
 const pool=createRequestPool(1),order=[];let finish;
 const first=pool.run('a',()=>new Promise(r=>{finish=r}));
 const back=pool.run('b',async()=>order.push('back'));
 const front=pool.run('c',async()=>order.push('front'),{priority:1});
 await turn();finish();await Promise.all([first,back,front]);
 assert.deepEqual(order,['front','back']);
});
test('取消后台请求会释放队列，前台请求可继续', async () => {
 const pool=createRequestPool(1);
 const back=pool.run('back',signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true})));
 const queued=pool.run('queued',()=>assert.fail('cancelled queued task ran'));
 const errors=[assert.rejects(back,{name:'AbortError'}),assert.rejects(queued,{name:'AbortError'})];
 await turn();pool.cancel({backgroundOnly:true});
 assert.equal(await pool.run('front',async()=>42,{priority:1}),42);
 await Promise.all(errors);
});
test('后台请求被前台复用后保留，错误结果不缓存', async () => {
 const pool=createRequestPool(1);let finish;
 const back=pool.run('same',()=>new Promise(r=>{finish=r}));
 const front=pool.run('same',()=>assert.fail('duplicated'),{priority:1});
 await turn();pool.cancel({backgroundOnly:true});finish(7);
 assert.equal(await front,7);assert.equal(await back,7);
 await turn();
 await assert.rejects(pool.run('error',async()=>{throw Error('network')}));
 await turn();assert.equal(await pool.run('error',async()=>9),9);
});