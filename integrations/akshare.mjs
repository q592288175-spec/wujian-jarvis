import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
const execute=promisify(execFile);
export async function akshareData({product,kind='all',days=30}={}){
 const code=String(product||'').split('.').at(-1).replace(/\d+$/,'').toLowerCase();
 if(!/^[a-z]{1,3}$/.test(code)||!['all','quote','basis','history','daily'].includes(kind)||!Number.isInteger(days)||days<1||days>3650)return {status:'error',error:'需要品种代码，例如rb、cu、SR；查询类型或天数无效'};
 try{const {stdout}=await execute(resolve('.venv-akshare/bin/python'),['-m','futures_data','data',code,'--kind',kind,'--days',String(days)],{timeout:10000,maxBuffer:2000000});return JSON.parse(stdout)}catch{return {status:'unavailable',source:'AKShare',missing:'本地AKShare数据库尚未采集或查询失败，不补造数值'}}
}
export const akshareTools=[{name:'get_akshare_futures_data',description:'读取小木本地免费AKShare数据库：主力行情、现货、基差、历史、日频库存仓单持仓。product传rb/cu/SR或完整合约代码。先查询再回答，注意每条记录的日期和口径，空数组是缺口不是零。',parameters:{type:'object',properties:{product:{type:'string'},kind:{type:'string',enum:['all','quote','basis','history','daily']},days:{type:'integer',minimum:1,maximum:3650}},required:['product'],additionalProperties:false}}];
