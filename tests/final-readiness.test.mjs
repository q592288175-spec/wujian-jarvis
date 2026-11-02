import test from 'node:test';
import assert from 'node:assert/strict';
import {marketCoverage} from '../dist/data-coverage.js';
import {marketHealth} from '../integrations/monitor-health.mjs';
test('六所覆盖分开缺映射、无成交、陈旧、技术不足与临时快照',()=>{
 const mk=(code,extra={})=>({code,exchange:'CZCE',main_contract:code+'2701',data_date:'2026-10-15',market_current:true,ok:true,...extra});
 const c=marketCoverage({target_date:'2026-10-15',rows:[mk('A'),mk('B',{provisional:true}),mk('C',{ok:false}),mk('D',{ok:false,no_trade:true}),mk('E',{data_date:'2026-10-14'}),mk('F',{main_contract:null})]});
 assert.equal(c.exchanges.length,6);const e=c.exchanges.find(e=>e.id==='CZCE');assert.equal(e.technical,2);assert.equal(e.noTrade,1);assert.equal(e.provisional,1);assert.equal(e.gaps,3);assert.equal(c.rows.find(r=>r.code==='E').state,'缺失或陈旧');
});
test('零价格规则为待命；真实报价、休市、陈旧与连接独立',()=>{
 const now=Date.parse('2026-10-16T13:31:00+08:00'),market={status:'disconnected'};
 assert.equal(marketHealth(market,[],new Map(),now).status,'idle');
 const rules=[{status:'active',kind:'price',members:[{symbol:'SHFE.BR2612'}]}],quotes=new Map([['SHFE.BR2612',{symbol:'SHFE.BR2612',sessionActive:true,quoteAt:'2026-10-16T13:30:50+08:00'}]]);
 assert.equal(marketHealth({status:'connected'},rules,quotes,now).freshQuoteCount,1);
 assert.equal(marketHealth({status:'connected'},rules,quotes,now+60000).freshQuoteCount,0);
 quotes.get('SHFE.BR2612').sessionActive=false;assert.equal(marketHealth({status:'connected'},rules,quotes,now).freshQuoteCount,0);
});
test('手机绑定不能掩盖持久化的未知送达状态',async()=>{
 const {phoneHealth}=await import('../integrations/monitor-health.mjs');
 const result=phoneHealth({ready:true},[{triggeredAt:'2026-10-16T12:36:00+08:00',deliveries:[{channel:'feishu',status:'unknown',note:'手机消息尚未确认'}]}]);
 assert.equal(result.ready,true);assert.equal(result.lastDelivery.status,'unknown');assert.equal(result.lastDelivery.note,'手机消息尚未确认');
});
