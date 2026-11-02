import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=promisify(execFile);
const current=resolve(root,'.runtime/contract-specs/current.json');
let pending=null,refreshError=null,lastRefreshDate='';

export function contractSpecs(){
 const snapshots=[];
 for(const path of [current,resolve(root,'data/contract-specs.json')]){
  try{const data=JSON.parse(readFileSync(path,'utf8'));if(data.products&&data.sourceDate)snapshots.push(data)}catch{}
 }
 const data=snapshots.sort((a,b)=>b.sourceDate.localeCompare(a.sourceDate))[0];
 return data?{...data,refreshError}:{products:{},sourceDate:null,refreshError:'合约参数暂不可用'};
}

export function contractSpec(symbol){
 const match=String(symbol||'').trim().toUpperCase().match(/^(?:[A-Z]+\.)?([A-Z]{1,2})(?:\d{3,4})?$/);
 if(!match)return null;
 const data=contractSpecs(),row=data.products[match[1]];
 if(!row||!(row.pointValue>0)||!(row.tickSize>0))return null;
 const hash=createHash('sha256').update(JSON.stringify([row.symbol,row.pointValue,row.tickSize])).digest('hex');
 return {...row,hash,source:data.source,sourceUrl:data.sourceUrl,sourceDate:data.sourceDate,fetchedAt:data.fetchedAt};
}

export function refreshContractSpecs(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return Promise.resolve(contractSpecs());
 if(pending)return pending;
 if(lastRefreshDate===date)return Promise.resolve(contractSpecs());
 const python=resolve(root,process.platform==='win32'?'.venv-akshare/Scripts/python.exe':'.venv-akshare/bin/python');
 pending=run(python,[resolve(root,'integrations/contract_specs.py'),'--date',date],{cwd:root,timeout:30000,maxBuffer:1024*1024})
  .then(()=>{lastRefreshDate=date;refreshError=null;return contractSpecs()})
  .catch(()=>{refreshError='合约参数更新失败，沿用已保存参数';return contractSpecs()})
  .finally(()=>{pending=null});
 return pending;
}
