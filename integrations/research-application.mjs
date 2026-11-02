import {getCard,saveWaterNotes} from './five-workbench.mjs';
import {getReport} from './research-agent.mjs';
import {strategyResonance} from './research-universe.mjs';
export async function applyResearchDraft(cardId,input){
 const card=getCard(cardId),job=await getReport(input.reportId);
 if(!card||card.archivedAt)throw Error('交易卡不存在或已归档');
 if(!job||job.status!=='completed'||!job.waterDraft||job.cardId!==card.id||job.contract!==card.contract||job.productCode!==card.symbol)throw Error('报告与当前交易卡不一致或尚未完成');
 const fields=input.fields;if(!Array.isArray(fields)||!fields.length||fields.some(k=>!Object.hasOwn(job.waterDraft,k)))throw Error('请选择要应用的报告字段');
 const values=Object.fromEntries(fields.map(k=>[k,job.waterDraft[k]])),expected={...input.expected};
 if(fields.includes('fundamentalDirection')){
  values.technicalDirection=card.direction;values.resonance=strategyResonance(values.fundamentalDirection,card.direction);
  expected.technicalDirection=card.water?.technicalDirection;expected.resonance=card.water?.resonance;
 }
 return saveWaterNotes(cardId,{values,expected,reportId:job.id});
}
