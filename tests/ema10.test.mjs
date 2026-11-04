import test from 'node:test';
import assert from 'node:assert/strict';
import {emaSeries,emaPair,INDICATOR} from '../dist/indicators.js';
import {intrabarMaSignal,evaluateTrend} from '../integrations/trend-monitor-engine.mjs';
import {parseTrendKlines} from '../integrations/trend-market.mjs';
import {movingAverageEvidence} from '../integrations/environment.mjs';
import {goldChartSeries} from '../dist/gold-chart.js';
import {maSignal} from '../integrations/market-panorama.mjs';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

test('EMA首价初始化、相邻递推与SMA确有区别，常量与比例缩放保持一致',()=>{
 const v=[...Array(10).fill(100),110,90],s=emaSeries(v);
 assert.equal(s.slice(0,9).every(x=>x===null),true);assert.equal(s[9],100);
 assert.ok(Math.abs(s[10]-(100+20/11))<1e-12);
 assert.ok(Math.abs(s[11]-(s[10]+2/11*(90-s[10])))<1e-12);
 assert.notEqual(s[10],101);assert.equal(emaPair([]).ma,null);
 for(const bad of [[NaN],[null],[0],[-1],[Infinity],['100']])assert.throws(()=>emaSeries(bad));
 assert.deepEqual(emaSeries(Array(40).fill(100)).slice(9),Array(31).fill(100));
 emaSeries(v.map(x=>x*1000)).forEach((x,i)=>{if(x!==null)assert.ok(Math.abs(x-s[i]*1000)<1e-8)});
});

test('使用全部预热历史；环境、市场与图表采用同一EMA数值',()=>{
 const v=[200,...Array(30).fill(100),110],bars=v.map((close,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,close}));
 const expected=emaPair(v),truncated=emaPair(v.slice(-11));assert.notEqual(expected.ma,truncated.ma);
 assert.equal(maSignal(bars).ma,expected.ma);assert.equal(goldChartSeries(bars).at(-1).ma10,expected.ma);
 // Use valid dates for the calendar evidence adapter.
 const dated=bars.map((b,i)=>({...b,date:new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10)}));
 assert.equal(movingAverageEvidence(dated,'day','2026-12-31').ma10,expected.ma);
});

test('盘中报价只替换形成K一次，不按tick重复递推，输入保持原样',()=>{
 const at=Date.parse('2026-11-04T09:45:00+08:00'),rows=Array.from({length:100},(_,i)=>({stamp:new Date(at-(100-i)*30*60000).toISOString(),close:100+i/10,complete:true}));
 rows.push({stamp:new Date(at-1000).toISOString(),close:999,complete:false});
 const before=JSON.stringify(rows),quoteAt=new Date(at).toISOString(),a=intrabarMaSignal(rows,110,quoteAt),b=intrabarMaSignal(rows,110,quoteAt);
 assert.equal(a.ma,b.ma);assert.equal(a.ma,emaPair([...rows.slice(0,-1).map(r=>r.close),110]).ma);
 assert.equal(JSON.stringify(rows),before);assert.equal(a.indicator.version,INDICATOR.version);
});

test('算法切换不继承SMA基线，首次当前状态不补报，分钟历史不再截为32根',()=>{
 const at=Date.parse('2026-11-04T09:45:00+08:00'),rows=Array.from({length:11},(_,i)=>({stamp:new Date(at-(11-i)*60000).toISOString(),close:100,complete:i<10}));
 const task={id:'ema',version:1,bigPeriods:['1d'],direction:'both',channels:['desktop']};
 const frame={symbol:'SHFE.CU2612',code:'CU',source:'fixture',bars:{'1d':rows.map((b,i)=>({...b,date:new Date(Date.UTC(2026,9,25+i)).toISOString().slice(0,10)})),'30m':rows},quote:{last:110,quoteAt:new Date(at).toISOString(),receivedAt:new Date(at).toISOString(),sequence:2,sessionActive:true,sessionKey:'day',tradingDay:'2026-11-04'}};
 const first=evaluateTrend({task,frame,period:'30m',now:at,generation:1});assert.equal(first.event,null);
 const result=evaluateTrend({task,frame:{...frame,quote:{...frame.quote,sequence:3,quoteAt:new Date(at+1000).toISOString()}},period:'30m',state:{...first.state,indicatorVersion:'sma10-v0',smallDirection:-1,relation:-1},now:at+1000,generation:1});
 assert.equal(result.event,null);assert.equal(result.observation.status,'baseline');
 const raw=Array.from({length:100},(_,i)=>({d:new Date(Date.UTC(2026,10,1,0,i*30)).toISOString().slice(0,19).replace('T',' '),o:'100',h:'101',l:'99',c:'100'}));
 assert.equal(parseTrendKlines('var _x=('+JSON.stringify(raw)+');','30m').length,100);
});

test('Python扫描适配与JS同一递推，外部技能变化时拒绝猜测适配',async()=>{
 const python=process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python';
 const p=spawnSync(python,['-c',"import sys;sys.path.insert(0,'scripts');from fire_scan import load_scanner;import pandas as pd;from datetime import date;s=load_scanner();d=pd.DataFrame({'date':pd.date_range('2024-01-01',periods=14,freq='MS'),'open':100,'high':120,'low':90,'close':list(range(100,114))});print(s.aggregate_bars(d,'M',False,date(2026,11,4))['ma10'].iloc[-1])"],{encoding:'utf8',windowsHide:true});
 assert.equal(p.status,0,p.stderr);assert.ok(Math.abs(Number(p.stdout.trim())-emaPair(Array.from({length:14},(_,i)=>100+i)).ma)<1e-10);
 const code=await readFile('scripts/fire_scan.py','utf8');assert.match(code,/adapter.count != 4/);
});
