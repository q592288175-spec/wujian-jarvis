import test from 'node:test';
import assert from 'node:assert/strict';
import {trendTableSignals,buildTrendTable} from '../integrations/trend-monitor-table.mjs';

function frame(){
 const quote={last:50,quoteAt:'2026-11-03T10:01:00+08:00',sessionActive:true,tradingDay:'2026-11-03'};
 const days=Array.from({length:10},(_,i)=>({stamp:`2026-10-${21+i}T00:00:00+08:00`,date:`2026-10-${21+i}`,close:i===0?10:100,complete:true}));
 days.push({stamp:'2026-11-03T00:00:00+08:00',date:'2026-11-03',close:50,complete:false});
 const start=Date.parse('2026-11-03T10:00:00+08:00'),small=Array.from({length:11},(_,i)=>({stamp:new Date(start-(10-i)*1800000).toISOString(),endStamp:new Date(start+(i-9)*1800000).toISOString(),close:i===0?10:100,complete:i<10}));
 return{quote,bars:{'1d':days,'30m':small},observedBars:{},source:'测试'};
}
test('direction grid measures MA10 slope even when price is below a rising MA10',()=>{
 const f=frame(),s=trendTableSignals(f,{now:Date.parse(f.quote.quoteAt)});assert.equal(s['1d'].direction,1);assert.equal(s['30m'].direction,1);assert.ok(f.quote.last<s['30m'].ma);assert.equal(s['1mo'].status,'missing');
});
test('closed periods show actual completed MA10 direction while fresh-session stale data is labelled',()=>{
 const f=frame();f.quote.sessionActive=false;f.bars['30m']=undefined;f.observedBars['30m']=Array.from({length:12},(_,i)=>({stamp:new Date(Date.parse(f.quote.quoteAt)-(12-i)*1800000).toISOString(),close:100-i}));
 const s=trendTableSignals(f,{now:Date.parse(f.quote.quoteAt)+3600000});assert.equal(s['30m'].status,'closed');assert.equal(s['30m'].direction,-1);
 f.quote.sessionActive=true;assert.equal(trendTableSignals(f,{now:Date.parse(f.quote.quoteAt)+31000})['1d'].status,'stale');
});
test('new-contract grid does not borrow old-contract alerts and preserves products without verified contracts',()=>{
 const feed={monitor:{quotes:new Map()},displayFrame:()=>null,status:()=>({source:'测试'})};
 const rows=buildTrendTable([{code:'MA',name:'甲醇',symbol:'CZCE.MA701'},{code:'WR',name:'线材',symbol:null}],feed,[{id:'old',kind:'ma-turn',symbol:'CZCE.MA611'}]);assert.equal(rows.length,2);assert.deepEqual(rows[0].alerts,[]);assert.equal(rows[1].signals['30m'].status,'missing');
});
