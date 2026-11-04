import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {hasLiquidity} from '../dist/liquidity.js';
import {databaseManifest} from './system-backup.mjs';
const out=resolve('output/maintenance-2026-11-03'),preview=JSON.parse(readFileSync(out+'/preview.json','utf8')),databases=[];
for(const path of ['.runtime/five-workbench.sqlite','.runtime/eod-market.sqlite','.runtime/market-panorama/market.sqlite','.runtime/monitor/monitor.sqlite','.runtime/knowledge/knowledge.sqlite']){
 if(!existsSync(path)){databases.push({path,status:'missing'});continue}
 const db=new DatabaseSync(path,{readOnly:true});try{const integrity=db.prepare('PRAGMA integrity_check').all(),foreignKeys=db.prepare('PRAGMA foreign_key_check').all(),tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t=>t.name);assert.deepEqual(integrity.map(r=>r.integrity_check),['ok'],path);assert.equal(foreignKeys.length,0,path);databases.push({path,integrity:'ok',foreignKeyErrors:0,tables:tables.length})}finally{db.close()}
}
const api=[];
for(const route of ['/api/health','/api/workbench/accounts','/api/workbench/cards','/api/workbench/summary','/api/workbench/fire','/api/market-panorama/snapshot','/api/trend-monitor/status','/api/monitor/status','/api/research/reports','/api/workbench/postmarket-reviews','/api/knowledge/status','/api/maintenance/status']){
 const start=Date.now(),response=await fetch(preview.base+route,{signal:AbortSignal.timeout(30000)}),value=await response.json();assert.ok(response.ok,route+':'+JSON.stringify(value));
 const info={route,status:response.status,ms:Date.now()-start};
 if(route==='/api/health')assert.equal(value.version,JSON.parse(readFileSync('package.json','utf8')).version);
 if(route==='/api/market-panorama/snapshot'){assert.ok(value.products.every(hasLiquidity));assert.ok(value.closeOverview.products.every(hasLiquidity));assert.ok(!('monitorDiscovery'in value));info.products=value.products.length;info.coverage=value.closeOverview.coverage;writeFileSync(out+'/market-snapshot.json',JSON.stringify(value,null,2))}
 if(route==='/api/workbench/fire'){assert.ok(value.rows.every(hasLiquidity));info.products=value.rows.length;info.dataDate=value.dataDate||value.data_date}
 if(route==='/api/trend-monitor/status'){info.rows=value.rows.length;info.activeTasks=value.tasks?.filter(t=>t.status==='active').length}
 api.push(info);
}
const protectedRequests=[];
for(const request of [{path:'/api/trend-monitor/speech',origin:false,body:{preview:true}},{path:'/api/trend-monitor/speech',origin:true,body:{voiceId:'old-siren',preview:true}},{path:'/api/trend-monitor/speech',origin:true,body:{eventId:'not-an-event',voiceId:'taiwan-female'}}]){
 const r=await fetch(preview.base+request.path,{method:'POST',headers:{'Content-Type':'application/json',...(request.origin?{Origin:preview.base}:{})},body:JSON.stringify(request.body)}),value=await r.json();assert.ok(r.status>=400&&r.status<500);protectedRequests.push({status:r.status,message:value.error});
}
const formal=await fetch('http://127.0.0.1:4318/api/trend-monitor/status').then(r=>r.json());
const result={passed:true,at:new Date().toISOString(),databases,api,protectedRequests,formalConnection:{weixinConnected:formal.weixin?.connected,pushReady:formal.weixin?.pushReady,market:formal.market},business:databaseManifest('.runtime/five-workbench.sqlite')};
writeFileSync(out+'/data-and-api-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,databases,api,protectedRequests}));
