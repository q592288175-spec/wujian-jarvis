import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import WebSocket from 'ws';
import {voiceConfig,voiceHeaders} from './voice-config.mjs';
import {duplexUrl,duplexSession} from './volc-duplex.mjs';
import {alarmVoices} from '../dist/alarm-voices.js';
export {alarmVoices};
export function alertVoice(id='taiwan-female'){const voice=alarmVoices.find(v=>v.id===id);if(!voice)throw Error('请选择台湾女声或清爽男声');return voice;}
export function alertSpeechText(event){
 const label={'30m':'三十分钟','60m':'一小时','120m':'两小时'}[event?.period||event?.evidence?.period];
 if(!label||!['up','down','long','short'].includes(event?.direction))throw Error('语音提醒缺少有效的周期或方向');
 const name=String(event.name||'').replace(/【[^】]*(?:测试|验收)[^】]*】/g,'').trim().slice(0,40);if(!name||/[<>\r\n]/.test(name))throw Error('语音提醒缺少有效品种名称');
 const up=['up','long'].includes(event.direction),test=event.isTest===true||event.evidence?.test===true;
 return (test?'测试提醒。':'')+name+'，'+label+'十均线'+(up?'向上':'向下')+'拐头，价格'+(up?'上穿':'下穿')+'十均线。';
}
export function pcmWave(pcm){if(!Buffer.isBuffer(pcm)||!pcm.length||pcm.length%2)throw Error('语音音频格式无效');const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);return wav;}
function validWave(wav){return Buffer.isBuffer(wav)&&wav.length>44&&wav.length<=44+24000*2*35&&wav.length%2===0&&wav.toString('ascii',0,4)==='RIFF'&&wav.readUInt32LE(4)===wav.length-8&&wav.toString('ascii',8,16)==='WAVEfmt '&&wav.readUInt32LE(16)===16&&wav.readUInt16LE(20)===1&&wav.readUInt16LE(22)===1&&wav.readUInt32LE(24)===24000&&wav.readUInt32LE(28)===48000&&wav.readUInt16LE(32)===2&&wav.readUInt16LE(34)===16&&wav.toString('ascii',36,40)==='data'&&wav.readUInt32LE(40)===wav.length-44;}
export function synthesizeAlert(text,voice,{signal,config=voiceConfig(),openSocket=(...args)=>new WebSocket(...args),timeoutMs=20000}={}){
 if(!config.apiKey&&!(config.appId&&config.accessToken))return Promise.reject(Error('本机火山语音尚未配置，暂不能播报'));
 if(signal?.aborted)return Promise.reject(Error('语音播报已取消'));
 return new Promise((resolve,reject)=>{
  let socket,timer,settled=false;const chunks=[];let bytes=0;
  const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(socket?.readyState===1){try{socket.send(JSON.stringify({type:'session.close'}))}catch{}socket.close()}else socket?.terminate?.();error?reject(error):resolve(value)};
  const abort=()=>done(Error('语音播报已取消'));signal?.addEventListener('abort',abort,{once:true});
  try{socket=openSocket(duplexUrl,{headers:voiceHeaders(config),handshakeTimeout:10000});}catch{return done(Error('语音服务连接失败'))}
  timer=setTimeout(()=>done(Error('语音服务响应超时，请重试播报')),timeoutMs);timer.unref?.();
  socket.on('open',()=>{const session=duplexSession();session.session.audio.output.voice=voice.speaker;socket.send(JSON.stringify(session))});
  socket.on('message',raw=>{if(settled)return;try{const event=JSON.parse(raw.toString());
   if(event.type==='session.created'){socket.send(JSON.stringify({type:'input_audio_mute.commit'}));socket.send(JSON.stringify({type:'speech_text_buffer.commit',text}));}
   if(event.type==='error')return done(Error('语音服务未能合成该音色，请重试'));
   if(event.type==='response.output_audio.delta'){
    if(typeof event.delta!=='string'||event.delta.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(event.delta))return done(Error('语音服务返回无效音频'));
    const pcm=Buffer.from(event.delta,'base64');if(pcm.length%2||(bytes+=pcm.length)>24000*2*35)return done(Error('语音音频长度或格式无效'));chunks.push(pcm);
   }
   if(event.type==='response.output_audio.done'){if(!bytes)return done(Error('语音服务未返回音频'));done(null,pcmWave(Buffer.concat(chunks)))}
  }catch{done(Error('语音服务返回格式异常'))}});
  socket.on('error',()=>done(Error('语音服务连接失败，请检查网络')));socket.on('close',()=>{if(!settled)done(Error('语音服务提前断开，请重试播报'))});
 });
}
export function createAlertSpeech({root=resolve('.'),synthesize=synthesizeAlert}={}){
 const directory=resolve(root,'.runtime/alert-speech'),inflight=new Map();
 return {async render(event,voiceId){const voice=alertVoice(voiceId),text=alertSpeechText(event),key=createHash('sha256').update('v1|'+voice.id+'|'+text).digest('hex'),file=join(directory,key+'.wav');
  try{const wav=await readFile(file);if(validWave(wav))return{audio:wav.toString('base64'),text,voiceId:voice.id,cacheHit:true,mime:'audio/wav'};}catch(e){if(e.code!=='ENOENT')throw Error('语音缓存暂不可读')}
  if(!inflight.has(key))inflight.set(key,(async()=>{const wav=await synthesize(text,voice);if(!validWave(wav))throw Error('语音服务返回无效音频，请重试');await mkdir(directory,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,wav);await rename(temp,file);return{audio:wav.toString('base64'),text,voiceId:voice.id,cacheHit:false,mime:'audio/wav'};})().finally(()=>inflight.delete(key)));
  return inflight.get(key);
 }};
}
