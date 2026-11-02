import WebSocket from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadVoiceConfig,voiceConfig,voiceHeaders} from '../integrations/voice-config.mjs';
import {duplexUrl,duplexSession} from '../integrations/volc-duplex.mjs';
await loadVoiceConfig();
const speaker=process.argv.find(x=>x.startsWith('--speaker='))?.slice(10)||duplexSession().session.audio.output.voice;
const label=process.argv.includes('--before')?'修复前':'修复后',out=resolve('output/playwright/voice-sound-2026-10-10');
const session=duplexSession();session.session.audio.output.voice=speaker;
const ws=new WebSocket(duplexUrl,{headers:voiceHeaders(voiceConfig()),handshakeTimeout:12000}),chunks=[],events=[];let finish,timer;
const complete=new Promise(r=>finish=r),start=Date.now();
const stop=reason=>{clearTimeout(timer);if(ws.readyState===1)ws.send(JSON.stringify({type:'session.close'}));ws.close();finish(reason)};
ws.on('open',()=>ws.send(JSON.stringify(session)));
ws.on('message',raw=>{
 const e=JSON.parse(raw.toString());
 if(e.type==='session.created'){
  events.push({type:e.type,session:e.session});
  ws.send(JSON.stringify({type:'input_audio_mute.commit'}));
  ws.send(JSON.stringify({type:'speech_text_buffer.commit',text:'五简你好，我是小木。我们慢慢说，先把事情看清楚，再做决定。'}));return;
 }
 if(e.type==='response.output_audio.delta'){
  const data=Buffer.from(e.delta,'base64');chunks.push(data);
  events.push({type:e.type,at:Date.now()-start,bytes:data.length,fields:Object.keys(e),question_id:e.question_id,response_id:e.response_id,...(chunks.length===1?{prefix:data.subarray(0,32).toString('hex')}:{})});return;
 }
 events.push({type:e.type,at:Date.now()-start,tts_type:e.tts_type,error:e.error});
 if(e.type==='response.output_audio.done')stop('complete');
 if(e.type==='error')stop('error');
});
ws.on('error',()=>stop('connection-error'));timer=setTimeout(()=>stop('timeout'),30000);
const reason=await complete,pcm=Buffer.concat(chunks);let peak=0,energy=0,evenEnergy=0,oddEnergy=0,zeros=0;
for(let i=0;i+1<pcm.length;i+=2){const n=pcm.readInt16LE(i);peak=Math.max(peak,Math.abs(n));energy+=n*n;if((i/2)%2)oddEnergy+=n*n;else evenEnergy+=n*n;if(n===0||n===-1)zeros++}
const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
const proof={reason,speaker,audioBytes:pcm.length,assumedSeconds:pcm.length/48000,peak,rms:pcm.length?Math.sqrt(energy/(pcm.length/2)):0,evenEnergy,oddEnergy,nearZeroRatio:pcm.length?zeros/(pcm.length/2):0,events};
await mkdir(out,{recursive:true});await writeFile(resolve(out,`${label}-音频诊断.json`),JSON.stringify(proof,null,2));await writeFile(resolve(out,`${label}-合成测试.wav`),wav);
console.log(JSON.stringify(proof));if(reason!=='complete'||!peak)process.exitCode=1;
