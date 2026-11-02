import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {ENTRY_PAIRS} from '../dist/position-sizing.js';

const source=readFileSync('dist/workbench.js','utf8').split(/\r?\n/);
const labels=source.find(line=>line.startsWith('const pairLabels='));
const form=source.find(line=>line.startsWith('function metalForm('));
const render=runInNewContext(labels+'\n'+form+'\nmetalForm',{
 ENTRY_PAIRS,state:{accounts:[{id:'preview',equity:1000000}],accountId:'preview',summary:{account:{id:'preview',alias:'测试账户'}}},
 section:()=>'',statusBadge:()=>'',layerRows:()=>'',accountOptions:()=>'',esc:value=>String(value??''),
 option:(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`
});

test('入场下拉框新名称保持四项顺序及原内部值',()=>{
 const dom=new JSDOM(render({id:'preview',layers:{},plan:{payload:{pairType:ENTRY_PAIRS[0]}}}));
 const options=[...dom.window.document.querySelector('[name="pairType"]').options];
 assert.deepEqual(options.map(option=>option.value),ENTRY_PAIRS);
 assert.equal(dom.window.document.querySelectorAll('#riskCalc,#approvePlan').length,0);
 assert.equal(dom.window.document.querySelector('#submitToEarth').textContent,'下一步：交给土执行');
 assert.deepEqual(options.map(option=>option.textContent),[
  '穿10日均线入场 / 区间上下沿止损','反K收线入场 / 前一根反K止损',ENTRY_PAIRS[2],ENTRY_PAIRS[3]
 ]);
 dom.window.close();
});

test('原计划的四种手法均能回显，前两项显示修正后的名称',()=>{
 for(const pairType of ENTRY_PAIRS){
  const dom=new JSDOM(render({id:'preview',layers:{},plan:{payload:{pairType}}}));
  const select=dom.window.document.querySelector('[name="pairType"]');
  assert.equal(select.value,pairType);
  assert.ok(select.selectedOptions[0].selected);
  if(pairType===ENTRY_PAIRS[0])assert.match(select.selectedOptions[0].textContent,/区间上下沿止损/);
  if(pairType===ENTRY_PAIRS[1])assert.match(select.selectedOptions[0].textContent,/反K收线入场/);
  dom.window.close();
 }
});
