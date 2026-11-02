import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {EventEmitter} from 'node:events';
import WebSocket from 'ws';
import {attachVolc,voiceTicket} from '../integrations/volc-voice.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function fixture(run){
 const old={...process.env};Object.assign(process.env,{VOLC_VOICE_API_KEY:'synthetic-test-voice',VOLC_VOICE_PROTOCOL:'duplex',DEEPSEEK_API_KEY:'synthetic-test-model'});
 const upstream=new EventEmitter();upstream.readyState=1;upstream.bufferedAmount=0;upstream.sent=[];
 upstream.send=raw=>upstream.sent.push(JSON.parse(raw));upstream.close=upstream.terminate=()=>{upstream.readyState=3};
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 let answer;const pending=new Promise(resolve=>answer=resolve);
 const replyCalls=[];
 const detach=attachVolc(server,port,{openUpstream:()=>{queueMicrotask(()=>upstream.emit('open'));return upstream},reply:(messages,context)=>{replyCalls.push({messages:structuredClone(messages),context});return pending}});
 const browser=new WebSocket(`ws://127.0.0.1:${port}/ws/volc`,{origin:`http://127.0.0.1:${port}`}),events=[];
 browser.on('message',raw=>events.push(JSON.parse(raw)));await new Promise(resolve=>browser.on('open',resolve));browser.send(JSON.stringify({type:'init',token:voiceTicket('').token}));await tick();
 const emit=async e=>{upstream.emit('message',Buffer.from(JSON.stringify(e)));await tick()};
 try{await emit({type:'session.created',session:{id:'synthetic'}});await run({emit,events,upstream,browser,answer,replyCalls})}
 finally{browser.close();detach();await new Promise(resolve=>server.close(resolve));for(const key of ['VOLC_VOICE_API_KEY','VOLC_VOICE_PROTOCOL','DEEPSEEK_API_KEY'])old[key]===undefined?delete process.env[key]:process.env[key]=old[key]}
}
async function question(emit,id,text){await emit({type:'conversation.item.input_audio_transcription.started',item_id:id});await emit({type:'conversation.item.input_audio_transcription.delta',item_id:id,delta:text});await emit({type:'conversation.item.input_audio_transcription.completed',item_id:id,text})}

test('switching research object keeps the socket open and drops the previous object pending reply',()=>fixture(async({emit,events,browser,answer,replyCalls})=>{
 browser.send(JSON.stringify({type:'context',contextSymbol:'SHFE.fu2701'}));await tick();
 await question(emit,'fuel','研究燃油');assert.equal(replyCalls[0].context,'SHFE.fu2701');
 browser.send(JSON.stringify({type:'context',contextSymbol:'SHFE.cu2612'}));await tick();
 answer({text:'待返回的旧研究'});await tick();assert.equal(events.some(e=>e.type==='result'),false);assert.equal(browser.readyState,WebSocket.OPEN);
 await question(emit,'copper','研究沪铜');assert.equal(replyCalls.at(-1).context,'SHFE.cu2612');assert.deepEqual(replyCalls.at(-1).messages,[{role:'user',content:'研究沪铜'}]);
}));
test('an empty following ASR segment cannot silence the pending DeepSeek reply',()=>fixture(async({emit,events,upstream,answer})=>{
 await question(emit,'q1','你好小木');
 await emit({type:'conversation.item.input_audio_transcription.started',item_id:'empty'});
 answer({text:'五简，我能听到你。'});await tick();
 assert.equal(events.filter(e=>e.type==='interrupt').length,1);
 assert.ok(upstream.sent.some(e=>e.type==='speech_text_buffer.commit'));
 await emit({type:'response.output_audio.started',tts_type:'chat_tts_text',question_id:'external-tts',response_id:'r1'});
 await emit({type:'response.output_audio.delta',delta:'AQI='});assert.equal(events.filter(e=>e.type==='audio').length,1);
}));
test('real new words still interrupt the old reply; native or stale audio stays inaudible',()=>fixture(async({emit,events,upstream,answer})=>{
 await question(emit,'q1','第一条问题');
 await emit({type:'conversation.item.input_audio_transcription.started',item_id:'q2'});
 await emit({type:'conversation.item.input_audio_transcription.delta',item_id:'q2',delta:'换一个问题'});
 assert.equal(events.filter(e=>e.type==='interrupt').length,2);
 answer({text:'上一条的迟到回答'});await tick();
 assert.equal(upstream.sent.some(e=>e.type==='speech_text_buffer.commit'),false);
 for(const tts_type of ['default','chat_tts_text']){await emit({type:'response.output_audio.started',tts_type,question_id:'q1',response_id:'old'});await emit({type:'response.output_audio.delta',delta:'AQI='})}
 assert.equal(events.filter(e=>e.type==='audio').length,0);
}));
