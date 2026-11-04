import test from 'node:test';
import assert from 'node:assert/strict';
import {strengthTradingIntervals,strengthTimeline,strengthLines,strengthTooltip,fiveMinuteMove} from '../dist/strength-live.js';
import {publicSession} from '../integrations/monitor-sina.mjs';
const day='2026-11-04',stamp=t=>day+' '+t;
function row(code='MA',exchange='CZCE',points=[['2026-11-03 21:00:00',0],['2026-11-03 23:00:00',2],[stamp('09:01:00'),3],[stamp('10:15:00'),4],[stamp('10:31:00'),5],[stamp('11:30:00'),6]]){
 const r={code,name:'测试品种',exchange,contract:code+'2701',points:points.map(([stamp,value])=>({stamp,value}))};
 r.intraday={code,contract:r.contract,basisKey:'session-open',tradingDay:day,baselineAt:'2026-11-03 21:00:00',session:{hasNight:true},points:r.points};return r;
}
test('23点收盘的品种夜间及日盘小节休市沿用真实收盘，复市边界仍横线，随后才采用新价',()=>{
 const r=row(),x=['2026-11-03 23:00:00',stamp('00:30:00'),stamp('09:00:00'),stamp('09:01:00'),stamp('10:15:00'),stamp('10:20:00'),stamp('10:30:00'),stamp('10:31:00')],s=strengthLines([r],x)[0];
 assert.equal(s.data[0],2);for(const i of [1,2])assert.deepEqual(s.data[i],{value:2,displayOnly:'休市延续',sourceStamp:'2026-11-03 23:00:00'});
 assert.equal(s.data[3],3);for(const i of [5,6])assert.equal(s.data[i].value,4);assert.equal(s.data[7],5);assert.equal(s.connectNulls,false);
});
test('交易时段缺分钟、缺收盘和元信息不完整均不补线，不用后续价格倒填',()=>{
 const r=row(),x=[stamp('09:01:00'),stamp('09:02:00'),stamp('10:20:00')];assert.equal(strengthLines([r],x)[0].data[1],null);
 r.points=r.points.filter(p=>p.stamp!==stamp('10:15:00'));assert.equal(strengthLines([r],x)[0].data[2],null);
 r.intraday.contract='MA2705';assert.equal(strengthLines([r],['2026-11-03 23:00:00',stamp('00:30:00')])[0].data[1],null);
});
test('未开盘的无夜盘品种不提前画零线；国债15点后仍交易不能补平',()=>{
 const r=row('T','CFFEX',[[stamp('09:30:00'),0],[stamp('11:30:00'),1],[stamp('13:01:00'),2],[stamp('15:00:00'),3],[stamp('15:15:00'),4]]);r.intraday.baselineAt=stamp('09:30:00');r.intraday.session.hasNight=false;
 const x=['2026-11-03 23:00:00',stamp('09:30:00'),stamp('12:00:00'),stamp('13:00:00'),stamp('15:01:00'),stamp('15:16:00')],s=strengthLines([r],x)[0];assert.equal(s.data[0],null);assert.equal(s.data[1],0);assert.equal(s.data[2].value,1);assert.equal(s.data[3].value,1);assert.equal(s.data[4],null);assert.equal(s.data[5].value,4);
});
test('回放只画截点之前，添加复市边界但不扩展到未来，也不修改原始分钟数据',()=>{
 const r=row(),before=JSON.stringify(r),x=strengthTimeline([r]);assert.ok(x.includes(stamp('09:00:00')));assert.ok(x.includes(stamp('10:30:00')));assert.equal(x.at(-1),stamp('11:30:00'));assert.ok(!x.includes(stamp('13:30:00')));
 const early=x.filter(t=>t<=stamp('09:00:00')),s=strengthLines([r],early)[0];assert.equal(s.data.at(-1).value,2);assert.equal(JSON.stringify(r),before);
});
test('休市横线只用于显示，不进入5分钟异动计算；悬停说明最后真实成交时间',()=>{
 const r=row(),before=JSON.stringify(r.intraday.points);strengthLines([r],[stamp('10:15:00'),stamp('10:20:00')]);assert.equal(JSON.stringify(r.intraday.points),before);assert.equal(fiveMinuteMove(r,r.intraday,{cutoff:stamp('10:20:00')}).status,'missing');
 const text=strengthTooltip([{axisValue:stamp('10:20:00'),seriesName:'MA 甲醇',marker:'●',data:{value:4,displayOnly:'休市延续',sourceStamp:stamp('10:15:00')}}]);assert.match(text,/休市延续/);assert.match(text,/最后成交 2026-11-04 10:15:00/);assert.match(text,/\+4.00%/);
});
test('前端显示时段与系统现有publicSession一致：商品、凌晨1点/2点半、无夜盘及股指国债',()=>{
 const days=['2026-11-03','2026-11-04','2026-11-05'];
 for(const [code,exchange,night]of [['MA','CZCE',true],['CU','SHFE',true],['SC','INE',true],['SI','GFEX',false],['IF','CFFEX',false],['T','CFFEX',false]]){
  const r=row(code,exchange);r.intraday.session.hasNight=night;if(!night)r.intraday.baselineAt=stamp(exchange==='CFFEX'?'09:30:00':'09:00:00');const intervals=strengthTradingIntervals(r);
  for(let m=0;m<1440+240;m++){
   const time=Date.parse('2026-11-03T20:00:00+08:00')+m*60000;
   const active=intervals.some(s=>time>=Date.parse(s.start.replace(' ','T')+'+08:00')&&time<Date.parse(s.end.replace(' ','T')+'+08:00'));
   const expected=publicSession(exchange+'.'+r.contract,time,days);assert.equal(active,expected.sessionActive&&expected.tradingDay===day,code+' '+new Date(time).toISOString());
  }
 }
});
