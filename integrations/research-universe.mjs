import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {latestFire} from './five-workbench.mjs';
import {atomicWrite} from './research-storage.mjs';
import {getReport,listReports,startResearch} from './research-agent.mjs';

const batchPath=resolve('.runtime/research-batch.json');
let batch=null;
const now=()=>new Date().toISOString();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const codeFromReport=report=>report.productCode||String(report.symbol||'').split('.').at(-1).replace(/\d+$/,'').toUpperCase();
try{batch=JSON.parse(await readFile(batchPath,'utf8'));if(['running','stopping'].includes(batch.status)){batch.status='interrupted';batch.stage='服务重启导致批量研究中断，可重新启动继续未完成品种';batch.finishedAt=now()}}catch{}

export function strategyResonance(fundamentalDirection,technicalDirection){
 if(!['long','short'].includes(technicalDirection))return technicalDirection==='mixed'?'技术分歧':'技术未通过';
 if(fundamentalDirection==='证据不足')return'证据不足';
 if(['中性','分歧'].includes(fundamentalDirection))return'基本面中性';
 return(fundamentalDirection==='偏多'&&technicalDirection==='long')||(fundamentalDirection==='偏空'&&technicalDirection==='short')?'共振':'冲突';
}
function technicalFor(row){const signals=Object.entries(row.modes||{}).filter(([,value])=>['多头观察','空头观察'].includes(value));const sides=[...new Set(signals.map(([,value])=>value==='多头观察'?'long':'short'))];return{direction:sides.length===1?sides[0]:sides.length>1?'mixed':'none',signals:signals.map(([mode,value])=>({mode,value}))}}

export async function researchUniverse(){
 const [fire,reports]=await Promise.all([latestFire(),listReports(Infinity)]),latest=new Map(),completed=new Map();
 for(const report of reports){const code=codeFromReport(report);if(code&&!latest.has(code))latest.set(code,report);if(code&&!completed.has(code)&&report.status==='completed')completed.set(code,report)}
 const rows=(fire.rows||[]).map(row=>{const active=latest.get(row.code),report=completed.get(row.code),technical=technicalFor(row),draft=report?.waterDraft||{},fundamental=draft.fundamentalDirection||'证据不足';return{code:row.code,name:row.name,sector:row.sector||'未分组',contract:row.main_contract||null,dataDate:row.data_date||null,researchable:!!(row.ok&&row.main_contract),technicalDirection:technical.direction,technicalSignals:technical.signals,fundamentalDirection:fundamental,resonance:strategyResonance(fundamental,technical.direction),strategyConclusion:draft.strategyConclusion||'尚未完成品种深度研究',strategyAction:draft.strategyAction||'继续观察',institutionView:draft.institutionView||'尚未核验机构观点',evidenceGrade:draft.evidenceGrade||'D',reportId:report?.id||active?.id||null,researchStatus:active?.status||'pending',researchAsOf:draft.asOf||report?.completed||null,framework:report?.framework||active?.framework||null}});
 return{generatedAt:now(),dataDate:fire.data_date||null,total:rows.length,researchable:rows.filter(row=>row.researchable).length,completed:rows.filter(row=>row.reportId).length,rows};
}

export function researchBatchStatus(){return batch||{status:'idle',total:0,completed:0,failed:0,current:null,startedAt:null,finishedAt:null}}
async function saveBatch(){await atomicWrite(batchPath,JSON.stringify(batch,null,2))}
async function waitForReport(id){for(;;){const report=await getReport(id);if(!report||report.status!=='running')return report;await delay(2000)}}
async function runBatch(codes){
 for(const code of codes){if(batch.status!=='running')break;batch.current=code;batch.stage=`正在研究 ${code}`;await saveBatch();try{const job=await startResearch(code);const report=await waitForReport(job.id);if(report?.status==='completed')batch.completed++;else{batch.failed++;batch.errors.push({code,error:report?.error||'研究未完成'})}}catch(error){batch.failed++;batch.errors.push({code,error:error.message})}batch.processed++;await saveBatch()}
 batch.current=null;batch.finishedAt=now();batch.status=batch.status==='running'?'completed':'stopped';batch.stage=batch.status==='completed'?'全品种研究刷新完成':'批量研究已停止';await saveBatch();
}
export async function startResearchBatch({force=false}={}){
 if(batch?.status==='running')throw Error('全品种研究刷新已经在运行');const universe=await researchUniverse(),codes=universe.rows.filter(row=>row.researchable&&(force||!row.reportId)).map(row=>row.code);
 batch={id:randomUUID(),status:'running',stage:'正在建立全品种研究队列',total:codes.length,processed:0,completed:0,failed:0,current:null,errors:[],startedAt:now(),finishedAt:null};await saveBatch();void runBatch(codes);return batch;
}
export async function stopResearchBatch(){if(!batch||batch.status!=='running')return researchBatchStatus();batch.status='stopping';batch.stage='当前品种完成后停止';await saveBatch();return batch}
