import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {fireStructure} from '../dist/fire-display.js';
import {themedCss} from './helpers/theme-css.mjs';

test('三模式周日结构逐项着色：全符合红绿，单项符合橙蓝，不符合白色',()=>{
 for(const mode of ['month-week-day','month-week','week-day'])for(const side of ['long','short'])for(const period of ['week','day']){
  const points=side==='long'?['low','high']:['high','low'],delta=side==='long'?1:-1;
  for(const conditions of [[true,true],[true,false],[false,true],[false,false]]){
   const row={modes:{[mode]:side==='long'?'多头观察':'空头观察'}};
   points.forEach((point,i)=>{
    row['previous_'+period+'_'+point]=100+delta;
    row[period+'_'+point]=conditions[i]?100+2*delta:100;
    if(period==='day')row['prior_day_'+point]=100;
   });
   const before=JSON.stringify(row),items=fireStructure(row,mode,period);
   assert.deepEqual(items.map(item=>item.condition),conditions);
   assert.deepEqual(items.map(item=>item.tone),conditions.map(ok=>side+'-'+(ok?(conditions.every(Boolean)?'strong':'partial'):'none')));
   assert.equal(JSON.stringify(row),before);
  }
 }
});

test('未符合及缺失结构保持中性主文字，浅色与全息版均不冒充橙蓝已符合项',()=>{
 for(const view of ['workbench','cockpit']){
  const css=themedCss([`dist/${view}.css`],view==='cockpit'?'holo':'light'),valueTag=view==='workbench'?'small':'b';
  const dom=new JSDOM(`<style>${css}</style><body data-shell="${view==='workbench'?'stable':'holo'}">${['long-none','short-none','neutral'].map(tone=>`<div class="fire-structure ${tone}"><span>未符合</span><${valueTag}>数值</${valueTag}></div>`).join('')}</body>`);
  for(const block of dom.window.document.querySelectorAll('.fire-structure')){
   for(const text of block.children)assert.equal(dom.window.getComputedStyle(text).color,view==='workbench'?'rgb(41, 54, 79)':'rgb(237, 243, 239)');
   assert.equal(dom.window.getComputedStyle(block).backgroundColor,view==='workbench'?'rgb(240, 243, 251)':'rgba(0, 0, 0, 0)');
  }
  dom.window.close();
 }
});
