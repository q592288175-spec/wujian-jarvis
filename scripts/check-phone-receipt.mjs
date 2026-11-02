import {loadBinding,bindingOverride} from '../integrations/im-binding.mjs';
import {monitorNotificationConfig} from '../integrations/feishu-core.mjs';
import * as lark from '@larksuiteoapi/node-sdk';
await loadBinding();const c=monitorNotificationConfig(bindingOverride()||{});
if(c.type!=='chat_id')throw Error('本人单聊尚未配置');
const logger={debug(){},info(){},warn(){},error(){},trace(){}};
const client=new lark.Client({appId:c.appId,appSecret:c.appSecret,logger,domain:lark.Domain.Feishu});
try{
 const result=await client.im.v1.message.list({params:{container_id_type:'chat',container_id:c.target,page_size:20,sort_type:'ByCreateTimeDesc'}});
 const tests=(result.data?.items||[]).filter(m=>m.sender?.sender_type==='app'&&m.body?.content?.includes('通知测试')).map(m=>({created:m.create_time,notificationTest:true}));
 console.log(JSON.stringify({code:result.code,message:result.msg,tests}));
}catch(error){console.log(JSON.stringify({errorType:error.name,diagnostic:String(error.message).replace(/[A-Za-z0-9_-]{20,}/g,'[redacted]').slice(0,240),status:error.response?.status,code:error.response?.data?.code,networkCode:error.code,providerMessage:error.response?.data?.msg||null}));process.exitCode=1}
