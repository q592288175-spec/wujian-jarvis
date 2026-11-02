import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachVolc,volcStatus,voiceTicket} from '../integrations/volc-voice.mjs';
import {loadVoiceConfig} from '../integrations/voice-config.mjs';
import {assistantReply} from '../integrations/assistant.mjs';
const out='output/unified-workbench-2026-10-25';await mkdir(out,{recursive:true});await loadVoiceConfig();
const active=await fetch('http://127.0.0.1:4318/api/volc/status').then(r=>r.json()).catch(()=>({active:0}));if(active.active)throw Error('存在用户通话，本次测试不占用语音服务');
if(!volcStatus().configured)throw Error('现有语音服务未配置');
const wav=await readFile('output/playwright/voice-2026-10-10/测试问句.wav');let pcm;
for(let pos=12;pos+8<=wav.length;){const n=wav.readUInt32LE(pos+4);if(wav.toString('ascii',pos,pos+4)==='data'){pcm=wav.subarray(pos+8,pos+8+n);break}pos+=8+n+(n%2)}
if(!pcm?.length)throw Error('缺少既有合成测试音频');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let modelVerified=false;
const detach=attachVolc(server,server.address().port,{reply:async()=>{const r=await assistantReply([{role:'user',content:'这是一条语音链路测试。请只回复一句话：小木语音链路正常。不要调用工具，不要创建任务。'}],'',{voice:true});modelVerified=!!r.text;return r}});
const socket=new WebSocket(base.replace('http','ws')+'/ws/volc',{origin:base}),events=[],chunks=[];let offset=0,interval,timeout,finish,finished=false;
const completed=new Promise(r=>finish=r),started=Date.now();
function stop(reason){if(finished)return;finished=true;clearInterval(interval);clearTimeout(timeout);if(socket.readyState===1)socket.send(JSON.stringify({type:'finish'}));socket.close();finish(reason)}
socket.on('open',()=>socket.send(JSON.stringify({type:'init',token:voiceTicket('').token})));
socket.on('message',raw=>{const e=JSON.parse(raw.toString());if(e.type==='audio'){chunks.push(Buffer.from(e.data,'base64'));return}if(!['partial','speaking'].includes(e.type))events.push({type:e.type,elapsed:Date.now()-started,...(e.type==='user'?{recognizedCharacters:e.text?.length}:e.type==='result'?{replyCharacters:e.text?.length}:e.type==='error'?{message:e.message}:{})});if(e.type==='ready')interval=setInterval(()=>{if(socket.readyState!==1)return;const packet=Buffer.alloc(640);if(offset<pcm.length)pcm.copy(packet,0,offset,offset+640);offset+=640;socket.send(packet)},20);if(e.type==='listening')stop(chunks.length?'audio-complete':'audio-dropped');if(e.type==='error')stop('provider-error')});
socket.on('error',()=>stop('socket-error'));timeout=setTimeout(()=>stop('timeout'),45000);
const reason=await completed,audio=Buffer.concat(chunks);let peak=0;for(let i=0;i+1<audio.length;i+=2)peak=Math.max(peak,Math.abs(audio.readInt16LE(i)));
const proof={reason,syntheticInput:true,realVoiceProvider:true,realModel:modelVerified,events,audioChunks:chunks.length,audioBytes:audio.length,pcmPeak:peak,humanMicrophone:false,humanListening:false};await writeFile(out+'/live-voice-verification.json',JSON.stringify(proof,null,2));
if(audio.length){const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+audio.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(audio.length,40);await writeFile(out+'/语音验证回复.wav',Buffer.concat([header,audio]))}
detach();await new Promise(r=>server.close(r));console.log(JSON.stringify(proof));if(reason!=='audio-complete'||!peak||!modelVerified)process.exitCode=1;
