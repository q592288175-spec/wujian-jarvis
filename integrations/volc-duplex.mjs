import {randomUUID} from 'node:crypto';

export const duplexUrl='wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue';
export function duplexSession(){return {type:'session.create',session:{model:'1.2.6.1',instructions:'你仅为小木提供语音识别和外部文本播报。金融研究和查询由外部 DeepSeek 处理，不凭记忆回答金融问题。',audio:{input:{format:{type:'pcm',rate:16000}},output:{format:{type:'pcm_s16le',rate:24000},voice:'zh_female_xiaohe_jupiter_bigtts'}}}};}
// Keep the existing research and turn lifecycle; only translate provider events.
export function createDuplexBridge(send){
 let text='',speech='',question=null,muted=false;const completed=new Set();
 const emit=value=>send({...value,event_id:randomUUID()});
 return {
  start(){emit(duplexSession())},
  send(event,payload={},audio=false){
   if(audio){if(!muted)emit({type:'input_audio_buffer.append',audio:Buffer.from(payload).toString('base64')});return}
   if(event===102){emit({type:'session.close'});return}
   // A completed external reply must remain speakable after the ASR turn changes.
   if(event===500){if(payload.start)speech='';if(payload.content)speech+=payload.content;if(payload.end&&speech){emit({type:'speech_text_buffer.commit',text:speech});speech=''}}
  },
  cancel(){speech='';emit({type:'response.cancel'})},
  mute(value){muted=value;emit({type:value?'input_audio_mute.commit':'input_audio_unmute.commit'})},
  keepAlive(){if(muted)emit({type:'input_audio_mute.commit'})},
  read(data){
   const e=JSON.parse(data.toString());
   if(e.type==='error')return {type:15,code:e.error?.code||e.status_code};
   if(e.type==='session.created')return {event:150,payload:{}};
   if(e.type==='conversation.item.input_audio_transcription.started'){question=e.item_id;text='';return {event:450,payload:{question_id:question}}}
   if(e.type==='conversation.item.input_audio_transcription.delta'){
    if(e.item_id!==question)return null;
    // Live 3.0 returns revised full hypotheses, including shorter corrections.
    text=typeof e.delta==='string'?e.delta.slice(0,4000):text;return {event:451,payload:{results:[{text}]}};
   }
   if(e.type==='conversation.item.input_audio_transcription.completed'){
    if(e.item_id!==question||completed.has(question))return null;completed.add(question);
    if(completed.size>100)completed.delete(completed.values().next().value);
    text=typeof e.text==='string'?e.text.slice(0,4000):text;return {event:459,payload:{question_id:question,results:[{text}]}};
   }
   if(e.type==='response.output_audio.started')return {event:350,payload:e};
   if(e.type==='response.output_audio.delta'){
    if(typeof e.delta!=='string'||e.delta.length>700000||!e.delta.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(e.delta))throw Error('Invalid audio');
    const payload=Buffer.from(e.delta,'base64');if(payload.length%2)throw Error('Invalid PCM');return {audio:true,payload,format:'pcm_s16le',sampleRate:24000};
   }
   if(e.type==='response.output_audio.done')return {event:359,payload:e};
   return null;
  }
 };
}
