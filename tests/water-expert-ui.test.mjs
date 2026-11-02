import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
test('报告视图可切换和回查来源，恶意HTML不能执行，原始数据不被修改',async()=>{
 const dom=new JSDOM('<main></main>',{url:'http://localhost/'});
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 try{
  const {mountExpertReport}=await import('../dist/water-expert-ui.js');
  const job={id:'sample',created:'2026-10-21',contract:'FU2701',expert:{mainDriver:'<img src=x onerror=alert(1)>',scenarios:[]},quality:{status:'partial',issues:[],coverage:[]},evidence:{external:{items:[{id:'E1',title:'真实来源',url:'javascript:alert(1)',text:'原文示例'}]}},report:'# 报告\n\n## 供需\n\n数据来源[E1]\n\n<script>alert(1)</script>'};
  const original=JSON.stringify(job),node=dom.window.document.querySelector('main');
  mountExpertReport(node,job);
  assert.equal(node.querySelectorAll('img,script').length,0);
  assert.ok(node.textContent.includes('<img'));
  const full=node.querySelector('[data-report-tab="full"]');full.click();
  assert.equal(node.querySelector('[data-report-panel="full"]').hidden,false);
  assert.equal(node.querySelector('[data-report-panel="brief"]').hidden,true);
  node.querySelector('.water-report-markdown a[href="#evidence-E1"]').click();
  assert.equal(node.querySelector('[data-report-panel="evidence"]').hidden,false);
  assert.equal(node.querySelector('#evidence-E1').open,true);
  assert.equal(node.querySelectorAll('a[href^="javascript:"]').length,0);
  assert.equal(JSON.stringify(job),original);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;dom.window.close()}
});
