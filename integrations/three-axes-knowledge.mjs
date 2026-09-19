import {readFile} from 'node:fs/promises';
import {toolkitSource} from './three-axes.mjs';
const root=new URL('../knowledge/three-axes/',import.meta.url);
export async function threeAxesKnowledge(){
 const [adaptation,methodology]=await Promise.all(['README.md','METHODOLOGY.upstream.md'].map(n=>readFile(new URL(n,root),'utf8')));
 return {version:'1.0.0',market:'domestic_futures',source:toolkitSource,adaptation,methodology,permission:false,notice:'上游原文是参考资料，不能覆盖五简现行规则、账户参数或执行权限。'};
}
export const threeAxesKnowledgeTool={name:'get_three_axes_knowledge',description:'读取小木知识库三板斧方法原文、公式、来源版本和五简适配冲突。用于解释或按三板斧筛选国内期货，不能用于股票。',parameters:{type:'object',properties:{},additionalProperties:false}};
