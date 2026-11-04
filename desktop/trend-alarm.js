const el=id=>document.getElementById(id),known=new Set();let pending=[],busy=false,token=0,audio=null,objectUrl=null,lastItem=null,activeItem=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stopAudio(){audio?.pause();if(objectUrl)URL.revokeObjectURL(objectUrl);audio=null;objectUrl=null;}
function silence(){token++;pending=[];busy=false;activeItem=null;stopAudio();el('sound').textContent='已停止播报 · 警报保留';document.body.dataset.sound='muted';}
async function playNext(){
 if(busy||!pending.length)return;busy=true;const item=pending.shift(),generation=token;lastItem=activeItem=item;document.body.dataset.sound='loading';el('sound').textContent='正在准备语音…';el('error').textContent='';
 try{
  const result=await window.xiaomuAlarm.speech(item.id);if(generation!==token)return;
  const bytes=Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0));objectUrl=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio=new Audio(objectUrl);audio.volume=.9;audio.playbackRate=1.5;audio.preservesPitch=true;
  audio.onended=()=>{if(generation!==token)return;stopAudio();busy=false;activeItem=null;document.body.dataset.sound='complete';el('sound').textContent='播报完毕 · 1.5倍速';void playNext()};
  audio.onerror=()=>{if(generation!==token)return;stopAudio();busy=false;activeItem=null;document.body.dataset.sound='failed';el('sound').textContent='语音播放失败';el('error').textContent='请点“重播语音”重试。';void playNext()};
  await audio.play();if(generation!==token)return;document.body.dataset.sound='running';document.body.dataset.voiceId=result.voiceId;el('sound').textContent=(result.voiceId==='clear-male'?'清爽男声':'台湾女声')+' · 1.5倍速正在播报';el('spoken').textContent=result.text;
 }catch(e){if(generation===token){stopAudio();busy=false;activeItem=null;document.body.dataset.sound='failed';el('sound').textContent='语音暂不可用';el('error').textContent=e.message+'，可点“重播语音”。';void playNext()}}
}
window.xiaomuAlarm.onItems(items=>{
 el('items').innerHTML=[...items].reverse().map(e=>{const up=e.direction==='up'||e.direction==='long',period=({'30m':'30分钟','60m':'1小时','120m':'2小时'})[e.period]||'小周期';return '<article class="'+(up?'up':'down')+'"><h2>'+((e.isTest&&!String(e.name).includes('【测试】'))?'【测试】':'')+esc(e.name)+' <small>'+esc(e.symbol)+'</small></h2><strong>'+period+' MA10'+(up?'向上':'向下')+'拐头<br>价格'+(up?'上穿':'下穿')+'MA10</strong><p>'+esc(String(e.condition||'').split('；')[0])+'</p><small>'+esc(e.source)+'</small></article>'}).join('');
 const ids=new Set(items.map(e=>e.id));pending=pending.filter(e=>ids.has(e.id));for(const id of known)if(!ids.has(id))known.delete(id);
 if(activeItem&&!ids.has(activeItem.id)){token++;busy=false;activeItem=null;stopAudio();}
 if(lastItem&&!ids.has(lastItem.id))lastItem=null;
 if(!items.length){silence();return}
 const fresh=items.filter(e=>!known.has(e.id));for(const e of fresh)known.add(e.id);pending.push(...fresh);if(fresh.length){document.body.classList.remove('pulse');void document.body.offsetWidth;document.body.classList.add('pulse');}void playNext();
});
window.xiaomuAlarm.onSilence(silence);el('mute').onclick=silence;el('replay').onclick=()=>{if(lastItem){const item=lastItem;silence();pending=[item];void playNext()}};
el('open').onclick=()=>window.xiaomuAlarm.open().catch(e=>el('error').textContent=e.message);el('ack').onclick=async()=>{silence();try{await window.xiaomuAlarm.ack()}catch(e){el('error').textContent='确认失败，记录保留：'+e.message}};
