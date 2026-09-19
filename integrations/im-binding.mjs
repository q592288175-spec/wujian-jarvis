import {readFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {atomicWrite} from './research-storage.mjs';

// Local binding overrides legacy env configuration, including an explicit disconnect.
let saved=null;
const file=resolve('.runtime/feishu/connection.json');
export async function loadBinding(){try{saved=JSON.parse(await readFile(file,'utf8'));if(!saved||typeof saved!=='object')throw Error('invalid')}catch(e){if(e.code!=='ENOENT'){saved={disabled:true};throw Error('IM绑定记录不可读，通道已停用')}}}
export function bindingOverride(){return saved}
export async function persistBinding(value){await mkdir(dirname(file),{recursive:true});await atomicWrite(file,JSON.stringify(value));saved=value;}
export function bindingSummary(){return {bound:!!(saved?.appId&&!saved.disabled),disabled:saved?.disabled===true,boundAt:saved?.boundAt||null,channel:'feishu',agent:'JARVIS 国内期货研究 Agent'};}

export function createBindingService({register,qr,persist,activate,now=Date.now}){
 let current=null;
 const publicState=a=>a?{id:a.id,status:a.status,qr:a.qr||null,expiresAt:a.expiresAt||null,error:a.error||null}: {status:'idle'};
 function stop(){if(current){clearTimeout(current.timer);current.abort.abort();current.status='cancelled';current.qr=null;}}
 async function start(){if(current?.status==='saving')throw Error('正在保存绑定，请稍后操作');stop();const a={id:randomBytes(24).toString('hex'),status:'preparing',abort:new AbortController()};current=a;
  void (async()=>{try{
   const result=await register({signal:a.abort.signal,source:'wujian-jarvis',createOnly:true,appPreset:{name:'五简 JARVIS',desc:'国内期货只读研究、问答与定时报告'},addons:{preset:false,scopes:{tenant:['im:message:send_as_bot','im:message.p2p_msg:readonly']},events:{items:{tenant:['im.message.receive_v1']}}},onQRCodeReady:info=>{void (async()=>{const u=new URL(info.url);if(u.protocol!=='https:'||!['open.feishu.cn','accounts.feishu.cn','accounts.larksuite.com'].includes(u.hostname))throw Error('invalid QR origin');const data=await qr(info.url);if(current!==a||a.abort.signal.aborted||a.status!=='preparing')return;a.qr=data;a.expiresAt=now()+Math.min(info.expireIn,600)*1000;a.status='waiting';a.timer=setTimeout(()=>{if(current===a&&a.status==='waiting'){a.abort.abort();a.qr=null;a.status='expired'}},Math.max(1,a.expiresAt-now()));a.timer.unref?.()})().catch(()=>{if(current===a){a.error='二维码生成失败，请重试';a.status='failed';a.abort.abort()}})}});
   if(current!==a||a.abort.signal.aborted)return;
   if(!/^cli_[A-Za-z0-9]+$/.test(result.client_id||'')||typeof result.client_secret!=='string'||!result.client_secret||!/^ou_[A-Za-z0-9_-]+$/.test(result.user_info?.open_id||'')||result.user_info?.tenant_brand==='lark')throw Error('invalid registration');
   clearTimeout(a.timer);a.status='saving';a.qr=null;
   await persist({appId:result.client_id,appSecret:result.client_secret,allowedUsers:[result.user_info.open_id],allowedChats:[],target:result.user_info.open_id,type:'open_id',boundAt:new Date(now()).toISOString(),disabled:false});
   if(current!==a||a.abort.signal.aborted)return;await activate();a.status='bound';
  }catch{if(current===a&&!a.abort.signal.aborted){a.status='failed';a.qr=null;a.error='绑定未完成：可能已过期、被取消，或组织不支持一键创建。可以刷新二维码或使用手工配置。'}}})();return publicState(a);
 }
 function status(id){if(!current||current.id!==id)return {status:'expired'};return publicState(current)}
 function cancel(id){if(current?.id===id){if(current.status==='saving')throw Error('正在保存绑定，请稍后使用断开连接');stop()}return {ok:true}}
 return {start,status,cancel,stop,isSaving:()=>current?.status==='saving'};
}
