import {readFile} from 'node:fs/promises';
import {axesFor} from './three-axes.mjs';
import {completedSeries,analyzeStructure,barDate} from '../dist/structure.js';
export const decisionProtocol=()=>readFile(new URL('../knowledge/review-method/PROTOCOL.md',import.meta.url),'utf8');
export function decisionEvidence(q,snapshot={}){
 const axes=axesFor(q),bars=completedSeries(q),last=bars.at(-1),prev=bars.at(-2);
 const valid=Number.isFinite(q.volume)&&q.volume>10000&&Number.isFinite(q.openInterest)&&q.openInterest>10000;
 const usable=snapshot.status==='observing'&&valid;
 const side=usable&&['long','short'].includes(axes.side)?axes.side:null;
 return {methodVersion:'2.0',symbol:q.symbol,name:axes.name,dataAsOf:snapshot.receivedAt||null,quoteTime:q.quoteTime||null,timeStatus:q.quality?.timeStatus||'unknown',status:side?'观察候选':'证据不足或环境分歧',allowedDirection:side,cornerProxy:side==='long'?'右上环境代理待裸K确认':side==='short'?'右下环境代理待裸K确认':'未知或分歧',structure:analyzeStructure(q),axes,nakedK:{asOf:last?barDate(last):null,last:last?{open:last.open,high:last.high,low:last.low,close:last.close,body:Math.abs(last.close-last.open),upperWick:last.high-Math.max(last.open,last.close),lowerWick:Math.min(last.open,last.close)-last.low}:null,highLowProgression:last&&prev?{higherHigh:last.high>prev.high,higherLow:last.low>prev.low,lowerHigh:last.high<prev.high,lowerLow:last.low<prev.low}:null,recent:bars.slice(-8).map(b=>({date:barDate(b),open:b.open,high:b.high,low:b.low,close:b.close}))},decisionCard:{entry:null,stop:null,riskBudgetYuan:null,lots:null,approval:'等待五简拍板'},missing:['触发模板与结构失效点确认','账户权益与单笔预算','核实后的合约乘数、费用和滑点','保证金、流动性、板块及组合剩余额度'],permission:false,notice:'方向代理不等于完整图形信号；历史报价只作对应日期研究；不自动产生入场点或账户仓位。'};
}
export function calculatePlanRisk(a={}){
 const pos=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
 const nonneg=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 if(!['long','short'].includes(a.direction)||a.direction!==a.allowedDirection)throw Error('只能沿已核验的允许方向计算；环境分歧或逆势不生成计划');
 if(![a.entry,a.stop,a.multiplier,a.riskBudgetYuan].every(pos)||!nonneg(a.costPerLot))throw Error('缺少有效入场、止损、乘数、预算或每手费用滑点');
 if(a.direction==='long'?a.stop>=a.entry:a.stop<=a.entry)throw Error('结构止损必须位于方向对应的失效侧');
 const riskPerLot=Math.abs(a.entry-a.stop)*a.multiplier+a.costPerLot;
 const riskCapLots=Math.floor(a.riskBudgetYuan/riskPerLot);
 const caps=['marginCapLots','liquidityCapLots','portfolioCapLots'];
 const missing=caps.filter(k=>!Number.isSafeInteger(a[k])||a[k]<0);
 const lots=missing.length?null:Math.min(riskCapLots,...caps.map(k=>a[k]));
 return {basis:'仅按明确输入计算，未连接交易账户或独立核验入场信号',riskPerLotYuan:riskPerLot,riskBudgetYuan:a.riskBudgetYuan,riskCapLots,lots,plannedLossYuan:lots===null?null:lots*riskPerLot,notionalYuan:lots===null?null:lots*a.entry*a.multiplier,missing,approval:'等待五简拍板',permission:false,notice:missing.length?'仅风险上限手数，约束未齐，不能作为可执行仓位':'算术上限，不是交易许可；跳空、涨跌停可能使实际损失超过预算'};
}
export const decisionTools=[{name:'get_futures_decision_evidence',description:'按实际合约读取裸K、完成月周日MA10、允许方向与决策卡缺项；用以产出国内期货条件计划，不能凭空报买点。',parameters:{type:'object',properties:{symbol:{type:'string'}},required:['symbol'],additionalProperties:false}},{name:'calculate_futures_plan_risk',description:'用户给出预算、入场、止损及核验乘数后，计算每手风险、金额和上限手数。不得猜账户参数；保证金/流动性/组合额度缺失时最终手数为null。仅人工输入算术，不独立核验信号。',parameters:{type:'object',properties:{direction:{type:'string',enum:['long','short']},allowedDirection:{type:'string',enum:['long','short']},entry:{type:'number'},stop:{type:'number'},multiplier:{type:'number'},riskBudgetYuan:{type:'number'},costPerLot:{type:'number'},marginCapLots:{type:'integer'},liquidityCapLots:{type:'integer'},portfolioCapLots:{type:'integer'}},required:['direction','allowedDirection','entry','stop','multiplier','riskBudgetYuan','costPerLot'],additionalProperties:false}}];
