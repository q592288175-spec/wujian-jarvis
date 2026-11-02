import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {resolveVoiceConfig,voiceHeaders,validateVoiceConfig,readVoiceConfig,writeVoiceConfig} from '../integrations/voice-config.mjs';
import {duplexSession,createDuplexBridge} from '../integrations/volc-duplex.mjs';
import {decodeVoiceAudio,VolcVoice} from '../dist/volc-voice.js';

const credential={protocol:'duplex',appId:'1234567890',accessToken:'synthetic-voice-token-only'};
test('speech auth distinguishes API Key from APP ID plus Access Token',()=>{
 assert.equal(resolveVoiceConfig({VOLC_VOICE_ACCESS_TOKEN:credential.accessToken},null).accessToken,undefined);
 const legacy=resolveVoiceConfig({VOLC_VOICE_APP_ID:credential.appId,VOLC_VOICE_ACCESS_TOKEN:credential.accessToken},null);
 assert.equal(legacy.protocol,'legacy');assert.equal(voiceHeaders(legacy)['X-Api-Access-Key'],credential.accessToken);
 assert.equal(voiceHeaders(legacy)['X-Api-Key'],undefined);assert.equal(voiceHeaders({apiKey:'synthetic-key'})['X-Api-Key'],'synthetic-key');
 assert.deepEqual(resolveVoiceConfig({VOLC_VOICE_API_KEY:'old'},credential),credential);
 assert.throws(()=>voiceHeaders({}));assert.throws(()=>validateVoiceConfig({protocol:'duplex',appId:'wrong',accessToken:'short'}));
 assert.deepEqual(validateVoiceConfig({...credential,secretKey:'must-not-save'}),credential);
});
test('speech config only persists an encrypted envelope; corrupt files fail closed',async()=>{
 const dir=await mkdtemp(resolve('.runtime','voice-test-')),file=resolve(dir,'voice.enc');
 const protect=async(value,mode)=>mode==='decrypt'?JSON.stringify(credential):{format:'windows-dpapi-v1',data:'synthetic-ciphertext'};
 try{
  assert.equal(await readVoiceConfig(file,protect),null);await writeVoiceConfig(credential,file,protect);
  const raw=await readFile(file,'utf8');assert.ok(!raw.includes(credential.accessToken)&&!raw.includes(credential.appId));assert.deepEqual(await readVoiceConfig(file,protect),credential);
  await assert.rejects(readVoiceConfig(file,async()=>{throw Error('invalid')}),/无法解密/);
 }finally{assert.equal(dirname(dir),resolve('.runtime'));await rm(dir,{recursive:true,force:true})}
});
test('duplex initializes the documented JSON session and transports PCM in base64',()=>{
 const out=[],b=createDuplexBridge(v=>out.push(v));b.start();assert.equal(out[0].type,'session.create');assert.equal(out[0].session.model,'1.2.6.1');assert.equal(duplexSession().session.audio.output.format.type,'pcm_s16le');assert.equal(out[0].session.audio.output.voice,'zh_female_xiaohe_jupiter_bigtts');
 b.send(200,Buffer.from([1,2]),true);assert.equal(out[1].type,'input_audio_buffer.append');assert.equal(out[1].audio,'AQI=');
 b.send(500,{start:true,content:''});b.send(500,{content:'只播报研究回答'});b.send(500,{end:true});assert.equal(out[2].type,'speech_text_buffer.commit');assert.equal(out[2].text,'只播报研究回答');b.send(102);assert.equal(out[3].type,'session.close');assert.ok(out.every(x=>typeof x.event_id==='string'));
});
test('duplex ASR replaces revised hypotheses and uses final text exactly once',()=>{
 const b=createDuplexBridge(()=>{}),read=e=>b.read(JSON.stringify(e));
 assert.equal(read({type:'session.created'}).event,150);
 assert.equal(read({type:'conversation.item.input_audio_transcription.started',item_id:'q1'}).payload.question_id,'q1');
 for(const delta of ['查询','查询黄金最新','查询黄金'])assert.equal(read({type:'conversation.item.input_audio_transcription.delta',item_id:'q1',delta}).payload.results[0].text,delta);
 assert.equal(read({type:'conversation.item.input_audio_transcription.delta',item_id:'older',delta:'迟到'}),null);
 const end={type:'conversation.item.input_audio_transcription.completed',item_id:'q1',text:'查询黄金最新报价。'};
 assert.equal(read(end).payload.results[0].text,end.text);assert.equal(read(end),null);
});
test('duplex mute pauses upstream audio but not synthesis; unmute and cancel are explicit',()=>{
 const out=[],b=createDuplexBridge(v=>out.push(v));b.mute(true);b.send(200,Buffer.alloc(640),true);b.keepAlive();b.send(500,{start:true,content:'继续播放',end:true});assert.deepEqual(out.map(x=>x.type),['input_audio_mute.commit','input_audio_mute.commit','speech_text_buffer.commit']);
 b.mute(false);b.send(200,Buffer.alloc(640),true);b.cancel();assert.deepEqual(out.slice(-3).map(x=>x.type),['input_audio_unmute.commit','input_audio_buffer.append','response.cancel']);
});
test('duplex maps native and external TTS separately and validates PCM chunks',()=>{
 const b=createDuplexBridge(()=>{}),read=e=>b.read(JSON.stringify(e));
 for(const type of ['chat_tts_text','native'])assert.equal(read({type:'response.output_audio.started',tts_type:type,question_id:'q1'}).payload.tts_type,type);
 const a=read({type:'response.output_audio.delta',delta:'AQI='});assert.deepEqual(a.payload,Buffer.from([1,2]));assert.equal(a.format,'pcm_s16le');assert.equal(a.sampleRate,24000);
 assert.throws(()=>read({type:'response.output_audio.delta',delta:'AQ=='}));assert.throws(()=>read({type:'response.output_audio.delta',delta:'invalid!'}));assert.equal(read({type:'response.output_audio.done'}).event,359);assert.equal(read({type:'error',status_code:45000001}).type,15);
});
test('browser converts PCM16 little endian at the documented output rate, not as Ogg',async()=>{
 const values=new Float32Array(3),ctx={createBuffer:(channels,n,rate)=>{assert.equal(channels,1);assert.equal(n,3);assert.equal(rate,24000);return {getChannelData:()=>values}},decodeAudioData:()=>{throw Error('not compressed')}};
 const raw=Buffer.alloc(6);raw.writeInt16LE(-32768);raw.writeInt16LE(0,2);raw.writeInt16LE(32767,4);
 await decodeVoiceAudio(ctx,{format:'pcm_s16le',sampleRate:24000,data:raw.toString('base64')});assert.deepEqual([...values],[-1,0,32767/32768]);
 await assert.rejects(decodeVoiceAudio(ctx,{format:'pcm_s16le',sampleRate:16000,data:raw.toString('base64')}));
 const old={decodeAudioData:data=>({old:true,bytes:data.byteLength})};assert.deepEqual(await decodeVoiceAudio(old,{data:'AQI='}),{old:true,bytes:2});
});
test('voice playback uses the 24 kHz PCM clock rather than per-packet resampling',async()=>{
 const original=globalThis.AudioContext;let options,closed=false;
 globalThis.AudioContext=class{constructor(o){options=o}async resume(){}async close(){closed=true}};
 try{const v=new VolcVoice({api:async()=>({configured:false}),status(){}});await v.connect();assert.equal(options.sampleRate,24000);assert.equal(closed,true);assert.equal(v.audio,null)}
 finally{if(original===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=original}
});
