import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import WebSocket from 'ws';
import {createServer} from 'node:http';
import {attachVolc,volcStatus,voiceTicket} from '../integrations/volc-voice.mjs';
import {loadVoiceConfig} from '../integrations/voice-config.mjs';
let base='http://127.0.0.1:4318',server,detach;const providerEvents=[],sentEvents=[];
const isolated=process.argv.includes('--isolated'),out=resolve('output/playwright/voice-2026-10-10');
if(isolated){await loadVoiceConfig();server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;detach=attachVolc(server,port,{...(process.argv.includes('--quick-reply')?{reply:async()=>{if(process.argv.includes('--delayed-reply'))await new Promise(r=>setTimeout(r,5000));return {text:'你好，这是小木的语音测试。',jobs:[]}}}:{}),openUpstream:(url,options)=>{const socket=new WebSocket(url,options),send=socket.send.bind(socket);socket.send=frame=>{const e=JSON.parse(frame.toString());if(e.type!=='input_audio_buffer.append')sentEvents.push({type:e.type,fields:Object.keys(e),textCharacters:e.text?.length});return send(frame)};socket.on('message',frame=>{const e=JSON.parse(frame.toString());if(!e.type?.endsWith('.delta'))providerEvents.push({type:e.type,fields:Object.keys(e),tts_type:e.tts_type,question_id:e.question_id,item_id:e.item_id,reply_id:e.reply_id,response_id:e.response_id,error:e.error?{code:e.error.code,message:e.error.message}:undefined})});return socket}});base=`http://127.0.0.1:${port}`}
const status=isolated?volcStatus():await fetch(base+'/api/volc/status').then(r=>r.json());
if(status.active)throw Error('请先挂断现有通话，测试不抢占麦克风');
const wav=await readFile(resolve(out,'测试问句.wav'));let pcm;
for(let pos=12;pos+8<=wav.length;){const n=wav.readUInt32LE(pos+4);if(wav.toString('ascii',pos,pos+4)==='data'){pcm=wav.subarray(pos+8,pos+8+n);break}pos+=8+n+(n%2)}
if(!pcm?.length)throw Error('缺少合成测试问句');
const ticket=isolated?voiceTicket(''):await fetch(base+'/api/volc/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'}).then(r=>r.json());
if(!ticket.token)throw Error('未取得测试会话凭证');
const ws=new WebSocket(base.replace('http','ws')+'/ws/volc',{origin:base}),events=[],chunks=[];let offset=0,timer,timeout,finish;
const completed=new Promise(r=>finish=r),start=Date.now();
const stop=reason=>{clearInterval(timer);clearTimeout(timeout);if(ws.readyState===1)ws.send(JSON.stringify({type:'finish'}));ws.close();finish(reason)};
ws.on('open',()=>ws.send(JSON.stringify({type:'init',token:ticket.token})));
ws.on('message',data=>{
 const e=JSON.parse(data.toString());
 if(e.type==='audio'){chunks.push(Buffer.from(e.data,'base64'));return}
 if(e.type!=='partial'&&e.type!=='speaking')events.push({type:e.type,at:Date.now()-start,...(e.type==='user'?{text:e.text}:e.type==='result'?{replyCharacters:e.text?.length}:e.type==='error'?{message:e.message}:{})});
 if(e.type==='ready')timer=setInterval(()=>{if(ws.readyState!==1)return;const frame=Buffer.alloc(640);if(offset<pcm.length)pcm.copy(frame,0,offset,offset+640);offset+=640;ws.send(frame)},20);
 if(e.type==='listening')stop(chunks.length?'audio-complete':'audio-dropped');
 if(e.type==='error')stop('provider-error');
});
ws.on('error',()=>stop('socket-error'));
timeout=setTimeout(()=>stop('timeout'),45000);
const reason=await completed,bytes=Buffer.concat(chunks);let peak=0,energy=0;
for(let i=0;i+1<bytes.length;i+=2){const n=bytes.readInt16LE(i);peak=Math.max(peak,Math.abs(n));energy+=n*n}
const proof={reason,isolated,quickReply:process.argv.includes('--quick-reply'),events,providerEvents,sentEvents,audioChunks:chunks.length,audioBytes:bytes.length,pcmPeak:peak,pcmRms:bytes.length?Math.sqrt(energy/(bytes.length/2)):0};
await mkdir(out,{recursive:true});await writeFile(resolve(out,'回复音频链路.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));if(!bytes.length||!peak)process.exitCode=1;
detach?.();if(server)await new Promise(resolve=>server.close(resolve));
