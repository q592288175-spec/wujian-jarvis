import {readFile,writeFile} from 'node:fs/promises';
const patch=async(path,pairs)=>{let s=await readFile(path,'utf8');for(const[a,b]of pairs){if(!s.includes(a))throw Error('未找到 '+path+': '+a.slice(0,70));s=s.replace(a,b)}await writeFile(path,s)};
await patch('dist/workbench.js',[
 ["bindConversationWindow({panel:$('#assistantDrawer')","if(!document.body.dataset.unified)bindConversationWindow({panel:$('#assistantDrawer')"],
 ["contextSymbol:currentCard()?.symbol,cardId:currentCard()?.id","contextSymbol:window.xiaomuContext?.()?.symbol||currentCard()?.symbol,cardId:document.body.dataset.area==='market'?undefined:currentCard()?.id"]
]);
await patch('integrations/volc-voice.mjs',[
 ["speaking=false,context='',queue=[]","speaking=false,context='',contextRevision=0,queue=[]"],
 ["const r=await reply(history.slice(-18),context,{voice:true});for(const j", "const r=await reply(history.slice(-18),context,{voice:true});if(item.contextRevision!==contextRevision)continue;for(const j"],
 ["queue.push({text,epoch});","queue.push({text,epoch,contextRevision});"],
 ["if(m.type==='interrupt'){clear();", "if(m.type==='context'&&ready&&typeof m.contextSymbol==='string'&&m.contextSymbol.length<=80){if(context!==m.contextSymbol){context=m.contextSymbol;contextRevision++;queue=[];history=[];clear();bridge?.cancel();tell('context',{contextSymbol:context})}return}if(m.type==='interrupt'){clear();"]
]);
console.log('助手上下文与页面交互已接通。');
