import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

const parse=JSON.parse;
export class MonitorStore{
 constructor(path){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS monitor_rules(id TEXT PRIMARY KEY,version INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS monitor_versions(rule_id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(rule_id,version));
   CREATE TABLE IF NOT EXISTS monitor_state(rule_id TEXT NOT NULL,symbol TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(rule_id,symbol));
   CREATE TABLE IF NOT EXISTS monitor_events(id TEXT PRIMARY KEY,rule_id TEXT,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,unique_key TEXT UNIQUE);
   CREATE TABLE IF NOT EXISTS monitor_deliveries(event_id TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',PRIMARY KEY(event_id,channel));
   CREATE TABLE IF NOT EXISTS monitor_meta(key TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS monitor_announcements(source TEXT NOT NULL,url TEXT NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(source,url));`);
 }
 transaction(work){this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result}catch(error){this.db.exec('ROLLBACK');throw error}}
 rules(){return this.db.prepare('SELECT * FROM monitor_rules ORDER BY updated_at DESC').all().map(row=>({...parse(row.payload),id:row.id,version:row.version,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at}));}
 getRule(id){return this.rules().find(rule=>rule.id===id)||null;}
 saveRule(payload,id=null){return this.transaction(()=>{
  const existing=id?this.getRule(id):null;if(id&&!existing)throw Error('提醒规则不存在');
  const key=id||randomUUID(),version=(existing?.version||0)+1,stamp=new Date().toISOString();
  this.db.prepare('INSERT INTO monitor_rules VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at').run(key,version,'draft',JSON.stringify(payload),existing?.createdAt||stamp,stamp);
  this.db.prepare('INSERT INTO monitor_versions VALUES(?,?,?,?)').run(key,version,JSON.stringify(payload),stamp);
  this.db.prepare('DELETE FROM monitor_state WHERE rule_id=?').run(key);return this.getRule(key);
 });}
 setStatus(id,status){if(!['active','paused','archived','completed','expired'].includes(status))throw Error('提醒状态无效');if(!this.getRule(id))throw Error('提醒规则不存在');this.db.prepare('UPDATE monitor_rules SET status=?,updated_at=? WHERE id=?').run(status,new Date().toISOString(),id);return this.getRule(id);}
 ruleState(id,symbol){const row=this.db.prepare('SELECT payload FROM monitor_state WHERE rule_id=? AND symbol=?').get(id,symbol);return row?parse(row.payload):{met:false,lastTriggered:0};}
 saveState(id,symbol,state){this.db.prepare('INSERT INTO monitor_state VALUES(?,?,?) ON CONFLICT(rule_id,symbol) DO UPDATE SET payload=excluded.payload').run(id,symbol,JSON.stringify(state));}
 recordEvent(event,{symbol,lastTriggered,met,complete=false,uniqueKey=null,state=null,cooldownKey=null,cooldownMs=0}={}){return this.transaction(()=>{
  const at=Date.parse(event.triggeredAt);
  if(cooldownKey&&cooldownMs>0){
   let previous=this.meta(cooldownKey,null);
   if(previous===null&&event.code&&event.period){const row=this.db.prepare("SELECT created_at FROM monitor_events WHERE kind='ma-turn' AND json_extract(payload,'$.code')=? AND json_extract(payload,'$.period')=? ORDER BY julianday(created_at) DESC LIMIT 1").get(event.code,event.period);previous=row?Date.parse(row.created_at):null;}
   if(!Number.isFinite(at)||Number.isFinite(previous)&&at-previous<cooldownMs)return false;
  }
  const inserted=this.db.prepare('INSERT OR IGNORE INTO monitor_events VALUES(?,?,?,?,?,NULL,?)').run(event.id,event.ruleId||null,event.kind,JSON.stringify(event),event.triggeredAt,uniqueKey);
  if(!inserted.changes)return false;
  if(cooldownKey&&cooldownMs>0)this.setMeta(cooldownKey,at);
  for(const channel of event.channels||[])this.db.prepare('INSERT INTO monitor_deliveries(event_id,channel,status) VALUES(?,?,?)').run(event.id,channel,'pending');
  if(symbol)this.saveState(event.ruleId,symbol,{...this.ruleState(event.ruleId,symbol),met,armed:false,lastTriggered,lastObserved:event.quoteAt,...(state||{})});
  if(complete)this.setStatus(event.ruleId,'completed');return true;
 });}
 deliveries(id){const receipts=this.meta('receipts:'+id,[]);return this.db.prepare('SELECT channel,status,attempts,note FROM monitor_deliveries WHERE event_id=?').all(id).map(item=>({...item,receipt:receipts.filter(r=>r.channel===item.channel).at(-1)||null}));}
 events({limit=100,unread=false}={}){return this.db.prepare(`SELECT * FROM monitor_events ${unread?'WHERE read_at IS NULL':''} ORDER BY created_at DESC LIMIT ?`).all(Math.min(500,Math.max(1,Number(limit)||100))).map(row=>({...parse(row.payload),readAt:row.read_at,deliveries:this.deliveries(row.id)}));}
 event(id){const row=this.db.prepare('SELECT * FROM monitor_events WHERE id=?').get(id);return row?{...parse(row.payload),readAt:row.read_at,deliveries:this.deliveries(id)}:null;}
 confirmDelivery(id,{channel,received,note=''}){return this.transaction(()=>{
  if(!['desktop','feishu','weixin'].includes(channel)||typeof received!=='boolean'||typeof note!=='string')throw Error('请明确通知通道与本人是否收到');
  const event=this.event(id);if(!event?.deliveries.some(d=>d.channel===channel))throw Error('该提醒没有此通知通道');
  const key='receipts:'+id,history=this.meta(key,[]),receipt={channel,received,note:note.slice(0,160),at:new Date(Date.now()+28800000).toISOString().replace('Z','+08:00')};
  this.setMeta(key,[...history,receipt]);return this.event(id);
 });}
 read(id){this.db.prepare('UPDATE monitor_events SET read_at=? WHERE id=?').run(new Date().toISOString(),id);return this.event(id);}
 unread(){return this.db.prepare('SELECT COUNT(*) AS n FROM monitor_events WHERE read_at IS NULL').get().n;}
 pending(channel,now=Date.now()){return this.db.prepare("SELECT d.*,e.payload FROM monitor_deliveries d JOIN monitor_events e ON e.id=d.event_id WHERE d.channel=? AND d.status IN ('pending','failed') AND d.attempts<3 AND d.next_at<=? ORDER BY e.created_at LIMIT 25").all(channel,now).map(row=>({...row,event:parse(row.payload)})).filter(row=>{
  if(row.event.kind!=='ma-turn')return true;
  const watched=this.meta('trend-monitor:watchlist',{mode:'codes',codes:[]});
  if(watched.mode==='codes'&&watched.codes.includes(row.event.code))return true;
  this.delivery(row.event_id,channel,'skipped','未关注该品种，停止提醒');return false;
 });}
 delivery(id,channel,status,note='',nextAt=0){this.db.prepare('UPDATE monitor_deliveries SET status=?,note=?,attempts=attempts+?,next_at=? WHERE event_id=? AND channel=?').run(status,String(note).slice(0,160),status==='sending'?1:0,nextAt,id,channel);}
 recover(){this.db.prepare("UPDATE monitor_deliveries SET status='unknown',note='服务中断时发送结果未确认，请核对通道' WHERE status='sending'").run();}
 meta(key,fallback=null){const row=this.db.prepare('SELECT payload FROM monitor_meta WHERE key=?').get(key);return row?parse(row.payload):fallback;}
 setMeta(key,value){this.db.prepare('INSERT INTO monitor_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').run(key,JSON.stringify(value));return value;}
 announcement(source,url){const row=this.db.prepare('SELECT * FROM monitor_announcements WHERE source=? AND url=?').get(source,url);return row?{...row,payload:parse(row.payload)}:null;}
 saveAnnouncement(source,article){this.db.prepare('INSERT INTO monitor_announcements VALUES(?,?,?,?) ON CONFLICT(source,url) DO UPDATE SET hash=excluded.hash,payload=excluded.payload').run(source,article.url,article.hash,JSON.stringify(article));}
 export(){return {schemaVersion:1,createdAt:new Date().toISOString(),rules:this.rules(),versions:this.db.prepare('SELECT * FROM monitor_versions').all(),states:this.db.prepare('SELECT * FROM monitor_state').all(),events:this.db.prepare('SELECT * FROM monitor_events').all(),deliveries:this.db.prepare('SELECT * FROM monitor_deliveries').all(),meta:this.db.prepare('SELECT * FROM monitor_meta').all(),announcements:this.db.prepare('SELECT * FROM monitor_announcements').all()};}
 close(){this.db.close();}
}
