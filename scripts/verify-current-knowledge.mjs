import {searchKnowledge,knowledgeSource,knowledgeStatus} from '../integrations/knowledge-base.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const queries=['成交量与持仓量等于1万手能通过吗','周日小周期结构参与筛选吗，周MA10价格位置如何判定','月周日共振是否要求突破','具体主力与连续合约有什么区别','余额同步和交易盈亏是否重复记账','下一步交土是否自动下单','删除交易卡会不会丢失历史','以损定量是否包含费用保证金跨品种风险'];
const results=[];
for(const query of queries){const result=await searchKnowledge({query,limit:4});assert.equal(result.policyConflicts.length,0);assert.equal(result.currentRules.documents.length,4);assert.ok(result.currentRules.documents.every(d=>d.lifecycle==='current'));const source=await knowledgeSource(result.hits[0].chunkId);assert.ok(source.content);results.push({query,firstSource:source.title,lifecycle:source.lifecycle,hits:result.hits.map(h=>({title:h.title,lifecycle:h.lifecycle})),currentRulesAttached:true})}
await mkdir('output/final-release',{recursive:true});await writeFile('output/final-release/knowledge-check.json',JSON.stringify({passed:true,checkedAt:new Date().toISOString(),status:await knowledgeStatus(),results,modelCall:false},null,2));console.log(JSON.stringify({passed:true,questions:results.length,modelCall:false}));
