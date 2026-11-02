import test from 'node:test';
import assert from 'node:assert/strict';
import {reportObject,auditExpertReport,numericTokens} from '../integrations/research-expert-report.mjs';
import {mpaSeries,relevantEvidence,collectExpertEvidence} from '../integrations/research-expert-evidence.mjs';
import {parseDocument,publicAddress} from '../integrations/research-document.mjs';
import {parseYuanbao,yuanbaoSearch} from '../integrations/research-search.mjs';
import {priceContext,reviewSavedReport} from '../integrations/research-agent.mjs';
import {runExpertModel} from '../integrations/research-model.mjs';
const quote='统计期2026年9月，燃料油样本库存为100万吨，同比增加10%。';
const evidence={items:[{id:'E1',fullText:true,type:'research',text:quote,published:'2026-10-20',observedPeriod:'2026-09'}]};
const checklist=[{id:'inventory',label:'库存'}];
const encode=expert=>'正文[E1]\n<!--WUJIAN_WATER_JSON_START-->'+JSON.stringify({expert})+'<!--WUJIAN_WATER_JSON_END-->';
const valid=()=>({claims:[{claim:'样本库存100万吨',evidenceId:'E1',quote,kind:'fact'}],coverage:[{metricId:'inventory',status:'supported',quote,evidenceIds:['E1'],period:'2026-09',unit:'万吨'}]});
const now=new Date('2026-10-21T00:00:00Z');
test('专家报告校验原句、数值和完整指标；不能将引用匹配称为预测准确率',()=>{
 const result=auditExpertReport(encode(valid()),evidence,checklist,now);
 assert.equal(result.status,'complete');assert.equal(result.supported,1);
 assert.match(result.notice,/不保证原始发布真实/);
 const wrong=valid();wrong.claims[0].claim='样本库存900万吨';
 assert.match(auditExpertReport(encode(wrong),evidence,checklist,now).issues.join(),/引文核对/);
});
test('单位未知、指标缺失、未来发布、虚构引用均不能算完整',()=>{
 const input=valid();input.coverage[0].unit='单位待核对';
 assert.equal(auditExpertReport(encode(input),evidence,checklist,now).supported,0);
 assert.equal(auditExpertReport(encode(valid())+'[E99]',evidence,checklist,now).issues.length,1);
 const future={items:[{...evidence.items[0],published:'2030-01-01'}]};
 assert.equal(auditExpertReport(encode(valid()),future,checklist,now).issues.length,1);
 assert.equal(auditExpertReport(encode(valid()),evidence,[...checklist,{id:'supply'}],now).coverage[1].status,'missing');
});
test('模型JSON字段形状异常不使任务崩溃；兼容根级claims但不放行空论断',()=>{
 const parsed=reportObject('<!--WUJIAN_WATER_JSON_START-->{"expert":{},"claims":[{"claim":"a"}],"coverage":[]}<!--WUJIAN_WATER_JSON_END-->');
 assert.equal(parsed.expert.claims.length,1);
 for(const text of [encode({claims:{},coverage:'bad'}),'<!--WUJIAN_WATER_JSON_START-->null<!--WUJIAN_WATER_JSON_END-->']){
  assert.match(auditExpertReport(text,evidence,checklist,now).issues.join(),/缺少/);
 }
});
test('摘要只能作为明确标识的线索，不能冒充已读正文',()=>{
 const e={items:[{...evidence.items[0],fullText:false}]},v=valid();
 assert.equal(auditExpertReport(encode(v),e,checklist,now).claims[0].status,'needs-review');
 v.claims[0]={...v.claims[0],kind:'clue',claim:'仅摘要线索：样本库存100万吨'};
 assert.equal(auditExpertReport(encode(v),e,checklist,now).claims[0].status,'clue-matched');
 assert.equal(auditExpertReport(encode(v),e,checklist,now).supported,0);
});
test('真实月度序列只比较相邻月份，不把缺月当环比，不补零',()=>{
 const row=(month,value)=>({month,bunker_sales:value,bunker_type:'Marine Fuel Oil'});
 const [s]=mpaSeries([row('2025-09','100'),row('2026-07','100'),row('2026-09','110'),row('2026-10','na'),row('2030-01','999')],now);
 assert.equal(s.period,'2026-09');assert.equal(s.changeMoM,null);assert.equal(s.changeYoY,10);
 assert.match(s.unit,/待交叉复核/);assert.equal(s.sampleCount,3);
});
test('采证同时要求品种和指标匹配，不把同一次搜索的杂文算覆盖',()=>{
 const fw={name:'燃料油',aliases:['FU','高硫燃料油']},metric={label:'库存',keywords:['库存']};
 assert.equal(relevantEvidence({title:'绿色金融',text:'消费需求与库存'},fw,metric),false);
 assert.equal(relevantEvidence({title:'燃料油',text:'价格上涨'},fw,metric),false);
 assert.equal(relevantEvidence({title:'燃料油',text:'新加坡库存下降'},fw,metric),true);
});
test('首轮无关结果自动补查，已中断研究不再启动搜索',async()=>{
 let calls=0;
 const fw={symbol:'TEST',name:'测试品种',exchange:'CFFEX',metrics:[]};
 const result=await collectExpertEvidence(fw,{search:async()=>{calls++;return{items:[]}}});
 assert.equal(calls,4);assert.equal(result.attempts.length,4);
 const controller=new AbortController();controller.abort();
 await assert.rejects(collectExpertEvidence(fw,{signal:controller.signal,search:async()=>{throw Error('不应调用')}}),/abort/i);
});
test('正文读取保留表格，去除脚本；拒绝内网地址',()=>{
 const doc=parseDocument('<title>测试</title><nav>广告</nav><p>燃料油正文</p><table><tr><th>库存</th><td>100</td></tr></table><script>bad()</script>');
 assert.match(doc.text,/库存.*100/);assert.doesNotMatch(doc.text,/bad|广告/);
 for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.2','172.16.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fd00::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('1.1.1.1'),true);
});
test('交易所公告的行内标签不能把1500拆成15和00；日期格式不冒充负数',()=>{
 const d=parseDocument('<p>2026年<span>10</span>月13日起，FU261<span>1</span>限额<span>15</span><b>00</b>手。</p>');
 assert.match(d.text,/FU2611.*1500手/);
 assert.deepEqual(numericTokens('2026-10-13，1,500手，-2.36%'),[2026,10,13,1500,-2.36]);
 const e={items:[{id:'E1',text:d.text,fullText:true}]};
 const value={claims:[{claim:'2026-10-13起FU2611限额1500手',evidenceId:'E1',quote:d.text,kind:'fact'}]};
 assert.equal(auditExpertReport(encode(value),e,[],now).issues.length,0);
 value.claims[0].claim='FU2611限额150手';assert.equal(auditExpertReport(encode(value),e,[],now).issues.length,1);
});
test('元宝按官方Pages协议读取，拒绝未知来源；凭证不进入输出',async()=>{
 const data={Response:{Pages:[JSON.stringify({title:'官方',url:'https://www.shfe.com.cn/a',passage:'数据'}),JSON.stringify({url:'https://evil.example/a'}),'bad']}};
 assert.equal(parseYuanbao(data).length,1);assert.deepEqual(parseYuanbao({Response:{Pages:{}}}),[]);
 let body,headers,reserved=0;
 const results=await yuanbaoSearch('燃料油',{apiKey:'test-secret',reserve:async()=>reserved++,fetchImpl:async(_url,options)=>{body=options.body;headers=options.headers;return{ok:true,json:async()=>data}}});
 assert.deepEqual(JSON.parse(body),{Query:'燃料油'});assert.equal(headers.Authorization,'Bearer test-secret');assert.equal(reserved,1);assert.doesNotMatch(JSON.stringify(results),/test-secret/);
});
test('持仓缺失不压缩交易日，不将前日有效数据冒充今日',()=>{
 const bars=Array.from({length:7},(_,i)=>({complete:true,close:100+i,low:99+i,high:101+i,openInterest:i===6?undefined:100+i,volume:100}));
 const p=priceContext({bars,changePct:1});assert.equal(p.openInterestChange5d,null);assert.equal(p.quadrant1d,null);assert.equal(p.quadrant5d,null);
});
test('长报告截断自动压缩重做一次；计入失败用量，不掩盖余额和密钥错误',async()=>{
 const calls=[],stages=[];
 const result=await runExpertModel({messages:[{role:'user',content:'资料'}],onRetry:s=>stages.push(s),model:async args=>{calls.push(args);if(calls.length===1)throw Object.assign(Error('截断'),{code:'MODEL_LENGTH',totalTokens:100});return{text:'完成',totalTokens:80}}});
 assert.equal(result.totalTokens,180);assert.equal(calls.length,2);assert.equal(calls[1].thinking,false);assert.equal(stages.length,1);
 let failures=0;
 await assert.rejects(runExpertModel({messages:[],model:async()=>{failures++;throw Error('余额不足')}}),/余额/);
 assert.equal(failures,1);
});
test('已知研究合约是标识符而非行情数字；未知合约不被放行，复核不改原报告',()=>{
 const v=valid();v.claims[0].claim+='；不能据此确认FU2701走势';
 const e={items:[...evidence.items,{id:'E0',type:'price',text:'{"contract":"FU2701"}'}],checklist};
 assert.equal(auditExpertReport(encode(v),e,checklist,now).issues.length,0);
 v.claims[0].claim+='或FU9999';assert.equal(auditExpertReport(encode(v),e,checklist,now).issues.length,1);
 const old={id:'old',status:'completed',researchVersion:'expert-v1',created:now.toISOString(),quality:{version:1,issues:['旧校验器误报']},framework:{name:'燃料油',version:'3.0'},report:encode(valid()),sources:[],evidence:{external:e}};
 const snapshot=JSON.stringify(old),updated=reviewSavedReport(old);
 assert.equal(updated.quality.issues.length,0);assert.equal(JSON.stringify(old),snapshot);assert.equal(updated.originalQuality.issues[0],'旧校验器误报');
});
test('未标合约的夜盘价不能与研究合约均线比较，加免责声明也不放行',()=>{
 const e={items:[...evidence.items,{id:'E0',type:'price',text:'{"contract":"FU2701"}'},{id:'E2',type:'news',text:'燃油报价4619元/吨，未标合约'}]};
 const result=auditExpertReport('4619低于日MA10 4633.1，但合约待核对。[E2]\n\n'+encode(valid()),e,checklist,now);
 assert.match(result.issues.join(),/未标具体合约/);
});
