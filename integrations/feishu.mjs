import * as lark from '@larksuiteoapi/node-sdk';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {marketSnapshot} from './market.mjs';
import {buildAxesReport} from './three-axes.mjs';
import {assistantReply} from './assistant.mjs';
import {getReport} from './research-agent.mjs';
import {atomicWrite} from './research-storage.mjs';
import {Ledger,deliveryId,scheduleTimes,dueSlots,acceptedMessage} from './feishu-core.mjs';
const dir=resolve('.runtime/feishu'),settingsPath=resolve(dir,'settings.json');
const split=v=>String(v||'').split(',').map(s=>s.trim()).filter(Boolean);
function config(){return {appId:process.env.FEISHU_APP_ID,appSecret:process.env.FEISHU_APP_SECRET,allowedUsers:split(process.env.FEISHU_ALLOWED_OPEN_IDS),allowedChats:split(process.env.FEISHU_ALLOWED_CHAT_IDS),botOpenId:process.env.FEISHU_BOT_OPEN_ID,target:process.env.FEISHU_RECEIVE_ID,type:process.env.FEISHU_RECEIVE_ID_TYPE||'open_id'};}
let ws,client,ledger,timer,busy=false,lastError=null,settings={enabled:false,times:['15:30','21:00']},ready=false;
const conversations=new Map(),active=new Set();
function configured(c=config()){return !!(c.appId&&c.appSecret&&c.allowedUsers.length)}
function targetAllowed(c=config()){return c.type==='open_id'?c.allowedUsers.includes(c.target):c.type==='chat_id'?c.allowedChats.includes(c.target):false;}
export function feishuStatus(){const c=config();return {configured:configured(c),targetConfigured:targetAllowed(c),transport:ws?.getConnectionStatus()?.state||'未连接',enabled:settings.enabled,times:settings.times,timezone:'Asia/Shanghai',lastError,ready,notice:'工作台服务需持续运行；仅交易日定时，错过5分钟窗口不补发。没有凭据时不发送。'};}
export async function setFeishuSchedule(input){if(typeof input.enabled!=='boolean')throw Error('请明确是否启用定时推送');const next={enabled:input.enabled,times:scheduleTimes(input.times)};if(next.enabled&&(!ready||!configured()||!targetAllowed()))throw Error('请先在本机配置飞书应用、授权用户和推送目标');await mkdir(dir,{recursive:true});await atomicWrite(settingsPath,JSON.stringify(next));settings=next;return feishuStatus();}
async function send(chatId,text,key,type='chat_id'){
 const c=config();const safeTarget=type==='open_id'?c.allowedUsers.includes(chatId):c.allowedChats.includes(chatId)||[...conversations.values()].some(v=>v.chatId===chatId&&v.chatType==='p2p'&&c.allowedUsers.includes(v.user));
 if(!safeTarget||!client)throw Error('飞书目标未授权或未配置');if(!await ledger.claim('send:'+key)){if(ledger.entries['send:'+key]?.status==='sent')return {duplicate:true,sent:true};throw Error('此前发送结果未确认，请先核对飞书消息，系统不会自动重发');}
 try{const result=await client.im.v1.message.create({params:{receive_id_type:type},data:{receive_id:chatId,msg_type:'text',content:JSON.stringify({text:text.length>5500?text.slice(0,5400)+'\n（内容较长，完整报告请在工作台查看）':text}),uuid:deliveryId(key)}});if(result.code!==0||!result.data?.message_id)throw Error('send_failed');await ledger.finish('send:'+key,'sent');return {sent:true}}catch{await ledger.finish('send:'+key,'uncertain');lastError='飞书发送未确认，请核对权限和目标；为避免重复未自动重发';throw Error(lastError)}
}
export async function previewFeishuReport(){return buildAxesReport(await marketSnapshot());}
export async function pushFeishuReport(){if(!ready||!targetAllowed())throw Error('飞书推送目标尚未配置');const report=await previewFeishuReport();if(report.status!=='observing'||!report.rows.length)throw Error('真实行情未就绪，不发送正式日报');const c=config();return send(c.target,report.text,'manual:'+new Date().toISOString().slice(0,16),c.type);}
async function processMessage(message){const scope=message.chatId+':'+message.user;let acquired=false;try{
 if(active.has(scope)){await send(message.chatId,'上一条问题仍在处理；已启动的深度研究在后台继续。','busy:'+message.id);return}active.add(scope);acquired=true;
 const old=conversations.get(scope)||{chatId:message.chatId,chatType:message.chatType,user:message.user,history:[]};conversations.set(scope,old);
 await send(message.chatId,'收到，正在查询。你可以继续使用工作台；深度研究会在后台运行。','ack:'+message.id);
 if(/^(日报|复盘日报|三板斧|帮助)$/.test(message.text)){const text=message.text==='帮助'?'可以说：日报、研究沪铜、查询原油行情、查看研究任务。仅只读研究，不下单。':(await previewFeishuReport()).text;await send(message.chatId,text,'answer:'+message.id);return}
 const messages=[...old.history.slice(-18),{role:'user',content:message.text}];const result=await assistantReply(messages);old.history=[...messages,{role:'assistant',content:result.text.slice(0,5500)}].slice(-20);
 for(const job of result.jobs||[])await ledger.claim('job:'+job.id,{jobId:job.id,chatId:message.chatId,chatType:message.chatType,user:message.user});
 await send(message.chatId,result.text,'answer:'+message.id);
 }catch{lastError='飞书请求处理失败，请在工作台核对模型、行情和授权状态'}finally{if(acquired)active.delete(scope);await ledger.finish('event:'+message.id,'processed').catch(()=>{})}}
