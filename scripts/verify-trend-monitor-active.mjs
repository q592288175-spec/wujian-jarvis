import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {databaseManifest} from './system-backup.mjs';
const base='http://127.0.0.1:4318',out='output/trend-monitor-2026-11-03';
const source=await readFile('server.mjs','utf8'),head=source.slice(source.indexOf('const buildSources='),source.indexOf('const operationArchive=')),paths=[...head.matchAll(/'([^']+\.(?:mjs|js|py|ps1))'/g)].map(m=>m[1]);
const expected=createHash('sha256').update(Buffer.concat(await Promise.all(paths.map(p=>readFile(p))))).digest('hex');
const health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.serverBuild,expected);
const data=await fetch(base+'/api/trend-monitor/status').then(r=>r.json());assert.equal(data.rows.length,87);
assert.ok(data.tasks.some(t=>t.status==='active'&&JSON.stringify(t.bigPeriods)==='["1w","1d"]'&&t.smallPeriods.includes('30m')&&t.smallPeriods.includes('120m')));
const baseline=JSON.parse(await readFile(out+'/formal-baseline.json','utf8'));assert.deepEqual(databaseManifest('.runtime/five-workbench.sqlite'),baseline.business);
for(const [path,hash]of Object.entries(baseline.hashes))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash,path);
for(const row of data.rows)for(const signal of Object.values(row.signals))if(['ok','closed'].includes(signal.status)&&signal.direction!==null){assert.ok(Number.isFinite(signal.ma)&&Number.isFinite(signal.previousMa));const delta=signal.ma-signal.previousMa;if(Math.abs(delta)>1e-7)assert.equal(signal.direction,Math.sign(delta));}
const result={passed:true,at:new Date().toISOString(),build:expected,rows:data.rows.length,tasks:data.tasks,coverage:data.coverage,market:{status:data.market.status,source:data.market.source,lastQuoteAt:data.market.lastQuoteAt,heartbeatFresh:data.market.heartbeatFresh},weixin:{connected:data.weixin.connected,pushReady:data.weixin.pushReady,state:data.weixin.state,error:data.weixin.error},samples:data.rows.filter(r=>['AU','MA','IH'].includes(r.code)),sourceGaps:data.sources.errors,businessUnchanged:true,protectedRulesUnchanged:true};
await writeFile(out+'/formal-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,rows:87,coverage:result.coverage,weixin:result.weixin,businessUnchanged:true,protectedRulesUnchanged:true}));
