import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {checkChatTool,openLocalMcp} from '../mcp/local-client.mjs';
import {workbenchChatReply} from '../integrations/workbench-chat.mjs';
import {createWeixinChat} from '../integrations/weixin-chat.mjs';
import {createWeixinChannel} from '../integrations/weixin-channel.mjs';
import {acceptedMessage} from '../integrations/feishu-core.mjs';

async function folder(){const base=resolve('output/im-chat-20261104/test-cases');await mkdir(base,{recursive:true});return mkdtemp(join(base,'case-'));}
test('聊天工具白名单拒绝写入、启动研究、任意路径和编码绕过',()=>{
 for(const name of ['wujian_write','wujian_trading','wujian_expensive','wujian_research_start','wujian_sync','exec'])assert.throws(()=>checkChatTool(name,{}));
 for(const path of ['/api/chat','/api/workbench/cards/../approve','/api/%2e%2e/private','/.env','//evil.test/','/api/health?x=1'])assert.throws(()=>checkChatTool('wujian_api',{method:'POST',path}));
 assert.throws(()=>checkChatTool('wujian_api',{path:'/api/not-registered'}));
 assert.throws(()=>checkChatTool('wujian_endpoint',{id:'missing'}));
 assert.doesNotThrow(()=>checkChatTool('wujian_api',{path:'/api/health'}));
 assert.doesNotThrow(()=>checkChatTool('wujian_fire_scan',{mode:'week-day'}));
});
test('MCP连接不允许远程主机或URL凭据',async()=>{
 for(const baseUrl of ['https://example.com','http://127.0.0.1:4318/path','http://user:pass@127.0.0.1:4318','http://127.0.0.1:4318?x=1'])await assert.rejects(openLocalMcp({baseUrl}));
});
test('飞书授权入站→同一聊天引擎→工具查询→回复；上下文与敏感字段处理',async()=>{
 const event={sender:{sender_type:'user',sender_id:{open_id:'owner'}},message:{message_id:'m1',chat_id:'private',chat_type:'p2p',message_type:'text',create_time:String(Date.now()),content:JSON.stringify({text:'查沪铜报价'})}};
 const message=acceptedMessage(event,{allowedUsers:['owner'],allowedChats:[],botOpenId:'bot'});assert.ok(message);
 const calls=[];let closed=0;
 const result=await workbenchChatReply([{role:'user',content:'上一句'},{role:'assistant',content:'已记住上下文'},{role:'user',content:message.text}],{channel:'飞书',openMcp:async()=>({tools:[{name:'wujian_quote',parameters:{type:'object'}}],call:async(name,args)=>{calls.push([name,args]);return name==='wujian_health'?{ok:true,service:{version:'fixture'}}:{name:'沪铜',contract:'CU2612',dataDate:'2026-11-04',token:'must-not-leak',nested:{appSecret:'must-not-leak'}}},close:()=>closed++}),runModel:async({messages,execute})=>{
  assert.equal(messages.at(-1).content,'查沪铜报价');assert.equal(messages[2].content,'已记住上下文');assert.match(messages[0].content,/飞书/);
  const data=await execute('wujian_quote',{query:'沪铜'});assert.equal(data.contract,'CU2612');assert.doesNotMatch(JSON.stringify(data),/must-not-leak/);
  await assert.rejects(execute('wujian_write',{path:'/api/workbench/cards'}));return{text:'沪铜 CU2612，数据日期2026-11-04。'};
 }});
 assert.match(result.text,/CU2612/);assert.equal(result.readOnly,true);assert.deepEqual(calls.map(c=>c[0]),['wujian_health','wujian_quote']);assert.equal(closed,1);
});
test('普通闲聊在数据连接不可用时仍可回复；长数据明确标记截断',async()=>{
 const answer=await workbenchChatReply([{role:'user',content:'今天有点累，聊两句'}],{openMcp:async()=>{throw Error('offline')},runModel:async({tools,messages})=>{assert.equal(tools.length,0);assert.match(messages.at(-1).content,/有点累/);return{text:'可以，今天最累的是什么事？'}}});assert.match(answer.text,/最累/);
 await workbenchChatReply([{role:'user',content:'查报告'}],{openMcp:async()=>({tools:[],call:async name=>name==='wujian_health'?{}:{text:'x'.repeat(30000)},close(){}}),runModel:async({execute})=>{const data=await execute('wujian_research_reports',{});assert.equal(data.truncated,true);assert.equal(data.preview.length,18000);return{text:'请缩小范围'}}});
});
test('微信重复消息与重启去重；追问保留上下文，新对话清空',async()=>{
 const root=await folder(),answers=[],seen=[];
 const chat=createWeixinChat({root,reply:async messages=>{seen.push(messages);return{text:'已读：'+messages.at(-1).content}}});
 const message=(id,text)=>({id,text,scope:'owner|bot|binding1',isCurrent:()=>true,reply:async text=>answers.push(text)});
 await Promise.all([chat.handle(message('1','查候选')),chat.handle(message('1','查候选'))]);await chat.drain();assert.equal(answers.length,1);
 await chat.handle(message('2','把空头单列'));await chat.drain();assert.equal(seen[1][0].content,'查候选');
 await chat.handle(message('3','新对话'));await chat.drain();await chat.handle(message('4','你好'));await chat.drain();assert.equal(seen.at(-1).length,1);
 chat.stop();const restarted=createWeixinChat({root,reply:async()=>{throw Error('不应调用')}});await restarted.handle(message('1','查候选'));await restarted.drain();assert.equal(answers.length,4);restarted.stop();
});
test('换绑后旧模型结果不发给新收件人；发送不确定时不重复发送',async()=>{
 let current=true,release;const answers=[];const chat=createWeixinChat({root:await folder(),reply:()=>new Promise(r=>release=r)});
 await chat.handle({id:'1',text:'私有账户',scope:'old',isCurrent:()=>current,reply:async text=>answers.push(text)});
 while(!release)await new Promise(r=>setImmediate(r));current=false;release({text:'private result'});await chat.drain();assert.equal(answers.length,0);chat.stop();
 let sends=0;const uncertain=createWeixinChat({root:await folder(),reply:async()=>({text:'answer'})});await uncertain.handle({id:'2',text:'hi',scope:'owner',isCurrent:()=>true,reply:async()=>{sends++;throw Object.assign(Error('unknown'),{deliveryStatus:'unknown'})}});await uncertain.drain();assert.equal(sends,1);assert.match(uncertain.status().error,/未完成/);uncertain.stop();
});
test('微信真实协议结构：仅本人新消息交给聊天，游标持久化，回复锁定原消息会话',async()=>{
 const root=await folder(),messages=[],sent=[];let batch=0;
 const protect=async(v,mode)=>mode==='decrypt'?Buffer.from(v.data,'base64').toString():{data:Buffer.from(v).toString('base64')};
 const base={from_user_id:'owner',to_user_id:'bot',message_type:1,message_state:2,context_token:'context-1',create_time_ms:Date.now(),item_list:[{type:1,text_item:{text:'你好'}}]};
 const channel=createWeixinChannel({root,protect,qr:async()=> 'fixture',onMessage:async m=>messages.push(m),fetchImpl:async(url,options)=>({ok:true,json:async()=>{
  if(url.includes('get_bot_qrcode'))return{qrcode:'fixture',qrcode_img_content:'https://liteapp.weixin.qq.com/fixture'};
  if(url.includes('get_qrcode_status'))return{status:'confirmed',bot_token:'test-token',ilink_bot_id:'bot',ilink_user_id:'owner'};
  if(url.includes('sendmessage')){sent.push(JSON.parse(options.body));return{ret:0};}
  batch++;return{get_updates_buf:'cursor-'+batch,msgs:batch===1?[
   {...base,message_id:'foreign',from_user_id:'other'}, {...base,message_id:'group',group_id:'g'}, {...base,message_id:'partial',message_state:1}, {...base,message_id:'old',create_time_ms:Date.now()-11*60000}, {...base,message_id:'bot',message_type:2}, {...base,message_id:'good'}
  ]:[{...base,message_id:'next',context_token:'context-2'}]};
 }})});
 await channel.init();await channel.startLogin();await channel.pollLogin();await channel.pollUpdates();assert.equal(messages.length,1);assert.equal(messages[0].text,'你好');
 await channel.pollUpdates();assert.equal(messages.length,2);await messages[0].reply('回复',{id:'test'});assert.equal(sent[0].msg.context_token,'context-1');assert.equal(sent[0].msg.to_user_id,'owner');
 await channel.disconnect();assert.equal(messages[0].isCurrent(),false);await assert.rejects(messages[0].reply('旧回复'),/绑定已变化/);assert.equal(sent.length,1);channel.stop();
});
test('微信停止再启动后，旧排队消息不会继续调用模型或发送',async()=>{
 let release,calls=0;const answers=[];
 const chat=createWeixinChat({root:await folder(),reply:async()=>{calls++;return new Promise(r=>release=r)}});
 const message=id=>({id,text:'旧问题',scope:'owner',isCurrent:()=>true,reply:async text=>answers.push(text)});
 await chat.handle(message('1'));while(!release)await new Promise(r=>setImmediate(r));
 await chat.handle(message('2'));chat.stop();await chat.init();release({text:'旧结果'});await chat.drain();
 assert.equal(calls,1);assert.equal(answers.length,0);assert.equal(chat.status().enabled,true);chat.stop();
});
