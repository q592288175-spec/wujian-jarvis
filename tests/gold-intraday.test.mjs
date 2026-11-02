import test from 'node:test';import assert from 'node:assert/strict';
import {METHODS,analyzeMethods,deriveMethod,validateGoldPlan} from '../dist/gold-methods.js';
const analysis={bars:[{date:'2099-10-19',open:104,close:110,high:112,low:90}],dataDate:'2099-10-19',tickSize:1,ma10:100,analyzedAt:'2099-10-20T10:00:00+08:00'};
const input=()=>({method:'intraday',direction:'long',start:'2099-10-19',end:'2099-10-19',intraday:{algorithm:'本人测试口径：当日累计成交金额÷成交量÷合约乘数，逐交易日重置',confirmation:'cross',tradingDay:'2099-10-20',referenceAt:'2099-10-20T09:30',pivot:105,stop:104,environmentConfirmed:true,structureConfirmed:true}});
const plan=()=>({mainCycle:'small',entryMin:110,entryMax:111,stop:104,tradingDay:'2099-10-20',validUntil:'2099-10-20T15:00:00+08:00',exitRule:'合成：失效退出',structureConfirmed:true,holdingMode:'intraday',holdingUntil:'2099-10-20T14:55:00+08:00',reentryRule:'合成：另行审定，累计原机会风险'});

test('第五法独立新增，原四法ID和配对顺序保持，缺分时资料不自动推荐',()=>{
 assert.deepEqual(METHODS.slice(0,4).map(x=>x.id),['anti-break','anti-close','ma10','trend']);assert.equal(METHODS.length,5);
 const a=analyzeMethods({bars:analysis.bars,cutoff:analysis.dataDate,direction:'long',tickSize:1,layers:{}});assert.equal(a.candidates.at(-1).id,'intraday');assert.equal(a.candidates.at(-1).available,false);assert.notEqual(a.recommended,'intraday');
});
test('日内低高点独立于前一日K，多空镜像且不自动加一跳或借用日K收盘当入场',()=>{
 let x=input(),d=deriveMethod(analysis,x);assert.equal(d.stop,104);assert.notEqual(d.stop,analysis.bars[0].low);assert.equal(d.entry,null);assert.equal(d.maxRiskPercent,.5);assert.match(d.stopReference,/09:30/);assert.equal(d.liveTriggerVerified,false);
 x.direction='short';x.intraday.pivot=116;x.intraday.stop=117;d=deriveMethod(analysis,x);assert.equal(d.stop,117);assert.match(d.trigger,/下穿做空/);
});
test('算法、二次确认、取值截止及环境结构确认缺失时不能确认第五法',()=>{
 for(const [key,value]of [['algorithm',''],['confirmation',''],['referenceAt',''],['environmentConfirmed',false],['structureConfirmed',false]]){const x=input();x.intraday[key]=value;assert.throws(()=>deriveMethod(analysis,x));}
 const x=input();x.intraday.confirmation='second';assert.throws(()=>deriveMethod(analysis,x),/二次确认/);x.intraday.confirmationRule='合成条件：回踩未破后再次上穿';assert.match(deriveMethod(analysis,x).trigger,/回踩未破/);
});
test('未来或盘后回填、无效日期、止损在高低点内侧与非法跳动均拒绝',()=>{
 for(const change of [{referenceAt:'2099-10-20T10:01'},{tradingDay:'2099-02-30'},{stop:106},{stop:104.5}]){const x=input();Object.assign(x.intraday,change);assert.throws(()=>deriveMethod(analysis,x));}
});
test('第五法拒绝升级主周期、改交易日或向外移止损；原四法不加该限制',()=>{
 const d=deriveMethod(analysis,input());assert.deepEqual(validateGoldPlan(d,plan(),1),[]);
 for(const change of [{mainCycle:'day'},{tradingDay:'2099-10-21'},{stop:103,adjustmentReason:'跟新低向外挪'}])assert.ok(validateGoldPlan(d,{...plan(),...change},1).length);
 const old=deriveMethod(analysis,{method:'trend',branch:'average',start:analysis.dataDate,end:analysis.dataDate,direction:'long'});assert.equal(old.stop,90);assert.doesNotMatch(validateGoldPlan(old,{...plan(),mainCycle:'day',stop:90},1).join('；'),/独立分时/);
});
test('日内与隔夜授权分开，缺截止、隔夜理由或本人确认都不能批准',()=>{
 const d=deriveMethod(analysis,input());assert.ok(validateGoldPlan(d,{...plan(),holdingUntil:''},1).length);
 const overnight={...plan(),holdingMode:'overnight',holdingUntil:'2099-10-21T10:00:00+08:00'};assert.ok(validateGoldPlan(d,overnight,1).some(e=>e.includes('隔夜')));
 assert.deepEqual(validateGoldPlan(d,{...overnight,overnightConfirmed:true,overnightReason:'合成：单独审定的隔夜安排'},1),[]);
 assert.ok(validateGoldPlan(d,{...plan(),holdingUntil:'2099-10-21T10:00:00+08:00'},1).length);
});
