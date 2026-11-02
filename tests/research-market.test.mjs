import {test} from 'node:test';
import assert from 'node:assert/strict';
import {researchMarket,resolveProduct} from '../integrations/research-market.mjs';
import {buildResearchBrief} from '../integrations/research.mjs';
import {analyzeStructure} from '../dist/structure.js';
import {loadCommodityFramework,researchSystemPrompt} from '../integrations/research-agent.mjs';

const framework={context:{framework:{symbol:'BR',exchange:'SHFE',name:'丁二烯橡胶'}}};
const card={symbol:'BR',contract:'BR2612'};
const bar=(date,close=110,extra={})=>({date,open:100,high:120,low:90,close,volume:8000,openInterest:9000,source:'上期所日行情',provisional:false,...extra});
const bars=[bar('2026-10-09',100),bar('2026-10-12',110)];
const request={product:'BR',framework,card};
const deps=(overrides={})=>({getFire:async()=>({target_date:'2026-10-12',rows:[{code:'BR',main_contract:'BR2612'}]}),getSnapshot:async()=>{throw Error('不得依赖缺少BR的主连快照')},getBars:async contract=>({contract,bars}),now:Date.parse('2026-10-12T16:00:00+08:00'),...overrides});

test('BR research uses exact completed contract even when continuous snapshot omits BR',async()=>{
 const result=await researchMarket(request,deps());
 assert.equal(result.quote.symbol,'SHFE.BR2612');assert.equal(result.quote.seriesType,'specific_contract');
 assert.equal(result.quote.close,110);assert.equal(result.quote.preClose,100);assert.equal(result.quote.volume,8000);
 assert.equal(result.context.source,'上期所日行情');assert.equal(result.context.dataDate,'2026-10-12');
 const brief=buildResearchBrief(result.snapshot);assert.match(brief.scope,/指定具体合约/);assert.match(brief.rows[0].priceNotice,/同一具体合约/);assert.doesNotMatch(brief.rows[0].priceNotice,/主力连续/);
 assert.equal(analyzeStructure(result.quote).day.count,2);
});
test('new main does not replace a card contract and explicit mismatch is rejected',async()=>{
 const result=await researchMarket({...request,card:{...card,contract:'BR2611'}},deps());
 assert.equal(result.quote.actualContract,'BR2611');assert.ok(result.context.warnings.some(s=>s.includes('未自动换月')));
 await assert.rejects(researchMarket({...request,product:'BR2611'},deps()),/与交易卡不一致/);
 await assert.rejects(researchMarket({...request,card:{contract:'RU2612'}},deps()),/与品种研究框架不一致/);
});
test('product without a card uses current scan mapping; explicit contract has precedence',async()=>{
 assert.equal((await researchMarket({product:'丁二烯橡胶',framework},deps())).context.contract,'BR2612');
 assert.equal((await researchMarket({product:'SHFE.BR2611',framework},deps())).context.contract,'BR2611');
});
test('specific source unavailable never silently substitutes another contract',async()=>{
 await assert.rejects(researchMarket(request,deps({getBars:async()=>{throw Error('网络超时')}})),/BR2612.*暂未取得/);
 await assert.rejects(researchMarket(request,deps({getBars:async()=>({contract:'BR2611',bars})})),/行情与研究合约不一致/);
});
test('future, incomplete, provisional and invalid rows are excluded, duplicate dates kept once',async()=>{
 const extra=[bar('2026-10-13'),bar('2026-10-10',110,{provisional:true}),bar('2026-10-11',110,{complete:false}),bar('2026-02-30'),bar('2026-10-08',110,{high:80})];
 const r=await researchMarket(request,deps({getBars:async contract=>({contract,bars:[...bars,...extra,bars[0]]})}));
 assert.equal(r.quote.bars.length,2);assert.equal(r.quote.tradingDay,'2026-10-12');
});
test('current-day bars before postmarket are not treated as completed close',async()=>{
 const r=await researchMarket(request,deps({now:Date.parse('2026-10-12T10:00:00+08:00'),getBars:async contract=>({contract,bars:[bar('2026-10-08'),...bars]})}));
 assert.equal(r.quote.tradingDay,'2026-10-09');assert.ok(r.context.warnings.some(s=>s.includes('历史截点')));
});
test('insufficient close history fails with concrete recoverable reason',async()=>{
 await assert.rejects(researchMarket(request,deps({getBars:async contract=>({contract,bars:[bars[0]]})})),/尚无两根可核验/);
});
test('missing mapping keeps legacy proxy visibly labeled without inventing actual contract',async()=>{
 const r=await researchMarket({product:'BR',framework},deps({getFire:async()=>({rows:[]}),getSnapshot:async()=>({status:'eod-ready',quotes:[{symbol:'SHFE.BR0',seriesType:'main_continuous',name:'丁二烯橡胶',tradingDay:'2026-10-09'}]})}));
 assert.equal(r.context.contract,null);assert.equal(r.context.priceBasis,'主力连续代理');assert.match(r.context.warnings[0],/不提供具体合约价位/);
});
test('legacy resolver recognizes actual contract and rejects ambiguous short names',()=>{
 assert.equal(resolveProduct([{symbol:'SHFE.BR0',actualContract:'BR2612'}],'BR2612').symbol,'SHFE.BR0');
 assert.throws(()=>resolveProduct([{symbol:'SHFE.CU0',name:'沪铜'},{symbol:'SHFE.AL0',name:'沪铝'}],'沪'),/多个品种/);
});
test('BR uses its own model, profile and runtime rather than natural rubber alone',async()=>{
 const loaded=await loadCommodityFramework('BR2612');const prompt=researchSystemPrompt(loaded);
 assert.equal(loaded.context.framework.symbol,'BR');assert.match(prompt,/丁二烯石化成本优先/);
 assert.match(prompt,/顺丁开工/);assert.match(prompt,/牌号库存/);assert.match(prompt,/主连只作明确标注的代理/);
 assert.match(prompt,/统计期不等于发布日期/);assert.match(prompt,/现货低于期货是现货贴水/);assert.match(prompt,/不是历史统计分位/);
 assert.equal(loaded.context.framework.trade_permission,false);
});
