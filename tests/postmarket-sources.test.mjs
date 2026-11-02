import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {classifyPublication,parseClsSubject,parseExchangeTable,parseShfeRanks,createJin10Client,collectJin10,sourceConnectionStatus,saveSourceConnection} from '../integrations/postmarket-sources.mjs';
import {loadPostmarketEvidence,reviewExplanationInput,explanationProblems} from '../integrations/postmarket-evidence.mjs';
import {postmarketReportHtml} from '../dist/postmarket-review.js';
import {buildThreeModeReview,reviewCalendar} from '../integrations/postmarket-review.mjs';
import {JSDOM} from 'jsdom';
const profiles=[{symbol:'CU',name:'铜',aliases:'沪铜',exchange:'SHFE'},{symbol:'AL',name:'铝',aliases:'沪铝',exchange:'SHFE'},{symbol:'AD',name:'铝合金',exchange:'SHFE'}];
const date='2026-10-09',capturedAt='2026-10-10T08:00:00Z';
function table(kind='warehouse',unit='吨',day=date){return `<html><p>${day}</p><table><tr class="special_row_type"><td>铜</td><td>单位：${unit}</td></tr><tr><td>小计</td><td>900</td><td>100</td></tr><tr><td>总计</td>${(kind==='inventory'?[1000,400,1200,500,200,100]:[800,100]).map(n=>`<td>${n}</td>`).join('')}</tr></table></html>`}
test('北京时间过滤未来资料，盘后与历史背景分开，不拿UTC日期当交易日',()=>{
 assert.equal(classifyPublication('2026-10-09T01:00:00Z',date,capturedAt),'当日盘前 / 盘中消息');
 assert.equal(classifyPublication('2026-10-09T07:00:00Z',date,capturedAt),'盘后信息（仅用于次日背景）');
 assert.equal(classifyPublication('2026-10-09T17:00:00Z',date,capturedAt),null);
 assert.equal(classifyPublication('2026-10-08T01:00:00Z',date,capturedAt),'历史背景');
 assert.equal(classifyPublication('2026-10-09T01:00:00Z',date,'2026-10-09T00:00:00Z'),null);
 assert.equal(classifyPublication('invalid',date,capturedAt),null);
});
test('财联社结构化公开正文区分快讯全文、资讯摘要与验证页',()=>{
 const data={props:{pageProps:{data:{articles:[{article_id:1,article_type:-1,article_title:'【沪铜库存】库存减少',article_time:1791510000},{article_id:2,article_type:0,article_title:'正文标题',article_brief:'摘要',article_time:1791510000}]}}}};
 const items=parseClsSubject(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`);
 assert.equal(items[0].fullText,true);assert.equal(items[1].fullText,false);assert.equal(items[1].text,'摘要');assert.throws(()=>parseClsSubject('<html>验证</html>'),/未返回/);
});
test('交易所仓单只取总计、原单位，不重复小计；周库存不叠加仓单',()=>{
 const [w]=parseExchangeTable(table(),date,'warehouse',profiles);assert.equal(w.value,800);assert.equal(w.change,100);assert.equal(w.unit,'吨');
 const [i]=parseExchangeTable(table('inventory','千克'),date,'inventory',profiles);assert.equal(i.previous,1000);assert.equal(i.value,1200);assert.equal(i.change,200);assert.equal(i.unit,'千克');
 const alloy=table().replace('<td>铜</td>','<td>铝合金</td>');assert.equal(parseExchangeTable(alloy,date,'warehouse',profiles)[0].code,'AD');
 assert.throws(()=>parseExchangeTable(table('warehouse','吨','2026-10-08'),date,'warehouse',profiles),/日期/);assert.throws(()=>parseExchangeTable('<html>访问验证</html>',date,'warehouse',profiles),/日期/);
});
test('席位只汇总本合约前20名，剔除汇总与其他合约，不称资金流',()=>{
 const row={INSTRUMENTID:'cu2611',RANK:1,CJ2:100,CJ2_CHG:10,CJ3:80,CJ3_CHG:-5};
 const result=parseShfeRanks(JSON.stringify({report_date:'20261009',o_cursor:[row,{...row,RANK:-1},{...row,INSTRUMENTID:'cu2612'}]}),date,[{code:'CU',name:'沪铜',contract:'CU2611'}]);
 assert.equal(result[0].value,100);assert.equal(result[0].shortChange,-5);assert.match(result[0].scope,/不能视为/);
 assert.throws(()=>parseShfeRanks('{}',date,[]),/日期/);
});
function mockMcp(handler){return async(url,options)=>{const request=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer mock-secret');options.onHeaders?.(new Headers({'mcp-session-id':'mock-session'}));if(request.method==='initialize'){assert.equal(request.params.protocolVersion,'2025-11-25');return JSON.stringify({result:{protocolVersion:'2025-11-25'}})}assert.equal(options.headers['Mcp-Session-Id'],'mock-session');if(request.method==='notifications/initialized')return '';return JSON.stringify({result:await handler(request)})}}
const tools=[{name:'list_flash',inputSchema:{properties:{cursor:{type:'string'}},additionalProperties:false}},{name:'search_flash',inputSchema:{properties:{keyword:{type:'string'}},required:['keyword']}}];
test('标准MCP保持会话、发现工具资源，structuredContent优先，拒绝未声明参数',async()=>{
 const c=await createJin10Client('mock-secret',mockMcp(r=>r.method==='tools/list'?{tools}:r.method==='resources/list'?{resources:[{uri:'quote://codes'}]}:{structuredContent:{data:{items:[]}},content:[{type:'text',text:'错误的文本'}]}));
 assert.deepEqual((await c.call('list_flash')).data.items,[]);await assert.rejects(()=>c.call('list_flash',{offset:'1'}),/未声明/);await assert.rejects(()=>c.call('search_flash'),/必要/);
});
test('金十按cursor分页，去重不能使用缺失id，额度失败明确部分结果',async()=>{
 let pages=0;
 const read=mockMcp(r=>{if(r.method==='tools/list')return {tools};if(r.method==='resources/list')return {resources:[]};const args=r.params.arguments;
  if(r.params.name==='search_flash')return {isError:true};
  pages++;assert.equal(args.cursor,pages===1?undefined:'next');return {structuredContent:{data:{items:pages===1?[{content:'沪铜库存下降',time:date+'T10:00:00+08:00',url:'https://flash.jin10.com/detail/1'}]:[{content:'沪铜供应变化',time:date+'T16:00:00+08:00',url:'https://flash.jin10.com/detail/2'}],has_more:pages===1,next_cursor:pages===1?'next':null}}};});
 const result=await collectJin10({date,rows:[{code:'CU',name:'沪铜'}]},profiles,'mock-secret',read);assert.equal(pages,2);assert.equal(result.items.length,2);assert.equal(result.provider.status,'partial');assert.ok(result.items.some(a=>a.classification.startsWith('盘后')));
 let called=false;const none=await collectJin10({date,rows:[]},profiles,'',async()=>{called=true});assert.equal(called,false);assert.match(none.provider.reason,/未配置/);
});
test('Token本机配置读回只返回配置状态，证据不含凭据，原文不进入AI大输入',async()=>{
 await mkdir('.runtime/test-postmarket',{recursive:true});const dir=await mkdtemp(resolve('.runtime/test-postmarket/sources-')),path=join(dir,'private.json');
 await saveSourceConnection({jin10Token:'mock-secret'},path);assert.equal((await sourceConnectionStatus(path)).jin10Configured,true);assert.ok(!JSON.stringify(await sourceConnectionStatus(path)).includes('mock-secret'));
 assert.equal(JSON.parse(await readFile(path,'utf8')).jin10Token,'mock-secret');await assert.rejects(()=>saveSourceConnection({jin10Token:'invalid\nvalue'},path),/有效/);
 const report={mode:'all',rows:[{code:'CU',name:'沪铜',contract:'CU2611',sector:'有色金属',judgment:'顺势推进'}],date,focus:{long:['CU'],short:[]}};
 report.evidence=await loadPostmarketEvidence(report,{dbPath:resolve('.runtime/missing.sqlite'),search:async()=>({items:[]}),collect:async()=>({items:[{code:'CU',type:'warehouse',title:'铜仓单',value:100,change:-20,unit:'吨'}],providers:[],documents:[{text:'大原文'}]})});
 assert.equal(report.evidence.products[0].exchangeData[0].id,'S1');assert.ok(!JSON.stringify(reviewExplanationInput(report)).includes('大原文'));assert.match(report.evidence.products[0].missing,/开工/);
});
test('页面显示观测日期、真实单位和来源缺口，恶意正文不能执行',()=>{
 const calendar=reviewCalendar(['2026-10-08',date,'2026-10-12'],new Date(capturedAt));
 const r=buildThreeModeReview({scan:{rows:[],data_date:date},barSets:{},calendar});r.evidence={fetchedAt:capturedAt,items:[{id:'S1',type:'warehouse',name:'沪铜',label:'仓单',observedDate:date,value:800,change:100,unit:'吨',period:'上一交易日',source:'上期所',url:'https://www.shfe.com.cn'}],providers:[{name:'金十数据',status:'unavailable',reason:'未配置'}],products:[],missing:[]};
 const dom=new JSDOM(postmarketReportHtml(r));assert.equal(dom.window.document.querySelectorAll('[data-review-industrial] tbody tr').length,1);assert.match(dom.window.document.body.textContent,/800 吨/);assert.match(dom.window.document.body.textContent,/未配置/);dom.window.close();
});
test('金十引流快讯不是所链接文章全文，不拿不存在的资讯id补正文',async()=>{
 let calls=0;const read=mockMcp(r=>r.method==='tools/list'?{tools}:r.method==='resources/list'?{resources:[]}:(calls++,{structuredContent:{data:{items:[{content:'沪铜库存下降，点击阅读。',time:date+'T10:00:00+08:00',url:'https://flash.jin10.com/detail/1'}],has_more:false}}}));
 const r=await collectJin10({date,rows:[{code:'CU',name:'沪铜'}]},profiles,'mock-secret',read);assert.equal(r.items.length,1);assert.equal(r.items[0].fullText,false);assert.match(r.items[0].notice,/未取得/);assert.equal(calls,2);
});
test('损坏的本机连接配置明确报错，不悄悄当作未配置',async()=>{
 await mkdir('.runtime/test-postmarket',{recursive:true});const dir=await mkdtemp(resolve('.runtime/test-postmarket/config-')),path=join(dir,'bad.json');
 const {writeFile}=await import('node:fs/promises');await writeFile(path,'invalid');await assert.rejects(()=>sourceConnectionStatus(path),/无法读取/);
});
test('AI解释必须保留标题、历史、盘后及周报口径，新闻不证明因果',()=>{
 const report={mode:'all',rows:[],focus:{},evidence:{products:[],items:[{id:'S1',type:'news',fullText:false},{id:'S2',type:'news',fullText:true,classification:'历史背景'},{id:'S3',type:'news',fullText:true,classification:'盘后信息（仅用于次日背景）'},{id:'S4',type:'inventory',period:'较上期周报'}]}};
 for(const text of ['库存紧张[S1]。','受断供支撑上涨[S2]。','出口政策支撑上涨[S3]。','库存当日下降[S4]。'])assert.ok(explanationProblems(text,report).length);
 assert.equal(explanationProblems('仅标题线索待核验[S1]。此前旧消息作为历史背景[S2]。盘后消息只作次日背景[S3]。周库存较上期下降[S4]。',report).length,0);
 const ids=reviewExplanationInput(report).evidence.items.map(s=>s.id);assert.ok(!ids.includes('S1')&&!ids.includes('S2'));
});
