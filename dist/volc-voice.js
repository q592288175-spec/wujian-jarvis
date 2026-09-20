import {AudioTap} from './ui/audio-tap.js';
const idle=()=>({connection:'idle',micMuted:false,working:false,userSpeaking:false,agentSpeaking:false});
export class VolcVoice{
 constructor({api,status,message,onJobs,context,onAudioGraph,onVoiceState,onOutputReset,onPartial}){Object.assign(this,{api,status,message,onJobs,context,onAudioGraph,onVoiceState,onOutputReset,onPartial});this.generation=0;this.sources=new Set();this.intervals=new Map();this.playAt=0;this.audioGeneration=0;this.chain=Promise.resolve();this.facts=idle();}
 update(patch){const next={...this.facts,...patch};if(Object.keys(next).some(k=>next[k]!==this.facts[k])){this.facts=next;this.onVoiceState?.({...next})}}
 async connect(){
  if(this.connecting||this.ready)return;
  if(this.pendingMic){this.status('请先处理已经打开的麦克风授权提示，再重新接通');return;}
  this.connecting=true;const gen=++this.generation;this.timeout=setTimeout(()=>{if(gen===this.generation&&!this.ready)this.fail('语音启动超时，请检查麦克风权限')},30000);this.update({connection:'connecting'});this.status('火山语音正在连接…');
  try{
   this.status('正在启用音频设备…');const ctx=this.audio=new AudioContext();await ctx.resume();if(gen!==this.generation)return;
   this.status('正在检查语音服务…');const conf=await this.api('/api/volc/status');if(gen!==this.generation)return;if(!conf.configured)throw Error('火山语音未配置');
   this.status('正在等待麦克风授权…');const request=this.pendingMic=navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   let stream;try{stream=await request}finally{if(this.pendingMic===request)this.pendingMic=null}
   if(gen!==this.generation){stream.getTracks().forEach(t=>t.stop());return}this.stream=stream;
   await ctx.audioWorklet.addModule('/volc-capture.js');if(gen!==this.generation)return;
   this.capture=new AudioWorkletNode(ctx,'volc-capture');this.source=ctx.createMediaStreamSource(stream);
   this.silence=ctx.createGain();this.silence.gain.value=0;this.source.connect(this.capture);this.capture.connect(this.silence).connect(ctx.destination);
   this.playbackGain=ctx.createGain();const savedVolume=Number(localStorage.getItem('xiaomu-voice-volume'));this.playbackGain.gain.value=Number.isFinite(savedVolume)?Math.min(1.8,Math.max(.6,savedVolume)):1.35;this.playbackGain.connect(ctx.destination);
   this.inputTap=new AudioTap(ctx).addSource(this.source);this.outputTap=new AudioTap(ctx).addSource(this.playbackGain);
   this.onAudioGraph?.({inputTap:this.inputTap,outputTap:this.outputTap});
   const token=await this.api('/api/volc/session',{contextSymbol:this.context?.()||''});if(gen!==this.generation)return;
   const ws=this.ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/volc`);
   ws.onopen=()=>{if(gen===this.generation)ws.send(JSON.stringify({type:'init',token:token.token}))};
   this.capture.port.onmessage=e=>{if(gen===this.generation&&this.ready&&ws.readyState===1){if(ws.bufferedAmount>262144)return this.fail('语音上行拥堵，请重新接通');ws.send(e.data)}};
   ws.onmessage=e=>{if(gen!==this.generation)return;try{this.event(JSON.parse(e.data),gen)}catch{this.fail('语音事件解析失败')}};
   ws.onerror=()=>{if(gen===this.generation)this.fail('语音连接失败')};
   ws.onclose=()=>{if(gen===this.generation)this.fail('语音连接已结束 · 后台研究继续')};

   // Playback facts follow the audio clock, not packet arrival or future queue entries.
   this.playbackTimer=setInterval(()=>this.syncPlayback(),50);
  }catch(e){if(gen===this.generation)this.fail(e.name==='NotAllowedError'?'麦克风权限被拒绝 · 文字对话仍可用':e.message)}
 }
 syncPlayback(){const now=this.audio?.currentTime;const speaking=!!this.ready&&this.audio?.state==='running'&&[...this.intervals.values()].some(i=>i.gen===this.generation&&i.ag===this.audioGeneration&&now>=i.start&&now<i.end);this.update({agentSpeaking:speaking});}
 event(e,gen){
  if(e.type==='ready'){clearTimeout(this.timeout);this.ready=true;this.connecting=false;this.update({connection:'connected'});this.status('火山语音已连接 · 请说话');return}
  if(e.type==='interrupt'){this.clearAudio();this.update({userSpeaking:true});this.status('正在聆听…');return}
  if(e.type==='partial'){this.onPartial?.(e.text||'');this.update({userSpeaking:true});this.status('正在聆听…');return}
  if(e.type==='user'){this.onPartial?.('');this.update({userSpeaking:false});this.message('user',e.text);return}
  if(e.type==='working'){this.update({working:true,userSpeaking:false});this.status('DeepSeek正在查询 · 可以继续说话');return}
  if(e.type==='result'){this.update({working:false});this.message('assistant',e.text);this.onJobs?.(e.jobs||[]);return}
  if(e.type==='job_complete'){this.message('assistant',e.text);this.onJobs?.([{id:e.id}]);return}
  if(e.type==='audio'){
   const ag=this.audioGeneration,ctx=this.audio;
   this.chain=this.chain.then(async()=>{
    if(gen!==this.generation||ag!==this.audioGeneration||!ctx)return;
    const raw=Uint8Array.from(atob(e.data),c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(raw.buffer);
    if(gen!==this.generation||ag!==this.audioGeneration)return;
    const s=ctx.createBufferSource();s.buffer=buffer;s.connect(this.playbackGain);this.sources.add(s);
    const start=Math.max(ctx.currentTime+.02,this.playAt);this.playAt=start+buffer.duration;
    this.intervals.set(s,{start,end:this.playAt,gen,ag});
    s.onended=()=>{this.sources.delete(s);this.intervals.delete(s);s.disconnect();if(gen===this.generation&&ag===this.audioGeneration){this.syncPlayback();if(!this.sources.size&&this.ready)this.status('正在聆听…')}};
    s.start(start);
   }).catch(()=>{if(gen===this.generation&&ag===this.audioGeneration)this.status('音频播放失败，文字回答仍可查看')});return;
  }
  if(e.type==='error')this.fail(e.message);
 }
 clearAudio(){this.audioGeneration++;for(const s of this.sources){s.onended=null;try{s.stop()}catch{}s.disconnect()}this.sources.clear();this.intervals.clear();this.playAt=0;this.chain=Promise.resolve();this.update({agentSpeaking:false});this.onOutputReset?.();}
 interrupt(){this.clearAudio();if(this.ws?.readyState===1)this.ws.send(JSON.stringify({type:'interrupt'}));}
 mute(value){this.stream?.getAudioTracks().forEach(t=>t.enabled=!value);this.update({micMuted:value,...(value?{userSpeaking:false}:{})});}
 fail(message){this.stop();this.update({connection:'error'});this.status(message);}
 stop(){this.onPartial?.('');this.generation++;clearTimeout(this.timeout);clearInterval(this.playbackTimer);this.ready=false;this.connecting=false;this.clearAudio();this.inputTap?.dispose();this.outputTap?.dispose();this.inputTap=this.outputTap=null;this.onAudioGraph?.({});this.capture?.disconnect();this.source?.disconnect();this.silence?.disconnect();this.playbackGain?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.ws?.readyState===1)this.ws.send(JSON.stringify({type:'finish'}));this.ws?.close();this.ws=null;this.audio?.close().catch(()=>{});this.audio=null;this.update(idle());}
}
