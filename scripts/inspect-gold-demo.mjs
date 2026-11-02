import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildEnvironment} from '../integrations/environment.mjs';
import {contractSpec} from '../integrations/contract-specs.mjs';
import {analyzeMethods,deriveMethod} from '../dist/gold-methods.js';
const api=async p=>(await fetch('http://127.0.0.1:4318'+p)).json();
const fire=await api('/api/workbench/fire'),index=JSON.parse(await readFile('.runtime/environment/commodity-index.json','utf8')),results=[];
for(const code of ['SC','FU','MA','AP','SH','LH']){
 const row=fire.rows.find(x=>x.code===code);if(!row?.ok||row.provisional||!row.modes['month-week-day']?.endsWith('观察'))continue;
 const direction=row.modes['month-week-day']==='多头观察'?'long':'short',card={symbol:code,contract:row.main_contract,direction},env=await buildEnvironment(card,fire,{gold:true,indexData:index}),s=contractSpec(code),series=await api('/api/workbench/fire/bars?contract='+card.contract);
 const a=analyzeMethods({bars:series.bars,direction,cutoff:fire.data_date,tickSize:s.tickSize,contract:card.contract,source:series.source,layers:env.layers}),c=a.candidates.find(c=>c.id===a.recommended);let derived=null;
 try{if(c)derived=deriveMethod(a,{method:c.id,branch:c.branch,...c.range,direction})}catch(e){derived={error:e.message}}
 results.push({row,card,env,s,analysis:a,derived});
}
await mkdir('output/gold-chart-demo',{recursive:true});await writeFile('output/gold-chart-demo/candidates.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(x=>({code:x.card.symbol,contract:x.card.contract,recommended:x.analysis.recommended,permission:x.analysis.permission,derived:x.derived,bars:x.analysis.bars.slice(-3)}))));
