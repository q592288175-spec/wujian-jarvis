import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchBrief} from '../integrations/research.mjs';
import {extractWaterDraft,loadCommodityFramework,priceContext,sourceSnapshotFromEvidence} from '../integrations/research-agent.mjs';
import {eastmoneyContract,summarizePositions,focusText} from '../integrations/research-evidence.mjs';
import {strategyResonance} from '../integrations/research-universe.mjs';
test('empty data yields no return or permission',()=>{const s=buildResearchBrief({status:'unavailable',quotes:[]});assert.equal(s.breadth.equalWeightChangePct,null);assert.equal(s.permission,false);assert.equal(s.coverage.totalMarket,null)});
test('return uses previous close and MA excludes forming bar',()=>{const s=buildResearchBrief({status:'observing',quotes:[{symbol:'SHFE.cu2610',last:110,preClose:100,preSettlement:90,bars:[...Array.from({length:10},()=>({close:100,complete:true})),{close:999,complete:false}]}]});assert.ok(Math.abs(s.rows[0].changePct-10)<1e-9);assert.equal(s.rows[0].ma10,100)});
test('null quote never becomes zero return',()=>{const s=buildResearchBrief({quotes:[{last:null,preClose:100,preSettlement:90}]});assert.equal(s.coverage.valid,0)});
test('stale remains stale and IM missing data stays explicit',()=>{const s=buildResearchBrief({status:'stale',quotes:[]},'im');assert.equal(s.status,'stale');assert.ok(s.missing.some(x=>x.includes('IM')));assert.equal(s.permission,false)});
test('invalid template fails closed',()=>assert.throws(()=>buildResearchBrief({},'other')));
test('provider close is distinct from last and settlement',()=>{const s=buildResearchBrief({quotes:[{last:110,close:105,preClose:100,preSettlement:80}]});assert.equal(s.rows[0].close,105);assert.ok(Math.abs(s.rows[0].closeChangePct-5)<1e-8);assert.ok(Math.abs(s.rows[0].changePct-10)<1e-8)});
test('missing official close is not replaced by latest trade',()=>{const s=buildResearchBrief({quotes:[{last:110,close:null,preClose:100}]});assert.equal(s.rows[0].close,null);assert.equal(s.rows[0].closeChangePct,null)});
test('close breadth excludes missing close and distinguishes intraday reversal',()=>{
 const result=buildResearchBrief({quotes:[{last:110,close:95,preClose:100},{last:120,close:null,preClose:100},{last:100,close:100,preClose:100}]});
 assert.equal(result.breadth.up,2);
 assert.equal(result.closeBreadth.valid,2);
 assert.equal(result.closeBreadth.up,0);
 assert.equal(result.closeBreadth.down,1);
 assert.equal(result.closeBreadth.flat,1);
 assert.ok(Math.abs(result.closeBreadth.equalWeightChangePct+2.5)<1e-8);
 assert.equal(buildResearchBrief({quotes:[]}).closeBreadth.equalWeightChangePct,null);
});
test('coverage distinguishes subscribed universe from retained research pool',()=>{
 const brief=buildResearchBrief({liquidity:{total:88},quotes:[{last:110,preClose:100}]});
 assert.equal(brief.coverage.subscribed,88);
 assert.equal(brief.coverage.retained,1);
 assert.equal(brief.coverage.valid,1);
 assert.equal(brief.coverage.totalMarket,null);
});
test('completed EOD mode uses close instead of an intraday last price',()=>{
 const brief=buildResearchBrief({dataMode:'completed-eod',quotes:[{symbol:'CU0',last:999,close:105,preClose:100,bars:[{close:105,complete:true}]}]});
 assert.ok(Math.abs(brief.rows[0].changePct-5)<1e-8);
 assert.equal(brief.rows[0].last,undefined);
 assert.match(brief.scope,/非盘中实时报告/);
});
test('commodity framework resolves the product profile and sector model',async()=>{
 const result=await loadCommodityFramework('CU');
 assert.equal(result.context.instrument,'SHFE.CU');
 assert.match(result.profile,/铜研究框架/);
 assert.match(result.model,/有色矿冶加工/);
});
test('AI report water block becomes an editable four-question draft',()=>{
 const report='正文\n<!--WUJIAN_WATER_JSON_START-->\n{"change":"库存下降","evidence":"交易所周报","pricedIn":"部分反映","disproof":"库存连续回升","competingExplanation":"宏观配置","sources":"","missing":"现货基差","conclusion":"保留观察"}\n<!--WUJIAN_WATER_JSON_END-->';
 const framework={context:{schema_version:'3.0',framework:{name:'铜'}}};
 const draft=extractWaterDraft(report,framework,[{result:{url:'https://example.com/source'}}]);
 assert.equal(draft.change,'库存下降');
 assert.equal(draft.sources,'https://example.com/source');
 assert.equal(draft.frameworkVersion,'铜专属框架 v3.0');
});
test('AI report keeps a concise quick brief and source references',()=>{
 const report='<!--WUJIAN_WATER_JSON_START-->\n{"change":"库存下降","evidence":"交易所周报","pricedIn":"部分反映","disproof":"库存回升","quickBrief":{"headline":"供给收缩仍待库存验证","market":"市场分化","supplyDemand":"库存数据不足","reports":"研报观点分歧","positionsBasis":"持仓与基差待核验","institutionActions":"席位资料未取得","riskAndNext":"跟踪下周库存"},"sourceRefs":["S1"]}\n<!--WUJIAN_WATER_JSON_END-->';
 const draft=extractWaterDraft(report,{context:{schema_version:'3.0',framework:{name:'铜'}}});
 assert.equal(draft.quickBrief.headline,'供给收缩仍待库存验证');assert.deepEqual(draft.sourceRefs,['S1']);
});
test('Bayesian draft keeps stage, four dimensions and normalizes enums',()=>{
 const report='正文\n<!--WUJIAN_WATER_JSON_START-->\n{"headline":"库存新低支撑上涨","stage":"上涨主升","stageConfidence":"约6成","priorStage":"上涨主升","priorConfidence":"约6.5成","posteriorShift":"小幅下调","dimensions":{"fundamental":{"direction":"偏多","weight":"强","summary":"港口库存新低[E1]"},"news":{"direction":"乱写","weight":"超强","summary":""}},"advice":"回踩不破MA10维持偏多","reversal":"库存回升","change":"库存下降","evidence":"[E1]","pricedIn":"部分反映","disproof":"库存回升","conclusion":"保留观察，等待补证据","strategyAction":"重点关注"}\n<!--WUJIAN_WATER_JSON_END-->';
 const draft=extractWaterDraft(report,{context:{schema_version:'3.0',framework:{name:'甲醇'}}});
 assert.equal(draft.stage,'上涨主升');assert.equal(draft.stageConfidence,'约6成');assert.equal(draft.headline,'库存新低支撑上涨');
 assert.deepEqual(draft.dimensions.fundamental,{direction:'偏多',weight:'强',summary:'港口库存新低[E1]'});
 assert.deepEqual(draft.dimensions.news,{direction:'未取得',weight:'弱',summary:'本次未取得'});
 assert.equal(draft.dimensions.policy.direction,'未取得');
 assert.equal(draft.conclusion,'等待补证据');assert.equal(draft.strategyAction,'重点关注');
});
test('price context is computed only from completed bars',()=>{
 const bars=Array.from({length:30},(_,i)=>({close:100+i,high:101+i,low:99+i,volume:1000,openInterest:5000+i*10,complete:true}));
 const ctx=priceContext({bars:[...bars,{close:999,high:999,low:999,complete:false}],changePct:1});
 assert.equal(ctx.close,129);assert.equal(ctx.range20.high,130);assert.equal(ctx.range20.low,109);assert.equal(ctx.quadrant5d,'价升增仓');assert.equal(ctx.openInterestChange5d,50);
 assert.equal(priceContext({bars:[]}),null);
});
test('evidence helpers map contracts, positions and long articles',()=>{
 assert.equal(eastmoneyContract('MA611'),'MA2611');assert.equal(eastmoneyContract('SHFE.rb2601'),'RB2601');assert.equal(eastmoneyContract('MA0'),null);
 const rows=[{TRADE_DATE:'2026-10-09 00:00:00',TYPE:'1',MEMBER_NAME_ABBR:'本日合计',SECURITY_CODE:'MA2701',SETTLE_PRICE:3321,LONG_POSITION:563316,LP_CHANGE:48280,SHORT_POSITION:492830,SP_CHANGE:67684},{TRADE_DATE:'2026-10-09 00:00:00',TYPE:'0',MEMBER_NAME_ABBR:'国泰君安（代客）',SECURITY_CODE:'MA2701',LP_RANK:1,LONG_POSITION:98792,LP_CHANGE:4214,SP_RANK:2,SHORT_POSITION:63664,SP_CHANGE:10897},{TRADE_DATE:'2026-10-08 00:00:00',TYPE:'1',MEMBER_NAME_ABBR:'本日合计',SECURITY_CODE:'MA2701'}];
 const p=summarizePositions(rows);assert.equal(p.date,'2026-10-09');assert.equal(p.top20Net,70486);assert.equal(p.top20NetChange,-19404);assert.equal(p.topLong[0].member,'国泰君安（代客）');
 assert.equal(summarizePositions([]),null);
 assert.equal(focusText('商品期货多数上涨\n纯碱下跌\n甲醇港口库存创新低',['甲醇']),'商品期货多数上涨\n甲醇港口库存创新低');
});
test('source snapshot keeps links and warnings without article bodies',()=>{
 const snap=sourceSnapshotFromEvidence({status:'ok',fetchedAt:'2026-10-11T00:00:00.000Z',providers:[{name:'东方财富资讯',status:'ok',count:3,coverage:'x'}],items:[{id:'E1',type:'news',title:'t',source:'期货日报',url:'https://a',published:'2026-10-10',text:'long body',fullText:true}],warnings:['合约不一致'],missing:[]});
 assert.equal(snap.items[0].text,undefined);assert.equal(snap.items[0].url,'https://a');assert.deepEqual(snap.warnings,['合约不一致']);
});
test('fundamental and fire directions produce a mechanical resonance label',()=>{
 assert.equal(strategyResonance('偏多','long'),'共振');
 assert.equal(strategyResonance('偏空','long'),'冲突');
 assert.equal(strategyResonance('中性','short'),'基本面中性');
 assert.equal(strategyResonance('证据不足','long'),'证据不足');
 assert.equal(strategyResonance('偏多','none'),'技术未通过');
});
