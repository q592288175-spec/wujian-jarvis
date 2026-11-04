import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import QRCode from 'qrcode';
import {atomicWrite} from './research-storage.mjs';
import {protectLocalSecret} from './local-secret.mjs';

export const WEIXIN_PROTOCOL_SOURCE='https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md';
const DEFAULT_BASE='https://ilinkai.weixin.qq.com';
const VERSION='2.4.10'; // Official package/protocol inspected 2026-11-03.
const VERSION_NUMBER=(2<<16)|(4<<8)|10;
export function officialWeixinBase(value=DEFAULT_BASE){
 let u;try{u=new URL(value)}catch{throw Error('微信返回的服务地址无效')}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!/(^|\.)weixin\.qq\.com$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash)throw Error('微信服务地址未通过官方域名校验');
 return u.origin;
}
const text=value=>typeof value==='string'&&value.length>0&&value.length<=10000;
const businessRejected=value=>['ret','errcode'].some(key=>Object.hasOwn(value,key)&&value[key]!==undefined&&value[key]!==0);
const explicitSuccess=value=>['ret','errcode'].some(key=>Object.hasOwn(value,key)&&value[key]===0);
const appHeaders=()=>({'iLink-App-Id':'bot','iLink-App-ClientVersion':String(VERSION_NUMBER)});
export function createWeixinChannel({root=resolve('.'),fetchImpl=fetch,now=Date.now,protect=protectLocalSecret,qr=value=>QRCode.toDataURL(value,{width:280,margin:2}),onChange=()=>{},onMessage=null}={}){
 const file=resolve(root,'.runtime/private/weixin-connection.enc');
 let binding=null,login=null,active=false,timer=null,pollPromise=null,updatePromise=null,persisting=Promise.resolve(),lastError=null,lastPollAt=null,lastSentAt=null;
 const controllers=new Set();
 const notify=()=>{try{onChange(status())}catch{}};
 function status(){
  const connected=Boolean(binding?.token&&!binding.disabled),ready=connected&&Boolean(binding.contextToken)&&!binding.expired;
  return{provider:'腾讯微信 iLink',adapter:onMessage?'小木微信聊天与通知':'小木独立通知适配',protocolSource:WEIXIN_PROTOCOL_SOURCE,connected,pushReady:ready,state:binding?.expired?'expired':ready?'ready':connected?'waiting_message':lastError?'error':'unbound',note:binding?.expired?'微信登录已失效，请重新扫码':ready?(onMessage?'已连接，可以发文字聊天、查工作台；事件提醒沿用现有设置':'已连接，事件触发后可推送；接口接收不等于手机已读'):connected?'已扫码绑定，请先向微信里的机器人发一条消息，建立聊天和推送会话':'尚未绑定微信',boundAt:binding?.boundAt||null,lastPollAt,lastSentAt,error:lastError,login:login?{id:login.id,state:login.state,status:login.state,replace:login.replace===true,qr:login.qr||null,qrDataUrl:login.qr||null,expiresAt:login.expiresAt,error:login.error||null,needsCode:login.state==='need_verifycode'}:null};
 }
 function save(value,{expected=binding,guard=()=>true}={}){
  const copy=JSON.stringify(value),saved=JSON.parse(copy);
  const work=persisting.catch(()=>{}).then(async()=>{
   if(expected!==null&&binding!==expected||!guard())return false;
   const encrypted=await protect(copy);
   if(expected!==null&&binding!==expected||!guard())return false;
   await mkdir(dirname(file),{recursive:true});await atomicWrite(file,JSON.stringify(encrypted));
   binding=saved;return true;
  });persisting=work;return work;
 }
 async function init(){try{const envelope=JSON.parse(await readFile(file,'utf8'));const saved=JSON.parse(await protect(envelope,'decrypt'));if(saved?.disabled)binding=saved;else if(text(saved?.token)&&text(saved?.userId)&&text(saved?.botId)){saved.baseUrl=officialWeixinBase(saved.baseUrl);binding=saved}else throw Error('invalid')}catch(e){if(e.code!=='ENOENT'){lastError='本机微信凭据无法解密，请重新扫码；未读取明文替代凭据';binding=null}}return status()}
 async function request(path,{base=DEFAULT_BASE,body,token,timeout=15000,signal}={}){
  const origin=officialWeixinBase(base),controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),timeout);timer.unref?.();
  try{
   const isGet=body===undefined,headers=isGet?appHeaders():{...appHeaders(),'Content-Type':'application/json',AuthorizationType:'ilink_bot_token','X-WECHAT-UIN':Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64')};if(token)headers.Authorization='Bearer '+token;
   const response=await fetchImpl(origin+'/'+path,{method:isGet?'GET':'POST',headers,...(!isGet?{body:JSON.stringify(body)}:{}),redirect:'error',signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal});
   if(!response.ok){const error=Error('微信公开接口暂不可用（HTTP '+response.status+'）');error.httpStatus=response.status;throw error}
   const value=await response.json();if(!value||typeof value!=='object'||Array.isArray(value))throw Error('微信接口返回格式无效');return value;
  }catch(e){if(e.httpStatus)throw e;const error=Error(controller.signal.aborted?'微信接口请求超时':'微信接口未连接，请检查网络后重试');error.ambiguous=true;throw error}finally{clearTimeout(timer);controllers.delete(controller)}
 }
 const baseInfo=()=>({channel_version:VERSION,bot_agent:'Xiaomu/0.5.1'});
 function cancelLogin(){if(login?.state==='saving')throw Error('正在安全保存微信绑定，请稍后操作');if(login){login.controller.abort();login={...login,state:'cancelled',qr:null};}notify();return status()}
 async function startLogin({replace=false}={}){
  cancelLogin();lastError=null;const current={id:randomUUID(),state:'preparing',controller:new AbortController(),expiresAt:now()+8*60000,baseUrl:DEFAULT_BASE,replace:replace===true};login=current;
  try{
   const result=await request('ilink/bot/get_bot_qrcode?bot_type=3',{body:{local_token_list:!current.replace&&binding?.token?[binding.token]:[]},signal:current.controller.signal});
   if(login!==current||current.controller.signal.aborted)return status();
   if(!text(result.qrcode)||!text(result.qrcode_img_content))throw Error('微信没有返回可扫描的二维码');
   const imageContent=new URL(result.qrcode_img_content);if(imageContent.protocol!=='https:'||!/(^|\.)weixin\.qq\.com$/.test(imageContent.hostname)||imageContent.username||imageContent.password)throw Error('微信二维码地址未通过官方域名校验');
   current.qrcode=result.qrcode;current.qr=await qr(result.qrcode_img_content);current.state='waiting';notify();schedule(0);return status();
  }catch(e){if(login===current&&!current.controller.signal.aborted){current.state='failed';current.error=e.message;current.qr=null;notify()}return status()}
 }
 async function pollLogin(id=login?.id){
  if(!login||id!==login.id)throw Error('微信扫码会话不存在或已更新');
  const current=login;if(!['waiting','scaned','need_verifycode'].includes(current.state))return status();
  if(now()>=current.expiresAt){current.state='expired';current.qr=null;notify();return status()}
  if(current.state==='need_verifycode'&&!current.verifyCode)return status();if(pollPromise)return pollPromise;
  const work=(async()=>{try{
   const result=await request('ilink/bot/get_qrcode_status?qrcode='+encodeURIComponent(current.qrcode)+(current.verifyCode?'&verify_code='+encodeURIComponent(current.verifyCode):''),{base:current.baseUrl,timeout:38000,signal:current.controller.signal});
   if(login!==current||current.controller.signal.aborted)return status();
   if(result.status==='confirmed'){
    if(!text(result.bot_token)||!text(result.ilink_bot_id)||!text(result.ilink_user_id))throw Error('微信授权不完整，请重新扫码');
    const saved={token:result.bot_token,botId:result.ilink_bot_id,userId:result.ilink_user_id,baseUrl:officialWeixinBase(result.baseurl||DEFAULT_BASE),boundAt:new Date(now()).toISOString(),getUpdatesBuf:'',contextToken:null};
    current.state='saving';current.qr=null;const committed=await save(saved,{expected:null,guard:()=>login===current&&!current.controller.signal.aborted});if(!committed)return status();current.state='bound';lastError=null;lastSentAt=null;lastPollAt=null;
   }else if(result.status==='scaned_but_redirect'){
    current.baseUrl=officialWeixinBase('https://'+result.redirect_host);current.state='waiting';
   }else if(['expired','verify_code_blocked','binded_redirect'].includes(result.status)){
    current.state=result.status;current.qr=null;current.error=result.status==='binded_redirect'?'微信提示此机器人已有绑定；请在原宿主解除后重新扫码':result.status==='verify_code_blocked'?'验证码错误次数过多，请重新扫码':'二维码已过期，请重新生成';
   }else if(result.status==='need_verifycode'){current.state='need_verifycode';current.verifyCode=null}
   else if(result.status==='scaned'){current.state='scaned';current.verifyCode=null}
   else if(result.status==='wait'){current.state='waiting'}else throw Error('微信返回未知扫码状态，请重新扫码');
   current.error=current.state==='bound'?null:current.error;notify();return status();
  }catch(e){if(!current.controller.signal.aborted&&login===current){if(current.state==='saving')current.state='failed';current.error=e.message;notify()}return status()}})();
  pollPromise=work;try{return await work}finally{if(pollPromise===work)pollPromise=null}
 }
 async function submitVerifyCode(id,code){if(!login||id!==login.id||login.state!=='need_verifycode')throw Error('当前不需要微信验证码');if(!/^\d{4,8}$/.test(String(code||'')))throw Error('请输入手机微信显示的数字');login.verifyCode=String(code);return pollLogin(id)}
 async function pollUpdates(){
  if(updatePromise)return updatePromise;if(!binding?.token||binding.disabled||binding.expired)return status();const current=binding;
  const work=(async()=>{try{
   const result=await request('ilink/bot/getupdates',{base:current.baseUrl,token:current.token,body:{get_updates_buf:current.getUpdatesBuf||'',base_info:baseInfo()},timeout:40000});
   if(binding!==current)return status();lastPollAt=new Date(now()).toISOString();
   if(result.ret===-14||result.errcode===-14){if(!await save({...current,expired:true}))return status();lastError='微信登录已失效，请重新扫码';notify();return status()}
   if(businessRejected(result))throw Error('微信消息会话读取失败，请稍后重试');
   if(!Array.isArray(result.msgs)||typeof result.get_updates_buf!=='string')throw Error('微信消息会话响应不完整，尚未确认连接成功');
   let contextToken=current.contextToken,contextAt=current.contextAt;
   // Pin all context updates and chat replies to the scanning owner.
   for(const msg of Array.isArray(result.msgs)?result.msgs:[])if(msg.from_user_id===current.userId&&msg.message_type===1&&text(msg.context_token)){contextToken=msg.context_token;contextAt=new Date(now()).toISOString()}
   const getUpdatesBuf=text(result.get_updates_buf)?result.get_updates_buf:current.getUpdatesBuf||'';
   if(contextToken!==current.contextToken||getUpdatesBuf!==current.getUpdatesBuf){if(!await save({...current,contextToken,contextAt,getUpdatesBuf}))return status();}else if(binding!==current)return status();
   if(onMessage)for(const msg of result.msgs){
    if(msg.from_user_id!==current.userId||msg.message_type!==1||msg.group_id||msg.to_user_id&&msg.to_user_id!==current.botId||msg.message_state===1||msg.delete_time_ms||!text(msg.context_token))continue;
    if(msg.create_time_ms!==undefined&&(!Number.isFinite(Number(msg.create_time_ms))||Math.abs(now()-Number(msg.create_time_ms))>10*60000))continue;
    const messageId=msg.client_id||msg.message_id;
    if(!['string','number'].includes(typeof messageId)||!String(messageId).length)continue;
    const content=(Array.isArray(msg.item_list)?msg.item_list:[]).map(item=>item.type===1?item.text_item?.text:item.type===3?item.voice_item?.text:'').filter(v=>typeof v==='string').join('\n').trim();
    if(content.length>4000)continue;
    const expected={token:current.token,userId:current.userId,botId:current.botId,boundAt:current.boundAt};
    const isCurrent=()=>binding&&!binding.disabled&&!binding.expired&&Object.entries(expected).every(([key,value])=>binding[key]===value);
    if(!isCurrent())break;
    const id=createHash('sha256').update(JSON.stringify([String(messageId),msg.seq,msg.create_time_ms,content])).digest('hex');
    await onMessage({id,scope:current.botId+'|'+current.userId+'|'+current.boundAt,text:content,unsupported:!content,isCurrent,reply:(answer,options={})=>sendMessage(answer,{...options,expected,contextToken:msg.context_token})});
   }
   lastError=null;notify();return status();
  }catch(e){if(binding===current){lastError=e.message;notify()}return status()}})();updatePromise=work;try{return await work}finally{if(updatePromise===work)updatePromise=null}
 }
 async function sendMessage(message,{id=randomUUID(),expected,contextToken}={}){
  if(expected&&(!binding||!Object.entries(expected).every(([key,value])=>binding[key]===value))){const error=Error('微信绑定已变化，已取消旧会话回复');error.deliveryStatus='cancelled';throw error;}
  const current=binding;if(!current?.token||current.disabled||current.expired)throw Error('微信尚未连接或登录已失效，请先扫码');if(!current.contextToken)throw Error('尚无微信推送会话，请先向机器人发一条消息');
  if(typeof message!=='string'||!message.trim()||message.length>4000)throw Error('微信通知需为1至4000字');
  const clientId='xiaomu-'+String(id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,80);let result;
  try{result=await request('ilink/bot/sendmessage',{base:current.baseUrl,token:current.token,body:{msg:{from_user_id:'',to_user_id:current.userId,client_id:clientId,message_type:2,message_state:2,context_token:contextToken||current.contextToken,item_list:[{type:1,text_item:{text:message}}]},base_info:baseInfo()}})}catch(e){e.deliveryStatus='unknown';e.retryable=false;throw e}
  if(businessRejected(result)){
   const error=Error(result.ret===-14||result.errcode===-14?'微信登录已失效，请重新扫码':'微信未接受通知，请先向机器人发一条消息更新会话');error.deliveryStatus='failed';error.retryable=false;
   if(binding===current){const committed=await save({...current,contextToken:null,...(result.ret===-14||result.errcode===-14?{expired:true}:{})});if(committed){lastError=error.message;notify()}}throw error;
  }
  const messageId=result.message_id;
  if(!explicitSuccess(result)&&!(typeof messageId==='string'&&messageId.length>0||typeof messageId==='number'&&Number.isFinite(messageId)&&messageId>0)){const error=Error('微信通知响应没有有效回执，发送结果尚未确认');error.deliveryStatus='unknown';error.retryable=false;throw error;}
  const sentAt=new Date(now()).toISOString();if(binding?.token===current.token&&binding?.userId===current.userId){lastSentAt=sentAt;lastError=null;notify()}return{ok:true,status:'sent',accepted:true,delivered:false,clientId,at:sentAt,note:'腾讯微信接口已接收，尚未确认手机送达或已读'};
 }
 function schedule(delay=1000){clearTimeout(timer);if(!active)return;timer=setTimeout(async()=>{try{if(login&&['waiting','scaned','need_verifycode'].includes(login.state))await pollLogin();else await pollUpdates()}catch{}finally{schedule(lastError?5000:1000)}},delay);timer.unref?.()}
 function start(){active=true;schedule(0);return status()}
 function stop(){active=false;clearTimeout(timer);for(const controller of controllers)controller.abort();return status()}
 async function disconnect(){cancelLogin();for(const controller of controllers)controller.abort();await save({disabled:true,unboundAt:new Date(now()).toISOString()},{expected:null});lastError=null;notify();return status()}
 return{init,status,startLogin,pollLogin,submitVerifyCode,cancelLogin,pollUpdates,sendMessage,disconnect,start,stop};
}
