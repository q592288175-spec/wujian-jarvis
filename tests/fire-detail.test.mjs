import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {fireStructure} from '../dist/fire-display.js';

const source=readFileSync('dist/workbench.js','utf8');
const select=source.slice(source.indexOf('async function selectFireForResearch('),source.indexOf('function showManualCandidate('));
const detail=source.slice(source.indexOf('async function showFireDetail('),source.indexOf('function drawChart('));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const row={code:'MA',name:'甲醇',exchange:'CZCE',main_contract:'MA2701',data_date:'2026-10-09',volume:1493099,open_interest:761175,
 modes:{'month-week-day':'多头观察','month-week':'多头观察','week-day':'多头观察'},
 month_ma10:2786.9,week_ma10:2862.6,day_ma10:3003.5,
 previous_week_high:140,week_high:150,previous_week_low:115,week_low:120,
 prior_day_high:148,previous_day_high:149,day_high:150,prior_day_low:120,previous_day_low:121,day_low:122};

function harness({mode='month-week-day',api=async()=>({bars:[]})}={}){
 const dom=new JSDOM('<dialog id="modal"><h2 id="modalTitle"></h2><div id="modalBody"></div></dialog>');
 const doc=dom.window.document,modal=doc.querySelector('dialog'),state={fireMode:mode,accountId:'test-account',waterView:'universe'};
 const navigations=[],notices=[],reminders=[];
 modal.showModal=()=>{modal.open=true};modal.close=()=>{modal.open=false};
 const functions=runInNewContext(select+'\n'+detail+'\n({showFireDetail,selectFireForResearch})',{
  $:selector=>doc.querySelector(selector),state,api,esc,fireStructure,
  fmt:value=>value==null?'未知':Number(value).toLocaleString('zh-CN'),
  loadCore:async()=>{},setView:async view=>navigations.push(view),toast:(...args)=>notices.push(args),
  monitorUI:{openEditor:input=>reminders.push(input)},drawChart:(node,bars)=>{node.textContent=`日K ${bars.length} 根`}
 });
 return {...functions,dom,doc,modal,state,navigations,notices,reminders};
}

test('三个模式的品种详情均展示周K和日K结构，复用现有数值与颜色',async()=>{
 for(const mode of Object.keys(row.modes)){
  const h=harness({mode}),before=JSON.stringify(row);await h.showFireDetail(row);
  assert.deepEqual([...h.doc.querySelectorAll('[data-detail-structure] h3')].map(node=>node.textContent),['周K结构（辅助）','日K结构（辅助）']);
  for(const period of ['week','day']){
   const expected=fireStructure(row,mode,period),blocks=[...h.doc.querySelectorAll(`[data-detail-structure="${period}"] .fire-structure`)];
   assert.deepEqual(blocks.map(node=>node.querySelector('span').textContent),expected.map(item=>item.label));
   assert.deepEqual(blocks.map(node=>node.querySelector('small').textContent),expected.map(item=>item.values));
   assert.ok(blocks.every(node=>node.classList.contains('long-strong')));
  }
  const actions=[...h.doc.querySelector('.fire-detail-actions').children];
  assert.deepEqual(actions.map(node=>node.textContent),['添加盯盘提醒','进入水研究']);
  actions[0].click();assert.equal(h.reminders[0].symbol,'CZCE.MA2701');
  assert.equal(JSON.stringify(row),before);h.dom.window.close();
 }
});

test('空头详情保留深绿完整结构与浅蓝单点结构，缺数据不伪造',async()=>{
 const h=harness(),short={...row,modes:{'month-week-day':'空头观察'},week_high:138,week_low:114,
  prior_day_high:150,previous_day_high:149,day_high:148,prior_day_low:122,previous_day_low:121,day_low:120};
 await h.showFireDetail(short);assert.equal(h.doc.querySelectorAll('.short-strong').length,4);
 await h.showFireDetail({...short,week_low:116});assert.equal(h.doc.querySelectorAll('.short-partial').length,1);assert.equal(h.doc.querySelectorAll('.short-none').length,1);
 await h.showFireDetail({...short,week_high:null,day_high:null});
 assert.match(h.doc.querySelector('[data-detail-structure="week"]').textContent,/数据不足/);
 assert.match(h.doc.querySelector('[data-detail-structure="day"]').textContent,/缺少结构数据/);
 assert.equal(h.doc.querySelectorAll('.short-strong').length,0);h.dom.window.close();
});

test('进入水研究传递所选模式和账户，复用研究卡并关闭详情，不自动运行AI',async()=>{
 const calls=[],h=harness({mode:'week-day',api:async(path,options)=>{
  calls.push({path,options});return path.endsWith('/select')?{id:'existing-card',name:'甲醇',reused:true}:{bars:[]};
 }});
 await h.showFireDetail(row);await h.doc.querySelector('#detailResearch').onclick();
 const post=calls.find(call=>call.options?.method==='POST');
 assert.equal(post.path,'/api/workbench/fire/select');
 assert.deepEqual(JSON.parse(post.options.body),{code:'MA',mode:'week-day',accountId:'test-account'});
 assert.equal(h.state.selectedCard,'existing-card');assert.equal(h.state.waterView,'card');
 assert.deepEqual(h.navigations,['water']);assert.equal(h.modal.open,false);
 assert.ok(h.notices.some(([notice])=>notice.includes('原卡')));assert.equal(calls.some(call=>call.path==='/api/research/run'),false);
 h.dom.window.close();
});

test('选择失败保留详情和可重试按钮，重复点击只提交一次',async()=>{
 let finish,posts=0;const h=harness({api:async(path,options)=>{
  if(!options)return {bars:[]};posts++;return new Promise(resolve=>{finish=resolve});
 }});
 await h.showFireDetail(row);const button=h.doc.querySelector('#detailResearch'),first=button.onclick();
 await button.onclick();assert.equal(posts,1);assert.equal(button.disabled,true);
 finish({id:'new-card',name:'甲醇'});await first;assert.equal(button.disabled,false);h.dom.window.close();
 const failed=harness({api:async(path,options)=>{if(options)throw Error('规则快照已过期，请刷新');return {bars:[]}}});
 await failed.showFireDetail(row);await failed.doc.querySelector('#detailResearch').onclick();
 assert.equal(failed.modal.open,true);assert.equal(failed.doc.querySelector('#detailResearch').disabled,false);
 assert.deepEqual(failed.navigations,[]);assert.match(failed.notices[0][0],/快照已过期/);failed.dom.window.close();
});

test('未纳入模式不能从详情绕过筛选，缺合约不显示一直加载',async()=>{
 const h=harness();await h.showFireDetail({...row,main_contract:null,modes:{}});
 assert.equal(h.doc.querySelector('#detailResearch').disabled,true);
 assert.equal(h.doc.querySelector('#detailMonitor').disabled,true);
 assert.match(h.doc.querySelector('#contractChart').textContent,/具体合约缺失/);h.dom.window.close();
});

test('关闭或切换弹窗后，迟到日K不会覆盖新弹窗或报错',async()=>{
 for(const reject of [false,true]){
  let resolveRequest,rejectRequest;const h=harness({api:()=>new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject})});
  const pending=h.showFireDetail(row);h.modal.close();h.doc.querySelector('#modalBody').textContent='盯盘提醒编辑';h.modal.showModal();
  if(reject)rejectRequest(Error('读取失败'));else resolveRequest({bars:[{close:10}]});
  await pending;assert.equal(h.doc.querySelector('#modalBody').textContent,'盯盘提醒编辑');h.dom.window.close();
 }
});
