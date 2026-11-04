import test from 'node:test';
import assert from 'node:assert/strict';
import {strengthLines,strengthColor,fiveMinuteMove,fiveMinuteLeaders,strengthAutoReady,labelInk} from '../dist/strength-live.js';
const p={code:'MA',name:'甲醇',contract:'MA2701',priceTime:'2026-11-04 10:06:00'};
const data=(values=[0,1,2,3,4,5],extra={})=>({code:p.code,contract:p.contract,source:'测试样本',points:values.map((value,i)=>({stamp:'2026-11-04 10:0'+i+':00',value})),...extra});
test('5分钟收益比较两个价格比例，不误用涨跌幅之差',()=>{const r=fiveMinuteMove(p,data([10,11,12,13,14,15]));assert.equal(r.status,'ok');assert.ok(Math.abs(r.value-(115/110-1)*100)<1e-10);assert.notEqual(r.value,5)});
test('不足样本、跨休市、滞后、换月不进入异动榜',()=>{
 assert.equal(fiveMinuteMove(p,data([0,1])).status,'missing');
 const gap=data();gap.points[3].stamp='2026-11-04 09:59:00';assert.equal(fiveMinuteMove(p,gap).status,'missing');
 assert.equal(fiveMinuteMove({...p,priceTime:'2026-11-04 10:10:00'},data()).status,'missing');
 assert.equal(fiveMinuteMove(p,data(undefined,{contract:'MA2705'})).status,'missing');
});
test('回放只读取截点之前的样本；重复时间去重，坏值不充数',()=>{
 const d=data([0,1,2,3,4,5,6]);d.points.push({...d.points[2]});assert.equal(fiveMinuteMove(p,d,{cutoff:'2026-11-04 10:05:00'}).value,5.000000000000004);
 assert.equal(fiveMinuteMove(p,d,{cutoff:'2026-11-04 10:04:00'}).status,'missing');
 d.points[1].value=NaN;assert.equal(fiveMinuteMove(p,d).status,'missing');
});
test('快速上涨与快速下跌各最多五个，平盘和缺失不补位',()=>{
 const rows=Array.from({length:14},(_,i)=>{const code='X'+i,values=Array.from({length:6},(_,j)=>j*(i-7));return {...p,code,intraday:data(values,{code})}});
 const result=fiveMinuteLeaders(rows);assert.equal(result.up.length,5);assert.equal(result.down.length,5);assert.ok(result.up.every(x=>x.movement5.value>0));assert.ok(result.down.every(x=>x.movement5.value<0));
 const short=fiveMinuteLeaders(rows.slice(0,2));assert.equal(short.up.length,0);assert.equal(short.down.length,2);
});
test('超过十二条曲线仍全部显示编号与品种尾标签，颜色与曲线相同',()=>{
 const x=data().points.map(p=>p.stamp),rows=Array.from({length:25},(_,i)=>({...p,code:'TEST'+i,points:data().points.map(p=>({...p,value:p.value+i}))})),series=strengthLines(rows,x);
 assert.equal(series.length,25);assert.ok(series.every(s=>s.endLabel.show&&s.endLabel.formatter.includes('甲醇')&&s.endLabel.backgroundColor===s.lineStyle.color&&s.lineStyle.type==='solid'));assert.equal(new Set(series.map(s=>s.lineStyle.color)).size,25);assert.match(series[0].endLabel.formatter,/^01 /);assert.match(series.at(-1).endLabel.formatter,/^25 /);assert.equal(strengthColor('TEST0'),strengthColor('TEST0'));
 assert.equal(labelInk('#f2c860'),'#182b43');assert.equal(labelInk('#6267ce'),'#ffffff');
});
test('编号按当前截点排序，缺点不拉直或填零',()=>{
 const a={...p,points:[{stamp:'a',value:1},{stamp:'c',value:3}]},b={...p,code:'B',points:[{stamp:'a',value:2},{stamp:'c',value:0}]};
 const early=strengthLines([a,b],['a','b']);assert.equal(early[0].id,'B');assert.deepEqual(early[0].data,[2,null]);assert.equal(strengthLines([a,b],['a','b','c'])[0].id,'MA');
});
test('仅当天实时模式每30秒自动更新，历史、暂停回放不抢刷',()=>{
 const s={auto:true,playing:false,replayMode:false,date:'2026-11-04',today:'2026-11-04',lastLoadedAt:1000,now:31000};assert.equal(strengthAutoReady(s),true);assert.equal(strengthAutoReady({...s,now:6000}),false);
 for(const patch of [{auto:false},{playing:true},{replayMode:true},{date:'2026-11-03'}])assert.equal(strengthAutoReady({...s,...patch}),false);
});
