import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountGoldSizing} from '../dist/gold-sizing-ui.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
async function fixture(run,{specError=false,pointValue=10,tickSize=1}={}){
 const dom=new JSDOM('<div id="root"></div>'),node=dom.window.document.querySelector('#root'),accounts=[{id:'a',alias:'百万账户',status:'active',equity:1e6},{id:'b',alias:'二十五万账户',status:'active',equity:250000}],changes=[];
 const sizing=mountGoldSizing(node,{card:{name:'测试品种',symbol:'FU',contract:'FU2701',accountId:'a',direction:'long'},accounts,api:async path=>{if(path.includes('contract-spec')){if(specError)throw Error('参数缺口');return{name:'测试合约',pointValue,tickSize,tickValue:pointValue*tickSize}}return accounts},onChange:v=>changes.push(v)});
 const input=(id,value)=>{const e=node.querySelector('#'+id);e.value=String(value);e.dispatchEvent(new dom.window.Event('input',{bubbles:true}))};await tick();
 try{await run({dom,node,sizing,input,changes})}finally{dom.window.close()}
}
test('手填入场与止损实时以损定量，改止损后手数立即重算',()=>fixture(({node,input})=>{
 input('goldSizingEntry',5000);input('goldSizingStop',4900);assert.equal(node.querySelector('#goldSizingLots').value,'10');assert.equal(node.querySelector('#goldSizingPerLot').value,'1,000');input('goldSizingStop',4950);assert.equal(node.querySelector('#goldSizingLots').value,'20');
 input('goldSizingAccount','b');assert.equal(node.querySelector('#goldSizingLots').value,'5');
}));
test('手动价格不被分析建议覆盖，只有主动采用建议才替换',()=>fixture(({node,sizing,input})=>{
 input('goldSizingEntry',5000);input('goldSizingStop',4900);sizing.suggest({entry:5300,stop:4700});assert.equal(sizing.values().entry,5000);assert.equal(sizing.values().stop,4900);node.querySelector('#goldSizingSuggestionButton').click();assert.equal(sizing.values().entry,5300);assert.equal(node.querySelector('#goldSizingLots').value,'1');
}));
test('错误止损、缺失点值与超出既定比例不产生可开手数',async()=>{
 await fixture(({node,input,sizing})=>{input('goldSizingEntry',5000);input('goldSizingStop',5010);assert.equal(node.querySelector('#goldSizingLots').value,'待填写');input('goldSizingStop',4900);input('goldSizingPercent',2);assert.equal(node.querySelector('#goldSizingLots').value,'待核验');sizing.setCycle('small');assert.match(node.querySelector('#goldSizingFeedback').textContent,/0.5%/)});
 await fixture(({node,input})=>{input('goldSizingEntry',5000);input('goldSizingStop',4900);assert.equal(node.querySelector('#goldSizingLots').value,'待填写')},{specError:true});
});
test('小数价差按合约点值精确计算，不因浮点误差少算一手',()=>fixture(({node,input})=>{input('goldSizingEntry',4000);input('goldSizingStop',3999.8);assert.equal(node.querySelector('#goldSizingPerLot').value,'60');assert.equal(node.querySelector('#goldSizingLots').value,'166')},{pointValue:300,tickSize:.2}));
