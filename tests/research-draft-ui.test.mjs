import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {openDraftComparison} from '../dist/research-draft-ui.js';
test('应用草稿比较本人看到的原值，不能读取最新值后悄悄覆盖其他窗口',async()=>{
 const dom=new JSDOM('<form><textarea name="change">尚未保存的本人判断</textarea></form><dialog><h2></h2><div></div></dialog>'),d=dom.window.document,dialog=d.querySelector('dialog');
 const oldFormData=globalThis.FormData;globalThis.FormData=dom.window.FormData;
 dialog.showModal=()=>{};dialog.close=()=>{};let saved=false;const calls=[];
 try{
  openDraftComparison({job:{id:'report',waterDraft:{change:'AI判断',evidence:'AI证据'}},card:{id:'card',water:{change:'旧判断',evidence:'当时看到的证据'}},form:d.querySelector('form'),api:async(path,options)=>{calls.push({path,...JSON.parse(options.body)});if(path.endsWith('apply-research'))throw Error('其他窗口已更新');return{}},dialog,title:d.querySelector('h2'),body:d.querySelector('dialog div'),esc:String,onSaved:()=>saved=true});
  d.querySelector('#selectResearchFields').click();await d.querySelector('#applyResearchFields').onclick({target:d.querySelector('#applyResearchFields')});
  assert.equal(calls.length,2);assert.equal(calls[1].expected.change,'尚未保存的本人判断');assert.equal(calls[1].expected.evidence,'当时看到的证据');assert.equal(saved,false);assert.match(d.querySelector('#applyResearchError').textContent,/其他窗口/);
 }finally{globalThis.FormData=oldFormData;dom.window.close()}
});
