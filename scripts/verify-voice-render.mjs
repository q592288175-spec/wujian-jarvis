import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'file:///C:/Users/86199/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const out=resolve('output/playwright/voice-sound-2026-10-10');
const pcm=(await readFile(resolve(out,'修复前-合成测试.wav'))).subarray(44);
const proof=JSON.parse(await readFile(resolve(out,'修复前-音频诊断.json'),'utf8'));
const chunks=proof.events.filter(e=>e.type==='response.output_audio.delta').map(e=>e.bytes/2);
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage();
 const result=await page.evaluate(async({base64,chunks})=>{
  const raw=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),view=new DataView(raw.buffer),samples=new Float32Array(raw.length/2);
  for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
  async function render(rate,split){
   const ctx=new OfflineAudioContext(1,Math.ceil(samples.length*rate/24000),rate);let pos=0;
   for(const n of split?chunks:[samples.length]){const buffer=ctx.createBuffer(1,n,24000);buffer.copyToChannel(samples.subarray(pos,pos+n),0);const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);source.start(pos/24000);pos+=n}
   return (await ctx.startRendering()).getChannelData(0);
  }
  const results=[];
  for(const rate of [24000,48000]){const joined=await render(rate,false),split=await render(rate,true);let peak=0,energy=0,affected=0;for(let i=0;i<joined.length;i++){const d=split[i]-joined[i];peak=Math.max(peak,Math.abs(d));energy+=d*d;if(Math.abs(d)>.00001)affected++}results.push({sampleRate:rate,maxError:peak,rmsError:Math.sqrt(energy/joined.length),affectedSamples:affected,totalSamples:joined.length})}
  const playback=new AudioContext({sampleRate:24000}),actualPlaybackRate=playback.sampleRate;await playback.close();
  return {actualPlaybackRate,comparisons:results};
 },{base64:pcm.toString('base64'),chunks});
 const source=await readFile(resolve('dist/volc-voice.js'),'utf8');assert.match(source,/new AudioContext\(\{sampleRate:24000\}\)/);
 assert.equal(result.actualPlaybackRate,24000);assert.equal(result.comparisons.find(r=>r.sampleRate===24000).affectedSamples,0);
 await writeFile(resolve(out,'分包播放接缝核验.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
