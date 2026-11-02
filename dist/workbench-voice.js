import {VoiceController} from './voice.js';
export function mountWorkbenchVoice({api,toast,getContext,onMessage,onOpen,onTool}){
 if(!document.body.dataset.unified)return;
 const $=s=>document.querySelector(s),submit=$('#assistantForm').onsubmit;
 const history=(()=>{try{return JSON.parse(localStorage.getItem('wj-assistant-history')||'[]')}catch{return[]}})();
 const voice=new VoiceController({api:(path,body)=>api(path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),isConfigured:()=>true,preserveHistory:true,history,getContext,onMessage,onTool,toast});
 $('#assistantForm').onsubmit=submit;
 const open=()=>{voice.open();$('#drawerShade').hidden=true;$('#assistantButton').setAttribute('aria-expanded','true');onOpen();};
 $('#assistantButton').onclick=open;
 $('#voiceButton').onclick=()=>{open();voice.openCall()};
 $('#restoreAssistant').onclick=open;
 $('#closeAssistant').onclick=()=>{voice.stop();$('#assistantDrawer').hidden=true;$('#restoreAssistant').hidden=true;$('#assistantButton').setAttribute('aria-expanded','false');$('#assistantButton').focus()};
 $('#drawerShade').onclick=()=>$('#closeAssistant').click();
 $('#minAssistant').onclick=()=>{$('#assistantDrawer').hidden=true;$('#drawerShade').hidden=true;$('#restoreAssistant').hidden=false;$('#assistantButton').setAttribute('aria-expanded','false')};
 $('#connectCall').textContent='接通语音';
 let lastSymbol='';
 addEventListener('xiaomu:context',()=>{const symbol=getContext()?.symbol||'';if(symbol!==lastSymbol&&voice.volc?.ready&&voice.volc.ws?.readyState===1){voice.volc.interrupt();voice.volc.ws.send(JSON.stringify({type:'context',contextSymbol:symbol}));voice.status(symbol?'研究对象已更新 · 请说话':'已切换到市场观察 · 请说话')}lastSymbol=symbol;});
 addEventListener('xiaomu:hangup',()=>voice.stop());
 addEventListener('pagehide',()=>voice.stop());
 window.xiaomuCallActive=()=>['connected','connecting'].includes(voice.state);
 $('#voiceButton').disabled=false;$('#assistantButton').disabled=false;
}
