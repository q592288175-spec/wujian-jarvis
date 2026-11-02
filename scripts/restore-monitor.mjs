import {readFile,access} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backup} from 'node:sqlite';
import {MonitorStore} from '../integrations/monitor-store.mjs';
import {validateRule} from '../integrations/monitor-engine.mjs';

// Restore to a new database. Old notifications are not replayed automatically.
export async function restoreMonitor(source,destination){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),target=resolve(destination),rel=relative(root,target);
 if(rel.startsWith('..')||isAbsolute(rel)||!target.endsWith('.sqlite'))throw Error('恢复目标必须是当前D盘项目里的新SQLite文件');
 try{await access(target);throw Error('恢复目标已存在，禁止覆盖')}catch(error){if(error.code!=='ENOENT')throw error;}
 const raw=await readFile(source);if(raw.length>100*1024*1024)throw Error('备份超过100MB限制');
 const data=JSON.parse(raw.toString('utf8'));if(data.schemaVersion!==1||!Array.isArray(data.rules)||data.rules.length>10000)throw Error('备份结构无效');
 const tables={versions:['monitor_versions',['rule_id','version','payload','created_at']],states:['monitor_state',['rule_id','symbol','payload']],events:['monitor_events',['id','rule_id','kind','payload','created_at','read_at','unique_key']],deliveries:['monitor_deliveries',['event_id','channel','status','attempts','next_at','note']],meta:['monitor_meta',['key','payload']],announcements:['monitor_announcements',['source','url','hash','payload']]};
 const store=new MonitorStore(':memory:');
 try{
  store.transaction(()=>{
   for(const rule of data.rules){validateRule({...rule,symbols:rule.members.map(m=>m.symbol),expiresAt:null},rule.members.map(m=>({...m,expiresAt:null})));if(!Number.isInteger(rule.version)||rule.version<1||!['draft','active','paused','archived','completed','expired'].includes(rule.status))throw Error('规则版本或状态无效');store.db.prepare('INSERT INTO monitor_rules VALUES(?,?,?,?,?,?)').run(rule.id,rule.version,rule.status==='active'?'paused':rule.status,JSON.stringify(rule),rule.createdAt,rule.updatedAt);}
   for(const [key,[table,columns]] of Object.entries(tables)){
    if(!Array.isArray(data[key])||data[key].length>500000)throw Error('备份表结构无效：'+key);
    const statement=store.db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
    for(const row of data[key]){if(typeof row.payload==='string')JSON.parse(row.payload);statement.run(...columns.map(column=>row[column]??null));}
   }
   store.db.exec("UPDATE monitor_deliveries SET status='unknown',note='备份恢复，不自动补发历史消息' WHERE status IN ('pending','sending','failed')");
   store.db.exec('DELETE FROM monitor_state');
  });
  await backup(store.db,target);return {path:target,rules:data.rules.length,pausedForReview:true,historicalNotificationsNotReplayed:true};
 }finally{store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4)throw Error('用法：node scripts/restore-monitor.mjs 监控备份.json 新文件.sqlite');
 console.log(JSON.stringify(await restoreMonitor(process.argv[2],process.argv[3])));
}
