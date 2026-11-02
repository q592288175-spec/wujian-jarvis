import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fullCard,systemGovernance,ruleRegistry} from './five-workbench.mjs';
const OCTOBER=resolve('../../');
const SOURCES=[
 ['职责说明','1_交易/团队与私募/2026-10-04_五行交易团队职责框架_v1.0.md'],
 ['学习参考，不覆盖执行规则','4_技能/交易/wujian-ekb-advisor/references/03_当前边界与工作接口.md'],
 ['整理层，不覆盖原件','2_研究/五简知识库/主题/T07_团队协作与独立复核.md'],
];
export async function teamContext(cardId){
 const rules=await ruleRegistry(),g=systemGovernance(),sources=[];
 for(const [authority,relativePath] of SOURCES){
  const path=resolve(OCTOBER,relativePath);
  const frozen=g.active?.snapshot?.contents?.find(x=>x.path===path);
  try{const content=frozen?.content??await readFile(path,'utf8');sources.push({authority,path,sha256:createHash('sha256').update(content).digest('hex'),excerpt:content.slice(0,12000),truncated:content.length>12000,locked:!!frozen})}
  catch{sources.push({authority,path,missing:true})}
 }
 const card=cardId?fullCard(cardId):null;
 return{runId:g.active?.id||null,ruleHash:rules.combinedHash,sourceChanged:rules.sourceChanged||false,responsibilities:g.active?.snapshot?.responsibilities||g.responsibilities,
  card:card?{id:card.id,roundId:card.roundId,status:card.status,fire:card.fire,water:card.water,plan:card.plan,trade:card.trade,issues:card.supervision}:null,sources};
}
