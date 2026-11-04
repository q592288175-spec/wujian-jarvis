import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Ledger} from './feishu-core.mjs';
import {workbenchChatReply} from './workbench-chat.mjs';

// The channel authenticates the owner and supplies a reply closure pinned to that binding.
export function createWeixinChat({root,reply=workbenchChatReply,now=Date.now}={}){
 let ledger,initPromise,enabled=false,epoch=0,error=null,lastReceivedAt=null,lastRepliedAt=null;
 const sessions=new Map(),pending=new Set(),controllers=new Set();
 const status=()=>({enabled,mode:'read-only',busy:pending.size,lastReceivedAt,lastRepliedAt,error});
 const init=()=>initPromise||(initPromise=(async()=>{const generation=epoch;try{const loaded=await new Ledger(resolve(root,'.runtime/im-chat/weixin-ledger.json')).init();if(generation!==epoch)return status();ledger=loaded;enabled=true;error=null;}catch{if(generation===epoch){enabled=false;error='微信对话去重记录不可用，已暂停聊天回复'}}return status()})());
 async function process(message,key,session,generation,records){
  const controller=new AbortController();controllers.add(controller);
  try{
   if(!enabled||generation!==epoch||!message.isCurrent())return;
   if(message.unsupported){await message.reply('我目前可以读取文字和微信已有转写的语音。图片、文件或没有转写的语音，请先把问题发成文字。',{id:key});}
   else if(['新对话','清空对话'].includes(message.text.trim())){session.history=[];await message.reply('已清空本次微信对话，可以开始新话题。',{id:key});}
   else{
    const messages=[...session.history.slice(-18),{role:'user',content:message.text}];
    const result=await reply(messages,{signal:controller.signal,channel:'微信'});
    if(controller.signal.aborted||!enabled||generation!==epoch||!message.isCurrent())return;
    const answer=String(result.text||'暂时没有取得有效回答，请稍后再试。');
    const chunks=answer.match(/[\s\S]{1,3500}/g)||[];
    for(let i=0;i<Math.min(chunks.length,4);i++){if(controller.signal.aborted||generation!==epoch||!enabled||!message.isCurrent())return;await message.reply(chunks[i]+(i===3&&chunks.length>4?'\n内容较长，请继续追问剩余部分。':''),{id:key+'-'+i});}
    session.history=[...messages,{role:'assistant',content:answer.slice(0,5500)}].slice(-20);
   }
   if(generation!==epoch)return;lastRepliedAt=new Date(now()).toISOString();error=null;await records.finish(key,'replied');
  }catch(cause){
   if(generation!==epoch)return;error='微信聊天未完成，请检查模型、工作台与微信会话状态';
   // An uncertain send must not trigger a second outgoing message.
   if(!controller.signal.aborted&&enabled&&message.isCurrent()&&!cause.deliveryStatus)try{await message.reply('这次没有完成查询或回复，请稍后重试；我没有修改工作台记录。',{id:key+'-error'})}catch{}
   await records.finish(key,'failed').catch(()=>{});
  }finally{controllers.delete(controller);session.queued--;}
 }
 async function handle(message){
  const generation=epoch;await init();if(!enabled||generation!==epoch||!message.isCurrent())return;const records=ledger;
  const scope=createHash('sha256').update(message.scope).digest('hex');
  const key='message:'+createHash('sha256').update(message.scope+'|'+message.id).digest('hex');
  if(!await records.claim(key)||generation!==epoch||!enabled||!message.isCurrent())return;
  lastReceivedAt=new Date(now()).toISOString();
  let session=sessions.get(scope);if(!session){session={history:[],tail:Promise.resolve(),queued:0,at:now()};sessions.set(scope,session)}
  if(session.queued>=4){await ledger.finish(key,'busy');await message.reply('前面的消息仍在处理中，请等回复后再继续。',{id:key+'-busy'});return;}
  if(now()-session.at>2*3600000&&!session.queued)session.history=[];session.at=now();session.queued++;
  const work=session.tail.catch(()=>{}).then(()=>process(message,key,session,generation,records));session.tail=work;pending.add(work);void work.finally(()=>pending.delete(work)).catch(()=>{});
 }
 const stop=()=>{enabled=false;epoch++;initPromise=null;for(const c of controllers)c.abort();sessions.clear();};
 return{init,handle,status,stop,drain:()=>Promise.allSettled([...pending])};
}
