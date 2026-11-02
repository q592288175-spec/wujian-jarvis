import test from 'node:test';
import assert from 'node:assert/strict';
import {goldChartSeries,drawGoldChart} from '../dist/gold-chart.js';
import {CANDLE_STYLE} from '../dist/candle-style.js';
test('gold chart MA10 uses ten completed closes and leaves the warm-up empty',()=>{
 const bars=Array.from({length:12},(_,i)=>({close:i+1})),copy=structuredClone(bars),result=goldChartSeries(bars);
 assert.ok(result.slice(0,9).every(b=>b.ma10===null));assert.equal(result[9].ma10,5.5);assert.equal(result[11].ma10,7.5);assert.deepEqual(bars,copy);
});
test('gold chart draws hollow red up candles, filled green down candles and MA10',()=>{
 const fills=[],lines=[],ctx={clearRect(){},setLineDash(){},fillRect(...args){fills.push([this.fillStyle,...args])},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){lines.push(this.strokeStyle)},fillText(){}};
 const bars=Array.from({length:12},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,open:100+i,close:100+i+(i%2?-1:1),high:103+i,low:98+i}));
 drawGoldChart({getContext:()=>ctx},{bars,contract:'TEST',dataDate:'2026-10-12'},{start:'2026-10-11',end:'2026-10-12'});
 assert.equal(fills.filter(f=>f[0]===CANDLE_STYLE.down).length,6);assert.equal(fills.filter(f=>f[0]===CANDLE_STYLE.background).length,7);assert.ok(lines.includes(CANDLE_STYLE.ma));assert.equal(fills.some(f=>f[0]==='#081310'),false);
});
