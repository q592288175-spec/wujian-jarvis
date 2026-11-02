import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {channelHealth} from '../integrations/monitor-health.mjs';
import {deliveryLabel,notificationHealth} from '../dist/notification-status.js';

test('本人未收到与通道接收分开，重启后保留，且不会再次入发送队列',()=>{
 const root=resolve('output/notification-receipt-tests');mkdirSync(root,{recursive:true});
 const path=join(mkdtempSync(join(root,'case-')),'monitor.sqlite');let store=new MonitorStore(path);
 store.recordEvent({id:'test',kind:'test',triggeredAt:'2026-10-16T12:36:00+08:00',channels:['desktop','feishu']});
 store.delivery('test','desktop','accepted');store.delivery('test','feishu','unknown');
 store.confirmDelivery('test',{channel:'desktop',received:false});store.confirmDelivery('test',{channel:'feishu',received:false});
 store.close();store=new MonitorStore(path);
 const event=store.event('test'),desktop=event.deliveries.find(d=>d.channel==='desktop');
 assert.equal(desktop.status,'accepted');assert.equal(desktop.receipt.received,false);assert.match(desktop.receipt.at,/\+08:00$/);
 assert.match(deliveryLabel(desktop),/本人确认未收到/);assert.equal(notificationHealth(channelHealth({available:true},[event],'desktop'),'desktop').confirmed,false);
 assert.equal(store.pending('desktop').length,0);assert.equal(store.pending('feishu').length,0);assert.equal(event.readAt,null);
 store.confirmDelivery('test',{channel:'desktop',received:true});assert.equal(store.meta('receipts:test').length,3);assert.equal(store.event('test').deliveries[0].receipt.received,true);
 assert.equal(store.export().meta.find(m=>m.key==='receipts:test')!==undefined,true);store.close();
});
test('不能给不存在的提醒或未发送通道填回执，阅读工作台不等于收到通知',()=>{
 const store=new MonitorStore(':memory:');store.recordEvent({id:'test',kind:'test',triggeredAt:new Date().toISOString(),channels:['desktop']});
 assert.throws(()=>store.confirmDelivery('missing',{channel:'desktop',received:true}),/没有此通知通道/);
 assert.throws(()=>store.confirmDelivery('test',{channel:'feishu',received:true}),/没有此通知通道/);
 assert.throws(()=>store.confirmDelivery('test',{channel:'desktop',received:'true'}),/明确/);
 store.read('test');assert.equal(store.event('test').deliveries[0].receipt,null);
 assert.equal(notificationHealth({available:true},'desktop').confirmed,false);assert.equal(notificationHealth({lastDelivery:{status:'accepted'}},'desktop').confirmed,false);store.close();
});