async function receive(data){const c=config(),m=acceptedMessage(data,c);if(!m||!await ledger.claim('event:'+m.id))return {};const scope=m.chatId+':'+m.user;if(!conversations.has(scope))conversations.set(scope,{chatId:m.chatId,chatType:m.chatType,user:m.user,history:[]});void processMessage(m);return {};}
async function tick(){if(busy||!ready)return;busy=true;try{
 // Completion notice survives service restarts and is restricted to original requester.
 for(const [key,item] of Object.entries(ledger.entries)){if(!key.startsWith('job:')||item.status!=='pending'||!config().allowedUsers.includes(item.user))continue;const job=await getReport(item.jobId);if(!job||job.status==='running')continue;if(!conversations.has(item.chatId+':'+item.user))conversations.set(item.chatId+':'+item.user,{chatId:item.chatId,chatType:item.chatType,user:item.user,history:[]});try{await send(item.chatId,`${job.name} · ${job.stage}\n${job.report||job.error||'请在工作台查看'}\n报告编号：${job.id}`,'complete:'+job.id);await ledger.finish(key,'notified')}catch{await ledger.finish(key,'delivery_unknown')}}
 if(!settings.enabled||!targetAllowed())return;let calendar;try{calendar=JSON.parse(await readFile(resolve('.runtime/trading-calendar.json'),'utf8'))}catch{lastError='缺少已核验交易日历，定时推送暂停';return}
 for(const slot of dueSlots(new Date(),settings.times,calendar)){if(!await ledger.claim('schedule:'+slot.key))continue;const report=await previewFeishuReport();await mkdir(resolve(dir,'reports'),{recursive:true});await atomicWrite(resolve(dir,'reports',slot.key.replace(':','-')+'.md'),report.text);const c=config();const text=report.status==='observing'&&report.rows.length?report.text:`JARVIS ${slot.date} ${slot.time}：行情状态 ${report.status}，未生成正式日报，请检查采集。`;await send(c.target,text,'schedule:'+slot.key,c.type);await ledger.finish('schedule:'+slot.key,'sent');}
 }catch{lastError='定时推送或完成通知未确认，请查看本地状态；不会自动重复发送'}finally{busy=false}}
export async function startFeishu(){const c=config();try{await mkdir(dir,{recursive:true});try{const saved=JSON.parse(await readFile(settingsPath,'utf8'));settings={enabled:saved.enabled===true,times:scheduleTimes(saved.times)}}catch(e){if(e.code!=='ENOENT')throw Error('定时配置损坏')}
 if(!configured(c))return;ledger=await new Ledger(resolve(dir,'ledger.json')).init();const silent={debug(){},info(){},warn(){},error(){lastError='飞书连接或API出现错误，请核对凭据、权限和网络'},trace(){}};lark.defaultHttpInstance.defaults.timeout=15000;client=new lark.Client({appId:c.appId,appSecret:c.appSecret,logger:silent,domain:lark.Domain.Feishu});ws=new lark.WSClient({appId:c.appId,appSecret:c.appSecret,logger:silent,domain:lark.Domain.Feishu});ready=true;
 void ws.start({eventDispatcher:new lark.EventDispatcher({logger:silent}).register({'im.message.receive_v1':receive})}).catch(()=>{lastError='飞书长连接启动失败'});timer=setInterval(()=>void tick(),30000);timer.unref();void tick();
 }catch{ready=false;lastError='飞书本地配置或去重记录不可用，已停止自动发送'}}
export function stopFeishu(){clearInterval(timer);ws?.close({force:true});ready=false;}
