import {readFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWrite} from './research-storage.mjs';
export const deliveryId=key=>createHash('sha256').update(key).digest('hex').slice(0,32);
export function scheduleTimes(value){const times=Array.isArray(value)?value:String(value||'15:30,21:00').split(',');if(!times.length||times.length>4||times.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('每天设置1—4个北京时间，格式HH:mm');return [...new Set(times)].sort();}
export function beijingClock(now){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,minute:+parts.hour*60+ +parts.minute};}
export function dueSlots(now,times,calendar){const {date,minute}=beijingClock(now);const weekday=new Date(date+'T00:00:00Z').getUTCDay();if(weekday===0||weekday===6||!calendar?.dates?.includes(date)||!Number.isFinite(Date.parse(calendar.updatedAt))||now-Date.parse(calendar.updatedAt)>14*86400000)return [];return times.filter(t=>{const [h,m]=t.split(':').map(Number);return minute>=h*60+m&&minute<h*60+m+5}).map(t=>({key:date+'@'+t,date,time:t}));}
export function acceptedMessage(data,{allowedUsers,allowedChats,botOpenId},now=Date.now()){
 const m=data?.message,sender=data?.sender;const user=sender?.sender_id?.open_id;if(sender?.sender_type!=='user'||!allowedUsers.includes(user)||m?.message_type!=='text'||typeof m.message_id!=='string'||typeof m.chat_id!=='string')return null;
 const created=Number(m.create_time);if(!Number.isFinite(created)||Math.abs(now-created)>10*60000)return null;
 if(m.chat_type!=='p2p'&&!(m.chat_type==='group'&&allowedChats.includes(m.chat_id)&&botOpenId&&m.mentions?.some(x=>x.id?.open_id===botOpenId)))return null;
 let text;try{text=JSON.parse(m.content).text}catch{return null}if(typeof text!=='string'||text.length>4000)return null;for(const x of m.mentions||[])text=text.replaceAll(x.key,'');text=text.trim();return text?{id:m.message_id,chatId:m.chat_id,chatType:m.chat_type,user,text}:null;
}
// Reserve before sending. An interrupted/uncertain send is never silently replayed.
export class Ledger{
 constructor(file){this.file=file;this.entries={};this.queue=Promise.resolve();}
 async init(){await mkdir(dirname(this.file),{recursive:true});try{this.entries=JSON.parse(await readFile(this.file,'utf8'));if(!this.entries||typeof this.entries!=='object'||Array.isArray(this.entries))throw Error('invalid ledger')}catch(e){if(e.code!=='ENOENT')throw Error('飞书去重记录不可读，已停止发送')}return this;}
 change(fn){const op=this.queue.then(async()=>{const result=fn(this.entries);await atomicWrite(this.file,JSON.stringify(this.entries));return result});this.queue=op.catch(()=>{});return op;}
 claim(key,extra={}){return this.change(rows=>{if(Object.hasOwn(rows,key))return false;rows[key]={status:'pending',at:new Date().toISOString(),...extra};return true});}
 finish(key,status,extra={}){return this.change(rows=>{rows[key]={...rows[key],status,...extra}});}
}
