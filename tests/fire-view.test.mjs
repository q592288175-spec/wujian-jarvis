import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {updateFireView} from '../dist/fire-view.js';
import {mountStrength} from '../dist/relative-strength-ui.js';
const html=(mode='共振',extra='')=>`<section id="fireScanPanel"><details><summary>覆盖</summary><p>资料</p></details><div class="fire-modebar"><div class="tabs"><button class="${mode==='共振'?'active':''}">共振</button><button class="${mode==='日K'?'active':''}">日K</button></div><div id="strengthSummary"></div></div><div class="fire-overview">${mode}</div><div class="table-wrap"><table><tbody><tr><td>${mode}</td>${extra}</tr></tbody></table></div></section>`;
test('cycle changes preserve the shell, focus, open coverage and loaded comparison cards',()=>{
 const dom=new JSDOM('<main id="content"></main>',{pretendToBeVisual:true}),root=dom.window.document.querySelector('main');updateFireView(root,html());
 const panel=root.firstChild,tabs=root.querySelector('.tabs'),button=tabs.lastChild,strength=root.querySelector('#strengthSummary'),coverage=root.querySelector('details');
 strength.innerHTML='<button class="strength-pair">原有组合</button>';strength.dataset.snapshot='snapshot';const pair=strength.firstChild;let clicks=0;pair.onclick=()=>clicks++;
 coverage.open=true;button.focus();updateFireView(root,html('日K','<td>新列</td>'));
 assert.equal(root.firstChild,panel);assert.equal(root.querySelector('.tabs'),tabs);assert.equal(dom.window.document.activeElement,button);assert.equal(root.querySelector('#strengthSummary'),strength);assert.equal(strength.firstChild,pair);assert.equal(strength.dataset.snapshot,'snapshot');pair.click();assert.equal(clicks,1);assert.equal(coverage.open,true);
 assert.equal(root.querySelector('.fire-overview').textContent,'日K');assert.equal(root.querySelectorAll('td').length,2);assert.equal(button.className,'active');
 updateFireView(root,html());assert.equal(root.querySelectorAll('td').length,1);dom.window.close();
});
test('entering fire from another page mounts fresh content',()=>{
 const dom=new JSDOM('<main><section>其他页面</section></main>'),root=dom.window.document.querySelector('main');updateFireView(root,html());assert(root.querySelector('#fireScanPanel'));assert(!root.textContent.includes('其他页面'));dom.window.close();
});
test('late strength responses cannot replace a newer completed snapshot',async()=>{
 const dom=new JSDOM('<div id="strengthSummary"></div>'),node=dom.window.document.querySelector('div');let first;
 const payload=cutoff=>({slots:[],selectionPolicy:{sourceMode:'day-trend'},cutoff,pool:{selectedLong:0,selectedShort:0}});
 const pending=mountStrength(node,{api:()=>new Promise(resolve=>first=resolve),esc:String});
 await mountStrength(node,{api:async()=>payload('新快照'),esc:String});first(payload('旧快照'));await pending;assert(node.textContent.includes('新快照'));assert(!node.textContent.includes('旧快照'));dom.window.close();
});
